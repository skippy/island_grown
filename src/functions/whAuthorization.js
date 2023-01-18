import config from '../config.js'
import bodyParser from 'body-parser'
import * as stripeUtils from '../stripe-utils.js'
import { logger } from '../logger.js'

/**
 *
 * @param req https://expressjs.com/en/api.html#req
 * @param res https://expressjs.com/en/api.html#res
 * @return {JSON} balance object
 */
export const whAuthorization = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripeUtils.stripe.webhooks.constructEvent(req.rawBody, sig, config.get('stripe_auth_webhook_secret'));
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the event
  switch (event.type) {
    case 'issuing_authorization.request':
    // case 'issuing_authorization.created':
      const issuingAuth = event.data.object;
      const merchantData = issuingAuth.merchant_data
      logger.debug('Merchant Data')
      logger.debug(merchantData)

      const merchantName = merchantData.name
      const merchantNameRegEx = new RegExp(escapeRegex(merchantName), 'i');

      const vendors = config.get('approved_vendors')
      const foundVendor = Object.keys(vendors).find(vn => merchantNameRegEx.test(vn) )
      const vendorVerified = foundVendor ? vendors[foundVendor].toString() === merchantData.postal_code.toString() : false
      logger.debug(`found vendor? ${foundVendor || false} -- verified vendor? ${vendorVerified || false}`)

      // if(vendorVerified){
      //   logger.info(`auth approved? ${vendorVerified}: ${issuingAuth.id}`)
      //   await stripeUtils.stripe.issuing.authorizations.approve(issuingAuth.id)
      // }else{
      //   logger.info(`auth declined: ${issuingAuth.id}`)
      //   await stripeUtils.stripe.issuing.authorizations.decline(issuingAuth.id,
      //     { metadata: {
      //       reason: "not a verified vendor",
      //       vendor_found: foundVendor || false,
      //       mapped_postal_code: vendors[foundVendor] || false
      //     }})
      // }
      logger.info(`auth approved? ${vendorVerified}: ${issuingAuth.id}`)
      res.writeHead(200, {"Stripe-Version": stripeUtils.stripeVersion, "Content-Type": "application/json"});
      var body = JSON.stringify({
        "approved": vendorVerified,
        "metadata": {
                      vendor_found: foundVendor || false,
                      mapped_postal_code: vendors[foundVendor] || false
                    }

      })


      return res.end(body)
      break;
    default:
      logger.warn(`Unhandled event type ${event.type}`);
  }
  // Return a 200 response to acknowledge receipt of the event
  res.send();
}


const escapeRegex = (string) => {
  return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

