/**
 * src/routes/analyticsRoutes.js
 *
 * Public analytics routes — called silently from the portfolio frontend.
 * Rate limited to prevent abuse. No auth required (the IP is the payload).
 */

'use strict';

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { recordVisit, recordLike } from '../controllers/analyticsController.js';

export function createAnalyticsRoutes() {
  const router = Router();

  // Visit: generous limit — one per page load, but some visitors refresh often
  const visitLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,  // 5 minutes
    max: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    // Always 200 even when rate limited — analytics must not surface errors
    handler: (_req, res) => res.status(200).json({ ok: true }),
  });

  // Like: stricter — shouldn't fire more than a few times
  const likeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: (_req, res) => res.status(200).json({ ok: true }),
  });

  router.post('/visit', visitLimiter, recordVisit);
  router.post('/like',  likeLimiter,  recordLike);

  return router;
}
