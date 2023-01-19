import config from '../config.js'
import * as stripeUtils from '../stripe-utils.js'
import { spendingControls } from '../spending-controls.js'
import { logger } from '../logger.js'

/**
 * webHook for cardholder and card create and update
 *
 * This
 *   - normalizes email
 *   - sets up metadata and spending limits
 *
 * @param req https://expressjs.com/en/api.html#req
 * @param res https://expressjs.com/en/api.html#res
 * @return {JSON} balance object
 */
export const whCardholderSetup = async (req, res) => {
  const sig = req.headers['stripe-signature']
  let event

  try {
    const whSecret = config.get('stripe_auth_webhook_secret')
    event = stripeUtils.stripe.webhooks.constructEvent(req.rawBody, sig, whSecret)
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`)
    return
  }

  // Handle the event
  switch (event.type) {
    case 'issuing_card.created':
    case 'issuing_card.updated':
      const issuingCard = event.data.object
      // Then define and call a function to handle the event issuing_card.updated
      break
    case 'issuing_cardholder.created':
    case 'issuing_cardholder.updated':
      const issuingCardholder = event.data.object
      const updateData = await spendingControls.recomputeSpendingLimits(issuingCardholder)

      // normalize email
      const updatedEmail = normalizeEmail(issuingCardholder.email)
      if (updatedEmail !== issuingCardholder.email) {
        updateData.email = updatedEmail
      }

      if (Object.keys(updateData).length > 0) {
        logger.info('updating cardholder data')
        logger.debug(updateData)
        await stripeUtils.stripe.issuing.cardholders.update(
          issuingCardholder.id,
          updateData
        )
      } else {
        logger.info('cardholder not updated')
      }
      break
    default:
      logger.warn(`Unhandled event type ${event.type}`)
  }
  // Return a 200 response to acknowledge receipt of the event
  res.send()
}

const normalizeEmail = (email) => {
  return email ? email.toLowerCase().trim() : null
}
