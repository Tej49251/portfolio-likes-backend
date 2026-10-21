/**
 * src/middleware/errorHandler.js
 *
 * Centralized Express error handler.
 *
 * Security rules:
 * - NEVER expose stack traces, database details, or internal implementation info
 *   in production responses.
 * - Always return a generic message to the client.
 * - Log full error details server-side (where only the operator can see them).
 *
 * The 4-argument signature is required by Express to recognize this as an error handler.
 */

'use strict';

import logger from '../config/logger.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Log the full error with stack trace for operator debugging
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    statusCode: err.statusCode,
  });

  // Determine status code — default to 500
  const statusCode =
    typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
      ? err.statusCode
      : 500;

  // Generic response — no internal details
  const message =
    statusCode < 500
      ? err.message || 'Bad request.'
      : 'An unexpected error occurred. Please try again later.';

  res.status(statusCode).json({ message });
}
