/**
 * local-admin-server/server.js
 *
 * Local-only admin proxy server.
 *
 * - Listens ONLY on 127.0.0.1 — never accessible from the network
 * - Reads ADMIN_SECRET from local .env file
 * - Serves the dashboard HTML/CSS/JS
 * - Proxies authenticated requests to the Render API
 */

'use strict';

import { config as dotenvConfig } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenvConfig({ path: join(__dirname, '.env') });

const ADMIN_SECRET  = process.env.ADMIN_SECRET;
const RENDER_API_URL = process.env.RENDER_API_URL;
const PORT          = parseInt(process.env.DASHBOARD_PORT || '3001', 10);
const LOCAL_HOST    = '127.0.0.1';

if (!ADMIN_SECRET || ADMIN_SECRET.length < 32) {
  console.error('ERROR: ADMIN_SECRET missing or too short in local-admin-server/.env');
  process.exit(1);
}
if (!RENDER_API_URL || !/^https:\/\//.test(RENDER_API_URL)) {
  console.error('ERROR: RENDER_API_URL must be set (e.g., https://your-app.onrender.com)');
  process.exit(1);
}

const dashboardHtml = readFileSync(join(__dirname, '..', 'dashboard', 'index.html'), 'utf8');
const dashboardCss  = readFileSync(join(__dirname, '..', 'dashboard', 'dashboard.css'), 'utf8');
const dashboardJs   = readFileSync(join(__dirname, '..', 'dashboard', 'dashboard.js'), 'utf8');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${LOCAL_HOST}:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(dashboardHtml);
  }
  if (req.method === 'GET' && url.pathname === '/dashboard.css') {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    return res.end(dashboardCss);
  }
  if (req.method === 'GET' && url.pathname === '/dashboard.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    return res.end(dashboardJs);
  }

  // ── Proxy: GET /proxy/analytics → Render /admin/analytics ─────────────────
  if (req.method === 'GET' && url.pathname === '/proxy/analytics') {
    const limit = url.searchParams.get('limit') || '100';
    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);

    try {
      const apiRes = await fetch(
        `${RENDER_API_URL}/admin/analytics?limit=${safeLimit}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${ADMIN_SECRET}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(30_000),
        }
      );
      const body = await apiRes.text();
      res.writeHead(apiRes.status, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(body);
    } catch (err) {
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      console.error('Proxy error:', err.message);
      res.writeHead(isTimeout ? 504 : 502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        message: isTimeout
          ? 'Render is waking up (cold start). Please wait 30–60 seconds and refresh.'
          : `Could not connect to Render API: ${err.message}`,
      }));
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, LOCAL_HOST, () => {
  console.log(`\n✅ Admin dashboard → http://${LOCAL_HOST}:${PORT}/`);
  console.log(`   Render API: ${RENDER_API_URL}`);
  console.log(`   Press Ctrl+C to stop.\n`);
});
