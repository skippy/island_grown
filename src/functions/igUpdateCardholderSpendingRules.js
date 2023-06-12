import * as stripeUtils from '../stripe-utils.js'
import { spendingControls } from '../spending-controls.js'
import { logger } from '../logger.js'

//FIXME: add a library like 'limiter'
const SLEEP_DURATION_MAX = 1000; // sleep for up to 1000 milliseconds
const SLEEP_AFTER_NUM_ITERATIONS = 10

export const igUpdateCardholderSpendingRules = async (req, res) => {
  let counter = 0
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

    logger.debug('updating cardholder card data')
    //stripe, by default, sets spending rules for new cards; clear these out
    for await (const c of stripeUtils.stripe.issuing.cards.list({ cardholder: cardholder.id })) {
      const resetData = spendingControls.clearSpendingControls()
      await stripeUtils.stripe.issuing.cards.update(c.id, resetData)
    }
  }
  res.send()
  counter++

  // NOTE: adding sleep because we can run into stripe API rate limiting, which is 100 calls per second
  if (counter % SLEEP_AFTER_NUM_ITERATIONS === 0) {
    logger.debug(`Sleeping at iteration ${counter}`);
    const sleepDuration = getRandomInt(10, SLEEP_DURATION_MAX);
    await sleep(sleepDuration);
  }

}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
