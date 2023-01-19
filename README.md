# Island Grown Credit Card

## Overview

This is the software to help manage the [San Juan County, WA](https://sanjuanco.com/) [Dept. of Health](https://sanjuanco.com/1777/Health-Community-Services) food assistance program.

The county manages and assists with a number of food assistance programs, ranging from the federal government to numerous local non-profits. They all have their own requirements and demands on both the consumer and merchant (paper coupons, special local vouchers, etc) that require training and significant time by the merchants and county health staff to manage.

This program is designed to roll many of those programs into a single physical credit card, using [Stripe's Issue Card](https://stripe.com/issuing) program. Food assistance customers can use these cards at specific local merchants, and they require minimal to no training at the merchant level as they are just credit cards. Various grant requirements are met by partnering with the largest local merchants (co-ops and food hubs) on food purchase history tied to the cards, which are gathered, aggregated, and used to meet various reporting requirements.

### The customer flow, in general, is:

* manually enter or upload customer information into the [Stripe Dashboard](https://dashboard.stripe.com/issuing/cardholders) to create cardholders and a physical card. This is done by the county health dept. and partnering local non-profits such as the family resource center
** upon entry, a [webhook](./src/functions/whCardholderSetup.js) runs to normalize the entered information and setup default spending limits for that card
* cards are shipped by Stripe to the customer in a few business days
* the cards can be used at select local merchants, such as local food co-ops and farm stands (see an example of a local merchant whitelist [here](./config/app_configs.yml))
* when a customer uses their card at a merchant, Stripe calls a [webhook](./src/functions/whAuthorization.js) to verify if the merchant is allowed or not. Stripe also checks the spending controls to see if the customer has enough balance on their card.
* customers can check their balance by using a webpage provided by county health which hits a [backend endpoint](./src/functions/igBalance.js), such as `GET https://cloud-function-hostname?email=example@gmail.com`
* on a set schedule (currently nightly) a [script](https://github.com/skippy/island_grown/blob/main/src/functions/igUpdateCardholderSpendingRules.js) is run to check if customers whom are using their card are eligible for a refill.



## Setup

### Requirements

* [Stripe account](https://dashboard.stripe.com/register)
* nodejs & yarn
* Service to host webhooks and endpoints.  The code is platform agnostic, and can be run on local servers or various cloud services.  This repository is currently configured to use GCP via a [setup script](scripts/gcp_update.zsh)


### Stripe Setup

* setup and enable [Card Issuing](https://stripe.com/issuing)
* configure Card issuing ([notification preferences](https://dashboard.stripe.com/settings/issuing/balance-notifications) and [card design](https://dashboard.stripe.com/settings/issuing/card-design)).  You'll also want to [initiate a transfer](https://dashboard.stripe.com/balance/overview) to Stripe to make funds available for your issued cards.
* setup [API keys](https://dashboard.stripe.com/apikeys)!  It is *highly* recommended that you create a separate key for each type of action that is scoped to just the functionality that you need.  You'll need the following keys:
   * [standard test key](https://dashboard.stripe.com/test/apikeys).
   * cardholders read key: with `read` resource permissions for `issuing_authorizations`,`issuing_cardholders`, `issuing_cards`,`issuing_transactions`
   * issuing write key: with `write` resource permissions for `issuing_authorizations`,`issuing_cardholders`, `issuing_cards`, and `read` permissions for `issuing_transactions`
 * Securely manage these API keys (e.g., do not check them in)

### Development & Testing

* make your Stripe API test key available to run tests. Store `STRIPE_API_KEY={your_long_stripe_key}` in `.env`.

```sh
yarn install
yarn run test
```

This creates and uses test data hosted by [Stripe in their test environment](https://dashboard.stripe.com/test/developers).  If the test data gets corrupted, go to the [Test Developer Dashboard](https://dashboard.stripe.com/test/developers) and click 'Delete all test data…'


### Production

#### Hosting

Setting up hosting is beyond the scope of this `README` but the code should be agnostic to any platform.  We use [GCP](https://cloud.google), specifically `cloud functions`, `Job Scheduler`, `IAM`, `cloud dns`, and `Secret Manager`.  See [./scripts/gcp_update.zsh](./scripts/gcp_update.zsh).

API Keys can be passed in via ENV, so plan to use a secret manager to securely inject them at runtime.

The following scripts need to be running
* `src/functions/igBalance.js`: for a website to hit so users can check the balances on their card
* `src/functions/whAuthorization.js`: a webhook for stripe to call to approve or reject a payment authorization
* `src/functions/whCardholderSetup.js`: a webhook for stripe to call when a cardholder is created or updated.  It sets up the spending limits.

OPTIONAL:
* `src/functions/igUpdateCardholderSpendingRules.js`: Can be run on a cron job to update uers spending limits if they are qualified for a refill.


#### Stripe Webhooks

once your host is setup, you'll need to add [Stripe Webhooks](https://dashboard.stripe.com/webhooks)

* Authorication: link to the url to call `src/functions/whAuthorization.js`.  Events to send should be `issuing_authorization.request`,
* Cardholder Setup: link to the url to call `src/functions/whCardholderSetup.js`.  Events to send should be `issuing_cardholder.created`, `issuing_cardholder.updated`, `issuing_card.created`, `issuing_card.updated`,

Each webhook has a signing secret.  Treat these as API keys, and store them in the same manner, and pass them to the running process via the ENV as `STRIPE_AUTH_WEBHOOK_SECRET`
