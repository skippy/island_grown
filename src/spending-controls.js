import config from './config.js'
import * as stripeUtils from './stripe-utils.js'
import { logger } from './logger.js'
import _ from 'lodash'

const defaultMetadata = (resetAll) => {
  // stripe doesn't allow a full reset of metadata;  you need to
  // define the parameter that should be removed with a null;
  // you can't set metadata: {} or just the values you want
  const defaults = {
    base_funding_amt: config.get('base_funding_amt'),
    numRefills: 0
  }
  if (!resetAll) return defaults
  return {
    ...clearMetadata(),
    ...defaults
  }
}


const clearMetadata = () => {
  return {
    refill_0_amt: null,
    refill_0_date: null,
    refill_1_amt: null,
    refill_1_date: null,
    refill_2_amt: null,
    refill_2_date: null,
    refill_3_amt: null,
    refill_3_date: null,
    refill_4_amt: null,
    refill_4_date: null,
    funding_traunch_initial: null,
    funding_traunch_second_refill: null,
    trial: null,
    Trial: null,
    base_funding_amt: null,
    numRefills: null
  }

}

const defaultSpendingControls = () => {
  return {
    spending_limits: [{
      amount: (config.get('base_funding_amt') * 100),
      interval: config.get('spending_limit_interval')
    }]
  }
}


// const clearSpendingControls = () => {
//   return {
//     spending_limits: []
//   }
// }


const clearSpendingControls = () => {
  //NOTE: possible bug in Stripe API; if additional data is sent in updateData, spending_controls: null
  // but if no data besides spending controls is sent, you can send an empty hash to clear it
  const updateData = {
    metadata: spendingControls.clearMetadata(),
    spending_controls: null
  }
  return updateData
}

const recomputeSpendingLimits = async (cardholder) => {
  // NOTE: if cardholder is NOT setup properly, this should fix that.  BUT is that proper or
  // should we throw an exception so it doesn't quietly fix other issues...?

  // calling on itself but in the declared namespace helps stub ESM modules
  const spendingInfo = await spendingControls.getSpendBalanceTransactions(cardholder, false)
  const updateData = {}
  if(_.isUndefined(cardholder.metadata) ||
    _.isUndefined(cardholder.metadata.numRefills)){
    //reset metadata!  this shouldn't happen, but lets check just in case because of older data
    updateData.metadata = spendingControls.defaultMetadata()
  }
  if(_.isUndefined(cardholder.spending_controls) ||
    !_.isArray(cardholder.spending_controls.spending_limits) ||
     cardholder.spending_controls.spending_limits.length === 0){
    updateData.spending_controls = spendingControls.defaultSpendingControls()
  }

  if (spendingInfo.spend < spendingInfo.spending_limit * config.get('refill_trigger_percent')) {
    logger.debug('spend is fine; no refill needed')
    return updateData
  }

  const refillIndex = cardholder.metadata.numRefills
  const refillAmts = config.get('refill_amts')
  const refillAmt = refillAmts[refillIndex]
  if (!refillAmt) {
    logger.debug(`approaching spending limit BUT they are maxed out on refills: ${refillIndex}`)
    return updateData
  }

  logger.debug('spend is close to spending limit and refill is available')
  updateData.metadata = updateData.metadata || {}
  updateData.metadata.numRefills = parseInt(cardholder.metadata.numRefills) + 1

  updateData.spending_controls = {
    spending_limits: [
      {
        amount: ((spendingInfo.spending_limit + refillAmt) * 100),
        interval: config.get('spending_limit_interval')
      }
    ]
  }
  updateData.metadata[`refill_${refillIndex}_amt`]  = refillAmt
  updateData.metadata[`refill_${refillIndex}_date`] = new Date().toLocaleDateString()
  return updateData
}

// const resetMetadata = async (cardholder) => {
//   await stripeUtils.stripe.issuing.cardholders.update(
//     cardholder.id,
//     { metadata: spendingControls.defaultMetadata() }

//   )
// }

// const resetSpendingControls = async(cardholder) => {
//   await stripeUtils.stripe.issuing.cardholders.update(
//     cardholder.id,
//     { spending_controls: spendingControls.defaultSpendingControls() }
//   )
// }

const getSpendBalanceTransactions = async (cardholder, includeTransactions = true) => {
  if (!cardholder) return null
  const output = {
    spending_limit: currentAllTimeSpendingLimit(cardholder),
    spend: 0.0,
    balance: 0.0,
    pending_transactions: 0,
    pending_amt: 0
  }
  if (includeTransactions) output.transactions = []
  const listArgs = constructListArgs(cardholder)

  for await (const transaction of stripeUtils.stripe.issuing.transactions.list(listArgs)) {
    const tran = {
      amount: parseFloat((Math.abs(transaction.amount) / 100).toFixed(2)),
      type: transaction.type,
      created_at: new Date(transaction.created * 1000)
    }
    tran.merchant = Object.fromEntries(
      ['name', 'city', 'state', 'postal_code']
        .map(key => [key, transaction.merchant_data[key]])
    )
    if (transaction.type === 'capture') {
      output.spend += tran.amount
    } else {
      output.spend -= tran.amount
    }
    if (includeTransactions) output.transactions.push(tran)
  }

  for await (const pendingAuths of stripeUtils.stripe.issuing.authorizations.list({ ...listArgs, status: 'pending' })) {
    if (output.pending_transactions === 0) logger.debug('pending authorizations')
    output.pending_transactions++
    output.pending_amt += pendingAuths.amount / 100
  }
  output.spend += output.pending_amt

  output.pending_amt = parseFloat(output.pending_amt.toFixed(2))
  output.spend = parseFloat(output.spend.toFixed(2))
  output.balance = parseFloat((output.spending_limit - output.spend).toFixed(2))
  return output
}

//NOTE: this hides any issues if the spending_limit is NOT set, which should never happen
const currentAllTimeSpendingLimit = (cardholder) => {
  const sl = cardholder.spending_controls.spending_limits.find(l => l.interval === config.get('spending_limit_interval'))
  return sl ? parseFloat((sl.amount / 100).toFixed(2)) : config.get('base_funding_amt')
}

const constructListArgs = (cardholder) => {
  const listArgs = { cardholder: cardholder.id }
  switch (config.get('spending_limit_interval')) {
    case 'all_time':
    // code block
      break
    case 'yearly':
    // get Jan 1st of current year, and return the unix timestamp
      listArgs['created[gte]'] = new Date(new Date().getFullYear(), 0, 1).valueOf()
      break
    case 'monthly':
    // get the 1st of current month, and return the unix timestamp
      const currDate = new Date()
      var firstDay = new Date(currDate.getFullYear(), currDate.getMonth(), 1)
      listArgs['created[gte]'] = firstDay.valueOf()
      break
    default:
      throw new Error("spending_limit_interval value '${const.get('spending_limit_interval')}' is not allowed")
    // code block
  }
  return listArgs
}

// using this model to help with stubbing of an ESM module
export const spendingControls = {
  defaultMetadata,
  clearMetadata,
  defaultSpendingControls,
  clearSpendingControls,
  recomputeSpendingLimits,
  getSpendBalanceTransactions
}
