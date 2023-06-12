import config from './config.js'
import { logger } from './logger.js'

import parsePhoneNumber from 'libphonenumber-js'
import Stripe from 'stripe'
// NOTE: remove API version and use stripe dashboard
export const stripeVersion = '2022-11-15'
export const stripe = new Stripe(config.get('stripe_api_key'), { apiVersion: stripeVersion })

export const retrieveCardholderByEmail = async (email) => {
  if (!email) return null
  if (email.trim() === '') return null
  email = email.toLowerCase()
  const cardholders = (await stripe.issuing.cardholders.list({ email, status: 'active' })).data
  if (cardholders.length > 1) {
    logger.error(`multiple cardholders for email ${email}`)
    return null
  }
  return cardholders[0] || null
}

export const retrieveCardholderByPhone = async (val) => {
  if (val === undefined || val === null || val.trim() === '') return null
  const phoneNumber = parsePhoneNumber(val, 'US')
  if (!phoneNumber) return null
  if(!phoneNumber.isValid()){
    logger.error(`phone number is not valid: ${val}`)
  }
  const cardholders = (await stripe.issuing.cardholders.list({ phone_number: phoneNumber.number, status: 'active' })).data
  if (cardholders.length > 1) {
    logger.error(`multiple cardholders for phoneNumber ${phoneNumber.number}`)
    cardholders.forEach((ch) => { logger.error(`  ${ch.id}`) })
    return null
  }
  return cardholders[0] || null
}

export const retrieveCardholderID = async (val) => {
  if (val === undefined || val === null || val.trim() === '') return null
  try {
    const cardholder = (await stripe.issuing.cardholders.retrieve(val))
    if (cardholder && cardholder.status !== 'active') {
      logger.error(`cardholder is not active.  id: ${val}`)
      return null
    }
    return cardholder
  } catch (err) {
    logger.error(`cardholder is not found.  id: ${val}`)
    return null
  }
}

export const retrieveCardholderByLast4Exp = async (last4, exp_month, exp_year) => {
  if (!last4 || !exp_month || !exp_year) return null
  const cards = (await stripe.issuing.cards.list({
    last4,
    exp_month,
    exp_year
  })).data
  if (cards.length > 1) {
    logger.error(`multiple cards for last4: ${last4}; exp_month: ${exp_month}; exp_year: ${exp_year}`)
    return null
  } else if (cards.length == 1) {
    return cards[0].cardholder
  }
  return null
}
