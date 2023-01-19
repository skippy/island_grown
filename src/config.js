import * as dotenv from 'dotenv'

import convict from 'convict'
import convict_format_with_validator from 'convict-format-with-validator'
import yaml from 'js-yaml'
dotenv.config()

convict.addParser({ extension: ['yml', 'yaml'], parse: yaml.load })
convict.addFormats(convict_format_with_validator)

// Define a schema
const config = convict({
  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test'],
    default: 'development',
    arg: 'nodeEnv',
    env: 'NODE_ENV'
  },
  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: 8080,
    env: 'PORT',
    arg: 'port'
  },
  log_level: {
    format: ['debug', 'verbose', 'info', 'warn', 'error'],
    default: 'info',
    env: 'LOG_LEVEL',
    arg: 'log_level'
  },
  stripe_api_key: {
    doc: 'Stripe API key',
    format: '*',
    default: null,
    sensitive: true,
    env: 'STRIPE_API_KEY'
  },
  stripe_auth_webhook_secret: {
    doc: 'Stripe Auth Webhook Secret',
    format: '*',
    default: null,
    sensitive: true,
    env: 'STRIPE_AUTH_WEBHOOK_SECRET'
  },
  base_funding_amt: {
    format: 'int',
    default: null
  },
  spending_limit_interval: {
    format: ['all_time', 'yearly', 'monthly'],
    default: null
  },
  refill_trigger_percent: {
    format: 'Number',
    default: null
  },
  refill_amts: {
    format: function check (amts) {
      if (!Array.isArray(amts)) {
        throw new Error('must be an array of amounts (int or float)')
      }
      amts.forEach((amts) => {
        if (isNaN(amts)) {
          throw new Error('must be an integer or float')
        }
      })
    },
    default: null
  },
  approved_postal_codes: {
    format: function check (postalCodes) {
      if (!Array.isArray(postalCodes)) {
        throw new Error('must be an array of 5-digit postal codes')
      }
      postalCodes.forEach((postalCode) => {
        if (!/^\d{5}$/.test(postalCode)) {
          throw new Error('must be a 5-digit postal code')
        }
      })
    },
    default: null
  },
  approved_vendors: {
    format: function check (approvedVendors) {
      for (const vendorName in approvedVendors) {
        if (!(typeof vendorName === 'string')) {
          throw new Error('Vendor name must be a string')
        }
        if (!/^\d{5}$/.test(approvedVendors[vendorName])) {
          throw new Error('must be a 5-digit postal code')
        }
      }
    },
    default: null
  }

})

// Load environment dependent configuration
const env = config.get('env')
config.loadFile('./config/default.json')
config.loadFile('config/app_configs.yml')
config.loadFile(`./config/${env}.json`)
// Perform validation
config.validate({ allowed: 'strict' })

// module.exports = config
export default config
