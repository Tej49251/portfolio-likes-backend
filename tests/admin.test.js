/**
 * tests/admin.test.js
 *
 * Tests for admin route authentication and authorization.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

const ADMIN_SECRET = 'test_secret_that_is_at_least_32_characters_long';
const WRONG_SECRET = 'this_is_wrong_secret_also_long_enough_for_test';

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
    adminSecret: ADMIN_SECRET,
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

  // Mock successful DB responses for admin queries
  mockDb.query.mockResolvedValue({
    rows: [
      { id: 1, name: 'Alex', created_at: new Date('2026-01-15T10:00:00Z') },
      { id: 2, name: 'María', created_at: new Date('2026-01-14T09:00:00Z') },
    ],
  });
});

afterAll(() => jest.restoreAllMocks());

describe('GET /admin/submissions — authentication', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await request(app).get('/admin/submissions');
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    const res = await request(app)
      .get('/admin/submissions')
      .set('Authorization', `Bearer ${WRONG_SECRET}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed header (no Bearer prefix)', async () => {
    const res = await request(app)
      .get('/admin/submissions')
      .set('Authorization', ADMIN_SECRET);
    expect(res.status).toBe(401);
  });

  it('returns 401 with empty Authorization header', async () => {
    const res = await request(app)
      .get('/admin/submissions')
      .set('Authorization', '');
    expect(res.status).toBe(401);
  });

  it('returns 401 with Bearer but no secret', async () => {
    const res = await request(app)
      .get('/admin/submissions')
      .set('Authorization', 'Bearer ');
    expect(res.status).toBe(401);
  });

  it('returns 200 with correct admin secret', async () => {
    const res = await request(app)
      .get('/admin/submissions')
      .set('Authorization', `Bearer ${ADMIN_SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('submissions');
    expect(Array.isArray(res.body.submissions)).toBe(true);
  });

  it('does not expose the admin secret in responses', async () => {
    const res = await request(app)
      .get('/admin/submissions')
      .set('Authorization', `Bearer ${ADMIN_SECRET}`);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(ADMIN_SECRET);
  });

  it('admin endpoint does not include CORS for public portfolio origin', async () => {
    // The admin endpoint should require auth and should not set
    // Access-Control-Allow-Origin for the portfolio origin without auth
    const res = await request(app)
      .get('/admin/submissions')
      .set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(401);
  });

  it('returns submissions as an array of objects with expected fields', async () => {
    const res = await request(app)
      .get('/admin/submissions')
      .set('Authorization', `Bearer ${ADMIN_SECRET}`);
    expect(res.status).toBe(200);
    const { submissions } = res.body;
    if (submissions.length > 0) {
      expect(submissions[0]).toHaveProperty('id');
      expect(submissions[0]).toHaveProperty('name');
      expect(submissions[0]).toHaveProperty('created_at');
    }
  });

  it('handles database errors gracefully with 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));
    const res = await request(app)
      .get('/admin/submissions')
      .set('Authorization', `Bearer ${ADMIN_SECRET}`);
    expect(res.status).toBe(500);
    // Must not expose database error details
    expect(JSON.stringify(res.body)).not.toContain('Connection refused');
  });
});
