/**
 * src/controllers/adminController.js
 *
 * Admin API — all endpoints require Authorization: Bearer <ADMIN_SECRET>
 * Never called from the public portfolio frontend.
 */

'use strict';

import { getStats, getRecentVisits, getRecentLikes } from '../repositories/analyticsRepository.js';
import { getPool } from '../config/database.js';
import logger from '../config/logger.js';

/**
 * GET /admin/analytics
 * Returns stats + recent visits + recent likes in one response.
 * Query param: ?limit=N (default 100, max 500)
 */
export async function getAnalytics(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const db = getPool();

    const [stats, recentVisits, recentLikes] = await Promise.all([
      getStats(db),
      getRecentVisits(db, limit),
      getRecentLikes(db, limit),
    ]);

    logger.info('Admin: analytics fetched', {
      visits: recentVisits.length,
      likes: recentLikes.length,
    });

    res.status(200).json({ stats, recentVisits, recentLikes });
  } catch (err) {
    next(err);
  }
}
