import chai, { expect } from 'chai'
import sinon from 'sinon'
import _ from 'lodash'

import { spendingControls } from '../src/spending-controls.js'
import * as stripeUtils from '../src/stripe-utils.js'
import config from '../src/config.js'

const should = chai.should()

describe('defaultMetadata', () => {
  it('should return numRefills set to zero', () => {
    const defaults = spendingControls.defaultMetadata()
    expect(defaults.numRefills).to.eql(0)
  })

  it('should return base_funding_amt set to what it is in configs', () => {
    const defaults = spendingControls.defaultMetadata()
    expect(defaults.base_funding_amt).to.eql(config.get('base_funding_amt'))
  })

  it('should pass back all the metadata resets', () => {
    const defaults = spendingControls.defaultMetadata(true)
    expect(Object.keys(defaults).length).to.be.above(5)
    // just a sample
    expect(defaults.refill_0_amt).to.be.null
    expect(defaults.refill_0_date).to.be.null
    // BUT the other expected values are still set
    expect(defaults.base_funding_amt).to.not.be.null
    expect(defaults.numRefills).to.not.be.null
  })
})

describe('defaultSpendingControls', () => {
  it('should return the expected spending limit, set in configs, and set to the base funding amt', () => {
    const defaults = spendingControls.defaultSpendingControls()
    expect(defaults).to.eql({
      spending_limits: [{
        amount: (config.get('base_funding_amt') * 100),
        interval: config.get('spending_limit_interval')
      }]
    })
  })
})

describe('recomputeSpendingLimits', async () => {
  const sandbox = sinon.createSandbox()
  let spendBalanceStub, sampleCardholder, defaultSpendBalance
  before(async () => {
    sampleCardholder = (await stripeUtils.stripe.issuing.cardholders.list({ email: global.emptyCardholderEmail })).data[0]
    defaultSpendBalance = await spendingControls.getSpendBalanceTransactions(sampleCardholder)
  })

  beforeEach(() => {
    spendBalanceStub = sandbox.stub(spendingControls, 'getSpendBalanceTransactions').returns(defaultSpendBalance)
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should return no updates to be made if there are no transactions', async () => {
    expect(defaultSpendBalance.transactions).to.be.empty
    const defaults = await spendingControls.recomputeSpendingLimits(sampleCardholder)
    expect(defaults).to.eql({})
  })

  it('should return a default metadata update if the metadata is empty', async () => {
    const clonedCardholder = _.cloneDeep( sampleCardholder )
    clonedCardholder.metadata = {}
    const defaults = await spendingControls.recomputeSpendingLimits(clonedCardholder)
    expect(defaults).to.not.be.empty
    expect(defaults.metadata).to.eql(spendingControls.defaultMetadata())
  })

  it('should return a spending limit update if the spending limit information is empty', async () => {
    const clonedCardholder = _.cloneDeep( sampleCardholder )
    clonedCardholder.spending_controls = {}
    const defaults = await spendingControls.recomputeSpendingLimits(clonedCardholder)
    expect(defaults).to.not.be.empty
    expect(defaults.spending_controls).to.eql(spendingControls.defaultSpendingControls())
  })

  it('should return an update if the spend is equal to spend_limit', async () => {
    const modifiedSpendBalance = structuredClone(defaultSpendBalance)
    modifiedSpendBalance.spend = modifiedSpendBalance.spending_limit
    spendBalanceStub.returns(modifiedSpendBalance)

    const defaults = await spendingControls.recomputeSpendingLimits(sampleCardholder)
    expect(defaults.spending_controls).to.eql({
      spending_limits: [{ amount: 22500, interval: config.get('spending_limit_interval') }]
    })
    expect(defaults.metadata.numRefills).to.eql(1)
    expect(defaults.metadata.refill_0_amt).to.eql(75)
    expect(defaults.metadata.refill_0_date).to.be.eql(new Date().toLocaleDateString())
  })

  it('should return an update if the spend is over the config refill_trigger_percent', async () => {
    const modifiedSpendBalance = structuredClone(defaultSpendBalance)
    modifiedSpendBalance.spend = modifiedSpendBalance.spending_limit * config.get('refill_trigger_percent')
    spendBalanceStub.returns(modifiedSpendBalance)

    const defaults = await spendingControls.recomputeSpendingLimits(sampleCardholder)
    expect(defaults.spending_controls).to.eql({
      spending_limits: [{ amount: 22500, interval: config.get('spending_limit_interval') }]
    })
    expect(defaults.metadata.numRefills).to.eql(1)
    expect(defaults.metadata.refill_0_amt).to.eql(75)
    expect(defaults.metadata.refill_0_date).to.be.eql(new Date().toLocaleDateString())
  })

  it('should return an update with multiple refills if called multiple times', async () => {
    // FIXME: we should really stub the config.get('refill_amts') to force this, but
    // the following mocking didn't quite work; I suspect it is a namespacing thing
    // const limitedConfigSub = sandbox.stub(config, "get").withArgs('refill_amts').returns([75,100])
    // limitedConfigSub.callThrough()
    const modifiedSpendBalance = structuredClone(defaultSpendBalance)
    modifiedSpendBalance.spend = modifiedSpendBalance.spending_limit + 75 // trigger the next refill
    spendBalanceStub.returns(modifiedSpendBalance)

    const defaults = await spendingControls.recomputeSpendingLimits(sampleCardholder)
    expect(defaults.spending_controls).to.eql({
      spending_limits: [{ amount: 22500, interval: config.get('spending_limit_interval') }]
    })
    expect(defaults.metadata.numRefills).to.eql(1)
    expect(defaults.metadata.refill_0_amt).to.eql(75)
    expect(defaults.metadata.refill_0_date).to.be.eql(new Date().toLocaleDateString())

    sampleCardholder.metadata = defaults.metadata
    sampleCardholder.spending_controls = defaults.spending_controls
    modifiedSpendBalance.spending_limit = modifiedSpendBalance.spend
    modifiedSpendBalance.spend = modifiedSpendBalance.spend + 50
    const defaults2 = await spendingControls.recomputeSpendingLimits(sampleCardholder)
    expect(defaults2.spending_controls).to.eql({
      spending_limits: [{ amount: 27500, interval: config.get('spending_limit_interval') }]
    })
    expect(defaults2.metadata.numRefills).to.eql(2)
    expect(defaults2.metadata.refill_1_amt).to.eql(50)
    expect(defaults2.metadata.refill_1_date).to.be.eql(new Date().toLocaleDateString())
  })
})

