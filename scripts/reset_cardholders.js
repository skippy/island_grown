#!/usr/bin/env node
'use strict'

/**
 *
*/
import yargs from 'yargs/yargs'

import config from '../src/config.js'
import * as stripeUtils from '../src/stripe-utils.js'
import { spendingControls } from '../src/spending-controls.js'

const options = yargs(process.argv.slice(2))
  .option('f', { alias: 'force', describe: 'persist changes' })
  .option('e', { alias: 'email', describe: 'email of cardholder to reset' })
  .argv

console.log('***** Resetting Cardholders and Cards to default metadata and spending limits')
const clearValues = {
  metadata: spendingControls.defaultMetadata(true),
  spending_controls: spendingControls.defaultSpendingControls()
}

const listArgs = {}
if (options.email) {
  console.log(`    Searching for cardholder email: '${options.email}'`)
  listArgs.email = options.email
}
for await (const cardholder of stripeUtils.stripe.issuing.cardholders.list(listArgs)) {
  console.log(`${options.force ? '': '**NOT** '}resetting ${cardholder.email} (${cardholder.id})`)
  console.log(clearValues)
  console.log(clearValues.spending_controls)
  if(options.force){
    const response = await stripeUtils.stripe.issuing.cardholders.update(
      cardholder.id,
      clearValues
    )
  }
}
