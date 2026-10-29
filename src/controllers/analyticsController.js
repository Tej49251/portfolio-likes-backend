/**
 * src/controllers/analyticsController.js
 *
 * Handlers for the two public analytics endpoints:
 *   POST /api/visit  — called once per page load
 *   POST /api/like   — called when a visitor clicks the like button
 *
 * Both endpoints:
 * - Read the visitor IP from req.ip (correctly resolved via trust proxy = 1)
 * - Capture a short, non-identifying user-agent hint for visits
 * - Always respond 200 — analytics should never surface errors to the UI
 */

'use strict';

import { insertVisit, insertLike } from '../repositories/analyticsRepository.js';
import { getPool } from '../config/database.js';
import logger from '../config/logger.js';

/**
 * Derive a short, readable browser hint from the User-Agent string.
 * We only keep the high-level browser/OS family — never the full UA.
 * Example: "Chrome / Windows" or "Safari / iOS"
 */
function browserHint(ua = '') {
  if (!ua) return null;
  const s = ua.toLowerCase();
  let browser = 'Other';
  let os = 'Unknown';

  if (s.includes('edg/'))         browser = 'Edge';
  else if (s.includes('opr/') || s.includes('opera')) browser = 'Opera';
  else if (s.includes('chrome'))  browser = 'Chrome';
  else if (s.includes('firefox')) browser = 'Firefox';
  else if (s.includes('safari'))  browser = 'Safari';

  if (s.includes('windows'))      os = 'Windows';
  else if (s.includes('android')) os = 'Android';
  else if (s.includes('iphone') || s.includes('ipad')) os = 'iOS';
  else if (s.includes('mac'))     os = 'macOS';
  else if (s.includes('linux'))   os = 'Linux';

  return `${browser} / ${os}`;
}

export async function recordVisit(req, res) {
  try {
    const db = getPool();
    const ip = req.ip || 'unknown';
    const hint = browserHint(req.headers['user-agent']);
    await insertVisit(db, ip, hint);
    logger.info('Visit recorded', { ip });
  } catch (err) {
    // Log but never expose — analytics must not break the portfolio
    logger.error('Failed to record visit', { message: err.message });
  }
  res.status(200).json({ ok: true });
}

export async function recordLike(req, res) {
  try {
    const db = getPool();
    const ip = req.ip || 'unknown';
    await insertLike(db, ip);
    logger.info('Like recorded', { ip });
  } catch (err) {
    logger.error('Failed to record like', { message: err.message });
  }
  res.status(200).json({ ok: true });
}
