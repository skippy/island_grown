import config from '../config.js'
import bodyParser from 'body-parser'
// import Stripe from 'stripe'
// const stripe = new Stripe(config.get('stripe_api_key'), { apiVersion: '2022-11-15' })
// const endpointSecret = "whsec_0dc3bc8b4c3ab8ce0ee9da633d97544eba2cb996a137cd4f5cd175615237a343";
import * as stripeUtils from '../stripe-utils.js'
import { logger } from '../logger.js'

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
export const whCardholderSetup = async (req, res) => {
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
    case 'issuing_card.created':
    case 'issuing_card.updated':
      const issuingCard = event.data.object;
      // Then define and call a function to handle the event issuing_card.updated
      break;
    case 'issuing_cardholder.created':
    case 'issuing_cardholder.updated':
      const issuingCardholder = event.data.object;
      const updateData = { }

      // normalize email
      const updatedEmail = normalizeEmail(issuingCardholder.email)
      if(updatedEmail !== issuingCardholder.email){
        updateData.email = updatedEmail
      }

      // update spending limits and refills if needed
      const spendingInfo = await stripeUtils.getSpendBalanceTransactions(issuingCardholder,false)

      // make sure spending limit is setup!
      let setupSpendingLimitRefills = false
      if(!issuingCardholder.metadata.numRefills){
        logger.debug("initializing metadata.numRefills")
        issuingCardholder.metadata.numRefills = 0
        setupSpendingLimitRefills = true
      }
      if(!issuingCardholder.metadata.base_funding_amt){
        logger.debug("initializing metadata.base_funding_amt")
        issuingCardholder.metadata.base_funding_amt = config.get('base_funding_amt')
        setupSpendingLimitRefills = true
      }

      if(!issuingCardholder.spending_controls.spending_limits ||
         !issuingCardholder.spending_controls.spending_limits[0]){
        logger.debug("initializing spending limits")
        setupSpendingLimitRefills = true
      }
      if(spendingInfo.spent > spendingInfo.spending_limit * config.get('refill_trigger_percent')){
        logger.debug("spent is close to spending limit; let's see if we can refill")
        setupSpendingLimitRefills = true
      }
      if(setupSpendingLimitRefills){
        const refillIndex = issuingCardholder.metadata.numRefills
        const refillAmts = config.get('refill_amts')
        const refillAmt = refillAmts[refillIndex]
        if(refillAmt &&
           spendingInfo.spent > spendingInfo.spending_limit * config.get('refill_trigger_percent')){
          logger.debug("spent is close to spending limit and refill is available")
          spendingInfo.spending_limit += refillAmt
          issuingCardholder.metadata.numRefills++;
          issuingCardholder.metadata[`refill_${refillIndex}_amt`] = refillAmt
          issuingCardholder.metadata[`refill_${refillIndex}_date`] = new Date().toLocaleDateString()
          logger.debug("adding refill")
        }
        updateData.metadata = issuingCardholder.metadata
        updateData.spending_controls = {
          spending_limits: [{ amount: (spendingInfo.spending_limit * 100),
                              interval: 'all_time'
                           }]
        }
      }

      if(Object.keys(updateData).length !== 0){
        logger.info("updating cardholder data")
        logger.debug(updateData)

        const cardholder = await stripeUtils.stripe.issuing.cardholders.update(
          issuingCardholder.id,
          updateData
        );
      }else{
        logger.info("cardholder not updated")
      }
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }
  // Return a 200 response to acknowledge receipt of the event
  res.send();
}


const normalizeEmail = (email) => {
  return email ? email.toLowerCase().trim() : null
}

// judy fox: ich_1Kl0VJJtc0cstjDbVDCOyLyp


// // server.js
// //
// // Use this sample code to handle webhook events in your integration.
// //
// // 1) Paste this code into a new file (server.js)
// //
// // 2) Install dependencies
// //   npm install stripe
// //   npm install express
// //
// // 3) Run the server on http://localhost:4242
// //   node server.js

// const stripe = require('stripe');
// const express = require('express');
// const app = express();

// // This is your Stripe CLI webhook secret for testing your endpoint locally.
// const endpointSecret = "whsec_0dc3bc8b4c3ab8ce0ee9da633d97544eba2cb996a137cd4f5cd175615237a343";

// app.post('/webhookCardholderSetup', express.raw({type: 'application/json'}), (request, response) => {
//   const sig = request.headers['stripe-signature'];

//   let event;

//   try {
//     event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
//   } catch (err) {
//     response.status(400).send(`Webhook Error: ${err.message}`);
//     return;
//   }

//   // Handle the event
//   switch (event.type) {
//     case 'issuing_card.created':
//       const issuingCard = event.data.object;
//       // Then define and call a function to handle the event issuing_card.created
//       break;
//     // ... handle other event types
//     default:
//       console.log(`Unhandled event type ${event.type}`);
//   }

//   // Return a 200 response to acknowledge receipt of the event
//   response.send();
// });

// app.listen(4242, () => console.log('Running on port 4242'));
