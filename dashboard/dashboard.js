/**
 * dashboard/dashboard.js
 *
 * Analytics dashboard — fetches data through the local proxy (/proxy/analytics).
 * The ADMIN_SECRET is held server-side by local-admin-server/server.js.
 * This script never handles or stores the secret.
 *
 * Security: all data is rendered with textContent — never innerHTML.
 */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let cachedData     = null;
let currentTab     = 'overview';
let autoTimer      = null;

// ── DOM refs ───────────────────────────────────────────────────────────────
const statusBadge   = document.getElementById('status-badge');
const refreshBtn    = document.getElementById('refresh-btn');
const lastUpdatedEl = document.getElementById('last-updated');
const limitSelect   = document.getElementById('limit-select');
const autoCb        = document.getElementById('auto-cb');
const stateLoading  = document.getElementById('state-loading');
const stateError    = document.getElementById('state-error');
const errorMsg      = document.getElementById('error-msg');
const pageTitleEl   = document.getElementById('page-title');

// ── Tab switching ──────────────────────────────────────────────────────────
function switchTab(tab, el) {
  if (el) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
  }
  document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
  const el2 = document.getElementById(`tab-${tab}`);
  if (el2) el2.style.display = 'flex';
  currentTab = tab;

  const titles = { overview: 'Overview', visitors: 'Visitors', likes: 'Likes' };
  pageTitleEl.textContent = titles[tab] || 'Analytics';

  if (cachedData) renderTab(tab, cachedData);
}

// ── Load data ──────────────────────────────────────────────────────────────
async function loadData() {
  const limit = limitSelect.value || '100';
  refreshBtn.disabled = true;
  setStatus('loading', 'Loading…');
  stateLoading.style.display = 'flex';
  stateError.style.display   = 'none';
  document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');

  try {
    const res = await fetch(`/proxy/analytics?limit=${encodeURIComponent(limit)}`);

    if (!res.ok) {
      let msg = `Error ${res.status}`;
      try { const j = await res.json(); if (typeof j.message === 'string') msg = j.message; } catch {}
      throw new Error(msg);
    }

    cachedData = await res.json();
    stateLoading.style.display = 'none';
    renderTab(currentTab, cachedData);
    setStatus('ok', 'Live');
    lastUpdatedEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (err) {
    stateLoading.style.display = 'none';
    stateError.style.display   = 'flex';
    errorMsg.textContent = err.message || 'Failed to load analytics.';
    setStatus('error', 'Error');
  } finally {
    refreshBtn.disabled = false;
  }
}

// ── Render tab ─────────────────────────────────────────────────────────────
function renderTab(tab, data) {
  const el = document.getElementById(`tab-${tab}`);
  if (!el) return;
  el.style.display = 'flex';

  if (tab === 'overview')  renderOverview(data);
  if (tab === 'visitors')  renderVisitors(data.recentVisits || []);
  if (tab === 'likes')     renderLikes(data.recentLikes || []);
}

// ── Overview ───────────────────────────────────────────────────────────────
function renderOverview(data) {
  const s = data.stats || {};
  setText('s-total-visits', fmt(s.totalVisits));
  setText('s-today-visits', `${fmt(s.todayVisits)} today`);
  setText('s-unique',       fmt(s.uniqueVisitors));
  setText('s-total-likes',  fmt(s.totalLikes));
  setText('s-today-likes',  `${fmt(s.todayLikes)} today`);

  const rate = s.totalVisits > 0
    ? ((s.totalLikes / s.totalVisits) * 100).toFixed(1)
    : '0.0';
  setText('s-like-rate', rate);

  const visits = (data.recentVisits || []).slice(0, 10);
  const likes  = (data.recentLikes  || []).slice(0, 10);

  setText('ov-visit-count', visits.length + ' shown');
  setText('ov-like-count',  likes.length  + ' shown');

  renderVisitRows('ov-visits-body', visits, true);
  renderLikeRows('ov-likes-body', likes, true);
}

// ── Visitors tab ────────────────────────────────────────────────────────────
function renderVisitors(visits) {
  setText('vis-count', visits.length + ' records');
  renderVisitRows('vis-body', visits, false);
}

// ── Likes tab ──────────────────────────────────────────────────────────────
function renderLikes(likes) {
  setText('like-count', likes.length + ' records');
  renderLikeRows('like-body', likes, false);
}

// ── Row renderers ──────────────────────────────────────────────────────────
function renderVisitRows(tbodyId, rows, compact) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';

  if (rows.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    const td = document.createElement('td');
    td.setAttribute('colspan', compact ? '3' : '4');
    td.textContent = 'No visits yet';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((row, i) => {
    const tr = document.createElement('tr');

    if (!compact) {
      const tdId = document.createElement('td');
      tdId.className = 'cell-id';
      tdId.textContent = String(row.id);
      tr.appendChild(tdId);
    }

    const tdIp = document.createElement('td');
    tdIp.className = 'cell-ip';
    tdIp.textContent = row.ip || '—';
    tr.appendChild(tdIp);

    const tdUa = document.createElement('td');
    tdUa.className = 'cell-ua';
    tdUa.textContent = row.user_agent || '—';
    tr.appendChild(tdUa);

    const tdTime = document.createElement('td');
    tdTime.className = 'cell-time';
    tdTime.textContent = formatUTC(row.visited_at);
    tr.appendChild(tdTime);

    tbody.appendChild(tr);
  });
}

function renderLikeRows(tbodyId, rows, compact) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';

  if (rows.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    const td = document.createElement('td');
    td.setAttribute('colspan', compact ? '2' : '3');
    td.textContent = 'No likes recorded yet';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');

    if (!compact) {
      const tdId = document.createElement('td');
      tdId.className = 'cell-id';
      tdId.textContent = String(row.id);
      tr.appendChild(tdId);
    }

    const tdIp = document.createElement('td');
    tdIp.className = 'cell-ip';
    tdIp.textContent = row.ip || '—';
    tr.appendChild(tdIp);

    const tdTime = document.createElement('td');
    tdTime.className = 'cell-time';
    tdTime.textContent = formatUTC(row.liked_at);
    tr.appendChild(tdTime);

    tbody.appendChild(tr);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function setStatus(type, label) {
  statusBadge.textContent = label;
  statusBadge.className = `status-badge status-${type}`;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function fmt(n) {
  if (n === undefined || n === null) return '—';
  return Number(n).toLocaleString();
}

function formatUTC(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} `
         + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  } catch { return isoStr; }
}

// ── Auto-refresh ───────────────────────────────────────────────────────────
function toggleAuto() {
  clearInterval(autoTimer);
  if (autoCb.checked) {
    autoTimer = setInterval(loadData, 30_000);
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
switchTab('overview', null);
loadData();
