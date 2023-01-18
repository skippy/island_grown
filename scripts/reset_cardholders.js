#!/usr/bin/env node

// const yargs = require("yargs");
// import yargs from 'yargs'

import yargs from 'yargs/yargs';
'use strict'

import config from '../src/config.js'
import * as stripeUtils from '../src/stripe-utils.js'
import { spendingControls } from '../src/spending-controls.js'


const options = yargs(process.argv.slice(2))
 .option("f", { alias: "force", describe: "persist changes", demandOption: true })
 .option("e", { alias: "email", describe: "email of cardholder to reset" })
 .argv;


console.log("***** Resetting Cardholders and Cards to default metadata and spending limits")
const clearValues =  {
    metadata: spendingControls.defaultMetadata(true),
    spending_controls: spendingControls.defaultSpendingControls()
  }

const listArgs = {}
if(options.email){
    console.log(`    Searching for cardholder email: '${options.email}'`)
    listArgs.email = options.email
}

for await (const cardholder of stripeUtils.stripe.issuing.cardholders.list(listArgs)) {
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
