/**
 * tests/routes.test.js
 *
 * Integration tests for the Express API routes.
 * Uses supertest with a mocked database pool — no live DB required.
 *
 * Each test suite creates its own app instance to avoid shared rate-limit state.
 */

import { describe, it, expect, beforeAll, afterAll, jest, beforeEach } from '@jest/globals';

// ── Mock the database module BEFORE importing app ──────────────────────────
const mockDb = {
  query: jest.fn(),
};

jest.unstable_mockModule('../src/config/database.js', () => ({
  getPool: () => mockDb,
  initializeSchema: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn().mockResolvedValue(undefined),
}));

// ── Mock env config for tests ──────────────────────────────────────────────
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
let createApp;

beforeAll(async () => {
  const supertest = await import('supertest');
  request = supertest.default;
  const appModule = await import('../src/app.js');
  createApp = appModule.createApp;
});

afterAll(() => {
  jest.restoreAllMocks();
});

// Helper: create a fresh app for each describe block to avoid shared limiter state
function freshApp() {
  return createApp();
}

// ── Health check ──────────────────────────────────────────────────────────
describe('GET /health', () => {
  let app;
  beforeAll(() => { app = freshApp(); });

  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('does not expose sensitive config', async () => {
    const res = await request(app).get('/health');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('secret');
    expect(body).not.toContain('password');
    expect(body).not.toContain('database');
    expect(body).not.toContain('postgresql');
  });
});

// ── POST /api/submissions — valid inputs ──────────────────────────────────
describe('POST /api/submissions — valid inputs', () => {
  let app;

  beforeAll(() => {
    // Default mock: successful insert + zero duplicate count
    mockDb.query.mockImplementation((sql, params) => {
      if (sql.includes('INSERT')) {
        return Promise.resolve({
          rows: [{ id: 1, name: params[0], created_at: new Date() }],
        });
      }
      if (sql.includes('COUNT')) {
        return Promise.resolve({ rows: [{ count: 0 }] });
      }
      return Promise.resolve({ rows: [] });
    });
    app = freshApp();
  });

  it('accepts a valid name', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Origin', 'http://localhost:5173')
      .send({ name: 'Alex' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Thank you!');
  });

  it('accepts a Unicode name', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Origin', 'http://localhost:5173')
      .send({ name: '李伟' });
    expect(res.status).toBe(200);
  });

  it('accepts an empty name (optional field)', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Origin', 'http://localhost:5173')
      .send({ name: '' });
    expect(res.status).toBe(200);
  });

  it('accepts missing name field (optional)', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Origin', 'http://localhost:5173')
      .send({});
    expect(res.status).toBe(200);
  });
});

// ── POST /api/submissions — invalid inputs (fresh app each time) ──────────
describe('POST /api/submissions — invalid inputs', () => {
  // Each invalid-input test gets its own fresh app to avoid hitting
  // the rate limiter from previous test runs in the same process.
  let app;
  beforeEach(() => { app = freshApp(); });

  it('rejects a name with digits', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Origin', 'http://localhost:5173')
      .send({ name: 'Alex1' });
    expect(res.status).toBe(400);
  });

  it('rejects a name with HTML', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Origin', 'http://localhost:5173')
      .send({ name: '<script>alert(1)</script>' });
    expect(res.status).toBe(400);
  });

  it('rejects a name exceeding 40 chars', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Origin', 'http://localhost:5173')
      .send({ name: 'A'.repeat(41) });
    expect(res.status).toBe(400);
  });

  it('rejects a SQL injection payload', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Origin', 'http://localhost:5173')
      .send({ name: "'; DROP TABLE submissions; --" });
    expect(res.status).toBe(400);
  });

  it('rejects an emoji name', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Origin', 'http://localhost:5173')
      .send({ name: '🎉' });
    expect(res.status).toBe(400);
  });

  it('rejects a request body over 2 KB', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Origin', 'http://localhost:5173')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'A'.repeat(3000) }));
    // Express rejects oversized bodies with 413; validation rejects at 400
    expect([400, 413]).toContain(res.status);
  });

  it('does not expose stack traces in error responses', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Origin', 'http://localhost:5173')
      .send({ name: 'Alex1!' });
    expect(res.body).not.toHaveProperty('stack');
    expect(JSON.stringify(res.body)).not.toContain('at ');
  });
});

// ── CORS ──────────────────────────────────────────────────────────────────
describe('CORS behaviour', () => {
  let app;
  beforeAll(() => { app = freshApp(); });

  it('rejects requests from a disallowed origin (no ACAO header set)', async () => {
    const res = await request(app)
      .post('/api/submissions')
      .set('Origin', 'https://evil.example.com')
      .send({ name: 'Alex' });
    // The CORS middleware should NOT set Access-Control-Allow-Origin for bad origins
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows preflight from the correct origin', async () => {
    const res = await request(app)
      .options('/api/submissions')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('rejects preflight from a disallowed origin', async () => {
    const res = await request(app)
      .options('/api/submissions')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(403);
  });
});

// ── Database error handling ───────────────────────────────────────────────
describe('Database error handling', () => {
  let app;
  beforeAll(() => { app = freshApp(); });

  it('handles a database error gracefully with 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB connection lost'));
    const res = await request(app)
      .post('/api/submissions')
      .set('Origin', 'http://localhost:5173')
      .send({ name: 'Alex' });
    expect(res.status).toBe(500);
    // Must not expose internal details
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('DB connection lost');
    expect(body).not.toContain('stack');
  });
});

// ── 404 handler ────────────────────────────────────────────────────────────
describe('Unknown routes', () => {
  let app;
  beforeAll(() => { app = freshApp(); });

  it('returns 404 for unknown paths', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
  });

  it('does not expose internal details on 404', async () => {
    const res = await request(app).get('/nonexistent');
    expect(JSON.stringify(res.body)).not.toContain('stack');
  });
});
