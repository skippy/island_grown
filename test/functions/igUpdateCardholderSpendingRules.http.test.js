import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'

import sinon from 'sinon'
import server from '../../src/server.js'
import * as stripeUtils from '../../src/stripe-utils.js'
import config from '../../src/config.js'
import { spendingControls } from '../../src/spending-controls.js'

const should = chai.should()
chai.use(chaiHttp)

describe('/POST igUpdateCardholderSpendingRules', () => {
  const sandbox = sinon.createSandbox();

  let constructEventStub, cardholdersUpdateStub
  afterEach(() => {
    sandbox.restore();
  })

  it('should iterate over all cardholders', async () => {
    const cardholderListSpy = sandbox.spy(stripeUtils.stripe.issuing.cardholders, "list")

    const res = await chai.request(server)
      .post('/igUpdateCardholderSpendingRules')
	    .query({ email: global.emptyCardholderEmail })
    res.should.have.status(200)
    expect(cardholderListSpy.calledOnce).to.be.true
    expect(cardholderListSpy.getCall(0).args).to.eql([])
  })

  it('should not update if recomputedSpendingLimits does not return updates to persist', async () => {
    const sampleCardholder   = (await stripeUtils.stripe.issuing.cardholders.list({ email: global.setupOneTransactionCardholder })).data[0]
    const cardholderListSpy  = sandbox.stub(stripeUtils.stripe.issuing.cardholders, "list").returns([sampleCardholder])
    const recomputeLimitsSpy = sandbox.stub(spendingControls, 'recomputeSpendingLimits').returns({})
    const updateStub         = sandbox.stub(stripeUtils.stripe.issuing.cardholders, 'update')

    const res = await chai.request(server)
      .post('/igUpdateCardholderSpendingRules')
      .query({ email: global.emptyCardholderEmail })
    res.should.have.status(200)
    expect(recomputeLimitsSpy.calledOnce).to.be.true
    expect(updateStub.notCalled).to.be.true
  })

  it('should update if recomputedSpendingLimits returns updates to persist', async () => {
    const sampleCardholder   = (await stripeUtils.stripe.issuing.cardholders.list({ email: global.setupOneTransactionCardholder })).data[0]
    const cardholderListSpy  = sandbox.stub(stripeUtils.stripe.issuing.cardholders, "list").returns([sampleCardholder])
    const recomputeLimitsSpy = sandbox.stub(spendingControls, 'recomputeSpendingLimits').returns({foo: 'bar'})
    const updateStub         = sandbox.stub(stripeUtils.stripe.issuing.cardholders, 'update')

    const res = await chai.request(server)
      .post('/igUpdateCardholderSpendingRules')
      .query({ email: global.emptyCardholderEmail })
    res.should.have.status(200)
    expect(recomputeLimitsSpy.calledOnce).to.be.true
    expect(updateStub.calledOnce).to.be.true
    expect(updateStub.getCall(0).args).to.eql([ sampleCardholder.id, { foo: 'bar' } ])
  })

})
