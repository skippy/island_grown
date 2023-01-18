import chai, { expect } from 'chai'
import * as spendingControls from '../src/spending-controls.js'
import * as stripeUtils from '../src/stripe-utils.js'
// import config from '../../src/config.js'

const should = chai.should()

describe('getSpendBalanceTransactions', () => {
  it('should return null if cardholder found', async () => {
    let response = await spendingControls.getSpendBalanceTransactions()
    expect(response).to.be.null;
    response = await spendingControls.getSpendBalanceTransactions(null)
    expect(response).to.be.null;
  })

  it('should return an obj with expected defaults if no transactions exist', async () => {
    const ch = await stripeUtils.retrieveCardholderByEmail(global.emptyCardholderEmail)
    //stripe sets spending limits in cents, we want dollars
    const chSpendingLimitAmt = ch.spending_controls.spending_limits[0].amount/100
    let response = await spendingControls.getSpendBalanceTransactions(ch)
    expect(response).to.not.be.null;
    expect(response).to.eql({
      spending_limit: chSpendingLimitAmt,
      spent: 0,
      balance: chSpendingLimitAmt,
      transactions: []
    })
  })

  it('should return an obj with expected defaults if transactions exist', async () => {
    const ch = await stripeUtils.retrieveCardholderByEmail(global.transactionCardholderEmail)
    //stripe sets spending limits in cents, we want dollars
    const chSpendingLimitAmt = ch.spending_controls.spending_limits[0].amount/100
    let response = await spendingControls.getSpendBalanceTransactions(ch)
    expect(response).to.not.be.null;
    expect(response.spending_limit).to.eql(chSpendingLimitAmt)
    expect(response.spent).to.eql(20)
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
    //stripe sets spending limits in cents, we want dollars

    const chSpendingLimitAmt = ch.spending_controls.spending_limits[0].amount/100
    let response = await spendingControls.getSpendBalanceTransactions(ch)
    expect(response).to.not.be.null;
    expect(response.spending_limit).to.eql(chSpendingLimitAmt)
    expect(response.spent).to.eql(0)
    expect(response.balance).to.eql(chSpendingLimitAmt)
    expect(response.transactions.length).to.eql(2)
    expect(response.transactions[0].type).to.eql('refund')
    expect(response.transactions[1].type).to.eql('capture')
  })



})




