/**
 * src/services/submissionService.js
 *
 * Business logic for name submissions.
 *
 * Responsibilities:
 * - Decide whether to insert (name present) or skip (name absent)
 * - Apply a soft duplicate guard as a server-side deterrent
 * - Delegate storage to the repository
 *
 * Important note on duplicates:
 * A submitted name alone cannot reliably identify a unique person. Two visitors
 * named "Alex" are indistinguishable by name alone. The duplicate guard here
 * only prevents the same exact name from being submitted multiple times within a
 * short window from the same browser session — it is not identity deduplication.
 */

'use strict';

import { insertSubmission, countRecentByName } from '../repositories/submissionRepository.js';
import logger from '../config/logger.js';

// Reject if the same name was submitted in the last 5 minutes
const DUPLICATE_WINDOW_MINUTES = 5;
const DUPLICATE_THRESHOLD = 3;

/**
 * Process a name submission.
 *
 * @param {import('pg').Pool} db
 * @param {string|null} normalizedName - Null means the user submitted without a name
 * @returns {Promise<{ stored: boolean, id?: number }>}
 */
export async function processSubmission(db, normalizedName) {
  // Name is optional — if absent, acknowledge without storing
  if (normalizedName === null) {
    logger.info('Submission acknowledged without a name');
    return { stored: false };
  }

  // Soft duplicate guard — log the occurrence but still accept it.
  // This is a deterrent only; it cannot prevent determined duplicate submissions.
  const recentCount = await countRecentByName(db, normalizedName, DUPLICATE_WINDOW_MINUTES);
  if (recentCount >= DUPLICATE_THRESHOLD) {
    logger.info('Duplicate name guard triggered', {
      recentCount,
      windowMinutes: DUPLICATE_WINDOW_MINUTES,
      // Log only the count and window, not the name itself
    });
    // Return success to avoid leaking information about existing records
    return { stored: false };
  }

  const row = await insertSubmission(db, normalizedName);
  // Log submission occurred, but NOT the name (privacy)
  logger.info('New submission stored', { id: row.id });

  return { stored: true, id: row.id };
}
