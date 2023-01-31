import chai, { expect } from 'chai'
// import spies from 'chai-spies'
import chaiHttp from 'chai-http'
import sinon from 'sinon'
import server from '../../src/server.js'
import * as stripeUtils from '../../src/stripe-utils.js'
import config from '../../src/config.js'
import sms from '../../src/sms.js'

chai.use(chaiHttp)
const should = chai.should()

describe('/POST whAuthorization', () => {
  const sandbox = sinon.createSandbox()
  let sampleCardholder, sampleAuthorization
  before(async () => {
    sampleCardholder = (await stripeUtils.stripe.issuing.cardholders.list({ email: global.setupOneTransactionCardholder })).data[0]
    sampleAuthorization = (await stripeUtils.stripe.issuing.authorizations.list({ cardholder: sampleCardholder.id, limit: 1 })).data[0]
  })

  let constructEventStub
  beforeEach(() => {
    constructEventStub = sandbox.stub(stripeUtils.stripe.webhooks, 'constructEvent')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('for issuing_authorization.request', () => {
    beforeEach(() => {
      constructEventStub.returns({
        type: 'issuing_authorization.request',
        data: {
          object: sampleAuthorization
        }
      })
    })

    it('should check that the event security method is called', async () => {
      const res = await chai.request(server)
        .post('/whAuthorization')
      res.should.have.status(200)
      expect(constructEventStub.calledOnce).to.be.true
    })

    it('should return an unapproved code, with a reason, if the vendor name is not mached', async () => {
      sampleAuthorization.merchant_data.name = 'JUnk Name'
      const res = await chai.request(server)
        .post('/whAuthorization')
      res.should.have.status(200)
      expect(res.body.approved).to.be.false
      expect(res.body.metadata.vendor_found).to.be.false
      expect(res.body.metadata.merchant_postal_code).to.not.be.empty
    })

    it('should return an unapproved code, with a reason, if the vendor name is found BUT the matching postal code is not', async () => {
      const vendors = config.get('approved_vendors')
      const validVendorName = Object.keys(vendors)[0]
      const validVendorPostalCode = vendors[validVendorName]
      const invalidPostalCode = 10002
      sampleAuthorization.merchant_data.name = validVendorName
      sampleAuthorization.merchant_data.postal_code = invalidPostalCode
      const res = await chai.request(server)
        .post('/whAuthorization')
      res.should.have.status(200)
      expect(res.body.approved).to.be.false
      expect(res.body.metadata.vendor_found).to.eql(validVendorName)
      expect(res.body.metadata.vendor_postal_code).to.be.eql(validVendorPostalCode)
      expect(res.body.metadata.merchant_postal_code).to.be.eql(invalidPostalCode)
    })

    it('should return an approved code if the vendor name and postal code match the merchant', async () => {
      const vendors = config.get('approved_vendors')
      const validVendorName = Object.keys(vendors)[0]
      const validVendorPostalCode = vendors[validVendorName]
      sampleAuthorization.merchant_data.name = validVendorName
      sampleAuthorization.merchant_data.postal_code = validVendorPostalCode
      const res = await chai.request(server)
        .post('/whAuthorization')
      res.should.have.status(200)
      expect(res.body.approved).to.be.true
      expect(res.body.metadata.vendor_found).to.eql(validVendorName)
      expect(res.body.metadata.vendor_postal_code).to.be.eql(validVendorPostalCode)
      expect(res.body.metadata.merchant_postal_code).to.be.eql(validVendorPostalCode)
    })

    it('should return an approved code if the vendor name matches but is a differnt case', async () => {
      const vendors = config.get('approved_vendors')
      const validVendorName = Object.keys(vendors)[0]
      const validVendorPostalCode = vendors[validVendorName]
      sampleAuthorization.merchant_data.name = validVendorName.toLowerCase()
      sampleAuthorization.merchant_data.postal_code = validVendorPostalCode
      const res = await chai.request(server)
        .post('/whAuthorization')
      res.should.have.status(200)
      expect(res.body.approved).to.be.true
    })

    it('should return an approved code if the whitelisted vendor name is a subset of the incoming vendor name', async () => {
      const vendors = config.get('approved_vendors')
      const validVendorName = Object.keys(vendors)[0]
      const validVendorPostalCode = vendors[validVendorName]
      sampleAuthorization.merchant_data.name = "SQARE * " + validVendorName + " --"
      sampleAuthorization.merchant_data.postal_code = validVendorPostalCode
      const res = await chai.request(server)
        .post('/whAuthorization')
      res.should.have.status(200)
      expect(res.body.approved).to.be.true
    })
  })

  describe('for issuing_authorization.created', () => {
    let smsStub
    beforeEach(() => {
      smsStub = sandbox.stub(sms, 'sendDeclinedMsg').returns({})
      constructEventStub.returns({
        type: 'issuing_authorization.created',
        data: {
          object: sampleAuthorization
        }
      })
    })

    it('should check that the event security method is called', async () => {
      const res = await chai.request(server)
        .post('/whAuthorization')
      res.should.have.status(200)
      expect(constructEventStub.calledOnce).to.be.true
    })

    it('should not call sms.sendDeclinedMsg if the authorization was approved', async () => {
      sampleAuthorization.approved = true
      const res = await chai.request(server)
        .post('/whAuthorization')
      res.should.have.status(200)
      expect(smsStub.calledOnce).to.be.false
    })

    it('should call sms.sendDeclinedMsg if the authorization was declined', async () => {
      sampleAuthorization.approved = false
      const res = await chai.request(server)
        .post('/whAuthorization')
      res.should.have.status(200)
      expect(smsStub.calledOnce).to.be.true
      expect(smsStub.getCall(0).args).to.eql([sampleAuthorization])
    })
  })
})
