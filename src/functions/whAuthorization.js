import config from '../config.js'
import bodyParser from 'body-parser'
import _ from 'lodash'
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

      const merchantName = _.escape(merchantData.name).toLowerCase()
      const vendors = config.get('approved_vendors')
      const approvedPostalCodes = config.get('approved_postal_codes')
      const foundVendor = Object.keys(vendors).find(vn => merchantName.includes(vn.toLowerCase()))
      let vendorVerified = foundVendor ? vendors[foundVendor].toString() === merchantData.postal_code.toString() : false
      logger.debug(`found vendor? ${foundVendor || false} -- verified vendor? ${vendorVerified || false}`)
      logger.info(`auth approved? ${vendorVerified}: ${issuingAuth.id}`)
      const metadata = {
          vendor_found: foundVendor || false,
          vendor_postal_code: vendors[foundVendor] || false,
          //NOTE: stripe can't allow null to be passed in the metadata, otherwise the
          //  transaction will fail on stripe
          merchant_postal_code: merchantData.postal_code || ''
      }
      //TODO: review this logic; if the vendor postal code does not match, do we:
      //  1) look at the approved postal list
      //  2) modify the datastructure to allow 1+ postal codes per merchant
      //
      if(foundVendor && !vendorVerified){
        vendorVerified = approvedPostalCodes.find(pc => pc.toString() === merchantData.postal_code.toString()) !== undefined
        logger.debug(`postalCode '${merchantData.postal_code}' not matched to vendor; checking general approved postal code list: '${vendorVerified}'`)
        metadata.in_approved_postal_code_list = vendorVerified
      }

      var body = JSON.stringify({
        approved: vendorVerified,
        metadata: metadata
      })
      res.writeHead(200, { 'Stripe-Version': stripeUtils.stripeVersion, 'Content-Type': 'application/json' })
      return res.status(200).end(body)
      break
    case 'issuing_authorization.created':
      //NOTE: This is triggered after the request, so if it is not approved, lets do somethin.
      logger.debug(issuingAuth)
      logger.debug(`approved: ${issuingAuth.approved}`)
      if (!issuingAuth.approved) {
        // this is an async response; but lets await for it so we make sure it
        // gets sent; if not, the http response returns super quick BUT the sms msg may not be
        // sent by the time the serverless function returns...on GCP that means the process is
        // put on a 'back-burner' and may not get cpu for awhile (seconds, or minutes), which
        // would delay the sending of the sms msg.
        await sms.sendDeclinedMsg(issuingAuth)
      }
      return res.status(200).end()
      break
    default:
      logger.warn(`Unhandled event type ${event.type}`)
  }
  // Return a 200 response to acknowledge receipt of the event
  res.status(200).end()
}
