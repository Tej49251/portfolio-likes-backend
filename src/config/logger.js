/**
 * src/config/logger.js
 *
 * Structured Winston logger.
 *
 * Rules followed:
 * - Never log submitted names at INFO level (privacy)
 * - Never log credentials, connection strings, or tokens
 * - In production: JSON format for log aggregation
 * - In development: human-readable colorized output
 * - Stack traces are included in error logs but never sent to API clients
 */

'use strict';

import { createLogger, format, transports } from 'winston';

const { combine, timestamp, json, colorize, printf, errors } = format;

const isDevelopment = process.env.NODE_ENV !== 'production';

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level}: ${message}${metaStr}${stack ? `\n${stack}` : ''}`;
  })
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const logger = createLogger({
  level: isDevelopment ? 'debug' : 'info',
  format: isDevelopment ? devFormat : prodFormat,
  transports: [new transports.Console()],
});

export default logger;
