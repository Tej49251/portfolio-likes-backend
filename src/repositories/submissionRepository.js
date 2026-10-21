/**
 * src/repositories/submissionRepository.js
 *
 * Data access layer for the submissions table.
 *
 * All queries use parameterized statements ($1, $2, …) to prevent SQL injection.
 * No raw string interpolation of user input is ever used.
 *
 * The repository accepts a `db` (Pool) argument, making it unit-testable
 * without a live database connection.
 */

'use strict';

/**
 * Insert a new submission.
 * Returns the created row.
 *
 * @param {import('pg').Pool} db
 * @param {string} name - Already validated and normalized name
 * @returns {Promise<{id: number, name: string, created_at: Date}>}
 */
export async function insertSubmission(db, name) {
  const result = await db.query(
    `INSERT INTO submissions (name, created_at)
     VALUES ($1, NOW())
     RETURNING id, name, created_at`,
    [name]
  );
  return result.rows[0];
}

/**
 * Fetch the N most recent submissions for the admin dashboard.
 * Defaults to 100 rows — sufficient for a personal portfolio.
 *
 * @param {import('pg').Pool} db
 * @param {number} [limit=100]
 * @returns {Promise<Array<{id: number, name: string, created_at: Date}>>}
 */
export async function getRecentSubmissions(db, limit = 100) {
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);
  const result = await db.query(
    `SELECT id, name, created_at
     FROM submissions
     ORDER BY created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}

/**
 * Count submissions in the last N minutes — used as a soft duplicate guard.
 * Note: this is not reliable deduplication since names don't uniquely identify people.
 *
 * @param {import('pg').Pool} db
 * @param {string} name - normalized name
 * @param {number} [windowMinutes=5]
 * @returns {Promise<number>}
 */
export async function countRecentByName(db, name, windowMinutes = 5) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM submissions
     WHERE name = $1
       AND created_at > NOW() - INTERVAL '${safeInt(windowMinutes)} minutes'`,
    [name]
  );
  return result.rows[0].count;
}

/**
 * Returns the integer clamped to [1, 60] to safely embed in an interval expression.
 * This is the only place we construct part of a query string — the value is an integer
 * we control, not user input.
 */
function safeInt(n) {
  return Math.min(Math.max(1, parseInt(n, 10) || 5), 60);
}
