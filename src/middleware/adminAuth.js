/**
 * src/middleware/adminAuth.js
 *
 * Server-side admin authentication middleware.
 *
 * Security model:
 * - Admin secret is stored only in environment variables on Render and in the
 *   local .env file on the developer's laptop.
 * - Never committed to Git.
 * - Never sent to or accessible from the public portfolio frontend.
 * - The local admin dashboard sends the secret via Authorization header in a
 *   request that goes from localhost → Render API. This means the secret travels
 *   over TLS (HTTPS) and is not embedded in browser JavaScript shipped to visitors.
 *
 * Comparison is done with timingSafeEqual to prevent timing-based side-channel attacks.
 */

'use strict';

import { timingSafeEqual } from 'crypto';
import config from '../config/env.js';
import logger from '../config/logger.js';

const BEARER_PREFIX = 'Bearer ';

export function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';

  if (!authHeader.startsWith(BEARER_PREFIX)) {
    logger.warn('Admin request missing or malformed Authorization header', {
      ip: req.ip,
      path: req.path,
    });
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  const providedSecret = authHeader.slice(BEARER_PREFIX.length);

  // Use timingSafeEqual to prevent timing attacks
  // Both buffers must be the same length for the comparison to work
  try {
    const expected = Buffer.from(config.adminSecret, 'utf8');
    const provided = Buffer.from(providedSecret, 'utf8');

    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      logger.warn('Admin request with invalid secret', { ip: req.ip, path: req.path });
      return res.status(401).json({ message: 'Unauthorized.' });
    }
  } catch {
    // Buffer creation failure (e.g., excessively long header)
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  next();
}
