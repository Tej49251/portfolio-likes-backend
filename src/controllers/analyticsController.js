/**
 * src/controllers/analyticsController.js
 *
 * Handlers for public analytics endpoints:
 *   POST /api/visit   — page load (with client-side context)
 *   POST /api/like    — like button clicked
 *   POST /api/section — section scrolled into view
 *
 * All endpoints always return 200 — analytics MUST NOT break the portfolio UI.
 * IPs are hashed before any storage (raw IPs never touch the DB).
 */

'use strict';

import {
  insertVisit,
  insertLike,
  insertSectionView,
} from '../repositories/analyticsRepository.js';
import { getPool } from '../config/database.js';
import { hashIp } from '../middleware/ipHasher.js';
import logger from '../config/logger.js';

// Allowed section names (whitelist to prevent junk data)
const VALID_SECTIONS = new Set([
  'hero', 'about', 'skills', 'projects',
  'experience', 'certifications', 'contact',
]);

// Allowed screen size values
const VALID_SCREENS = new Set(['Mobile', 'Tablet', 'Desktop']);

/**
 * Parse browser + OS from User-Agent string server-side.
 * Returns { browser, os } — never stores the full UA string.
 */
function parseUA(ua = '') {
  const s = ua.toLowerCase();
  let browser = 'Other';
  let os = 'Unknown';

  if (s.includes('edg/'))                                browser = 'Edge';
  else if (s.includes('opr/') || s.includes('opera'))    browser = 'Opera';
  else if (s.includes('chrome') && !s.includes('edg/')) browser = 'Chrome';
  else if (s.includes('firefox'))                        browser = 'Firefox';
  else if (s.includes('safari') && !s.includes('chrome')) browser = 'Safari';

  if (s.includes('windows'))                             os = 'Windows';
  else if (s.includes('android'))                        os = 'Android';
  else if (s.includes('iphone') || s.includes('ipad'))  os = 'iOS';
  else if (s.includes('mac'))                            os = 'macOS';
  else if (s.includes('linux'))                          os = 'Linux';

  return { browser, os };
}

/**
 * Sanitize a referrer string.
 * Accepts only a domain name (up to 100 chars) — no full URLs, no scripts.
 */
function sanitizeReferrer(ref) {
  if (!ref || typeof ref !== 'string') return null;
  // Strip protocol/path, keep only the domain
  const clean = ref.trim().replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
  // Only allow domain-like characters
  if (!/^[a-z0-9.-]{1,100}$/.test(clean)) return null;
  if (clean === '' || clean === 'localhost') return 'direct';
  return clean;
}

/**
 * Sanitize timezone string (e.g. "Asia/Kolkata").
 */
function sanitizeTimezone(tz) {
  if (!tz || typeof tz !== 'string') return null;
  if (!/^[A-Za-z_/]{1,60}$/.test(tz.trim())) return null;
  return tz.trim();
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function recordVisit(req, res) {
  try {
    const db     = getPool();
    const ipHash = hashIp(req.ip || 'unknown');
    const { browser, os } = parseUA(req.headers['user-agent'] || '');

    const body       = req.body || {};
    const screenSize = VALID_SCREENS.has(body.screenSize) ? body.screenSize : null;
    const referrer   = sanitizeReferrer(body.referrer);
    const timezone   = sanitizeTimezone(body.timezone);

    await insertVisit(db, { ipHash, browser, os, screenSize, referrer, timezone });
    logger.info('Visit recorded', { ipHash });
  } catch (err) {
    logger.error('Failed to record visit', { message: err.message });
  }
  res.status(200).json({ ok: true });
}

export async function recordLike(req, res) {
  try {
    const db     = getPool();
    const ipHash = hashIp(req.ip || 'unknown');
    await insertLike(db, ipHash);
    logger.info('Like recorded', { ipHash });
  } catch (err) {
    logger.error('Failed to record like', { message: err.message });
  }
  res.status(200).json({ ok: true });
}

export async function recordSection(req, res) {
  try {
    const db      = getPool();
    const ipHash  = hashIp(req.ip || 'unknown');
    const section = req.body?.section;

    if (!VALID_SECTIONS.has(section)) {
      return res.status(200).json({ ok: true }); // silently ignore invalid
    }

    await insertSectionView(db, ipHash, section);
    logger.info('Section view recorded', { ipHash, section });
  } catch (err) {
    logger.error('Failed to record section view', { message: err.message });
  }
  res.status(200).json({ ok: true });
}
