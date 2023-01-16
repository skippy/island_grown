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

// if(process.env.NODE_ENV !== 'production'){
//   //disable on prod as the serverless function host will manage ports
//   //TODO: can we make this 'better' for running on serverless components?
//   app.listen(port, () => {
//     console.log(`Local server listening on port ${port}`)
//   })
// }

// Solution to expose multiple cloud functions locally
export { app as index, igBalance, igSetup, helloHttp }
export { config }
// export { app }
// export { app as index, igBalance, igSetup, helloHttp }

export default app;
// needed for testing with jest; not a fan!
// module.exports = app; // for testing
// export { config, app }
