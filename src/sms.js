import Twilio from 'twilio'
import config from './config.js'
import * as stripeUtils from './stripe-utils.js'
import { spendingControls } from './spending-controls.js'
import { logger } from './logger.js'

// FIXME: use API keys
// const accountSid = config.get('twilio_account_sid')
// const authToken = config.get('twilio_auth_token')
// const twilioClient = new Twilio(accountSid, authToken)
// expecting either:
//   - TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to be set, or
//   - TWILIO_ACCOUNT_SID, TWILIO_API_KEY, and TWILIO_API_SECRET
let _twilioClient
// lazy load!!!  Not all serverless endpoints want or need sms logic so lets not require it
const _sms_enabled = process.env.TWILIO_ACCOUNT_SID

if (_sms_enabled) {
  logger.info(`SMS Enabled using Twilio`)
  _twilioClient = new Twilio()
} else {
  logger.debug(`Twilio needs the following parameters set
  - TWILIO_PHONE_NUMBER
  - for authentication
    - TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN  or
    - TWILIO_ACCOUNT_SID, TWILIO_API_KEY, and TWILIO_API_SECRET
`)
}

// if(config.get('sms_enabled')){
//   if(!config.get('twilio_phone_number')){
//     throw new Error('SMS is enabled and need to pass in the env TWILIO_PHONE_NUMBER');
//   }
//   console.log('sms.js -------------------------------')
//   _twilioClient = new Twilio()
// }

// const accountSid = process.env.TWILIO_ACCOUNT_SID;
// const apiKey = process.env.TWILIO_API_KEY;
// const apiSecret = process.env.TWILIO_API_SECRET;
// const client = require('twilio')(apiKey, apiSecret, { accountSid: accountSid });

const welcomeMsg = () => {
  return config.get('sms_welcome_msg')
}

const sendWelcomeMsg = async (cardholder, override = false) => {
  if (!sms.isEnabled(cardholder, override)) return false
  if (cardholder.metadata.sms_welcome_sent) return false

  const response = await sms._sendTwilioMsg(cardholder.phone_number, welcomeMsg())
  await stripeUtils.stripe.issuing.cardholders.update(
    cardholder.id,
    { metadata: { sms_welcome_sent: 1 } }
  )
  return response
}

const helpMsg = () => {
  return config.get('sms_help_msg')
}

const declinedMsg = async (authorization) => {
  let subMsg = null
  const cardholder = authorization.card.cardholder
  if (authorization.approved) {
    logger.error(`authorization ${authorization.id} was not declined.`)
    return false
  }

  if (authorization.metadata.vendor_found == 'false' || authorization.metadata.vendor_postal_code == 'false') {
    subMsg = config.get('sms_declined_vendor_not_found_submsg')
  } else if (!authorization.request_history[0].approved &&
           authorization.request_history[0].reason == 'authorization_controls') {
    subMsg = config.get('sms_declined_over_balance_submsg')
  } else {
    logger.error(`unexpected declined authorization ${authorization.id}`)
    return false
  }
  const spendBalance = await spendingControls.getSpendBalanceTransactions(cardholder, false)
  let msg = config.get('sms_declined_msg')
  msg = msg.replace('DECLINED_MSG', subMsg)
  // Stripe stores it in pending_request IF it is going to the auth webhook, but once the auth has been
  // processed, it is put in merchant_amount
  const amt = authorization.pending_request ? authorization.pending_request.amount : authorization.merchant_amount
  msg = msg.replaceAll('VENDOR_NAME', authorization.merchant_data.name)
  msg = msg.replaceAll('AUTH_AMT', amt / 100)
  msg = msg.replaceAll('CURRENT_BALANCE', spendBalance.balance)
  return msg
}

const sendDeclinedMsg = async (authorization, override = false) => {
  const cardholder = authorization.card.cardholder
  if (!sms.isEnabled(cardholder, override)) return false

  const msg = await sms.declinedMsg(authorization)
  return await sms._sendTwilioMsg(cardholder.phone_number, msg)
}

