import config from '../src/config.js'
import { spendingControls } from '../src/spending-controls.js'
import * as stripeUtils from '../src/stripe-utils.js'
import Stripe from 'stripe'
const stripeAPIKey = config.get('stripe_api_key')

if (!/^sk_test_/i.test(stripeAPIKey)) {
  console.log('***** ERROR')
  if (stripeAPIKey) {
    console.log(`  stripe API key is NOT a test key: ${stripeAPIKey.substring(0, 6)}...`)
  } else {
    console.log('  stripe API key is NOT set.  set ENV STRIPE_API_KEY')
  }
  console.log('  exiting')
  process.exit(1)
}
// NOTE: do NOT use the stripe defined in stripeUtils because we want to make sure the
// right API key is being used
global.stripe = new Stripe(stripeAPIKey, { apiVersion: stripeUtils.apiVersion })

global.transactionCardholderEmail = 'jenny.rubin_has_transactions@example.com'
global.transactionPendingCardholderEmail = 'jenny.rubin_has_transactions_and_pending@example.com'
global.transactionWithRefundCardholderEmail = 'jenny.rubin_has_transaction_and_refund@example.com'
global.emptyCardholderEmail = 'jenny.rubin_empty@example.com'

let createdStripeObjects = false

before(async () => {
  await setupNoTransactionsCardholder()
  await setupOneTransactionCardholder()
  await setupOneTransactionWithRefundCardholder()
  await setupOneTransactionAndPendingCardholder()
  if (createdStripeObjects) {
  	console.log('**** Waiting for stripe objects to become available')
  	// FIXME: can we keep looping until a query returns?
  	await delay(5000)
  }
})

const setupNoTransactionsCardholder = async () => {
  let cardholder = (await stripe.issuing.cardholders.list({ email: global.emptyCardholderEmail })).data[0]
  if (cardholder) return
  console.log('** creating initial stripe cardholder with no transactions')
  createdStripeObjects = true

  cardholder = await stripe.issuing.cardholders.create({
	  name: 'Jenny Rosen Empty',
	  email: emptyCardholderEmail,
	  phone_number: '+18008675309',
	  status: 'active',
	  type: 'individual',
	  metadata: spendingControls.defaultMetadata(),
	  spending_controls: spendingControls.defaultSpendingControls(),
	  billing: {
	    address: {
	      line1: '123 Main Street',
	      city: 'San Francisco',
	      state: 'CA',
	      postal_code: '94111',
	      country: 'US'
	    }
	  }
  })
  const card = await stripe.issuing.cards.create({
	  cardholder: cardholder.id,
	  type: 'virtual',
	  currency: 'usd',
	  status: 'active'
  })
  console.log('**   Finished')
}

const setupOneTransactionWithRefundCardholder = async () => {
  let cardholder = (await stripe.issuing.cardholders.list({ email: global.transactionWithRefundCardholderEmail })).data[0]
  if (cardholder) return
  console.log('** creating initial stripe cardholder with 1 transaction and a refund')
  createdStripeObjects = true

  await stripe.topups.create({
	  destination_balance: 'issuing',
	  amount: 2000,
	  currency: 'usd',
	  description: 'Top-up for Issuing, January 16, 2023',
	  statement_descriptor: 'Top-up'
  })
  cardholder = await stripe.issuing.cardholders.create({
	  name: 'Jenny Rosen',
	  email: transactionWithRefundCardholderEmail,
	  phone_number: '+18008675308',
	  status: 'active',
	  type: 'individual',
	  metadata: spendingControls.defaultMetadata(),
	  spending_controls: spendingControls.defaultSpendingControls(),
	  billing: {
	    address: {
	      line1: '123 Main Street',
	      city: 'San Francisco',
	      state: 'CA',
	      postal_code: '94111',
	      country: 'US'
	    }
	  }
  })
  let card = await stripe.issuing.cards.create({
	  cardholder: cardholder.id,
	  type: 'virtual',
	  currency: 'usd',
	  status: 'active'
  })

  card = await stripe.issuing.cards.retrieve(
	  card.id,
	  { expand: ['number', 'cvc'] }
  )

  const customer = await stripe.customers.create({
	  name: 'Jenny Rosen Transactions',
	  email: transactionCardholderEmail,
	  phone: '+18008675307',
	  description: 'Issuing Cardholder',
	  address: {
	    line1: '123 Main Street',
	    city: 'San Francisco',
	    state: 'CA',
	    postal_code: '94111',
	    country: 'US'
	  }
  })
  const paymentMethod = await stripe.paymentMethods.create({
	  type: 'card',
	  card: { number: card.number, exp_month: card.exp_month, exp_year: card.exp_year }
  })

  const paymentIntent = await stripe.paymentIntents.create({
	  payment_method: paymentMethod.id,
	  amount: 2000,
	  currency: 'usd',
	  payment_method_types: ['card'],
	  capture_method: 'manual',
	  customer: customer.id,
	  confirm: true
  })
  await stripe.paymentIntents.capture(paymentIntent.id)
  const refund = await stripe.refunds.create({
  	payment_intent: paymentIntent.id,
	  amount: 2000
  })
  console.log('**   Finished')
}

