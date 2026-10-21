/**
 * src/middleware/rateLimiter.js
 *
 * Per-IP rate limiting for the public submission endpoint.
 *
 * IMPORTANT LIMITATIONS (documented per requirements):
 * 1. State is in-process memory. Rate limit counters reset when Render restarts
 *    the service or when it wakes from sleep (cold start). An adversary who knows
 *    this could wait for a cold start to reset their limit. This is an acceptable
 *    trade-off for a personal portfolio — adding Redis for distributed rate limiting
 *    would add cost and operational complexity out of proportion to the risk.
 *
 * 2. IP addresses can be shared (NAT, corporate networks) or spoofed through certain
 *    network arrangements. Rate limiting by IP is a deterrent, not a guarantee.
 *
 * 3. trust proxy is set to 1 (one hop) in app.js, which correctly reads the
 *    X-Forwarded-For header that Render's load balancer adds. Trusting arbitrary
 *    forwarded headers without this configuration would allow IP spoofing.
 *
 * Factory functions are exported so each app instance gets fresh limiters
 * (important for test isolation — shared limiter stores would bleed across tests).
 */

'use strict';

import rateLimit from 'express-rate-limit';

/**
 * Creates a fresh public submission rate limiter.
 * Max 5 submissions per IP per 15-minute window.
 * Returns 429 with a Retry-After header when exceeded.
 */
export function createSubmissionLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      message: 'Too many submissions. Please wait a few minutes before trying again.',
    },
    keyGenerator: (req) => req.ip,
    skip: (req) => req.method === 'OPTIONS',
  });
}

/**
 * Creates a fresh global rate limiter.
 * 200 requests per IP per 10 minutes across all routes.
 */
export function createGlobalLimiter() {
  return rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 200,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Too many requests. Please slow down.' },
    keyGenerator: (req) => req.ip,
    skip: (req) => req.method === 'OPTIONS',
  });
}

// Singleton instances for production use (one per process lifecycle)
export const submissionLimiter = createSubmissionLimiter();
export const globalLimiter = createGlobalLimiter();
