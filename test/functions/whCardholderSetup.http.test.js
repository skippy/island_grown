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

describe('/POST whCardholderSetup', () => {
  const sandbox = sinon.createSandbox()
  let sampleCardholder
  before(async () => {
    sampleCardholder = (await stripeUtils.stripe.issuing.cardholders.list({ email: global.emptyCardholderEmail })).data[0]
  })

  let constructEventStub, cardholdersUpdateStub
  beforeEach(() => {
    constructEventStub = sandbox.stub(stripeUtils.stripe.webhooks, 'constructEvent')
    cardholdersUpdateStub = sandbox.stub(stripeUtils.stripe.issuing.cardholders, 'update').returns(true)
    constructEventStub.returns({
      type: 'issuing_cardholder.updated',
      data: {
        object: sampleCardholder
      }
    })
  })
  afterEach(() => {
    sandbox.restore()
  })

  it('should check that the event security method is called', async () => {
    const res = await chai.request(server)
      .post('/whCardholderSetup')
    res.should.have.status(200)
    expect(constructEventStub.calledOnce).to.be.true
  })

  // these objects should be setup!
  // it('should update the cardholder if the metadata is empty', async () => {
  //   sampleCardholder.metadata = {}
  //   const res = await chai.request(server)
  //     .post('/whCardholderSetup')
  //   res.should.have.status(200)
  //   expect(constructEventStub.calledOnce).to.be.true
  //   expect(cardholdersUpdateStub.calledOnce).to.be.true
  //   expect(cardholdersUpdateStub.getCall(0).args).to.eql(    sampleCardholder.id, { metadata: { numRefills: 0, base_funding_amt: config.get('base_funding_amt') } })
  // })

  //   it('should update the cardholder if the spending_limits are empty', async () => {
  //     sampleCardholder.spending_controls = { spending_limits: [] }
  //     const res = await chai.request(server)
  //       .post('/whCardholderSetup')
  //     res.should.have.status(200)
  //     expect(constructEventStub.calledOnce).to.be.true
  //     expect(cardholdersUpdateStub.calledOnce).to.be.true
  //     expect(cardholdersUpdateStub.getCall(0).args).to.eql(expectedCardholderUpdateObject(sampleCardholder))
  //   })

  it('should not update the cardholder if the spending_limits and metadata are setup with defaults', async () => {
    const expectedVals = expectedCardholderUpdateObject(sampleCardholder)[1]
    sampleCardholder.spending_controls = expectedVals.spending_controls
    sampleCardholder.metadata = expectedVals.metadata

    const res = await chai.request(server)
      .post('/whCardholderSetup')
    res.should.have.status(200)
    expect(cardholdersUpdateStub.notCalled).to.be.true
  })

  it('should not update the cardholder a different event type is entered', async () => {
    constructEventStub.returns({
      type: 'issuing_card.updated',
      data: {
        object: sampleCardholder
      }
    })
    const res = await chai.request(server)
      .post('/whCardholderSetup')
    res.should.have.status(200)
    expect(cardholdersUpdateStub.notCalled).to.be.true
  })

  it('should send an sms welcome message', async () => {
    const smsStub = sandbox.stub(sms, 'sendWelcomeMsg')

    const res = await chai.request(server)
      .post('/whCardholderSetup')
    res.should.have.status(200)
    expect(smsStub.calledOnce).to.be.true
    expect(smsStub.getCall(0).args).to.eql([sampleCardholder])
  })
})

const expectedCardholderUpdateObject = (cardholder) => {
  return [
    cardholder.id,
    {
      metadata: { numRefills: 0, base_funding_amt: config.get('base_funding_amt') },
      spending_controls: { spending_limits: [{ amount: config.get('base_funding_amt') * 100, interval: config.get('spending_limit_interval') }] }
    }
  ]
}
