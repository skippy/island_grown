import { check, validationResult } from 'express-validator'
import config from './config.js'
import * as StripeUtils from './stripe-utils.js'
import Stripe from 'stripe'
//NOTE: remove API version and use stripe dashboard
export const stripe = new Stripe(config.get('stripe_api_key'), { apiVersion: '2022-11-15' })

export const getSpendBalanceTransactions = async (cardholder, includeTransactions=true) => {
  if(!cardholder) return null
  const output = {
    spending_limit: currentAllTimeSpendingLimit(cardholder),
    spent: 0.0,
    balance: 0.0,
  }
  if(includeTransactions) output.transactions = []
  for await (const transaction of stripe.issuing.transactions.list({ cardholder: cardholder.id })) {
    const tran = {
      amount: parseFloat((Math.abs(transaction.amount) / 100).toFixed(2)),
      type: transaction.type,
      created_at: new Date(transaction.created * 1000)
    }
    tran.merchant = Object.fromEntries(
      ['name', 'city', 'state', 'postal_code']
        .map(key => [key, transaction.merchant_data[key]])
    )
    if(transaction.type === 'capture'){
      output.spent += tran.amount
    }else{
      output.spent -= tran.amount
    }
    if(includeTransactions) output.transactions.push(tran)
  }
  output.spent   = parseFloat(output.spent.toFixed(2))
  output.balance = parseFloat((output.spending_limit - output.spent).toFixed(2))
  return output
}

const currentAllTimeSpendingLimit = (cardholder) => {
  const sl = cardholder.spending_controls.spending_limits.find(l => l.interval === 'all_time')
  return sl ? parseFloat((sl.amount / 100).toFixed(2)) : config.get('base_funding_amt')
}

