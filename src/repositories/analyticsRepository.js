/**
 * src/repositories/analyticsRepository.js
 *
 * All data access for analytics tables.
 * Uses parameterized queries throughout — no raw user input in SQL.
 */

'use strict';

// ── Writes ──────────────────────────────────────────────────────────────────

export async function insertVisit(db, { ipHash, browser, os, screenSize, referrer, timezone }) {
  await db.query(
    `INSERT INTO visits (ip_hash, browser, os, screen_size, referrer, timezone, visited_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [ipHash, browser || null, os || null, screenSize || null, referrer || null, timezone || null]
  );
}

export async function insertSectionView(db, ipHash, section) {
  // Prevent abuse: max 1 row per ip_hash+section per 10 minutes
  const existing = await db.query(
    `SELECT id FROM section_views
     WHERE ip_hash = $1 AND section = $2 AND viewed_at > NOW() - INTERVAL '10 minutes'
     LIMIT 1`,
    [ipHash, section]
  );
  if (existing.rows.length > 0) return; // deduplicate
  await db.query(
    `INSERT INTO section_views (ip_hash, section, viewed_at) VALUES ($1, $2, NOW())`,
    [ipHash, section]
  );
}

export async function insertLike(db, ipHash) {
  await db.query(
    `INSERT INTO likes_log (ip_hash, liked_at) VALUES ($1, NOW())`,
    [ipHash]
  );
}

// ── Stats ────────────────────────────────────────────────────────────────────

export async function getStats(db) {
  const result = await db.query(`
    SELECT
      (SELECT COUNT(*)           FROM visits)                                                   AS total_visits,
      (SELECT COUNT(DISTINCT ip_hash) FROM visits)                                              AS unique_visitors,
      (SELECT COUNT(*)           FROM likes_log)                                                AS total_likes,
      (SELECT COUNT(*)           FROM section_views)                                            AS total_section_views,
      (SELECT COUNT(*)           FROM visits    WHERE visited_at > NOW() - INTERVAL '24 hours') AS today_visits,
      (SELECT COUNT(*)           FROM likes_log WHERE liked_at   > NOW() - INTERVAL '24 hours') AS today_likes
  `);
  const r = result.rows[0];
  return {
    totalVisits:      parseInt(r.total_visits,       10),
    uniqueVisitors:   parseInt(r.unique_visitors,    10),
    totalLikes:       parseInt(r.total_likes,        10),
    totalSectionViews:parseInt(r.total_section_views,10),
    todayVisits:      parseInt(r.today_visits,       10),
    todayLikes:       parseInt(r.today_likes,        10),
  };
}

export async function getTopSections(db) {
  const result = await db.query(`
    SELECT section, COUNT(*) AS views
    FROM section_views
    GROUP BY section
    ORDER BY views DESC
    LIMIT 10
  `);
  return result.rows.map(r => ({ section: r.section, views: parseInt(r.views, 10) }));
}

// ── Combined log feed (visits + likes + section_views merged by time) ─────────

export async function getLogFeed(db, limit = 200) {
  const safe = Math.min(Math.max(1, parseInt(limit, 10) || 200), 1000);
  const result = await db.query(`
    SELECT 'VISIT'   AS type, id, ip_hash,
           visited_at  AS ts,
           browser, os, screen_size AS screen, referrer, timezone,
           NULL AS section
    FROM visits
    UNION ALL
    SELECT 'LIKE'    AS type, id, ip_hash,
           liked_at    AS ts,
           NULL, NULL, NULL, NULL, NULL, NULL
    FROM likes_log
    UNION ALL
    SELECT 'SECTION' AS type, id, ip_hash,
           viewed_at   AS ts,
           NULL, NULL, NULL, NULL, NULL, section
    FROM section_views
    ORDER BY ts DESC
    LIMIT $1
  `, [safe]);
  return result.rows;
}
