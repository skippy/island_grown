import config from '../config.js'
import bodyParser from 'body-parser'
import lodash from 'lodash'
import * as stripeUtils from '../stripe-utils.js'
import { logger } from '../logger.js'
import sms from '../sms.js'

/**
 *
 * @param req https://expressjs.com/en/api.html#req
 * @param res https://expressjs.com/en/api.html#res
 * @return {JSON} balance object
 */
export const whAuthorization = async (req, res) => {
  let event

  try {
    const sig = req.headers['stripe-signature']
    const whSecret = config.get('stripe_auth_webhook_secret')
    event = stripeUtils.stripe.webhooks.constructEvent(req.rawBody, sig, whSecret)
  } catch (err) {
    res.status(400).send(`Webhook Error: ${_.escape(err.message)}`)
    return
  }

  // Handle the event
  const issuingAuth = event.data.object
  const merchantData = issuingAuth.merchant_data
  logger.debug(event.type)
  switch (event.type) {
    case 'issuing_authorization.request':
    // case 'issuing_authorization.created':
      logger.debug(merchantData)

      const merchantName = merchantData.name
      const merchantNameRegEx = new RegExp(escapeRegex(merchantName), 'i')

      const vendors = config.get('approved_vendors')
      const foundVendor = Object.keys(vendors).find(vn => merchantNameRegEx.test(vn.toLowerCase()))
      const vendorVerified = foundVendor ? vendors[foundVendor].toString() === merchantData.postal_code.toString() : false
      logger.debug(`found vendor? ${foundVendor || false} -- verified vendor? ${vendorVerified || false}`)

      logger.info(`auth approved? ${vendorVerified}: ${issuingAuth.id}`)
      res.writeHead(200, { 'Stripe-Version': stripeUtils.stripeVersion, 'Content-Type': 'application/json' })
      var body = JSON.stringify({
        approved: vendorVerified,
        metadata: {
          vendor_found: foundVendor || false,
          vendor_postal_code: vendors[foundVendor] || false,
          merchant_postal_code: merchantData.postal_code
        }

      })

      return res.end(body)
      break
    case 'issuing_authorization.created':
      logger.debug(issuingAuth)
      logger.debug(issuingAuth.approved)
      if (!issuingAuth.approved) {
        await sms.sendDeclinedMsg(issuingAuth)
      }
      return res.send()
      break
    default:
      logger.warn(`Unhandled event type ${event.type}`)
  }
  // Return a 200 response to acknowledge receipt of the event
  res.send()
}

const escapeRegex = (string) => {
  return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')
}
