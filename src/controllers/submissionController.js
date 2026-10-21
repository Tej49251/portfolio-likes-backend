/**
 * src/controllers/submissionController.js
 *
 * Thin HTTP controller for the public submission endpoint.
 * Business logic lives in submissionService; DB access in the repository.
 */

'use strict';

import { processSubmission } from '../services/submissionService.js';
import { getPool } from '../config/database.js';

/**
 * POST /api/submissions
 *
 * req.normalizedName is attached by the validateName middleware.
 * Accepts a name (or no name) and acknowledges the submission.
 */
export async function handleSubmission(req, res, next) {
  try {
    const db = getPool();
    await processSubmission(db, req.normalizedName);

    // Always respond 200 regardless of whether the name was stored.
    // Varying the response based on storage outcome would leak info about duplicates.
    res.status(200).json({ message: 'Thank you!' });
  } catch (err) {
    next(err);
  }
}
