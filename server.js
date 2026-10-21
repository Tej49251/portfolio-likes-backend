/**
 * server.js — Entry point for the Render deployment.
 *
 * Responsibilities:
 * - Initialize the database schema
 * - Start the HTTP server
 * - Handle graceful shutdown on SIGTERM / SIGINT
 *
 * Render sends SIGTERM when it stops or restarts an instance.
 * Graceful shutdown allows in-flight requests to complete and
 * the database pool to close cleanly.
 */

'use strict';

// Load environment variables from .env in development
// In production (Render), env vars are set via the dashboard
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import config from './src/config/env.js';
import logger from './src/config/logger.js';
import { initializeSchema, closePool } from './src/config/database.js';
import { createApp } from './src/app.js';

let server = null;

async function start() {
  // Initialize database schema (idempotent — safe to run on every cold start)
  await initializeSchema();

  const app = createApp();

  server = app.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}`, {
      env: config.nodeEnv,
      // Do NOT log the full DATABASE_URL or ADMIN_SECRET
    });
  });

  // Increase keep-alive timeout slightly above Render's load balancer timeout
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
}

async function shutdown(signal) {
  logger.info(`${signal} received — starting graceful shutdown`);

  // Stop accepting new connections
  if (server) {
    server.close(() => logger.info('HTTP server closed'));
  }

  // Close database pool (allows in-flight queries to complete)
  await closePool();

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch unhandled rejections — log and exit so Render restarts the service
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
  process.exit(1);
});

start().catch((err) => {
  logger.error('Failed to start server', { message: err.message, stack: err.stack });
  process.exit(1);
});
