/**
 * tests/analytics.test.js
 *
 * Integration tests for the analytics endpoints.
 * POST /api/visit and POST /api/like
 */

import { describe, it, expect, beforeAll, afterAll, jest, beforeEach } from '@jest/globals';

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
    adminSecret: 'test_secret_that_is_at_least_32_characters_long',
    isProduction: false,
  },
}));

let request, createApp;

beforeAll(async () => {
  const supertest = await import('supertest');
  request = supertest.default;
  const m = await import('../src/app.js');
  createApp = m.createApp;

  // Default: successful INSERT
  mockDb.query.mockResolvedValue({ rows: [] });
});

afterAll(() => jest.restoreAllMocks());

// ── Health check ───────────────────────────────────────────────────────────
describe('GET /health', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  it('returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('exposes no secrets', async () => {
    const res = await request(app).get('/health');
    expect(JSON.stringify(res.body)).not.toMatch(/secret|password|postgres/i);
  });
});

// ── POST /api/visit ─────────────────────────────────────────────────────────
describe('POST /api/visit', () => {
  let app;
  beforeEach(() => { app = createApp(); });

  it('returns 200 ok', async () => {
    const res = await request(app)
      .post('/api/visit')
      .set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 200 even if DB insert fails (fire-and-forget)', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .post('/api/visit')
      .set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(200); // analytics must never fail the UI
    expect(res.body).toEqual({ ok: true });
    // Restore
    mockDb.query.mockResolvedValue({ rows: [] });
  });

  it('allows preflight from portfolio origin', async () => {
    const res = await request(app)
      .options('/api/visit')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
  });

  it('does not set ACAO header for disallowed origins', async () => {
    const res = await request(app)
      .post('/api/visit')
      .set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

// ── POST /api/like ──────────────────────────────────────────────────────────
describe('POST /api/like', () => {
  let app;
  beforeEach(() => { app = createApp(); });

  it('returns 200 ok', async () => {
    const res = await request(app)
      .post('/api/like')
      .set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 200 even when DB fails', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('timeout'));
    const res = await request(app)
      .post('/api/like')
      .set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(200);
    mockDb.query.mockResolvedValue({ rows: [] });
  });
});

// ── 404 ────────────────────────────────────────────────────────────────────
describe('Unknown routes', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  it('returns 404', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
  });
});
