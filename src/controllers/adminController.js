/**
 * src/controllers/adminController.js
 *
 * Admin API controller — all endpoints protected by adminAuth middleware.
 * These endpoints are NEVER called from the public portfolio frontend.
 * They are only called from the local admin dashboard running at 127.0.0.1.
 */

'use strict';

import { getRecentSubmissions } from '../repositories/submissionRepository.js';
import { getPool } from '../config/database.js';
import logger from '../config/logger.js';

/**
 * GET /admin/submissions
 *
 * Returns the most recent submissions (default 100, max 500).
 * Query param: ?limit=N
 */
export async function listSubmissions(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const db = getPool();
    const rows = await getRecentSubmissions(db, limit);

    logger.info('Admin: submissions listed', { count: rows.length });

    // Render names as plain text — safe since we validate on insert.
    // The admin dashboard must escape HTML when rendering these strings.
    res.status(200).json({ submissions: rows });
  } catch (err) {
    next(err);
  }
}
