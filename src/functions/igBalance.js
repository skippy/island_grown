import { body, check, validationResult } from 'express-validator'
import config from '../config.js'

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_API_KEY);


/**
 * responds with a user's transaction history, spending limit, and balance
 *
 * Expects the following request query items:
 *   - email OR
 *   - last4, exp_month, exp_year
 *
 * @param req https://expressjs.com/en/api.html#req
 * @param res https://expressjs.com/en/api.html#res
 * @return {JSON} balance object
 */
export const igBalance = async (req, res) => {
  const errMsgs = await verifyParams(req)
  if(errMsgs.length > 0){
    return res.status(400).send(errMsgs[0])
  }

  const cardholder = await retrieveCardholderByEmail(req.query.email) ||
                     await retrieveCardholderByLast4Exp(
                       req.query.last4,
                       req.query.exp_month,
                       req.query.exp_year
                     )
  if(!cardholder){
    return res.json({});
  }

  const output = {
    spending_limit: currentAllTimeSpendingLimit(cardholder),
    total_spent: 0.0,
    remaining_amt: 0.0,
    authorizations: []
  }

  for await (const transaction of stripe.issuing.transactions.list({cardholder: cardholder.id, type: 'capture'})) {
    let tran = {
      // approved: a.approved,
      amount: parseFloat((transaction.amount / 100).toFixed(2)),
      created_at: new Date(transaction.created * 1000)
    }
    tran.merchant = Object.fromEntries(
      ['name', 'city', 'state', 'postal_code']
      .map(key => [key, transaction.merchant_data[key]])
    );
    output.total_spent += tran.amount
    output.authorizations.push(tran)
  }
  output.total_spent = parseFloat(output.total_spent.toFixed(2))
  output.remaining_amt = parseFloat((output.spending_limit - output.total_spent).toFixed(2))
  res.json(output);
}


const retrieveCardholderByEmail = async (email) => {
  if(!email) return null
  email = email.toLowerCase()
  // const cards = []
  for await (const cardholder of stripe.issuing.cardholders.list({email: email, status: 'active' })) {
    return cardholder;
  }
  return null
}


const retrieveCardholderByLast4Exp = async (last4, exp_month, exp_year) => {
  if(!last4 || !exp_month || !exp_year) return null
  // const cards = []
  for await (const card of stripe.issuing.cards.list({
    last4: last4,
    exp_month: exp_month,
    exp_year: exp_year})){
      return card.cardholder
   }
   return null
}



const currentAllTimeSpendingLimit = (cardholder) => {
  const sl = cardholder.spending_controls.spending_limits.find(l => l.interval === 'all_time' )
  return sl ? parseFloat((sl.amount / 100).toFixed(2)) : 0
}



const verifyParams = async (req) => {
  //NOTE: do NOT normalize email; that strips dots, or + from the email...
  //TODO: make sure we normalize emails on the stripe side, perhaps during post-init
  //      webhook invocation.
  await check('email')
    .isEmail()
    .trim()
    // .normalizeEmail()
    .optional()
    .withMessage('email is not valid')
    .run(req);
  await check('last4')
    .toInt()
    .custom(value => {
      return /^\d{4}$/.test(value)
    })
    .optional()
    .withMessage('last4 needs to be the last 4 digits of a credit card')
    .run(req);
  await check('exp_month')
    .toInt()
    .custom(value => {
      return value >= 1 && value <= 12
    })
    .optional()
    .withMessage('exp_month must be between 1 and 12')
    .run(req);
  await check('exp_year')
    .toInt()
    .custom(value => {
      return value >= new Date().getFullYear() && value < new Date().getFullYear() + 10
    })
    .optional()
    .withMessage('exp_year must be a 4 digit year, such as 2023, and this year or later')
    .run(req);

  const errors = validationResult(req);
  const errMsgs = []
  if (!errors.isEmpty()) {
    errMsgs.push(...errors.array().map(e => e.msg))
  }else if(Object.keys(req.query).length === 0){
    errMsgs.push('email or the last4, exp_month, and exp_year of the credit card are expected')
  } else if (req.query.email === undefined ){
    if( req.query.last4 === undefined ||
        req.query.exp_month === undefined ||
        req.query.exp_year === undefined ){
      errMsgs.push('last4, exp_month, and exp_year of the credit card are expected')
    }
  }
  return errMsgs
}
