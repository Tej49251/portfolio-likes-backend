/**
 * src/routes/adminRoutes.js
 *
 * Admin API routes.
 * All routes are protected by adminAuth middleware.
 *
 * Security: These routes are accessed from the local admin server (127.0.0.1) only.
 * They are NOT registered under a path that CORS allows from the portfolio origin.
 * The admin secret is never sent from browser JavaScript on the public website.
 */

'use strict';

import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth.js';
import { listSubmissions } from '../controllers/adminController.js';

const router = Router();

// All admin routes require authentication
router.use(adminAuth);

// GET /admin/submissions?limit=N
router.get('/submissions', listSubmissions);

export default router;
