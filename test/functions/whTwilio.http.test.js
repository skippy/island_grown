import chai, { expect } from 'chai'
// import spies from 'chai-spies'
import chaiHttp from 'chai-http'
import sinon from 'sinon'
import Twilio from 'twilio'

import server from '../../src/server.js'
import * as stripeUtils from '../../src/stripe-utils.js'
import config from '../../src/config.js'
import sms from '../../src/sms.js'

chai.use(chaiHttp)
const should = chai.should()

describe('/POST whTwilio', () => {
  const sandbox = sinon.createSandbox()
  let sampleCardholder
  before(async () => {
    sampleCardholder = (await stripeUtils.stripe.issuing.cardholders.list({ email: global.setupOneTransactionCardholder })).data[0]
  })

  let constructEventStub
  beforeEach(() => {
    // constructEventStub = sandbox.stub(stripeUtils.stripe.webhooks, 'constructEvent')
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should return 404 if phone number is not found', async () => {
    const res = await chai.request(server)
      .post('/whTwilio')
      .send({ From: '+12223334444', Body: 'should not be called' })
    res.should.have.status(404)
  })

  describe('valid phone number', () => {
    it('should return 200 if phone number is found', async () => {
      const res = await chai.request(server)
        .post('/whTwilio')
        .send({ From: sampleCardholder.phone_number, Body: 'should not be called' })
      res.should.have.status(200)
    })

    it('should return a twiml xml if phone number is found', async () => {
      const res = await chai.request(server)
        .post('/whTwilio')
        .send({ From: sampleCardholder.phone_number, Body: 'should not be called' })
      expect(res.headers['content-type']).to.be.eql('text/xml')
      expect(res.text).to.satisfy(msg => msg.startsWith('<?xml version="1.0" encoding="UTF-8"?><Response><Message>'))
      expect(res.text).to.satisfy(msg => msg.endsWith('</Message></Response>'))
    })

    it('should return current balance for various commands', async () => {
      const expectedMsg = await sms.currBalanceMsg(sampleCardholder)
      for await (const cmd of ['b', 'B', 'balance', 'Balance', 'BALANCE', 'bal', 'Bal', 'BAL']) {
        const res = await chai.request(server)
          .post('/whTwilio')
          .send({ From: sampleCardholder.phone_number, Body: cmd })
        expect(res.text).to.contain(expectedMsg)
      }
    })

    it('should default to returning balance if unexpected cmd is entered', async () => {
      const res = await chai.request(server)
        .post('/whTwilio')
        .send({ From: sampleCardholder.phone_number, Body: 'unkown command' })
      expect(res.text).to.contains(await sms.currBalanceMsg(sampleCardholder))
    })

    it('should return current help', async () => {
      const expectedMsg = await sms.helpMsg()
      for await (const cmd of ['h', 'H', 'help', 'Help', 'HELP', 'info', 'Info', 'INFO']) {
        const res = await chai.request(server)
          .post('/whTwilio')
          .send({ From: sampleCardholder.phone_number, Body: cmd })
        expect(res.text).to.contain(expectedMsg)
      }
    })

    it('should return current vendors', async () => {
      const expectedMsg = await sms.vendorsMsg()
      for await (const cmd of ['v', 'v', 'vendor', 'Vendor', 'VENDORS', 'vendors', 'ven', 'Ven', 'VEN']) {
        const res = await chai.request(server)
          .post('/whTwilio')
          .send({ From: sampleCardholder.phone_number, Body: cmd })
        expect(res.text).to.contain(expectedMsg)
      }
    })

    it('should persist that the cardholder is enabled when start is passed back', async () => {
      const expectedMsg = await sms.helpMsg()
      const smsStub = sandbox.stub(sms, 'persistEnabled')
      for await (const cmd of ['start', 'Start', 'START']) {
        const res = await chai.request(server)
          .post('/whTwilio')
          .send({ From: sampleCardholder.phone_number, Body: cmd })
        expect(smsStub.calledOnce).to.be.true
        expect(smsStub.getCall(0).args).to.eql([sampleCardholder])
        smsStub.resetHistory()
        // no msg, as twilio has a default msg
        expect(res.text).to.eql('<?xml version="1.0" encoding="UTF-8"?><Response><Message/></Response>')
      }
    })

    it('should persist that the cardholder is disabled when stop is entered', async () => {
      const expectedMsg = await sms.helpMsg()
      const smsStub = sandbox.stub(sms, 'persistDisabled')
      for await (const cmd of ['stop', 'Stop', 'STOP']) {
        const res = await chai.request(server)
          .post('/whTwilio')
          .send({ From: sampleCardholder.phone_number, Body: cmd })
        expect(smsStub.calledOnce).to.be.true
        expect(smsStub.getCall(0).args).to.eql([sampleCardholder])
        smsStub.resetHistory()
        // no msg, as twilio has a default msg
        expect(res.text).to.eql('<?xml version="1.0" encoding="UTF-8"?><Response><Message/></Response>')
      }
    })
  })
})
