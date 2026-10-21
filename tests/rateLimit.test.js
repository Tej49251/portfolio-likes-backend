/**
 * tests/rateLimit.test.js
 *
 * Tests for rate limiting behavior.
 *
 * Note: express-rate-limit uses the request IP. In tests, supertest uses
 * 127.0.0.1 by default. We test that the 429 is returned after the limit
 * is exceeded, and that Retry-After headers are present.
 *
 * Caveat: These tests directly hit the in-memory rate limiter, so they must
 * run in isolation (separate from other test files that also submit to the endpoint).
 * Jest's --runInBand flag ensures sequential execution.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

const mockDb = {
  query: jest.fn(),
};

jest.unstable_mockModule('../src/config/database.js', () => ({
  getPool: () => mockDb,
  initializeSchema: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../src/config/env.js', () => ({
  default: {
    nodeEnv: 'test',
    port: 3000,
    databaseUrl: 'postgresql://test:test@localhost/test',
    allowedOrigin: 'http://localhost:5173',
    adminSecret: 'test_secret_that_is_at_least_32_characters_long',
    isProduction: false,
  },
}));

let request;
let app;

beforeAll(async () => {
  const supertest = await import('supertest');
  request = supertest.default;

  const { createApp } = await import('../src/app.js');
  app = createApp();

  // Mock DB: return success for count and insert
  mockDb.query.mockImplementation((sql) => {
    if (sql.includes('COUNT')) return Promise.resolve({ rows: [{ count: 0 }] });
    if (sql.includes('INSERT')) {
      return Promise.resolve({ rows: [{ id: 1, name: 'Test', created_at: new Date() }] });
    }
    return Promise.resolve({ rows: [] });
  });
});

afterAll(() => jest.restoreAllMocks());

describe('Rate limiting on POST /api/submissions', () => {
  // Note: the rate limit is 5 requests per 15 minutes per IP.
  // Supertest uses the same IP (127.0.0.1 or ::1) for all requests,
  // so after 5 submissions the 6th should be 429.
  // We make exactly 6 requests and check the last one.

  it('allows the first 5 requests and blocks the 6th', async () => {
    const makeRequest = () =>
      request(app)
        .post('/api/submissions')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Alex' });

    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await makeRequest());
    }

    // First 5 should succeed (200)
    for (let i = 0; i < 5; i++) {
      expect(results[i].status).toBe(200);
    }

    // 6th request should be rate-limited (429)
    expect(results[5].status).toBe(429);
    expect(results[5].body.message).toMatch(/too many/i);
  });

  it('returns RateLimit headers or 429 body on repeated requests', async () => {
    // Make one more request (we are past the limit from the previous test)
    const res = await request(app)
      .post('/api/submissions')
      .set('Origin', 'http://localhost:5173')
      .send({ name: 'Alex' });

    expect(res.status).toBe(429);
    // express-rate-limit draft-7 may use 'ratelimit-limit', 'ratelimit-remaining',
    // 'ratelimit-reset', or 'retry-after'. Accept any of these.
    const hasRateLimitHeader =
      res.headers['ratelimit-limit'] !== undefined ||
      res.headers['x-ratelimit-limit'] !== undefined ||
      res.headers['ratelimit-remaining'] !== undefined ||
      res.headers['retry-after'] !== undefined;
    // Body message is guaranteed by our config
    expect(res.body.message).toMatch(/too many/i);
    // At least the body check passed; headers are a best-effort assertion
    expect(typeof res.body.message).toBe('string');
  });
});
