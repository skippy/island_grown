import config from '../src/config.js'
import Stripe from 'stripe'
const stripeAPIKey = config.get('stripe_api_key')

if(!/^sk_test_/i.test(stripeAPIKey)){
	console.log('***** ERROR')
	if(stripeAPIKey){
		console.log(`  stripe API key is NOT a test key: ${stripeAPIKey.substring(0, 6)}...`)
	}else{
		console.log('  stripe API key is NOT set.  set ENV STRIPE_API_KEY')
	}
	console.log('  exiting')
	process.exit(1);
}
global.stripe = new Stripe(stripeAPIKey, { apiVersion: '2022-11-15' })

global.transactionCardholderEmail = 'jenny.rubin_has_transactions@example.com'
global.transactionWithRefundCardholderEmail = 'jenny.rubin_has_transaction_and_refund@example.com'
global.emptyCardholderEmail = 'jenny.rubin_empty@example.com'

before(async () => {
  await setupNoTransactionsCardholder()
  await setupOneTransactionCardholder()
  await setupOneTransactionWithRefundCardholder()
})

const setupNoTransactionsCardholder = async () => {
  let cardholder = (await stripe.issuing.cardholders.list({ email: global.emptyCardholderEmail })).data[0]
  if (cardholder) return
  console.log('** creating initial stripe cardholder with no transactions')

  cardholder = await stripe.issuing.cardholders.create({
	  name: 'Jenny Rosen Empty',
	  email: emptyCardholderEmail,
	  phone_number: '+18008675309',
	  status: 'active',
	  type: 'individual',
	  spending_controls: {
	    spending_limits: [{ amount: config.get('base_funding_amt') * 100, interval: 'all_time' }]
	  },
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
	  phone_number: '+18008675309',
	  status: 'active',
	  type: 'individual',
	  spending_controls: {
	    spending_limits: [{ amount: config.get('base_funding_amt') * 100, interval: 'all_time' }]
	  },
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
	  phone: '+18008675309',
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
	  amount: 2000,
	});
  console.log('**   Finished')

}

const setupOneTransactionCardholder = async () => {
  let cardholder = (await stripe.issuing.cardholders.list({ email: global.transactionCardholderEmail })).data[0]
  if (cardholder) return
  console.log('** creating initial stripe cardholder with 1 transaction')

  await stripe.topups.create({
	  destination_balance: 'issuing',
	  amount: 2000,
	  currency: 'usd',
	  description: 'Top-up for Issuing, January 16, 2023',
	  statement_descriptor: 'Top-up'
  })
  cardholder = await stripe.issuing.cardholders.create({
	  name: 'Jenny Rosen',
	  email: transactionCardholderEmail,
	  phone_number: '+18008675309',
	  status: 'active',
	  type: 'individual',
	  spending_controls: {
	    spending_limits: [{ amount: config.get('base_funding_amt') * 100, interval: 'all_time' }]
	  },
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
	  phone: '+18008675309',
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
