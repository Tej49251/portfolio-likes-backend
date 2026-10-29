/**
 * src/routes/adminRoutes.js
 *
 * Admin API routes — all protected by adminAuth middleware.
 * Only called from the local admin server at 127.0.0.1.
 */

'use strict';

import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth.js';
import { getAnalytics } from '../controllers/adminController.js';

const router = Router();

router.use(adminAuth);

// GET /admin/analytics?limit=N
router.get('/analytics', getAnalytics);

export default router;
