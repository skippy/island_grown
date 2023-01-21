import config from './config.js'
import winston from 'winston'

// const transport = new winston.transports.Console({
//   format: winston.format.combine(
//     winston.format.simple(),
//     // winston.format.prettyPrint(),
//     // Format the metadata object
//     winston.format.metadata({
//       fillExcept: ["message", "level", "timestamp", "label"],
//     })
//   ),
// });
// winston.add(transport);

export const logger = winston.createLogger({
  level: config.get('log_level'),
  transports: [
    new winston.transports.Console()
  ]
})

if (config.get('env') === 'development') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }))
}

// export const logger = winston
// module.exports = winston;
