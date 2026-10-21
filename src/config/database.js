/**
 * src/config/database.js
 *
 * Creates and exports a PostgreSQL connection pool configured for Neon.
 *
 * Neon specifics:
 * - Uses the pooled connection endpoint (connection string contains "pooler" subdomain)
 * - SSL is required; Node.js pg client accepts ssl:true for Neon
 * - Neon compute suspends after 5 minutes of inactivity; the pool's idleTimeoutMillis
 *   is set to 20 seconds so idle connections are released before Neon's own timeout
 *
 * Connection limit note:
 * - Render free tier runs a single instance with 512 MB RAM
 * - max: 5 is generous for this low-traffic portfolio use case
 * - Neon's pooler (PgBouncer-compatible) can handle more concurrent connections
 */

'use strict';

import pg from 'pg';
import config from './env.js';
import logger from './logger.js';

const { Pool } = pg;

let pool = null;

/**
 * Returns the singleton pool, creating it if it doesn't exist.
 * Throws if DATABASE_URL is not set (caught by env.js at startup).
 */
export function getPool() {
  if (pool) return pool;

  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false }, // Neon requires SSL; certificate validation is handled by Neon
    max: 5,
    idleTimeoutMillis: 20_000,   // Release idle connections after 20 s
    connectionTimeoutMillis: 8_000, // Fail fast if Neon is slow to respond
  });

  pool.on('error', (err) => {
    // Unexpected errors on idle clients — log without crashing the process
    logger.error('PostgreSQL pool unexpected error', { message: err.message });
  });

  logger.info('PostgreSQL pool created');
  return pool;
}

/**
 * Initializes the database schema if tables don't exist.
 * Called once at server startup.
 */
export async function initializeSchema() {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id         SERIAL PRIMARY KEY,
      name       TEXT        NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Index for efficient admin queries (most recent first)
    CREATE INDEX IF NOT EXISTS idx_submissions_created_at
      ON submissions (created_at DESC);
  `);

  logger.info('Database schema verified/initialized');
}

/**
 * Gracefully closes the pool.
 * Called on SIGTERM / SIGINT so in-flight queries complete.
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('PostgreSQL pool closed');
  }
}
