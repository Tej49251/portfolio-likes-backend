/**
 * src/app.js
 *
 * Express application factory.
 * Exported as a function so tests can create isolated instances.
 *
 * Security controls:
 * - Helmet security headers
 * - Strict CORS (only the production portfolio origin + localhost in dev)
 * - trust proxy = 1 (one hop — Render's load balancer)
 * - Body size limit (2 KB)
 * - Global rate limiter
 * - Centralized error handler (no internals exposed to clients)
 */

'use strict';

import express from 'express';
import helmet from 'helmet';
import config from './config/env.js';
import logger from './config/logger.js';
import { createGlobalLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createAnalyticsRoutes } from './routes/analyticsRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

export function createApp() {
  const app = express();

  // Fresh rate limiter per app instance (required for test isolation)
  const globalLimiter = createGlobalLimiter();
  const analyticsRouter = createAnalyticsRoutes();

  // ── Trust exactly one proxy hop (Render's load balancer) ─────────────────
  app.set('trust proxy', 1);

  // ── Helmet security headers ───────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameSrc:   ["'none'"],
          objectSrc:  ["'none'"],
        },
      },
    })
  );

  // ── CORS ──────────────────────────────────────────────────────────────────
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
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') {
      return origin && allowedOrigins.has(origin)
        ? res.sendStatus(204)
        : res.sendStatus(403);
    }

    next();
  });

  // ── Body parsing ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '2kb', strict: true }));

  // ── Global rate limiter ───────────────────────────────────────────────────
  app.use(globalLimiter);

  // ── Dev request logging ───────────────────────────────────────────────────
  if (!config.isProduction) {
    app.use((req, _res, next) => {
      logger.debug(`${req.method} ${req.path}`, { ip: req.ip });
      next();
    });
  }

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // ── Analytics routes (public, called by portfolio frontend) ───────────────
  app.use('/api', analyticsRouter);

  // ── Admin routes (auth-gated, local access only) ──────────────────────────
  app.use('/admin', adminRoutes);

  // ── 404 ───────────────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ message: 'Not found.' });
  });

  // ── Centralized error handler ─────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
