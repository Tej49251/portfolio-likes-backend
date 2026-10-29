/**
 * tests/admin.test.js
 *
 * Tests for admin route authentication and the analytics endpoint.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

const ADMIN_SECRET = 'test_secret_that_is_at_least_32_characters_long';
const WRONG_SECRET = 'this_is_wrong_secret_also_long_enough_for_test';

const mockDb = { query: jest.fn() };

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

let request, app;

beforeAll(async () => {
  const supertest = await import('supertest');
  request = supertest.default;
  const { createApp } = await import('../src/app.js');
  app = createApp();

  // Mock DB: stats query + visits + likes
  mockDb.query.mockImplementation((sql) => {
    if (sql.includes('total_visits')) {
      return Promise.resolve({ rows: [{ total_visits: 50, unique_visitors: 30, total_likes: 5, today_visits: 3, today_likes: 1 }] });
    }
    if (sql.includes('FROM visits')) {
      return Promise.resolve({ rows: [{ id: 1, ip: '1.2.3.4', user_agent: 'Chrome / Windows', visited_at: new Date() }] });
    }
    if (sql.includes('FROM likes_log')) {
      return Promise.resolve({ rows: [{ id: 1, ip: '1.2.3.4', liked_at: new Date() }] });
    }
    return Promise.resolve({ rows: [] });
  });
});

afterAll(() => jest.restoreAllMocks());

describe('GET /admin/analytics — authentication', () => {
  it('returns 401 with no header', async () => {
    const res = await request(app).get('/admin/analytics');
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    const res = await request(app)
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${WRONG_SECRET}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed header', async () => {
    const res = await request(app)
      .get('/admin/analytics')
      .set('Authorization', ADMIN_SECRET);
    expect(res.status).toBe(401);
  });

  it('returns 200 with correct secret', async () => {
    const res = await request(app)
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${ADMIN_SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('stats');
    expect(res.body).toHaveProperty('recentVisits');
    expect(res.body).toHaveProperty('recentLikes');
  });

  it('stats contain expected keys', async () => {
    const res = await request(app)
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${ADMIN_SECRET}`);
    const { stats } = res.body;
    expect(stats).toHaveProperty('totalVisits');
    expect(stats).toHaveProperty('uniqueVisitors');
    expect(stats).toHaveProperty('totalLikes');
    expect(stats).toHaveProperty('todayVisits');
    expect(stats).toHaveProperty('todayLikes');
  });

  it('does not expose admin secret in response', async () => {
    const res = await request(app)
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${ADMIN_SECRET}`);
    expect(JSON.stringify(res.body)).not.toContain(ADMIN_SECRET);
  });

  it('handles DB error gracefully with 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));
    const res = await request(app)
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${ADMIN_SECRET}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('Connection refused');
  });
});
