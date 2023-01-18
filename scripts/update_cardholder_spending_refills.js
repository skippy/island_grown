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
 .option("e", { alias: "email", describe: "email of cardholder to update spending limits" })
 .argv;


console.log("***** updating spending limits")

const listArgs = {}
if(options.email){
    console.log(`    Searching for cardholder email: '${options.email}'`)
    listArgs.email = options.email
}


for await (const cardholder of stripeUtils.stripe.issuing.cardholders.list(listArgs)) {
    console.log(`checking ${cardholder.email} (${cardholder.id}) for refills`)
    const updatedSpendingData = await spendingControls.recomputeSpendingLimits(cardholder)
    if(Object.keys(updatedSpendingData).length > 0){
        console.log("updating cardholder data")
        await stripeUtils.stripe.issuing.cardholders.update(
          cardholder.id,
          updatedSpendingData
        );
    }else{
        console.log("cardholder not updated")
    }
}
