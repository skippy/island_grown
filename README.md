# Island Grown Credit Card



## Setup


### Stripe


### Google Cloud Functions


## Testing

Testing locally

````sh
stripe login
stripe listen --forward-to localhost:8080
stripe trigger issuing_authorization.request
# grab the webhook signing secret, which will start with `whsec_`
bundle exec functions-framework-ruby -v -e STRIPE_AUTH_WEBHOOK_SECRET=whsec_lotsOfJunk --target=cc_authorization_webhook
```