const currBalanceMsg = async (cardholder) => {
  const spendBalance = await spendingControls.getSpendBalanceTransactions(cardholder, false)
  let msg = config.get('sms_balance_msg')
  msg = msg.replaceAll('CURRENT_BALANCE', spendBalance.balance)
  msg = msg.replaceAll('SPEND_LIMIT', spendBalance.spending_limit)
  return msg
}

// const sendCurrBalanceMsg = async (cardholder, override = false) => {
//   if (!isEnabled(cardholder, override)) return false
//   const msg = await currBalanceMsg(cardholder)
//   const _twilioClient = new Twilio(accountSid, authToken)
//   const response = await _twilioClient.messages
//     .create({
//       body: msg,
//       from: config.get('twilio_phone_number'),
//       to: cardholder.phone_number
//     })
//   handleTwilioResponse(response)
// }

const stopMsg = () => {
  return config.get('sms_stop_msg')
}

// const sendStopMsg = async (cardholder, override = false) => {
//   if (!isEnabled(cardholder, override)) return false
//   const _twilioClient = new Twilio(accountSid, authToken)
//   const response = await _twilioClient.messages
//     .create({
//       body: stopMsg(),
//       from: config.get('twilio_phone_number'),
//       to: cardholder.phone_number
//     })
//   handleTwilioResponse(response)
// }

// const getPhoneNumberInfo = async (phoneNumber) => {
//   // const _twilioClient = new Twilio(accountSid, authToken)
//   return await _twilioClient.lookups.phoneNumbers(phoneNumber).fetch()
// }

const persistEnabled = async (cardholder) => {
  if (sms.isEnabled(cardholder)) {
    // nothing to do here
    return true
  }
  await stripeUtils.stripe.issuing.cardholders.update(
    cardholder.id,
    { metadata: { sms_enabled: true } }
  )
}

const persistDisabled = async (cardholder) => {
  if (!sms.isEnabled(cardholder, true)) {
    // nothing to do here
    return true
  }
  await stripeUtils.stripe.issuing.cardholders.update(
    cardholder.id,
    { metadata: { sms_enabled: false } }
  )
}

const isEnabled = (cardholder, override) => {
  // if (!_sms_enabled) return false
  const md = cardholder.md
  // Stripe stores key/value pairs in metadata as strings
  if (cardholder.phone_number && cardholder.metadata.sms_enabled === 'true') return true
  if (cardholder.phone_number && override) return true
  if (cardholder.phone_number === undefined) {
    logger.info(`Cardholder ${cardholder.id} phone number is not set`)
    return false
  }
  if (cardholder.metadata.sms_enabled === undefined) {
    logger.warn(`Cardholder ${cardholder.id} metadata.sms_enabled is not set`)
    return false
  }
  logger.info(`Cardholder ${cardholder.id} has opted out of sms`)
  return false
}

// const handleTwilioResponse = (msg) => {
//   logger.debug(msg.sid)
//   if (msg.errorCode) {
//     logger.error(msg.errorCode)
//     logger.error(msg.errorMessage)
//   }
// }

const _sendTwilioMsg = async (to_phone_number, body) => {
  const response = await _twilioClient.messages
    .create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to_phone_number
    })
  logger.debug(response.sid)
  if (response.errorCode) {
    logger.error(response.errorCode)
    logger.error(response.errorMessage)
  }
  return response
}

// using this model to help with stubbing of an ESM module
export const sms = {
  isEnabled,
  _sendTwilioMsg,
  // _twilioClient,
  welcomeMsg,
  helpMsg,
  sendWelcomeMsg,
  stopMsg,
  // sendStopMsg,
  declinedMsg,
  sendDeclinedMsg,
  currBalanceMsg,
  // sendCurrBalanceMsg,
  // getPhoneNumberInfo,
  persistEnabled,
  persistDisabled
}
export default sms