describe('getSpendBalanceTransactions', () => {
  const sandbox = sinon.createSandbox()

  afterEach(() => {
    sandbox.restore()
  })

  it('should return null if cardholder found', async () => {
    let response = await spendingControls.getSpendBalanceTransactions()
    expect(response).to.be.null
    response = await spendingControls.getSpendBalanceTransactions(null)
    expect(response).to.be.null
  })

  it('should return an obj with expected defaults if no transactions exist', async () => {
    const ch = await stripeUtils.retrieveCardholderByEmail(global.emptyCardholderEmail)
    // stripe sets spending limits in cents, we want dollars
    const chSpendingLimitAmt = ch.spending_controls.spending_limits[0].amount / 100
    const response = await spendingControls.getSpendBalanceTransactions(ch)
    expect(response).to.not.be.null
    expect(response).to.eql({
      spending_limit: chSpendingLimitAmt,
      spend: 0,
      pending_transactions: 0,
      pending_amt: 0,
      balance: chSpendingLimitAmt,
      transactions: []
    })
  })

  it('should return an obj with expected defaults if transactions exist', async () => {
    const ch = await stripeUtils.retrieveCardholderByEmail(global.transactionCardholderEmail)
    // stripe sets spending limits in cents, we want dollars
    const chSpendingLimitAmt = ch.spending_controls.spending_limits[0].amount / 100
    const response = await spendingControls.getSpendBalanceTransactions(ch)
    expect(response).to.not.be.null
    expect(response.spending_limit).to.eql(chSpendingLimitAmt)
    expect(response.spend).to.eql(20)
    expect(response.balance).to.eql(chSpendingLimitAmt - 20)
    expect(response.transactions.length).to.eql(1)
    expect(response.transactions[0].amount).to.eql(20)
    expect(response.transactions[0].type).to.eql('capture')
    expect(response.transactions[0].created_at).to.not.be.null
    expect(response.transactions[0].merchant.name).to.not.be.empty
    expect(response.transactions[0].merchant.city).to.not.be.empty
    expect(response.transactions[0].merchant.state).to.not.be.empty
    expect(response.transactions[0].merchant.postal_code).to.not.be.empty
  })

  it('should correctly balance a transaction and refund', async () => {
    const ch = await stripeUtils.retrieveCardholderByEmail(global.transactionWithRefundCardholderEmail)
    // stripe sets spending limits in cents, we want dollars

    const chSpendingLimitAmt = ch.spending_controls.spending_limits[0].amount / 100
    const response = await spendingControls.getSpendBalanceTransactions(ch)
    expect(response).to.not.be.null
    expect(response.spending_limit).to.eql(chSpendingLimitAmt)
    expect(response.spend).to.eql(0)
    expect(response.balance).to.eql(chSpendingLimitAmt)
    expect(response.transactions.length).to.eql(2)
    expect(response.transactions[0].type).to.eql('refund')
    expect(response.transactions[1].type).to.eql('capture')
  })

  it('should correctly handle a transaction and pending authorizations', async () => {
    const ch = await stripeUtils.retrieveCardholderByEmail(global.transactionPendingCardholderEmail)
    const chSpendingLimitAmt = ch.spending_controls.spending_limits[0].amount / 100
    const response = await spendingControls.getSpendBalanceTransactions(ch)
    expect(response).to.not.be.null
    expect(response.spending_limit).to.eql(chSpendingLimitAmt)
    expect(response.spend).to.eql(30)
    expect(response.pending_transactions).to.eql(1)
    expect(response.pending_amt).to.eql(10)
    expect(response.balance).to.eql(chSpendingLimitAmt - 30)
    expect(response.transactions.length).to.eql(1)
    expect(response.transactions[0].type).to.eql('capture')
  })

  it('should not pass a created filter if spending_limit_interval is set to all_time', async () => {
    const transactionsListSpy = sandbox.spy(stripeUtils.stripe.issuing.transactions, 'list')
    const configGetSpy = sandbox.stub(config, 'get').returns('all_time')
    const ch = await stripeUtils.retrieveCardholderByEmail(global.emptyCardholderEmail)

    // stripe sets spending limits in cents, we want dollars
    const response = await spendingControls.getSpendBalanceTransactions(ch)
    expect(transactionsListSpy.calledOnce).to.be.true
    expect(transactionsListSpy.getCall(0).args[0]).to.eql({ cardholder: ch.id })
  })

  it('should pass a created filter set to the beginning of the year if spending_limit_interval is set to yearly', async () => {
    const transactionsListSpy = sandbox.spy(stripeUtils.stripe.issuing.transactions, 'list')
    const configGetSpy = sandbox.stub(config, 'get').returns('yearly')
    const ch = await stripeUtils.retrieveCardholderByEmail(global.emptyCardholderEmail)

    // stripe sets spending limits in cents, we want dollars
    const response = await spendingControls.getSpendBalanceTransactions(ch)
    expect(transactionsListSpy.calledOnce).to.be.true
    // console.log(cardholderListSpy.getCall(1).args)
    const beginningOfYear = new Date(new Date().getFullYear(), 0, 1).valueOf()/1000
    expect(transactionsListSpy.getCall(0).args[0]).to.eql({ cardholder: ch.id, 'created[gte]': beginningOfYear })
  })

  it('should pass a created filter set to the beginning of the month if spending_limit_interval is set to monthly', async () => {
    const transactionsListSpy = sandbox.spy(stripeUtils.stripe.issuing.transactions, 'list')
    const configGetSpy = sandbox.stub(config, 'get').returns('monthly')
    const ch = await stripeUtils.retrieveCardholderByEmail(global.emptyCardholderEmail)

    // stripe sets spending limits in cents, we want dollars
    const response = await spendingControls.getSpendBalanceTransactions(ch)
    expect(transactionsListSpy.calledOnce).to.be.true
    // console.log(cardholderListSpy.getCall(1).args)
    const currDate = new Date()
    const beginningOfMonth = new Date(currDate.getFullYear(), currDate.getMonth(), 1).valueOf()/1000
    expect(transactionsListSpy.getCall(0).args[0]).to.eql({ cardholder: ch.id, 'created[gte]': beginningOfMonth })
  })
})
