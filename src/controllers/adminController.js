/**
 * src/controllers/adminController.js
 *
 * Admin API — protected by adminAuth middleware.
 * Returns full analytics: stats, top sections, and a merged chronological log feed.
 */

'use strict';

import {
  getStats,
  getTopSections,
  getLogFeed,
} from '../repositories/analyticsRepository.js';
import { getPool } from '../config/database.js';
import logger from '../config/logger.js';

/**
 * GET /admin/analytics?limit=N
 * Returns: { stats, topSections, logFeed }
 */
export async function getAnalytics(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 200;
    const db = getPool();

    const [stats, topSections, logFeed] = await Promise.all([
      getStats(db),
      getTopSections(db),
      getLogFeed(db, limit),
    ]);

    logger.info('Admin: analytics fetched', { logEntries: logFeed.length });

    res.status(200).json({ stats, topSections, logFeed });
  } catch (err) {
    next(err);
  }
}
