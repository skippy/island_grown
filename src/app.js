'use strict'

import express from 'express'
import bodyParser from 'body-parser'
import Twilio from 'twilio'
import config from './config.js'
import { logger } from './logger.js'

import { igBalance } from './functions/igBalance.js'
import { igUpdateCardholderSpendingRules } from './functions/igUpdateCardholderSpendingRules.js'
import { whCardholderSetup } from './functions/whCardholderSetup.js'
import { whAuthorization } from './functions/whAuthorization.js'
import { whTwilio } from './functions/whTwilio.js'

logger.level = config.get('log_level')
const shouldValidateTwilio = config.get('env') !== 'test'

const app = express()
const port = config.get('port')

// need to add rawBody so we can pass it back to Stripe-js to verify signature
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf
  }
}))
app.use(bodyParser.urlencoded({ extended: false }))

app.get('/igBalance', igBalance)
app.post('/igUpdateCardholderSpendingRules', igUpdateCardholderSpendingRules)
app.post('/whCardholderSetup', express.raw({ type: 'application/json' }), whCardholderSetup)
app.post('/whAuthorization', express.raw({ type: 'application/json' }), whAuthorization)
app.post('/whTwilio', Twilio.webhook({ validate: shouldValidateTwilio }), whTwilio)

// NOTE: google cloud functions needs app to be exported with the various end points specified
// but the server.js and testing logic needs app just to be exported; so declaring it twice
export { app as index, igBalance, igUpdateCardholderSpendingRules, whCardholderSetup, whAuthorization, whTwilio }
export { app }
export { config }
// export { app as index, igBalance, igUpdateCardholderSpendingRules, helloHttp }

// export default app;
// needed for testing with jest; not a fan!
// module.exports = app; // for testing
// export { config, app }
