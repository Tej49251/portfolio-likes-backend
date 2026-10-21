/**
 * src/routes/submissionRoutes.js
 *
 * Public routes for name submissions.
 *
 * Exports a factory function so each app instance gets fresh middleware
 * (important for test isolation — shared rate-limiter stores bleed between tests).
 */

'use strict';

import { Router } from 'express';
import { createSubmissionLimiter } from '../middleware/rateLimiter.js';
import { validateName } from '../middleware/validateName.js';
import { handleSubmission } from '../controllers/submissionController.js';

/**
 * Creates a fresh submission router with its own rate-limiter instance.
 */
export function createSubmissionRoutes() {
  const router = Router();
  const submissionLimiter = createSubmissionLimiter();

  // POST /api/submissions
  router.post('/', submissionLimiter, validateName, handleSubmission);

  return router;
}
