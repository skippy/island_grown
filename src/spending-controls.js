import { check, validationResult } from 'express-validator'
import config from './config.js'
import * as stripeUtils from './stripe-utils.js'
import { logger } from './logger.js'


const defaultMetadata = (resetAll) => {
  //stripe doesn't allow a full reset of metadata;  you need to
  //define the parameter that should be removed with a null;
  // you can't set metadata: {} or just the values you want
  const defaults = {
    base_funding_amt: config.get('base_funding_amt'),
    numRefills: 0
  }
  if(!resetAll) return defaults;

  const resetDefaults = {
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
    Trial: null
  }
  return {
    ...defaults,
    ...resetDefaults
    }
  }

const defaultSpendingControls = () => {
  return  {
    spending_limits: [{ amount: (config.get('base_funding_amt') * 100),
                        interval: 'all_time'
                     }]
  }
}


const recomputeSpendingLimits = async(cardholder) => {
  // ASSUME cardholder is properly setup.  If not, this logic will fail.
  // rather than add logic to try to fix it, let it fail so we can figure out
  // why the object was not properly setup in the first place
  // update spending limits and refills if needed
  // calling on itself but in the declared namespace helps stub ESM modules
  const spendingInfo = await spendingControls.getSpendBalanceTransactions(cardholder,false)

//   if(!cardholder.metadata.numRefills){
//     //reset metadata!  this shouldn't happen, but lets check just in case
//     cardholder.metadata = spendingControls.defaultMetadata()
//     updateData.metadata = cardholder.metadata
//   }
//   if(!cardholder.spending_controls || !cardholder.spending_controls.spending_limits || cardholder.spending_controls.spending_limits.length ===0){
// console.log(cardholder.spending_controls)
//     cardholder.spending_controls = spendingControls.defaultSpendingControls()
//     updateData.spending_controls = cardholder.spending_controls
//   }
  if(spendingInfo.spend < spendingInfo.spending_limit * config.get('refill_trigger_percent')){
    logger.debug("spend is fine; no refill needed")
    return {}
  }

  const refillIndex = cardholder.metadata.numRefills
  const refillAmts = config.get('refill_amts')
  const refillAmt = refillAmts[refillIndex]
  if(!refillAmt){
    logger.debug(`approaching spending limit BUT they are maxed out on refills: ${refillIndex}`)
    return {}
  }

  logger.debug("spend is close to spending limit and refill is available")
  const updateData = {
    metadata: {
      numRefills: parseInt(cardholder.metadata.numRefills) + 1
    },
    spending_controls: {
      spending_limits: [
        { amount: ((spendingInfo.spending_limit + refillAmt) * 100),
          interval: 'all_time'
        }
    ]}
  }
  updateData.metadata[`refill_${refillIndex}_amt`] = refillAmt
  updateData.metadata[`refill_${refillIndex}_date`] = new Date().toLocaleDateString()
  return updateData;
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



const getSpendBalanceTransactions = async (cardholder, includeTransactions=true) => {
  if(!cardholder) return null
  const output = {
    spending_limit: currentAllTimeSpendingLimit(cardholder),
    spend: 0.0,
    balance: 0.0,
    pending_transactions: 0,
    pending_amt: 0
  }
  if(includeTransactions) output.transactions = []
  for await (const transaction of stripeUtils.stripe.issuing.transactions.list({ cardholder: cardholder.id })) {
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
      output.spend += tran.amount
    }else{
      output.spend -= tran.amount
    }
    if(includeTransactions) output.transactions.push(tran)
  }
  for await (const pendingAuths of stripeUtils.stripe.issuing.authorizations.list({ cardholder: cardholder.id, status: 'pending'})) {
    if(output.pending_transactions === 0) logger.debug("pending authorizations")
    output.pending_transactions++
    output.pending_amt += pendingAuths.amount / 100
  }
  output.spend  += output.pending_amt

  output.pending_amt = parseFloat(output.pending_amt.toFixed(2))
  output.spend   = parseFloat(output.spend.toFixed(2))
  output.balance = parseFloat((output.spending_limit - output.spend).toFixed(2))
  return output
}

const currentAllTimeSpendingLimit = (cardholder) => {
  const sl = cardholder.spending_controls.spending_limits.find(l => l.interval === 'all_time')
  return sl ? parseFloat((sl.amount / 100).toFixed(2)) : config.get('base_funding_amt')
}

// using this model to help with stubbing of an ESM module
export const spendingControls = {
    defaultMetadata,
    defaultSpendingControls,
    recomputeSpendingLimits,
    getSpendBalanceTransactions,
};
