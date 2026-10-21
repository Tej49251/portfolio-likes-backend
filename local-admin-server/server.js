/**
 * local-admin-server/server.js
 *
 * Local-only admin proxy server.
 *
 * This server:
 * - Listens ONLY on 127.0.0.1 (not 0.0.0.0), so it is never accessible
 *   from the network — only from your laptop.
 * - Reads ADMIN_SECRET from the local .env file
 * - Serves the dashboard HTML at http://127.0.0.1:3001/
 * - Proxies authenticated GET requests to the Render API for submission data
 *
 * Security model:
 * - The ADMIN_SECRET never leaves your laptop in plaintext over the network
 *   EXCEPT in the Authorization header of HTTPS requests to the Render API.
 *   TLS ensures these are encrypted in transit.
 * - The dashboard JavaScript never receives or stores the secret — the secret
 *   is only held by this Node.js process on your laptop.
 * - Running `node local-admin-server/server.js` is the only way to start the dashboard.
 */

'use strict';

import { config as dotenvConfig } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load local .env — must contain ADMIN_SECRET and RENDER_API_URL
dotenvConfig({ path: join(__dirname, '.env') });

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const RENDER_API_URL = process.env.RENDER_API_URL;
const PORT = parseInt(process.env.DASHBOARD_PORT || '3001', 10);
const LOCAL_HOST = '127.0.0.1'; // Never bind to 0.0.0.0

// ── Startup validation ───────────────────────────────────────────────────────
if (!ADMIN_SECRET || ADMIN_SECRET.length < 32) {
  console.error(
    'ERROR: ADMIN_SECRET is missing or too short in local-admin-server/.env\n' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
  process.exit(1);
}

if (!RENDER_API_URL || !/^https:\/\//.test(RENDER_API_URL)) {
  console.error(
    'ERROR: RENDER_API_URL must be set to your Render service URL (e.g., https://my-app.onrender.com)\n' +
    'Set it in local-admin-server/.env'
  );
  process.exit(1);
}

// ── Dashboard HTML ───────────────────────────────────────────────────────────
const dashboardHtml = readFileSync(join(__dirname, '..', 'dashboard', 'index.html'), 'utf8');
const dashboardCss = readFileSync(join(__dirname, '..', 'dashboard', 'dashboard.css'), 'utf8');
const dashboardJs = readFileSync(join(__dirname, '..', 'dashboard', 'dashboard.js'), 'utf8');

// ── HTTP Server ──────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${LOCAL_HOST}:${PORT}`);

  // Serve dashboard assets
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

  // ── Proxy: GET /proxy/submissions → Render API admin endpoint ──────────────
  if (req.method === 'GET' && url.pathname === '/proxy/submissions') {
    const limit = url.searchParams.get('limit') || '100';
    // Validate limit is a reasonable integer before forwarding
    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);

    try {
      const apiResponse = await fetch(
        `${RENDER_API_URL}/admin/submissions?limit=${safeLimit}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${ADMIN_SECRET}`,
            Accept: 'application/json',
          },
          // 30-second timeout to handle Render cold starts gracefully
          signal: AbortSignal.timeout(30_000),
        }
      );

      const body = await apiResponse.text();
      res.writeHead(apiResponse.status, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(body);
    } catch (err) {
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      console.error('Proxy error:', err.message);
      res.writeHead(isTimeout ? 504 : 502, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          message: isTimeout
            ? 'Render is waking up (cold start). Please wait 30–60 seconds and refresh.'
            : `Could not connect to Render API: ${err.message}`,
        })
      );
    }
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// ── Bind ONLY to 127.0.0.1 ────────────────────────────────────────────────────
server.listen(PORT, LOCAL_HOST, () => {
  console.log(`\n✅ Admin dashboard running at: http://${LOCAL_HOST}:${PORT}/`);
  console.log(`   Render API: ${RENDER_API_URL}`);
  console.log(`   Press Ctrl+C to stop.\n`);
});
