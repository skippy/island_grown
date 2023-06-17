'use strict'
/**
 * Design:
 *   - inital txt goes out explaining what this service provides
 *   - user can text STOP anytime
 *   - user can text anything else, and will receive a limit and remaining balance
 *   - any authorization failures will notify the user as to why
 */
import Twilio from 'twilio'
import config from '../config.js'
import * as stripeUtils from '../stripe-utils.js'
import { logger } from '../logger.js'
import sms from '../sms.js'

// Must have TWILIO_AUTH_TOKEN env set
export const whTwilio = async (req, res) => {
  const twiml = new Twilio.twiml.MessagingResponse()
  // Access the message body and the number it was sent from.
  logger.debug(`Incoming message from ${req.body.From}: ${req.body.Body}`)
  const cardholder = await stripeUtils.retrieveCardholderByPhone(req.body.From)
  if (!cardholder) {
    // TODO: can we prevent spaming?  return something to twilio to notify them to not allow frequent retries?
    return res.status(404).send('Not Found')
  }
  logger.debug(`cardholder id: ${cardholder.id}`)
  const incomingMsg = ((typeof req.body.Body) === 'string' ) ? req.body.Body.toLowerCase().trim() : ''
  let responseMsg
  switch (incomingMsg) {
    case 'stop':
    case 'cancel':
    case 'end':
    case 'quit':
    case 'stopall':
    case 'unsubscribe':
      // twilio handles this msg... BUT we need to unsubscribe
      // cancel, end, quit, stop, stopall, unsubscribe
      // responseMsg = sms.stopMsg()
      await sms.persistDisabled(cardholder)
      break
    case 'start':
    case 'unstop':
    case 'yes':
      await sms.persistEnabled(cardholder)
      break
    case 'h':
    case 'help':
    case 'hel':
    case 'info':
    case 'in':
      // NOTE: this is addressed by twilio at: https://console.twilio.com/us1/service/sms/MG562218764d145186c07bec96731194d2/messaging-service-advanced-opt-out
      // responseMsg = await sms.helpMsg()
      break
    case 'w':
    case 'welcome':
      // this path isn't advertised but it allows for us to trigger the welcome msg
      responseMsg = await sms.welcomeMsg()
      break
    case 'v':
    case 'vendor':
    case 'vendors':
    case 'ven':
      responseMsg = await sms.vendorsMsg()
      break
    case 'b':
    case 'balance':
    case 'bal':
      responseMsg = await sms.currBalanceMsg(cardholder)
      break
    default:
      responseMsg = await sms.helpMsg()
  }
  if(responseMsg){
    twiml.message(responseMsg)
    res.writeHead(200, { 'Content-Type': 'text/xml' })
    logger.debug(twiml.toString())
    res.end(twiml.toString())
    return
  }
  res.status(200).end();
}