const setupOneTransactionCardholder = async () => {
  // one transaction AND one pending
  let cardholder = (await stripe.issuing.cardholders.list({ email: global.transactionCardholderEmail })).data[0]
  if (cardholder) return
  console.log('** creating initial stripe cardholder with 1 transaction')
  createdStripeObjects = true

  await stripe.topups.create({
	  destination_balance: 'issuing',
	  amount: 3000,
	  currency: 'usd',
	  description: 'Top-up for Issuing, January 16, 2023',
	  statement_descriptor: 'Top-up'
  })
  cardholder = await stripe.issuing.cardholders.create({
	  name: 'Jenny Rosen',
	  email: transactionCardholderEmail,
	  phone_number: '+18008675306',
	  status: 'active',
	  type: 'individual',
	  metadata: spendingControls.defaultMetadata(),
	  spending_controls: spendingControls.defaultSpendingControls(),
	  billing: {
	    address: {
	      line1: '123 Main Street',
	      city: 'San Francisco',
	      state: 'CA',
	      postal_code: '94111',
	      country: 'US'
	    }
	  }
  })
  let card = await stripe.issuing.cards.create({
	  cardholder: cardholder.id,
	  type: 'virtual',
	  currency: 'usd',
	  status: 'active'
  })

  card = await stripe.issuing.cards.retrieve(
	  card.id,
	  { expand: ['number', 'cvc'] }
  )

  const customer = await stripe.customers.create({
	  name: 'Jenny Rosen Transactions',
	  email: transactionCardholderEmail,
	  phone: '+18008675305',
	  description: 'Issuing Cardholder',
	  address: {
	    line1: '123 Main Street',
	    city: 'San Francisco',
	    state: 'CA',
	    postal_code: '94111',
	    country: 'US'
	  }
  })
  const paymentMethod = await stripe.paymentMethods.create({
	  type: 'card',
	  card: { number: card.number, exp_month: card.exp_month, exp_year: card.exp_year }
  })
  const paymentIntent = await stripe.paymentIntents.create({
	  payment_method: paymentMethod.id,
	  amount: 2000,
	  currency: 'usd',
	  payment_method_types: ['card'],
	  capture_method: 'manual',
	  customer: customer.id,
	  confirm: true
  })
  await stripe.paymentIntents.capture(paymentIntent.id)
  console.log('**   Finished')
}

const setupOneTransactionAndPendingCardholder = async () => {
  // one transaction AND one pending
  let cardholder = (await stripe.issuing.cardholders.list({ email: global.transactionPendingCardholderEmail })).data[0]
  if (cardholder) return
  console.log('** creating initial stripe cardholder with 1 transaction and 1 pending')
  createdStripeObjects = true

  await stripe.topups.create({
	  destination_balance: 'issuing',
	  amount: 3000,
	  currency: 'usd',
	  description: 'Top-up for Issuing, January 16, 2023',
	  statement_descriptor: 'Top-up'
  })
  cardholder = await stripe.issuing.cardholders.create({
	  name: 'Jenny Rosen',
	  email: transactionPendingCardholderEmail,
	  phone_number: '+18008675304',
	  status: 'active',
	  type: 'individual',
	  metadata: spendingControls.defaultMetadata(),
	  spending_controls: spendingControls.defaultSpendingControls(),
	  billing: {
	    address: {
	      line1: '123 Main Street',
	      city: 'San Francisco',
	      state: 'CA',
	      postal_code: '94111',
	      country: 'US'
	    }
	  }
  })
  let card = await stripe.issuing.cards.create({
	  cardholder: cardholder.id,
	  type: 'virtual',
	  currency: 'usd',
	  status: 'active'
  })

  card = await stripe.issuing.cards.retrieve(
	  card.id,
	  { expand: ['number', 'cvc'] }
  )

  const customer = await stripe.customers.create({
	  name: 'Jenny Rosen Transactions',
	  email: transactionPendingCardholderEmail,
	  phone: '+18008675303',
	  description: 'Issuing Cardholder',
	  address: {
	    line1: '123 Main Street',
	    city: 'San Francisco',
	    state: 'CA',
	    postal_code: '94111',
	    country: 'US'
	  }
  })
  const paymentMethod = await stripe.paymentMethods.create({
	  type: 'card',
	  card: { number: card.number, exp_month: card.exp_month, exp_year: card.exp_year }
  })
  const paymentIntent = await stripe.paymentIntents.create({
	  payment_method: paymentMethod.id,
	  amount: 2000,
	  currency: 'usd',
	  payment_method_types: ['card'],
	  capture_method: 'manual',
	  customer: customer.id,
	  confirm: true
  })
  await stripe.paymentIntents.capture(paymentIntent.id)

  const paymentPending = await stripe.paymentMethods.create({
	  type: 'card',
	  card: { number: card.number, exp_month: card.exp_month, exp_year: card.exp_year }
  })
  await stripe.paymentIntents.create({
	  payment_method: paymentPending.id,
	  amount: 1000,
	  currency: 'usd',
	  payment_method_types: ['card'],
	  capture_method: 'manual',
	  customer: customer.id,
	  confirm: true
  })

  console.log('**   Finished')
}

function delay (time) {
  return new Promise(resolve => setTimeout(resolve, time))
}
