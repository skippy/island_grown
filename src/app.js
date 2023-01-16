'use strict'

import config from './config.js'
import express from 'express'

import { igBalance } from './functions/igBalance.js'
import { igSetup } from './functions/igSetup.js'
import { helloHttp } from './functions/helloHttp.js'

const app = express()
const port = config.get('port')
// console.log(config.toString())

app.use('/igBalance', igBalance)
app.use('/igSetup', igSetup)
app.use('/helloHttp', helloHttp)
// NOTE: google cloud functions needs app to be exported with the various end points specified
// but the server.js and testing logic needs app just to be exported; so declaring it twice
export { app as index, igBalance, igSetup, helloHttp }
export { app }
export { config }
// export { app as index, igBalance, igSetup, helloHttp }

// export default app;
// needed for testing with jest; not a fan!
// module.exports = app; // for testing
// export { config, app }
