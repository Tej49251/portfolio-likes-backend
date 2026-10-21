/**
 * src/app.js
 *
 * Express application factory.
 * Exported as a function so tests can create isolated instances.
 *
 * Security controls applied here:
 * - Helmet security headers
 * - Strict CORS (only the production portfolio origin)
 * - trust proxy = 1 (one hop — Render's load balancer)
 * - Body size limit (2 KB)
 * - JSON-only request body
 * - Global rate limiter
 * - No default Express headers exposing version info (helmet handles this)
 * - Health check endpoint with no sensitive data
 */

'use strict';

import express from 'express';
import helmet from 'helmet';
import config from './config/env.js';
import logger from './config/logger.js';
import { createGlobalLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createSubmissionRoutes } from './routes/submissionRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

export function createApp() {
  const app = express();

  // Fresh rate limiter instances per app (critical for test isolation)
  const globalLimiter = createGlobalLimiter();
  const submissionLimiterInstance = createSubmissionRoutes();

  // ── Trust exactly one proxy hop (Render's load balancer) ─────────────────
  // This allows req.ip to correctly reflect the real visitor IP from
  // X-Forwarded-For rather than Render's internal IP.
  // IMPORTANT: If set too high, malicious clients can spoof X-Forwarded-For.
  app.set('trust proxy', 1);

  // ── Helmet security headers ───────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
    })
  );

  // ── CORS ──────────────────────────────────────────────────────────────────
  // Allow only the exact production Firebase Hosting origin.
  // In development (NODE_ENV !== 'production'), also allow localhost for testing.
  const allowedOrigins = new Set([config.allowedOrigin]);
  if (!config.isProduction) {
    allowedOrigins.add('http://localhost:5173');
    allowedOrigins.add('http://127.0.0.1:5173');
    allowedOrigins.add('http://localhost:3001');
    allowedOrigins.add('http://127.0.0.1:3001');
  }

  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      if (origin && allowedOrigins.has(origin)) {
        return res.sendStatus(204);
      }
      return res.sendStatus(403);
    }

    next();
  });

  // ── Body parsing ──────────────────────────────────────────────────────────
  // Strict size limit prevents large-body attacks
  app.use(express.json({ limit: '2kb', strict: true }));

  // ── Global rate limiter ────────────────────────────────────────────────────
  app.use(globalLimiter);

  // ── Request logging (development) ─────────────────────────────────────────
  if (!config.isProduction) {
    app.use((req, _res, next) => {
      logger.debug(`${req.method} ${req.path}`, { ip: req.ip });
      next();
    });
  }

  // ── Health check ──────────────────────────────────────────────────────────
  // Returns only status information — no secrets, no config, no sensitive data.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // ── API routes ────────────────────────────────────────────────────────────
  app.use('/api/submissions', submissionLimiterInstance);

  // Admin routes — protected by adminAuth middleware inside adminRoutes
  app.use('/admin', adminRoutes);

  // ── 404 handler ────────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ message: 'Not found.' });
  });

  // ── Centralized error handler ─────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
