/**
 * src/config/database.js
 *
 * Neon PostgreSQL connection pool + schema initialization.
 * Schema is idempotent — safe to run on every cold start.
 *
 * Tables:
 *   visits    – one row per page visit (ip, user_agent_hint, visited_at)
 *   likes_log – one row per like click (ip, liked_at)
 */

'use strict';

import pg from 'pg';
import config from './env.js';
import logger from './logger.js';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: { rejectUnauthorized: false }, // Required for Neon's SSL proxy
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000,
    });

    pool.on('error', (err) => {
      logger.error('Unexpected database pool error', { message: err.message });
    });
  }
  return pool;
}

export async function initializeSchema() {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS visits (
      id            SERIAL PRIMARY KEY,
      ip            TEXT        NOT NULL,
      user_agent    TEXT,
      visited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS likes_log (
      id            SERIAL PRIMARY KEY,
      ip            TEXT        NOT NULL,
      liked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Indexes for fast dashboard queries
  await db.query(`CREATE INDEX IF NOT EXISTS idx_visits_at    ON visits    (visited_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_likes_at     ON likes_log (liked_at   DESC)`);

  logger.info('Database schema initialized');
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}
