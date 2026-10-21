/**
 * dashboard/dashboard.js
 *
 * Admin dashboard frontend logic.
 *
 * Security notes:
 * - This script NEVER handles or stores the ADMIN_SECRET.
 * - All authenticated requests go through the local proxy at /proxy/submissions.
 *   The proxy (local-admin-server/server.js) attaches the Authorization header.
 * - All submitted names are rendered as text nodes, NEVER as innerHTML,
 *   preventing any XSS even if a malicious string were somehow stored.
 * - This file is served only from 127.0.0.1 and is never shipped to the public portfolio.
 */

'use strict';

let autoRefreshTimer = null;

// ── DOM references ─────────────────────────────────────────────────────────
const statusEl = document.getElementById('status-indicator');
const refreshBtn = document.getElementById('refresh-btn');
const totalCountEl = document.getElementById('total-count');
const lastUpdatedEl = document.getElementById('last-updated');
const limitSelect = document.getElementById('limit-select');
const autoRefreshCb = document.getElementById('auto-refresh-cb');

const loadingState = document.getElementById('state-loading');
const errorState = document.getElementById('state-error');
const emptyState = document.getElementById('state-empty');
const tableState = document.getElementById('state-table');
const errorMessage = document.getElementById('error-message');
const submissionsBody = document.getElementById('submissions-body');

// ── State helpers ──────────────────────────────────────────────────────────
function showState(which) {
  [loadingState, errorState, emptyState, tableState].forEach((el) => {
    el.style.display = el === which ? (which === tableState ? 'block' : 'flex') : 'none';
  });
}

function setStatus(type, label) {
  statusEl.textContent = label;
  statusEl.className = `status-chip status-${type}`;
}

// ── Load submissions ───────────────────────────────────────────────────────
async function loadSubmissions() {
  const limit = limitSelect.value || '100';

  refreshBtn.disabled = true;
  setStatus('loading', 'Loading…');
  showState(loadingState);

  try {
    const response = await fetch(`/proxy/submissions?limit=${encodeURIComponent(limit)}`);

    if (!response.ok) {
      let msg = `Error ${response.status}`;
      try {
        const json = await response.json();
        if (typeof json.message === 'string') msg = json.message;
      } catch { /* ignore */ }
      throw new Error(msg);
    }

    const data = await response.json();
    const submissions = data.submissions || [];

    if (submissions.length === 0) {
      showState(emptyState);
      setStatus('ok', 'OK');
      totalCountEl.textContent = '0';
    } else {
      renderTable(submissions);
      showState(tableState);
      setStatus('ok', 'OK');
      totalCountEl.textContent = submissions.length.toString();
    }

    lastUpdatedEl.textContent = new Date().toLocaleTimeString();
  } catch (err) {
    errorMessage.textContent = err.message || 'Failed to load submissions.';
    showState(errorState);
    setStatus('error', 'Error');
    totalCountEl.textContent = '—';
  } finally {
    refreshBtn.disabled = false;
  }
}

// ── Render table ──────────────────────────────────────────────────────────
function renderTable(submissions) {
  // Clear existing rows
  submissionsBody.innerHTML = '';

  submissions.forEach((row, index) => {
    const tr = document.createElement('tr');

    // ID cell
    const tdId = document.createElement('td');
    tdId.className = 'cell-id';
    // Use textContent — never innerHTML — to prevent XSS
    tdId.textContent = String(row.id);
    tr.appendChild(tdId);

    // Name cell — ALWAYS text node, never innerHTML
    const tdName = document.createElement('td');
    tdName.className = 'cell-name';
    tdName.textContent = row.name; // Safe — no HTML parsing
    tr.appendChild(tdName);

    // Date cell — format UTC timestamp
    const tdDate = document.createElement('td');
    tdDate.className = 'cell-date';
    try {
      const date = new Date(row.created_at);
      // ISO-ish format in UTC for clarity
      tdDate.textContent =
        date.getUTCFullYear() + '-' +
        String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(date.getUTCDate()).padStart(2, '0') + ' ' +
        String(date.getUTCHours()).padStart(2, '0') + ':' +
        String(date.getUTCMinutes()).padStart(2, '0') + ':' +
        String(date.getUTCSeconds()).padStart(2, '0') + ' UTC';
    } catch {
      tdDate.textContent = row.created_at || 'Unknown';
    }
    tr.appendChild(tdDate);

    // Alternate row shading via JS (no class needed, CSS handles :nth-child)
    submissionsBody.appendChild(tr);
  });
}

// ── Auto-refresh ──────────────────────────────────────────────────────────
function toggleAutoRefresh() {
  if (autoRefreshCb.checked) {
    autoRefreshTimer = setInterval(loadSubmissions, 30_000);
    console.log('Auto-refresh enabled (every 30 s)');
  } else {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
    console.log('Auto-refresh disabled');
  }
}

// ── Initial load ──────────────────────────────────────────────────────────
loadSubmissions();
