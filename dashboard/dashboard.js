/**
 * dashboard/dashboard.js
 *
 * Terminal-style analytics log viewer.
 * Fetches from /proxy/analytics (local proxy → Render /admin/analytics).
 * All rendering uses textContent — never innerHTML. XSS-safe.
 */

'use strict';

// ── DOM refs ───────────────────────────────────────────────────────────────
const statusText    = document.getElementById('status-text');
const lastUpdated   = document.getElementById('last-updated');
const refreshBtn    = document.getElementById('refresh-btn');
const limitSelect   = document.getElementById('limit-select');
const autoCb        = document.getElementById('auto-cb');
const statBar       = document.getElementById('stat-bar');
const sectionsBar   = document.getElementById('sections-bar');
const stateLoading  = document.getElementById('state-loading');
const stateError    = document.getElementById('state-error');
const errMsg        = document.getElementById('err-msg');
const logFeed       = document.getElementById('log-feed');

let autoTimer = null;

// ── Load data ──────────────────────────────────────────────────────────────
async function loadData() {
  const limit = limitSelect.value || '200';
  refreshBtn.disabled = true;
  setStatus('loading', 'fetching analytics...');
  stateLoading.style.display = 'flex';
  stateError.style.display   = 'none';
  logFeed.innerHTML           = '';

  try {
    const res = await fetch(`/proxy/analytics?limit=${encodeURIComponent(limit)}`);

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); if (j.message) msg = j.message; } catch {}
      throw new Error(msg);
    }

    const data = await res.json();
    stateLoading.style.display = 'none';

    renderStats(data.stats || {});
    renderTopSections(data.topSections || []);
    renderLogFeed(data.logFeed || []);

    setStatus('ok', `loaded ${(data.logFeed || []).length} events`);
    lastUpdated.textContent = formatTS(new Date().toISOString());
  } catch (err) {
    stateLoading.style.display = 'none';
    stateError.style.display   = 'flex';
    errMsg.textContent          = err.message || 'connection failed';
    setStatus('error', 'error — see above');
  } finally {
    refreshBtn.disabled = false;
  }
}

// ── Stat bar ───────────────────────────────────────────────────────────────
function renderStats(s) {
  setText('s-visits',  fmt(s.totalVisits));
  setText('s-unique',  fmt(s.uniqueVisitors));
  setText('s-likes',   fmt(s.totalLikes));
  setText('s-sections',fmt(s.totalSectionViews));
  setText('s-today',   `${fmt(s.todayVisits)}v / ${fmt(s.todayLikes)}l`);

  const rate = s.totalVisits > 0
    ? ((s.totalLikes / s.totalVisits) * 100).toFixed(1) + '%'
    : '0.0%';
  setText('s-rate', rate);
  statBar.style.display = 'flex';
}

// ── Top sections ───────────────────────────────────────────────────────────
function renderTopSections(sections) {
  const el = document.getElementById('top-sections-list');
  if (!el) return;
  el.textContent = '';

  sections.forEach((s) => {
    const span = document.createElement('span');
    span.className = 'section-tag';
    const name  = document.createTextNode(s.section);
    const count = document.createElement('span');
    count.className = 'section-count';
    count.textContent = `(${s.views})`;
    span.appendChild(name);
    span.appendChild(document.createTextNode(' '));
    span.appendChild(count);
    el.appendChild(span);
  });

  sectionsBar.style.display = sections.length ? 'block' : 'none';
}

// ── Log feed ───────────────────────────────────────────────────────────────
function renderLogFeed(rows) {
  if (rows.length === 0) {
    const p = document.createElement('p');
    p.className = 'log-empty';
    p.textContent = 'no events recorded yet — visit the portfolio to generate data';
    logFeed.appendChild(p);
    return;
  }

  const frag = document.createDocumentFragment();
  rows.forEach(row => frag.appendChild(buildLogLine(row)));
  logFeed.appendChild(frag);
}

function buildLogLine(row) {
  const type = (row.type || '').toUpperCase(); // VISIT | LIKE | SECTION

  const line = document.createElement('div');
  line.className = `log-line type-${type.toLowerCase()}`;

  // Timestamp
  const ts = document.createElement('span');
  ts.className = 'log-ts';
  ts.textContent = formatTS(row.ts);
  line.appendChild(ts);

  // Type badge
  const badge = document.createElement('span');
  badge.className = 'log-type';
  badge.textContent = `[${padR(type, 7)}]`;
  line.appendChild(badge);

  // IP hash
  const hash = document.createElement('span');
  hash.className = 'log-hash';
  hash.textContent = `hash=${row.ip_hash || 'unknown'}`;
  line.appendChild(hash);

  // Data fields
  const data = document.createElement('span');
  data.className = 'log-data';

  if (type === 'VISIT') {
    if (row.browser) data.appendChild(kv('browser', row.browser, true));
    if (row.os)      data.appendChild(kv('os', row.os));
    if (row.screen)  data.appendChild(kv('screen', row.screen));
    if (row.referrer)data.appendChild(kv('ref', row.referrer));
    if (row.timezone)data.appendChild(kv('tz', row.timezone));
  } else if (type === 'SECTION') {
    if (row.section) data.appendChild(kv('section', row.section, true));
  } else if (type === 'LIKE') {
    data.appendChild(kv('event', '❤️ liked'));
  }

  line.appendChild(data);
  return line;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function kv(key, val, highlight = false) {
  const span = document.createElement('span');
  span.className = 'kv';
  const k = document.createElement('span');
  k.className = 'k';
  k.textContent = key + '=';
  const v = document.createElement('span');
  v.className = highlight ? 'v hi' : 'v';
  v.textContent = val;
  span.appendChild(k);
  span.appendChild(v);
  return span;
}

function setStatus(type, msg) {
  statusText.className = `status-${type}`;
  statusText.textContent = msg;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function fmt(n) {
  if (n === undefined || n === null) return '0';
  return Number(n).toLocaleString();
}

function padR(str, len) {
  return str.padEnd(len, ' ');
}

function formatTS(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} `
         + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
  } catch { return iso; }
}

// ── Auto-refresh ───────────────────────────────────────────────────────────
function toggleAuto() {
  clearInterval(autoTimer);
  if (autoCb.checked) autoTimer = setInterval(loadData, 30_000);
}

// ── Boot ───────────────────────────────────────────────────────────────────
loadData();
