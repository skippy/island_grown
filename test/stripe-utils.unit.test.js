import chai, { expect } from 'chai'
import * as stripeUtils from '../src/stripe-utils.js'
// import config from '../../src/config.js'

const should = chai.should()

describe('retrieveCardholderByEmail', () => {
  it('should return null if no email is sent', async () => {
    const ch = await stripeUtils.retrieveCardholderByEmail(null)
    expect(ch).to.be.null;
  })

  it('should return null if empty email is sent', async () => {
    const ch = await stripeUtils.retrieveCardholderByEmail('   ')
    expect(ch).to.be.null;
  })
  it('should return null if no cardholder found with that email', async () => {
    const ch = await stripeUtils.retrieveCardholderByEmail('junk@nope.com')
    expect(ch).to.be.null;
  })
  it('should return the matching cardholder', async () => {
    const ch = await stripeUtils.retrieveCardholderByEmail(global.emptyCardholderEmail)
    expect(ch).to.not.be.null;
    expect(ch.object).to.eql('issuing.cardholder')
    expect(ch.email).to.eql(global.emptyCardholderEmail)
  })
  it('should return the matching cardholder even if the email is mixed case', async () => {
    let changedEmail = global.emptyCardholderEmail.charAt(0).toUpperCase() + global.emptyCardholderEmail.slice(1);
    const ch = await stripeUtils.retrieveCardholderByEmail(changedEmail)
    expect(ch).to.not.be.null;
    expect(ch.object).to.eql('issuing.cardholder')
    expect(ch.email).to.eql(global.emptyCardholderEmail)
  })
})


describe('retrieveCardholderByLast4Exp', () => {
  it('should return null if no args are passed in', async () => {
    let ch = await stripeUtils.retrieveCardholderByLast4Exp()
    expect(ch).to.be.null;
    ch = await stripeUtils.retrieveCardholderByLast4Exp(null)
    expect(ch).to.be.null;
    ch = await stripeUtils.retrieveCardholderByLast4Exp(null, null)
    expect(ch).to.be.null;
    ch = await stripeUtils.retrieveCardholderByLast4Exp(null, null, null)
    expect(ch).to.be.null;
    ch = await stripeUtils.retrieveCardholderByLast4Exp('1234')
    expect(ch).to.be.null;
    ch = await stripeUtils.retrieveCardholderByLast4Exp('1234', '12')
    expect(ch).to.be.null;
  })
  it('should return null if no matching args are passed in', async () => {
    let ch = await stripeUtils.retrieveCardholderByLast4Exp('', '', '')
    expect(ch).to.be.null;
  })
  it('should return matching cardholder for valid last4 and exp ', async () => {
    let card;
    for await (const c of stripe.issuing.cards.list()) {
      card = c
      break
    }
    let ch = await stripeUtils.retrieveCardholderByLast4Exp(card.last4, card.exp_month, card.exp_year)
    expect(ch).to.not.be.null;
    expect(ch.object).to.eql('issuing.cardholder')
    // lets make sure this cardholder has the underlying card
    let retrievedCard
    for await (const c of stripe.issuing.cards.list({cardholder: ch.id})) {
      retrievedCard = c
      break
    }
    expect(retrievedCard.id).to.eql(card.id)
  })

})

