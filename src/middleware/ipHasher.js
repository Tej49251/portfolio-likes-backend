/**
 * src/middleware/ipHasher.js
 *
 * Converts a raw IP address to a short HMAC-SHA256 hash.
 * The hash is deterministic for the same IP + salt, so unique visitor
 * counts are accurate — but the original IP can never be recovered.
 *
 * Privacy compliance:
 * - Raw IPs are NEVER stored in the database
 * - The salt is a secret held only on the server (IP_SALT env var)
 * - Without the salt, the hash is computationally irreversible
 */

'use strict';

import { createHmac, randomBytes } from 'crypto';
import config from '../config/env.js';

// If IP_SALT is not set, use a random salt per process start.
// This means unique visitor counts reset on restarts — acceptable for free tier.
const SALT = config.ipSalt || randomBytes(32).toString('hex');

/**
 * Returns a 12-character hex fingerprint of an IP address.
 * Example: "a3f8c2d14e91"
 */
export function hashIp(ip) {
  if (!ip || ip === 'unknown') return 'unknown';
  return createHmac('sha256', SALT).update(ip).digest('hex').slice(0, 12);
}
