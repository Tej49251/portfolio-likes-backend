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
      ip_hash     TEXT        NOT NULL DEFAULT 'unknown',
      browser     TEXT,
      os          TEXT,
      screen_size TEXT,
      referrer    TEXT,
      timezone    TEXT,
      visited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ── Migration: add new columns to existing visits table ───────────────────
  const visitMigrations = [
    `ALTER TABLE visits ADD COLUMN IF NOT EXISTS ip_hash     TEXT`,
    `ALTER TABLE visits ADD COLUMN IF NOT EXISTS browser     TEXT`,
    `ALTER TABLE visits ADD COLUMN IF NOT EXISTS os          TEXT`,
    `ALTER TABLE visits ADD COLUMN IF NOT EXISTS screen_size TEXT`,
    `ALTER TABLE visits ADD COLUMN IF NOT EXISTS referrer    TEXT`,
    `ALTER TABLE visits ADD COLUMN IF NOT EXISTS timezone    TEXT`,
    // If old 'ip' column exists, copy its value to ip_hash where ip_hash is null
    `UPDATE visits SET ip_hash = COALESCE(ip_hash, ip::TEXT, 'legacy') WHERE ip_hash IS NULL OR ip_hash = ''`,
  ];
  for (const sql of visitMigrations) {
    await db.query(sql).catch(() => {}); // ignore errors (column may already exist)
  }

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
      ip_hash   TEXT        NOT NULL DEFAULT 'unknown',
      liked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ── Migration: add ip_hash to existing likes_log ──────────────────────────
  await db.query(`ALTER TABLE likes_log ADD COLUMN IF NOT EXISTS ip_hash TEXT`)
    .catch(() => {});
  await db.query(`UPDATE likes_log SET ip_hash = COALESCE(ip_hash, ip::TEXT, 'legacy') WHERE ip_hash IS NULL OR ip_hash = ''`)
    .catch(() => {});

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
