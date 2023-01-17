'use strict'

import config from './config.js'
import express from 'express'
import bodyParser from 'body-parser'
import { logger } from './logger.js'

import { igBalance } from './functions/igBalance.js'
import { igSetup } from './functions/igSetup.js'
import { helloHttp } from './functions/helloHttp.js'
import { whCardholderSetup } from './functions/whCardholderSetup.js'


logger.level = config.get('log_level')

const app = express()
const port = config.get('port')

// need to add rawBody so we can pass it back to Stripe-js to verify signature
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf
  }
}))

app.get('/igBalance', igBalance)
app.get('/igSetup', igSetup)
app.get('/helloHttp', helloHttp)
// app.use('/helloHttp', helloHttp)
// app.use('/wh-cardholder-setup', whCardholderSetup)
app.post('/whCardholderSetup', express.raw({type: 'application/json'}), whCardholderSetup);
// NOTE: google cloud functions needs app to be exported with the various end points specified
// but the server.js and testing logic needs app just to be exported; so declaring it twice
export { app as index, igBalance, igSetup, helloHttp, whCardholderSetup }
export { app }
export { config }
// export { app as index, igBalance, igSetup, helloHttp }

// export default app;
// needed for testing with jest; not a fan!
// module.exports = app; // for testing
// export { config, app }
