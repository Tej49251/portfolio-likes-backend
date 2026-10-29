/**
 * src/repositories/analyticsRepository.js
 *
 * All data access for the analytics tables (visits, likes_log).
 * Every query uses parameterized statements — no raw user input in SQL.
 */

'use strict';

export async function insertVisit(db, ip, userAgent) {
  await db.query(
    `INSERT INTO visits (ip, user_agent, visited_at) VALUES ($1, $2, NOW())`,
    [ip, userAgent || null]
  );
}

export async function insertLike(db, ip) {
  await db.query(
    `INSERT INTO likes_log (ip, liked_at) VALUES ($1, NOW())`,
    [ip]
  );
}

export async function getStats(db) {
  const result = await db.query(`
    SELECT
      (SELECT COUNT(*)         FROM visits)                                            AS total_visits,
      (SELECT COUNT(DISTINCT ip) FROM visits)                                          AS unique_visitors,
      (SELECT COUNT(*)         FROM likes_log)                                         AS total_likes,
      (SELECT COUNT(*)         FROM visits    WHERE visited_at > NOW() - INTERVAL '24 hours') AS today_visits,
      (SELECT COUNT(*)         FROM likes_log WHERE liked_at   > NOW() - INTERVAL '24 hours') AS today_likes
  `);
  const r = result.rows[0];
  return {
    totalVisits:     parseInt(r.total_visits,    10),
    uniqueVisitors:  parseInt(r.unique_visitors, 10),
    totalLikes:      parseInt(r.total_likes,     10),
    todayVisits:     parseInt(r.today_visits,    10),
    todayLikes:      parseInt(r.today_likes,     10),
  };
}

export async function getRecentVisits(db, limit = 100) {
  const safe = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);
  const result = await db.query(
    `SELECT id, ip, user_agent, visited_at FROM visits ORDER BY visited_at DESC LIMIT $1`,
    [safe]
  );
  return result.rows;
}

export async function getRecentLikes(db, limit = 100) {
  const safe = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);
  const result = await db.query(
    `SELECT id, ip, liked_at FROM likes_log ORDER BY liked_at DESC LIMIT $1`,
    [safe]
  );
  return result.rows;
}
