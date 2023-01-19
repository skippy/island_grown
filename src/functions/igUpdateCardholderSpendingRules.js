import * as stripeUtils from '../stripe-utils.js'
import { spendingControls } from '../spending-controls.js'
import { logger } from '../logger.js'

export const igUpdateCardholderSpendingRules = async (req, res) => {
  for await (const cardholder of stripeUtils.stripe.issuing.cardholders.list()) {
    logger.debug(`checking ${cardholder.email} (${cardholder.id}) for refills`)
    const updatedSpendingData = await spendingControls.recomputeSpendingLimits(cardholder)
    if (Object.keys(updatedSpendingData).length > 0) {
      logger.debug('updating cardholder data')
      await stripeUtils.stripe.issuing.cardholders.update(
        cardholder.id,
        updatedSpendingData
      )
    } else {
      logger.debug('cardholder not updated')
    }
  }
  res.send()
}
