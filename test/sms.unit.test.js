import Twilio from 'twilio'
import chai, { expect } from 'chai'
import * as stripeUtils from '../src/stripe-utils.js'
import config from '../src/config.js'
import sinon from 'sinon'
import sms from '../src/sms.js'
import { spendingControls } from '../src/spending-controls.js'

const should = chai.should()
const sandbox = sinon.createSandbox()

describe('sms utils', async () => {
  const sampleCardholder = (await stripeUtils.stripe.issuing.cardholders.list({ email: global.transactionCardholderEmail })).data[0]
  let twilioMsgsStub

  beforeEach(() => {
	  twilioMsgsStub = sandbox.stub(sms, '_sendTwilioMsg').returns({})
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('welcomeMsg', () => {
	  it('should return the msg from configs', () => {
	    const msg = sms.welcomeMsg()
	    expect(msg).to.be.not.empty
	    expect(msg).to.be.eql(config.get('sms_welcome_msg'))
	  })
  })

  describe('sendWelcomeMsg', () => {
    let updateStub
    beforeEach(() => {
	    updateStub = sandbox.stub(stripeUtils.stripe.issuing.cardholders, 'update')
    })

    it('does not send if isEnabled returns false', async () => {
      sandbox.stub(sms, 'isEnabled').returns(false)
      await sms.sendWelcomeMsg(sampleCardholder)
	    expect(twilioMsgsStub.calledOnce).to.be.false
    })

    it('does send if isEnabled returns true', async () => {
      sandbox.stub(sms, 'isEnabled').returns(true)
      await sms.sendWelcomeMsg(sampleCardholder)
	    expect(twilioMsgsStub.calledOnce).to.be.true
	    expect(twilioMsgsStub.getCall(0).args.length).to.be.eql(2)
	    expect(twilioMsgsStub.getCall(0).args[0]).to.eql(sampleCardholder.phone_number)
	    expect(twilioMsgsStub.getCall(0).args[1]).to.eql(sms.welcomeMsg())
    })

    it('does not send if has sent before', async () => {
      sandbox.stub(sms, 'isEnabled').returns(true)
      const clonedCH = structuredClone(sampleCardholder)
      clonedCH.metadata.sms_welcome_sent = true
      await sms.sendWelcomeMsg(clonedCH)
	    expect(twilioMsgsStub.calledOnce).to.be.false
    })

    it('does send if has sent before AND override is set to true', async () => {
      sandbox.stub(sms, 'isEnabled').returns(true)
      const clonedCH = structuredClone(sampleCardholder)
      clonedCH.metadata.sms_welcome_sent = true
      await sms.sendWelcomeMsg(clonedCH, true)
	    expect(twilioMsgsStub.calledOnce).to.be.true
    })

    it('upon sending msg a flag is persisted so it will not send again', async () => {
      sandbox.stub(sms, 'isEnabled').returns(true)
      await sms.sendWelcomeMsg(sampleCardholder)
	    expect(twilioMsgsStub.calledOnce).to.be.true
	    expect(updateStub.calledOnce).to.be.true
	    expect(updateStub.getCall(0).args).to.eql([sampleCardholder.id, {
      	metadata: {
      		sms_welcome_sent: 1
        }
	    }])
    })
  })

  describe('helpMsg', () => {
	  it('should return the msg from configs', () => {
	    const msg = sms.helpMsg()
	    expect(msg).to.be.not.empty
	    expect(msg).to.be.eql(config.get('sms_help_msg'))
	  })
  })

  describe('declinedMsg', async () => {
    const sampleAuthorization = (await stripeUtils.stripe.issuing.authorizations.list({ cardholder: sampleCardholder.id, limit: 1 })).data[0]

	  it('should return false if the authorization was not declined', async () => {
	  	const clonedAut = structuredClone(sampleAuthorization)
	  	clonedAut.approved = true
	    const msg = await sms.declinedMsg(clonedAut)
	    expect(msg).to.be.false
	  })

	  it('should return false if the authorization was declined for unknown reason', async () => {
	  	const clonedAut = structuredClone(sampleAuthorization)
	  	clonedAut.approved = false
	  	clonedAut.request_history = [{
	  		approved: false,
	  		reason: 'unknown_reason'
	  	}]
	    const msg = await sms.declinedMsg(clonedAut)
	    expect(msg).to.be.false
	  })

	  it('should return unauthorized vendor msg if the vendor_found or vendor_postal_code are false', async () => {
	  	const clonedAut = structuredClone(sampleAuthorization)
	  	clonedAut.approved = false
	  	// stripe stores everything in metadata key/value pair as a string
	  	clonedAut.metadata.vendor_found = 'false'
	  	clonedAut.metadata.vendor_postal_code = 'false'

	    const msg = await sms.declinedMsg(clonedAut)
	    expect(msg).to.not.be.empty
	    expect(msg).to.match(/ not a verified /i)
	    expect(msg).to.match(/ vendor/i)
	  })

	  it('should return over balance msg if the authorization was not approved by stripe for authorization_controls', async () => {
	  	const clonedAut = structuredClone(sampleAuthorization)
	  	clonedAut.approved = false
	  	clonedAut.request_history = [{
	  		approved: false,
	  		reason: 'authorization_controls'
	  	}]

	    const msg = await sms.declinedMsg(clonedAut)
	    expect(msg).to.not.be.empty
	    expect(msg).to.match(/ is over /i)
	    expect(msg).to.match(/ balance /i)
	  })
  })

  describe('sendDeclinedMsg', async () => {
    let clonedAut
    const sampleAuthorization = (await stripeUtils.stripe.issuing.authorizations.list({ cardholder: sampleCardholder.id, limit: 1 })).data[0]
    // let twilioMsgsStub
    beforeEach(() => {
      // make sure it is enabled to send
	    // twilioMsgsStub = sandbox.stub(sms._twilioClient.messages, 'create').returns({})
	  	clonedAut = structuredClone(sampleAuthorization)
	  	clonedAut.approved = false
	  	// stripe stores everything in metadata key/value pair as a string
	  	clonedAut.metadata.vendor_found = 'false'
	  	clonedAut.metadata.vendor_postal_code = 'false'
    })

    it('does not send if isEnabled returns false', async () => {
      sandbox.stub(sms, 'isEnabled').returns(false)
      await sms.sendDeclinedMsg(clonedAut)
	    expect(twilioMsgsStub.calledOnce).to.be.false
    })

    it('does send if isEnabled returns true', async () => {
      sandbox.stub(sms, 'isEnabled').returns(true)
      await sms.sendDeclinedMsg(clonedAut)
	    expect(twilioMsgsStub.calledOnce).to.be.true
	    expect(twilioMsgsStub.getCall(0).args.length).to.be.eql(2)
	    expect(twilioMsgsStub.getCall(0).args[0]).to.eql(clonedAut.card.cardholder.phone_number)
	    expect(twilioMsgsStub.getCall(0).args[1]).to.not.be.empty
    })
  })

  describe('currBalanceMsg', async () => {
    it('should return current balance in the msg', async () => {
		  const spendBalance = await spendingControls.getSpendBalanceTransactions(sampleCardholder, false)
      const msg = await sms.currBalanceMsg(sampleCardholder)
	    expect(msg).to.match(/current balance/i)
	    expect(msg).to.match(new RegExp(spendBalance.balance, 'i'))
    })

    it('should return spending limit in the msg', async () => {
		  const spendBalance = await spendingControls.getSpendBalanceTransactions(sampleCardholder, false)
      const msg = await sms.currBalanceMsg(sampleCardholder)
	    expect(msg).to.match(/spending limit/i)
	    expect(msg).to.match(new RegExp(spendBalance.spending_limit, 'i'))
    })
  })

  describe('stopMsg', () => {
	  it('should return the msg from configs', () => {
	    const msg = sms.stopMsg()
	    expect(msg).to.be.not.empty
	    expect(msg).to.be.eql(config.get('sms_stop_msg'))
	  })
  })

  describe('isEnabled', async () => {
	  // it('should return false if sms_enabled is globally not set', async () => {
	  //   const configGetStub = sandbox.stub(config, 'get').returns(null)
	  //   const result = sms.isEnabled(sampleCardholder)
	  //   expect(result).to.be.false
	  //   expect(configGetStub.calledOnce).to.be.true
	  //   expect(configGetStub.getCall(0).args).to.be.eql(['sms_enabled'])
	  // })

	  // it('should return false if sms_enabled is globally set to false', async () => {
	  //   const configGetStub = sandbox.stub(config, 'get').returns(false)
	  //   const result = sms.isEnabled(sampleCardholder)
	  //   expect(result).to.be.false
	  //   expect(configGetStub.calledOnce).to.be.true
	  //   expect(configGetStub.getCall(0).args).to.be.eql(['sms_enabled'])
	  // })

	  describe('global sms_enabled is true', () => {
		  beforeEach(() => {
		  	sandbox.stub(config, 'get').returns(true)
		  })

		  it('should return false if phone number is not set', async () => {
		  	const clonedCH = structuredClone(sampleCardholder)
		  	clonedCH.phone_number = null
		    expect(sms.isEnabled(clonedCH)).to.be.false
		  })

		  it('should return false if phone number is empty', async () => {
		  	const clonedCH = structuredClone(sampleCardholder)
		  	clonedCH.phone_number = ''
		    expect(sms.isEnabled(clonedCH)).to.be.false
		  })

		  it('should return false if phone number is whitespace', async () => {
		  	const clonedCH = structuredClone(sampleCardholder)
		  	clonedCH.phone_number = '  '
		    expect(sms.isEnabled(clonedCH)).to.be.false
		  })

		  it('should return false if phone number is set but the cardholder sms_enabled is not set', async () => {
		  	const clonedCH = structuredClone(sampleCardholder)
		  	clonedCH.phone_number = '+15031234567'
		  	clonedCH.metadata.sms_enabled = null
		    expect(sms.isEnabled(clonedCH)).to.be.false
		  })

		  it('should return false if phone number is set but the cardholder sms_enabled is false', async () => {
		  	const clonedCH = structuredClone(sampleCardholder)
		  	clonedCH.phone_number = '+15031234567'
		  	clonedCH.metadata.sms_enabled = 'false'
		    expect(sms.isEnabled(clonedCH)).to.be.false
		  })

		  it('should return false if phone_number is not set but sms_enabled flag is', async () => {
		  	const clonedCH = structuredClone(sampleCardholder)
		  	clonedCH.phone_number = null
		  	clonedCH.metadata.sms_enabled = 'true'
		    expect(sms.isEnabled(clonedCH)).to.be.false
		  })

		  it('should return true if phone number is set and the cardholder sms_enabled is true', async () => {
		  	const clonedCH = structuredClone(sampleCardholder)
		  	clonedCH.phone_number = '+15031234567'
		  	clonedCH.metadata.sms_enabled = 'true'
		    expect(sms.isEnabled(clonedCH)).to.be.true
		  })
	  })
  })

  describe('persistEnabled', async () => {
    it('should not modify the cardholder if already enabled', () => {
      sandbox.stub(sms, 'isEnabled').returns(true)
	    const updateStub = sandbox.stub(stripeUtils.stripe.issuing.cardholders, 'update')
	    sms.persistEnabled(sampleCardholder)
      expect(updateStub.notCalled).to.be.true
    })

    it('should modify the cardholder if not enabled', () => {
      sandbox.stub(sms, 'isEnabled').returns(false)
	    const updateStub = sandbox.stub(stripeUtils.stripe.issuing.cardholders, 'update')
	    sms.persistEnabled(sampleCardholder)
      expect(updateStub.calledOnce).to.be.true
      expect(updateStub.getCall(0).args).to.eql([sampleCardholder.id, { metadata: { sms_enabled: true } }])
    })
  })

  describe('persistDisabled', async () => {
    it('should not modify the cardholder if already disabled', () => {
      sandbox.stub(sms, 'isEnabled').returns(false)
	    const updateStub = sandbox.stub(stripeUtils.stripe.issuing.cardholders, 'update')
	    sms.persistDisabled(sampleCardholder)
      expect(updateStub.notCalled).to.be.true
    })

    it('should modify the cardholder if enabled', () => {
      sandbox.stub(sms, 'isEnabled').returns(true)
	    const updateStub = sandbox.stub(stripeUtils.stripe.issuing.cardholders, 'update')
	    sms.persistDisabled(sampleCardholder)
      expect(updateStub.calledOnce).to.be.true
      expect(updateStub.getCall(0).args).to.eql([sampleCardholder.id, { metadata: { sms_enabled: false } }])
    })
  })
})
