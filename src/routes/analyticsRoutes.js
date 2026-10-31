/**
 * src/routes/analyticsRoutes.js
 *
 * Public analytics routes — silently called by the portfolio frontend.
 * Always return 200 regardless of outcome.
 */

'use strict';

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { recordVisit, recordLike, recordSection } from '../controllers/analyticsController.js';

const silent200 = (_req, res) => res.status(200).json({ ok: true });

export function createAnalyticsRoutes() {
  const router = Router();

  const visitLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, max: 10,
    standardHeaders: 'draft-7', legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: silent200,
  });

  const likeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, max: 5,
    standardHeaders: 'draft-7', legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: silent200,
  });

  const sectionLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, max: 20, // 20 section events per minute per IP
    standardHeaders: 'draft-7', legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: silent200,
  });

  router.post('/visit',   visitLimiter,   recordVisit);
  router.post('/like',    likeLimiter,    recordLike);
  router.post('/section', sectionLimiter, recordSection);

  return router;
}
