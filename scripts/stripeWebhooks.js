'use strict'

import config from '../src/config.js'
import Stripe from 'stripe'
import * as stripeUtils from '../src/stripe-utils.js'

console.log('** Stripe Webhooks')
// for await (var webhookEndpoints in await stripe.webhookEndpoints()) {
// 	console.log(`  ${webhookEndpoints.endpoint}`)
// 	console.log(`     ${webhookEndpoints.enabled_events}`)
// 	console.log(`     ${webhookEndpoints.description}`)
// }

for await (const we of stripeUtils.stripe.webhookEndpoints.list()) {
console.log(we)
	console.log(`  ${we.id}`)
	console.log(`     url: ${we.url}`)
	console.log(`     desc: ${we.description}`)
	console.log(`     events: ${we.enabled_events.join(', ')}`)
}

// console.log(webhookEndpoints)
