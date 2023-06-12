import { check, validationResult } from 'express-validator'
import config from '../config.js'
import * as stripeUtils from '../stripe-utils.js'
import { spendingControls } from '../spending-controls.js'
import { logger } from '../logger.js'
import parsePhoneNumber from 'libphonenumber-js'

/**
 * responds with a user's transaction history, spending limit, and balance
 *
 * Expects the following request query items:
 *   - email OR
 *   - phone_number OR
 *   - last4, exp_month, exp_year
 *
 * @param req https://expressjs.com/en/api.html#req
 * @param res https://expressjs.com/en/api.html#res
 * @return {JSON} balance object
 */
export const igBalance = async (req, res) => {
  const errMsgs = await verifyParams(req)
  if (errMsgs.length > 0) {
    return res.status(400).send(errMsgs[0])
  }
  const cardholder = await stripeUtils.retrieveCardholderByEmail(req.query.email) ||
                     await stripeUtils.retrieveCardholderID(req.query.ich) ||
                     await stripeUtils.retrieveCardholderByPhone(req.query.phone_number) ||
                     await stripeUtils.retrieveCardholderByLast4Exp(
                       req.query.last4,
                       req.query.exp_month,
                       req.query.exp_year
                     )
  if (!cardholder) {
    return res.json({})
  }
  const responseOutput = await spendingControls.getSpendBalanceTransactions(cardholder)
  addDeprecationNote(responseOutput)
  if(req.query.pretty){
    res.status(200).send(JSON.stringify(responseOutput, null, 2))
  }else{
    res.status(200).json(responseOutput)
  }
  res.end()
}

// NOTE: for backwards compatability, we need to return it in this format
const addDeprecationNote = (responseOutput) => {
  responseOutput.deprecations = 'DEPRECATION NOTE: total_spent, remaining_amt, and authorizations are deprecated'
  responseOutput.total_spent = responseOutput.spend
  responseOutput.remaining_amt = responseOutput.balance
  responseOutput.authorizations = responseOutput.transactions
  return responseOutput
}

const verifyParams = async (req) => {
  // NOTE: do NOT normalize email; that strips dots, or + from the email...
  // TODO: make sure we normalize emails on the stripe side, perhaps during post-init
  //      webhook invocation.
  await check('email')
    .isEmail()
    .trim()
    // .normalizeEmail()
    .optional()
    .withMessage('email is not valid')
    .run(req)
  await check('phone_number')
    .custom(value => {
      const phoneNumber = parsePhoneNumber(value, 'US')
      return phoneNumber && phoneNumber.isValid()
    })
    .optional()
    .withMessage('phone_number is not valid')
    .run(req)
  await check('last4')
    .toInt()
    .custom(value => {
      return /^\d{4}$/.test(value)
    })
    .optional()
    .withMessage('last4 needs to be the last 4 digits of a credit card')
    .run(req)
  await check('ich')
    .custom(value => {
      return /^ich_.{20,26}$/.test(value)
    })
    .optional()
    .withMessage('ich should start with ich_')
    .run(req)
  await check('exp_month')
    .toInt()
    .custom(value => {
      return value >= 1 && value <= 12
    })
    .optional()
    .withMessage('exp_month must be between 1 and 12')
    .run(req)
  await check('exp_year')
    .toInt()
    .custom(value => {
      return value >= new Date().getFullYear() && value < new Date().getFullYear() + 10
    })
    .optional()
    .withMessage('exp_year must be a 4 digit year, such as 2023, and this year or later')
    .run(req)

  const errors = validationResult(req)
  const errMsgs = []
  if (!errors.isEmpty()) {
    errMsgs.push(...errors.array().map(e => e.msg))
  } else if (Object.keys(req.query).length === 0) {
    errMsgs.push('email, phone_number, ich, or the last4, exp_month, and exp_year of the credit card are expected')
  } else if (req.query.email === undefined && req.query.phone_number === undefined && req.query.ich === undefined) {
    if (req.query.last4 === undefined ||
        req.query.exp_month === undefined ||
        req.query.exp_year === undefined) {
      errMsgs.push('last4, exp_month, and exp_year of the credit card are expected')
    }
  }
  return errMsgs
}
