/**
 * src/config/database.js
 *
 * Neon PostgreSQL connection pool + schema initialization.
 * Schema is idempotent — safe to run on every cold start.
 *
 * Tables:
 *   visits        – one row per page visit (hashed IP, browser, OS, screen, referrer, timezone)
 *   section_views – one row per section scroll event
 *   likes_log     – one row per like click (hashed IP)
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
      ssl: { rejectUnauthorized: false },
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
      id          SERIAL PRIMARY KEY,
      ip_hash     TEXT        NOT NULL,
      browser     TEXT,
      os          TEXT,
      screen_size TEXT,
      referrer    TEXT,
      timezone    TEXT,
      visited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS section_views (
      id         SERIAL PRIMARY KEY,
      ip_hash    TEXT        NOT NULL,
      section    TEXT        NOT NULL,
      viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS likes_log (
      id        SERIAL PRIMARY KEY,
      ip_hash   TEXT        NOT NULL,
      liked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Indexes for fast dashboard queries
  await db.query(`CREATE INDEX IF NOT EXISTS idx_visits_at   ON visits        (visited_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_sections_at ON section_views (viewed_at  DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_likes_at    ON likes_log     (liked_at   DESC)`);

  logger.info('Database schema initialized');
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}
