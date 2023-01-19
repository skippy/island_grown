import config from './config.js'

import Stripe from 'stripe'
// NOTE: remove API version and use stripe dashboard
export const stripeVersion = '2022-11-15'
export const stripe = new Stripe(config.get('stripe_api_key'), { apiVersion: stripeVersion })

export const retrieveCardholderByEmail = async (email) => {
  if (!email) return null
  if (email.trim() === '') return null
  email = email.toLowerCase()
  // const cards = []
  for await (const cardholder of stripe.issuing.cardholders.list({ email, status: 'active' })) {
    return cardholder
  }
  return null
}

export const retrieveCardholderByLast4Exp = async (last4, exp_month, exp_year) => {
  if (!last4 || !exp_month || !exp_year) return null
  // const cards = []
  for await (const card of stripe.issuing.cards.list({
    last4,
    exp_month,
    exp_year
  })) {
    return card.cardholder
  }
  return null
}
