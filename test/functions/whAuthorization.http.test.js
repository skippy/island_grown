import chai, { expect } from 'chai'
// import spies from 'chai-spies'
import chaiHttp from 'chai-http'
import sinon from 'sinon'
import server from '../../src/server.js'
import * as stripeUtils from '../../src/stripe-utils.js'
import config from '../../src/config.js'
import sms from '../../src/sms.js'
import _ from 'lodash'

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
    let origVendorConfigs
    // before(async () => {
    //   origVendorConfigs = config.get('approved_vendors')
    // })
    beforeEach(() => {
      // sandbox.stub(config, 'get').withArgs('approved_vendors').returns(origVendorConfigs)
      origVendorConfigs = _.cloneDeep(config.get('approved_vendors'))
      constructEventStub.returns({
        type: 'issuing_authorization.request',
        data: {
          object: sampleAuthorization
        }
      })
    })

    afterEach(() => {
      config.set('approved_vendors', origVendorConfigs)
    })

    describe('matching multiple variations of a vendor name', () => {
      it('should match a regular string', async() => {
        let vendors = config.get('approved_vendors')
        vendors['My Vendor'] = sampleAuthorization.merchant_data.postal_code
        config.set('approved_vendors', vendors)
        sampleAuthorization.merchant_data.name = 'My Vendor'

        const res = await chai.request(server)
          .post('/whAuthorization')
        res.should.have.status(200)

        expect(res.body.approved).to.be.true
        expect(res.body.metadata.vendor_found).to.equal('My Vendor')
      })

      it('should match a mismatched case string', async() => {
        let vendors = config.get('approved_vendors')
        vendors['My Vendor'] = sampleAuthorization.merchant_data.postal_code
        config.set('approved_vendors', vendors)
        sampleAuthorization.merchant_data.name = 'my vendor'

        const res = await chai.request(server)
          .post('/whAuthorization')
        res.should.have.status(200)

        expect(res.body.approved).to.be.true
        expect(res.body.metadata.vendor_found).to.equal('My Vendor')
      })

      it('should match a partial name match', async() => {
        let vendors = config.get('approved_vendors')
        vendors['Vendor2'] = sampleAuthorization.merchant_data.postal_code
        config.set('approved_vendors', vendors)
        sampleAuthorization.merchant_data.name = 'My Vendor2'

        const res = await chai.request(server)
          .post('/whAuthorization')
        res.should.have.status(200)

        expect(res.body.approved).to.be.true
        expect(res.body.metadata.vendor_found).to.equal('Vendor2')
      })

      it('should match a partial name match with * characters in the name which are not a part of a regex', async() => {
        let vendors = config.get('approved_vendors')
        vendors['Vendor2'] = sampleAuthorization.merchant_data.postal_code
        config.set('approved_vendors', vendors)
        sampleAuthorization.merchant_data.name = 'FSP*My Vendor2*d'

        const res = await chai.request(server)
          .post('/whAuthorization')
        res.should.have.status(200)

        expect(res.body.approved).to.be.true
        expect(res.body.metadata.vendor_found).to.equal('Vendor2')
      })

      it('should match a vendor name with a \`', async() => {
        let vendors = config.get('approved_vendors')
        vendors['My Vendor\'s Farm'] = sampleAuthorization.merchant_data.postal_code
        config.set('approved_vendors', vendors)
        sampleAuthorization.merchant_data.name = 'my vendor\'s farm'

        const res = await chai.request(server)
          .post('/whAuthorization')
        res.should.have.status(200)

        expect(res.body.approved).to.be.true
        expect(res.body.metadata.vendor_found).to.equal('My Vendor\'s Farm')
      })


      it('should match a partial name match that is case insensitive', async() => {
        let vendors = config.get('approved_vendors')
        vendors['Vendor2'] = sampleAuthorization.merchant_data.postal_code
        config.set('approved_vendors', vendors)
        sampleAuthorization.merchant_data.name = 'my vendor2'

        const res = await chai.request(server)
          .post('/whAuthorization')
        res.should.have.status(200)

        expect(res.body.approved).to.be.true
        expect(res.body.metadata.vendor_found).to.equal('Vendor2')
      })

      it('should match a vendor name with a space regexp', async() => {
        let vendors = config.get('approved_vendors')
        vendors['my\\s*vendor'] = sampleAuthorization.merchant_data.postal_code
        config.set('approved_vendors', vendors)
        sampleAuthorization.merchant_data.name = 'my vendor'

        const res = await chai.request(server)
          .post('/whAuthorization')
        res.should.have.status(200)

        expect(res.body.approved).to.be.true
        expect(res.body.metadata.vendor_found).to.equal('my\\s*vendor')
      })

      it('should match a partial vendor name with a regexp', async() => {
        let vendors = config.get('approved_vendors')
        vendors['my\\s+vendor'] = sampleAuthorization.merchant_data.postal_code
        config.set('approved_vendors', vendors)
        sampleAuthorization.merchant_data.name = 'my vendor lucky'

        const res = await chai.request(server)
          .post('/whAuthorization')
        res.should.have.status(200)

        expect(res.body.approved).to.be.true
        expect(res.body.metadata.vendor_found).to.equal('my\\s+vendor')
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

    it('should return an unapproved code AND an empty postal_code if the postal_code is not set', async () => {
      //NOTE: stripe can't receive null values in the metadata;
      // if it does it will fail serverside with odd behavior
      // NOTE2: this can happen with certain vendors such as online vendors like Blizzard
      sampleAuthorization.merchant_data.postal_code = null
      const res = await chai.request(server)
        .post('/whAuthorization')
      res.should.have.status(200)
      expect(res.body.approved).to.be.false
      expect(res.body.metadata.vendor_found).to.be.false
      expect(res.body.metadata.merchant_postal_code).to.equal('')
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

    it('should return an approved code if the vendor name matches, but the postal code of the merchant does not BUT it is in the approved zipcode list', async () => {
      const vendors = config.get('approved_vendors')
      const postalCodes = config.get('approved_postal_codes')

      const validVendorName = Object.keys(vendors)[0]
      const validVendorPostalCode = postalCodes[0]
      const vendorPostalCode = vendors[validVendorName]

      sampleAuthorization.merchant_data.name = validVendorName
      sampleAuthorization.merchant_data.postal_code = validVendorPostalCode.toString()
      const res = await chai.request(server)
        .post('/whAuthorization')
      res.should.have.status(200)
      expect(res.body.approved).to.be.true
      expect(res.body.metadata.vendor_found).to.eql(validVendorName)
      expect(res.body.metadata.in_approved_postal_code_list).to.true
      expect(res.body.metadata.vendor_postal_code).to.be.eql(vendorPostalCode)
      expect(res.body.metadata.merchant_postal_code).to.be.eql(validVendorPostalCode.toString())
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
