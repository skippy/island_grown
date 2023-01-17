#!/usr/bin/env node

// const yargs = require("yargs");
// import yargs from 'yargs'

import yargs from 'yargs/yargs';
'use strict'

import config from '../src/config.js'
import * as stripeUtils from '../src/stripe-utils.js'


const options = yargs(process.argv.slice(2))
 .option("f", { alias: "force", describe: "persist changes", demandOption: true })
 .argv;

console.log("***** Resetting Cardholders and Cards to default metadata and spending limits")
const clearValues =  {
    metadata: {
        base_funding_amt: null,
        numRefills: null,
        refill_0_amt: null,
        refill_0_date: null,
        refill_1_amt: null,
        refill_1_date: null,
        refill_2_amt: null,
        refill_2_date: null,
        refill_3_amt: null,
        refill_3_date: null,
        refill_4_amt: null,
        refill_4_date: null,
        funding_traunch_initial: null,
        funding_traunch_second_refill: null,
        trial: null,
        Trial: null
    },
    spending_controls: { spending_limits: null}
  }


for await (const cardholder of stripeUtils.stripe.issuing.cardholders.list()) {
    console.log(`resetting ${cardholder.email} (${cardholder.id})`)
    // Do something with customer
    const cards = (await stripeUtils.stripe.issuing.cards.list({ cardholder: cardholder.id })).data
    // console.log(cardholder)
    // console.log(cards)
    const response = await stripeUtils.stripe.issuing.cardholders.update(
      cardholder.id,
      clearValues
    )
    for await (const c of cards) {
        await stripeUtils.stripe.issuing.cards.update(
            c.id,
            clearValues
        )
    }
}
