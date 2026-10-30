/**
 * FiscalBridge – Renderer Process (UI v2)
 * All core API/parse logic preserved; full UI layer rewritten.
 */

const isElectron = !!(typeof window !== 'undefined' && window.fiscalBridgeAPI);

// ─── State ───────────────────────────────────────────────────────────────────
let config = {};
let isMonitoring = false;
let wizardStep = 1;
let currentPage = 'dashboard';
let documents = [];
let sortCol = 'processedAt';
let sortDir = -1;
let docPage = 1;
const PAGE_SIZE = 15;
let docFilter = { search: '', status: '', currency: '', date: '' };
let fiscalDayOpenTime = null;
let fiscalDayTimerInterval = null;
let watcherLastFile = null;
let watcherPillInterval = null;
const inFlightFiles = new Set();
let reconcilingDocs = false;
let parserProfiles = [];
let activeProfileIdx = 0;
let parserLines = [];
let lineRoles = {};
let parserCurrentFile = null;
let dashTab = 'all';
let pdfPreviewDoc = null;
let pdfPreviewBlobUrl = null;
let pdfPreviewMode = null;
// Normalise fiscal day status from server (FiscalDayOpened/Open) or (FiscalDayClosed/Closed)
function _fiscalDayOpen(s) { return s === 'FiscalDayOpen' || s === 'FiscalDayOpened'; }


// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!isElectron) { document.body.innerHTML = '<div style="padding:2rem;font-family:sans-serif"><h2>Requires Electron</h2></div>'; return; }
  await loadConfig();
  // Each setup is isolated so a single missing element can't abort boot
  // (previously one bad lookup left stats and fiscal status blank until refresh)
  const safeInit = (label, fn) => { try { fn(); } catch (e) { console.error(`[Init] ${label} failed:`, e); } };
  safeInit('navigation', setupNavigation);
  safeInit('watcher', setupWatcher);
  safeInit('dashboard', setupDashboard);
  safeInit('documents', setupDocumentsPage);
  safeInit('parser', setupParserLab);
  safeInit('fiscalDevice', setupFiscalDevice);
  safeInit('dayClose', setupDayClose);
  safeInit('settings', setupSettings);
  safeInit('detailDrawer', setupDetailDrawer);
  safeInit('pdfModal', setupPdfModal);
  safeInit('confirmDialog', setupConfirmDialog);
  safeInit('statusIndicator', setupStatusIndicator);
  window.fiscalBridgeAPI.onReceiptFileAdded(handleReceiptFile);
  safeInit('folderWatchError', () => {
    window.fiscalBridgeAPI.onFolderWatchError((e) => showToast('Folder watcher error: ' + e.error, 'error'));
  });
  safeInit('trayWatchToggle', () => {
    window.fiscalBridgeAPI.onTrayToggleWatch(() => {
      if (isMonitoring) stopMonitoring(); else startMonitoring();
    });
  });
  
  // Load initial (local) data first so stats show immediately on startup
  try {
    documents = await window.fiscalBridgeAPI.getDocuments() || [];
  } catch (e) {
    console.error('Failed to load documents on startup:', e);
    documents = [];
  }
  updateBadges();
  refreshDashboard();
  renderFiscalDayCard();
  renderDocumentsTable();
  // Start refresh loop after config is loaded
  if (config.apiEndpoint && config.apiKey) {
    startRefreshLoop();
  }
  // Recover documents left queued/retrying by a crash or transient API failure,
  // then keep retrying on a slow cadence while the app is open.
  if (config.setupComplete) {
    reconcileDocuments();
    setInterval(reconcileDocuments, 2 * 60 * 1000);
  }
});

// ─── Config ───────────────────────────────────────────────────────────────────
function migrateConfigV2(c) {
  c = c || {};
  if (!c.configVersion || c.configVersion < 2) {
    c.configVersion = 2;
    c.sourceFolder = c.sourceFolder || (c.folders && c.folders.source) || '';
    c.targetFolder = c.targetFolder || (c.folders && c.folders.target) || '';
    c.errorFolder  = c.errorFolder  || (c.folders && c.folders.error)  || '';
    c.printFormat  = c.printFormat  || 'thermal';
    c.preferredPrinter = c.preferredPrinter || c.printerName || null;
    c.parserProfiles = c.parserProfiles || [{
      name: 'Default',
      productStartLine: c.productStartLine || '',
      productEndLine:   c.productEndLine   || '',
      itemDotCounter:   c.itemDotCounter   || 2,
      multiLineProduct: c.multiLineProduct || 0,
      vatA: c.vatA || '15.5',
      vatE: c.vatE || '0',
    }];
    c.notifyOnFail  = c.notifyOnFail  !== false;
    c.notifyOnClose = c.notifyOnClose !== false;
  }
  return c;
}

async function loadConfig() {
  try {
    const raw = await window.fiscalBridgeAPI.getConfig();
    config = migrateConfigV2(raw);
    parserProfiles = config.parserProfiles || [{ name: 'Default' }];
    if (config.setupComplete) {
      document.getElementById('wizard-overlay').classList.remove('open');
      showPage('dashboard');
      // Auto-start monitoring if folders are configured
      if (config.sourceFolder && config.targetFolder && !isMonitoring) {
        setTimeout(() => startMonitoring(), 1000);
      }
    } else {
      openWizard();
    }
  } catch {
    openWizard();
  }
}

async function saveConfig() {
  config.parserProfiles = parserProfiles;
  await window.fiscalBridgeAPI.saveConfig(config);
}

// ─── Toast ────────────────────────────────────────────────────────────────────
const TOAST_ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
function showToast(message, type = 'info', duration = 4000) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type] || 'ℹ'}</span><div class="toast-body">${message}</div><button class="toast-close" aria-label="Close">✕</button>`;
  t.querySelector('.toast-close').onclick = () => dismissToast(t);
  c.appendChild(t);
  setTimeout(() => dismissToast(t), duration);
}
function dismissToast(t) {
  t.classList.add('leaving');
  setTimeout(() => t.remove(), 220);
}

// ─── System Notifications ─────────────────────────────────────────────────────
function showSystemNotification(title, body, type = 'info') {
  if (!('Notification' in window)) {
    console.log('[System Notification] Not supported');
    return;
  }
  
  if (Notification.permission === 'granted') {
    new Notification(title, { 
      body, 
      icon: type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️',
      silent: false
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, { body, icon: type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️' });
      }
    });
  }
}

// Request notification permission on load
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });
  document.getElementById('settingsShortcut').addEventListener('click', () => showPage('settings'));
  document.addEventListener('click', e => {
    const navTo = e.target.closest('[data-navto]');
    if (navTo) showPage(navTo.dataset.navto);
  });
  document.getElementById('kpiReviewLink').addEventListener('click', e => { e.preventDefault(); showPage('parser'); });
}

function showPage(id) {
  currentPage = id;
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === id);
    if (b.dataset.page === id) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + id));
  const titles = { dashboard:'Dashboard', documents:'Documents', parser:'Parser Lab', fiscal:'Fiscal Device', dayclose:'Day Close', settings:'Settings' };
  const subs   = { dashboard:'Overview of today\'s fiscal activity', documents:'Full receipt history', parser:'Inspect and tune receipt parsing rules', fiscal:'FDMS device status and counters', dayclose:'Guided open/close fiscal day', settings:'Configuration' };
  document.getElementById('pageTitle').textContent    = titles[id] || id;
  document.getElementById('pageSubtitle').textContent = subs[id]   || '';
  if (id === 'settings') populateSettings();
  if (id === 'parser')   populateParserProfiles();
  if (id === 'fiscal')   loadFiscalDevice();
  if (id === 'documents') renderDocumentsTable();
}

// ─── Periodic refresh ─────────────────────────────────────────────────────────
function startRefreshLoop() {
  refreshDashboard();
  setInterval(refreshDashboard, 15000);
}

async function refreshDashboard() {
  try {
    documents = await window.fiscalBridgeAPI.getDocuments() || [];
  } catch { documents = []; }

  // Render local stats first so they appear even if the device endpoint is slow
  renderKPIs();
  renderHourlyChart();
  renderRecentDocsTable();

  // Then pull live device/fiscal status for the header pill, chip and day card
  await updateDeviceChip();
  renderFiscalDayCard();
  updateCloseChecklist();
}

function updateBadges() {
  const total      = documents.length;
  const needsReview = documents.filter(d => d.status === 'needs_review').length;
  const docsBadge  = document.getElementById('docsBadge');
  const parserBadge = document.getElementById('parserBadge');
  docsBadge.textContent = total;
  parserBadge.textContent = needsReview;
  parserBadge.style.display = needsReview > 0 ? '' : 'none';
}

// ─── Watcher Pill ─────────────────────────────────────────────────────────────
function setupWatcher() {
  const btn = document.getElementById('pauseResumeBtn');
  btn.addEventListener('click', () => {
    if (isMonitoring) stopMonitoring(); else startMonitoring();
  });
  
  // Refresh button
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshDashboard();
      showToast('Dashboard refreshed', 'info');
    });
  }
}

async function startMonitoring() {
  if (!config.sourceFolder || !config.targetFolder) {
    showToast('Configure source and target folders first', 'error'); return;
  }
  const r = await window.fiscalBridgeAPI.startFolderWatch(config.sourceFolder, config.targetFolder);
  if (r.success) {
    isMonitoring = true;
    updateWatcherPill();
    showToast('Monitoring ' + config.sourceFolder, 'success');
    if (watcherPillInterval) clearInterval(watcherPillInterval);
    watcherPillInterval = setInterval(updateWatcherPill, 5000);
  } else {
    showToast('Failed to start: ' + r.error, 'error');
  }
}

async function stopMonitoring() {
  const r = await window.fiscalBridgeAPI.stopFolderWatch();
  if (r.success) {
    isMonitoring = false;
    if (watcherPillInterval) { clearInterval(watcherPillInterval); watcherPillInterval = null; }
    updateWatcherPill();
    showToast('Monitoring paused', 'info');
  }
}

function updateWatcherPill() {
  const pill = document.getElementById('watcherPill');
  const txt  = document.getElementById('watcherPillText');
  const btn  = document.getElementById('pauseResumeBtn');
  if (isMonitoring) {
    pill.classList.add('watching');
    const folder = (config.sourceFolder || '').split('/').pop() || config.sourceFolder;
    let age = '';
    if (watcherLastFile) {
      const sec = Math.round((Date.now() - watcherLastFile) / 1000);
      age = sec < 60 ? ` · last file ${sec}s ago` : ` · last file ${Math.round(sec/60)}m ago`;
    }
    txt.textContent = `Watching ${folder}${age}`;
    btn.textContent = 'Pause';
  } else {
    pill.classList.remove('watching');
    txt.textContent = 'Not watching';
    btn.textContent = 'Start';
  }
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function setupDashboard() {
  document.querySelectorAll('[data-tab]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
      dashTab = b.dataset.tab;
      renderRecentDocsTable();
    });
  });
  document.querySelectorAll('[data-dcstep]').forEach(() => {}); // day close handled separately
}

function renderDashboard() {
  renderKPIs();
  renderHourlyChart();
  renderRecentDocsTable();
  renderFiscalDayCard();
  updateCloseChecklist();
}

function renderKPIs() {
  const fiscalised   = documents.filter(d => d.status === 'fiscalised').length;
  const queued       = documents.filter(d => d.status === 'queued' || d.status === 'retrying').length;
  const needsReview  = documents.filter(d => d.status === 'needs_review').length;
  const totals       = {};
  documents.filter(d => d.status === 'fiscalised').forEach(d => {
    const c = d.currency || 'USD';
    totals[c] = (totals[c] || 0) + (parseFloat(d.amount) || 0);
  });
  const totalStr = Object.entries(totals).map(([c,v]) => `${v.toFixed(2)} ${c}`).join(' / ') || '—';

  document.getElementById('kpiProcessed').textContent = fiscalised;
  document.getElementById('kpiQueued').textContent    = queued;
  document.getElementById('kpiReview').textContent    = needsReview;
  document.getElementById('kpiTotal').textContent     = totalStr;

  const rc = document.getElementById('kpiReviewCard');
  rc.classList.toggle('kpi-alert', needsReview > 0);
  document.getElementById('kpiReview').classList.toggle('kpi-value-alert', needsReview > 0);

  // Queue sub
  const nextRetry = documents.filter(d => d.status === 'retrying' && d.nextRetryAt).sort((a,b) => a.nextRetryAt - b.nextRetryAt)[0];
  document.getElementById('kpiQueuedSub').textContent = nextRetry
    ? 'Next retry ' + timeAgo(nextRetry.nextRetryAt)
    : queued > 0 ? 'Pending sync' : 'All clear';
}

function renderHourlyChart() {
  const hourly = new Array(24).fill(0);
  documents.filter(d => d.status === 'fiscalised').forEach(d => {
    const h = new Date(d.processedAt).getHours();
    if (!isNaN(h)) hourly[h]++;
  });
  const max = Math.max(...hourly, 1);
  const chart = document.getElementById('hourlyChart');
  chart.innerHTML = hourly.map((v, h) =>
    `<div class="bar" style="height:${Math.max(4, Math.round(v / max * 100))}%" title="${h}:00 – ${v} receipts"></div>`
  ).join('');
}

function renderRecentDocsTable() {
  const filtered = dashTab === 'all' ? documents :
    documents.filter(d => d.status === dashTab);
  const recent = filtered.slice(0, 20);
  const tbody = document.getElementById('recentDocsTbody');
  if (!recent.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-state-icon">📄</div><h4>No documents</h4><p>${isMonitoring ? 'Waiting for receipts…' : 'Start monitoring to process receipts.'}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = recent.map(d => `
    <tr data-id="${d.id}" style="cursor:pointer">
      <td class="td-mono">${esc(d.fileName || '—')}</td>
      <td class="td-mono">${esc(d.receiptNo || '—')}</td>
      <td class="td-mono">${d.amount ? parseFloat(d.amount).toFixed(2) + ' ' + (d.currency||'') : '—'}</td>
      <td>${statusPill(d.status)}</td>
      <td class="td-mono" style="font-size:.72rem">${esc(d.fiscalCode || '—')}</td>
    </tr>`).join('');
  tbody.querySelectorAll('tr[data-id]').forEach(r => r.addEventListener('click', () => openDrawer(r.dataset.id)));
}

async function renderFiscalDayCard() {
  try {
    // Use config directly since fiscal config is stored in the main config
    const fc = config;
    
    // Handle both camelCase and PascalCase field names from API
    const fiscalDayStatus = fc.fiscalDayStatus || fc.Data?.fiscalDayStatus;
    const fiscalDayNo = fc.fiscalDayNo || fc.FiscalDay || fc.Data?.FiscalDay || fc.Data?.lastFiscalDayNo;
    
    const isOpen = _fiscalDayOpen(fiscalDayStatus);
    const dayNo  = fiscalDayNo || '—';
    const company = config.companyName || 'FiscalBridge';

    const fdcDay = document.getElementById('fdcDay');
    const fdcMeta = document.getElementById('fdcMeta');
    const fdcTimer = document.getElementById('fdcTimer');
    
    if (fdcDay) fdcDay.textContent = `${company} · Day ${dayNo}`;
    if (fdcMeta) fdcMeta.textContent = isOpen ? `Opened ${fc.fiscalDate ? new Date(fc.fiscalDate).toLocaleString() : ''}` : 'Fiscal day closed';

    if (isOpen && fc.fiscalDate && !fiscalDayOpenTime) {
      fiscalDayOpenTime = new Date(fc.fiscalDate).getTime();
    }
    if (!isOpen) {
      fiscalDayOpenTime = null;
      if (fdcTimer) {
        fdcTimer.textContent = 'Closed';
        fdcTimer.style.color = '#F87171';
      }
      if (fiscalDayTimerInterval) { clearInterval(fiscalDayTimerInterval); fiscalDayTimerInterval = null; }
    } else if (fiscalDayOpenTime && !fiscalDayTimerInterval) {
      updateFiscalDayTimer();
      fiscalDayTimerInterval = setInterval(updateFiscalDayTimer, 1000);
    }
  } catch (e) {
    console.error('Error rendering fiscal day card:', e);
    const fdcDay = document.getElementById('fdcDay');
    const fdcMeta = document.getElementById('fdcMeta');
    const fdcTimer = document.getElementById('fdcTimer');
    if (fdcDay) fdcDay.textContent = 'FiscalBridge · Day —';
    if (fdcMeta) fdcMeta.textContent = 'Status unknown';
    if (fdcTimer) fdcTimer.textContent = '--:--:--';
  }
}

function updateFiscalDayTimer() {
  if (!fiscalDayOpenTime) return;
  const el = document.getElementById('fdcTimer');
  const diff = Date.now() - fiscalDayOpenTime;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  el.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
  el.style.color = '';
}

function updateCloseChecklist() {
  const queued = documents.filter(d => d.status === 'queued' || d.status === 'retrying').length;
  const review = documents.filter(d => d.status === 'needs_review').length;

  const setChk = (dotId, valId, ok, val) => {
    const dot = document.getElementById(dotId);
    const valEl = document.getElementById(valId);
    if (dot) { dot.className = `check-dot ${ok ? '' : 'fail'}`; }
    if (valEl) valEl.textContent = val;
  };

  setChk('chkQueue',  'chkQueueVal',  queued === 0, queued === 0 ? 'OK' : `${queued} pending`);
  setChk('chkReview', 'chkReviewVal', review === 0, review === 0 ? 'OK'  : `${review} files`);
  // FDMS: pull from last known device status
  const fdmsOk = _fiscalDayOpen(config.fiscalDayStatus);
  setChk('chkFdms', 'chkFdmsVal', fdmsOk, fdmsOk ? 'Healthy' : 'Check device');
}

async function updateDeviceChip() {
  // Stored fiscal config is the baseline (counters, TIN, saved day state)
  try {
    const fc = await window.fiscalBridgeAPI.getFiscalConfig();
    if (fc) Object.assign(config, fc);
  } catch (e) {
    console.error('Failed to load fiscal config:', e);
  }

  // Live device status overrides any stale saved values
  let liveOk = null;
  try {
    const r = await window.fiscalBridgeAPI.getDeviceStatus();
    liveOk = !!(r && r.success);
    if (liveOk) {
      const data = r.data?.Data || r.data || {};
      if (data.fiscalDayStatus) config.fiscalDayStatus = data.fiscalDayStatus;
      const dayNo = r.data?.FiscalDay ?? data.lastFiscalDayNo;
      if (dayNo !== undefined && dayNo !== null && dayNo !== '') config.fiscalDayNo = dayNo;
      const devId = r.data?.DeviceID || r.data?.DeviceSerialNumber;
      if (devId) config.deviceId = devId;
    }
  } catch (e) {
    console.error('Failed to fetch live device status:', e);
    liveOk = false;
  }

  const dot = document.getElementById('deviceDot');
  const txt = document.getElementById('deviceChipText');
  const isOpen = _fiscalDayOpen(config.fiscalDayStatus);
  if (dot) dot.className = `dot ${isOpen ? '' : 'offline'}`;
  if (txt) {
    const devId = config.deviceId ? String(config.deviceId).slice(0, 10) : 'No device';
    txt.textContent = `${devId} · Day ${config.fiscalDayNo ?? '—'}`;
  }
  renderHeaderFiscalStatus();

  // Mirror identity into the tray tooltip/menu
  try {
    await window.fiscalBridgeAPI.setDeviceInfo({
      companyName: config.companyName || null,
      deviceId: config.deviceId != null ? String(config.deviceId) : null,
      fiscalDay: config.fiscalDayNo != null ? String(config.fiscalDayNo) : null,
      tin: config.tin || null
    });
  } catch (e) {
    console.error('Failed to update device info:', e);
  }

  // Keep the header connection indicator in sync with the live check
  await reportConnectionStatus(liveOk);
}

async function reportConnectionStatus(liveOk) {
  let status;
  if (!config.apiEndpoint || !config.apiKey) status = 'error';
  else if (liveOk) status = 'online';
  else status = 'offline';

  try {
    const queued = documents.filter(d => d.status === 'queued' || d.status === 'retrying').length;
    await window.fiscalBridgeAPI.setStatus(status, queued);
  } catch (e) {
    console.error('Failed to set connection status:', e);
  }
  updateStatusDisplay();
}

// ─── Documents Page ────────────────────────────────────────────────────────────
function setupDocumentsPage() {
  document.getElementById('docSearch').addEventListener('input', e => { docFilter.search = e.target.value; docPage = 1; renderDocumentsTable(); });
  document.getElementById('docStatusFilter').addEventListener('change', e => { docFilter.status = e.target.value; docPage = 1; renderDocumentsTable(); });
  document.getElementById('docCurrencyFilter').addEventListener('change', e => { docFilter.currency = e.target.value; docPage = 1; renderDocumentsTable(); });
  document.getElementById('docDateFilter').addEventListener('change', e => { docFilter.date = e.target.value; docPage = 1; renderDocumentsTable(); });
  document.getElementById('refreshDocsBtn').addEventListener('click', async () => { documents = await window.fiscalBridgeAPI.getDocuments() || []; renderDocumentsTable(); });
  document.getElementById('exportCsvBtn').addEventListener('click', exportDocumentsCSV);
  document.querySelectorAll('#docsTable thead th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      if (sortCol === th.dataset.col) sortDir *= -1; else { sortCol = th.dataset.col; sortDir = -1; }
      document.querySelectorAll('#docsTable thead th').forEach(h => h.classList.remove('sorted'));
      th.classList.add('sorted');
      renderDocumentsTable();
    });
  });
}

function filteredSortedDocs() {
  let list = [...documents];
  if (docFilter.status)   list = list.filter(d => d.status === docFilter.status);
  if (docFilter.currency) list = list.filter(d => d.currency === docFilter.currency);
  if (docFilter.date)     list = list.filter(d => (d.processedAt||'').startsWith(docFilter.date));
  if (docFilter.search) {
    const q = docFilter.search.toLowerCase();
    list = list.filter(d => (d.receiptNo||'').toLowerCase().includes(q) || (d.fileName||'').toLowerCase().includes(q));
  }
  list.sort((a,b) => {
    const av = a[sortCol]||'', bv = b[sortCol]||'';
    return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir;
  });
  return list;
}

function renderDocumentsTable() {
  // Update currency filter options
  const currencies = [...new Set(documents.map(d=>d.currency).filter(Boolean))];
  const cfEl = document.getElementById('docCurrencyFilter');
  const cur = cfEl.value;
  cfEl.innerHTML = '<option value="">All currencies</option>' + currencies.map(c=>`<option value="${c}">${c}</option>`).join('');
  cfEl.value = cur;

  const list = filteredSortedDocs();
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (docPage > pages) docPage = pages;
  const slice = list.slice((docPage-1)*PAGE_SIZE, docPage*PAGE_SIZE);

  const tbody = document.getElementById('docsTbody');
  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">📂</div><h4>No documents match</h4><p>Try adjusting your filters.</p></div></td></tr>`;
  } else {
    tbody.innerHTML = slice.map(d => `
      <tr data-id="${d.id}">
        <td class="td-mono">${esc(d.fileName||'—')}</td>
        <td class="td-mono">${esc(d.receiptNo||'—')}</td>
        <td class="td-mono">${d.amount ? parseFloat(d.amount).toFixed(2)+' '+(d.currency||'') : '—'}</td>
        <td>${statusPill(d.status)}</td>
        <td class="td-mono" style="font-size:.72rem">${esc(d.fiscalCode||'—')}</td>
        <td class="td-muted">${d.processedAt ? new Date(d.processedAt).toLocaleTimeString() : '—'}</td>
        <td class="td-action">
          <button class="btn-icon" onclick="handlePreviewPdf('${d.id}');event.stopPropagation()" title="Preview PDF" ${!d.filePath ? 'disabled' : ''}>👁</button>
          <button class="btn-icon" onclick="handlePrintDocument('${d.id}');event.stopPropagation()" title="Print" ${(!d.filePath && !d.invoiceData) ? 'disabled' : ''}>🖨</button>
          <button class="btn-icon" onclick="handleDownloadFile('${d.id}');event.stopPropagation()" title="Download File" ${!d.filePath ? 'disabled' : ''}>⬇</button>
          ${d.status==='needs_review' ? `<button class="btn-ghost" style="font-size:.75rem" onclick="openParserWithFile('${d.id}');event.stopPropagation()">Fix</button>` : ''}
        </td>
      </tr>`).join('');
    tbody.querySelectorAll('tr[data-id]').forEach(r => r.addEventListener('click', () => openDrawer(r.dataset.id)));
  }

  // Pagination
  const pg = document.getElementById('docsPagination');
  if (pages <= 1) { pg.innerHTML = ''; return; }
  pg.innerHTML = `<span>${(docPage-1)*PAGE_SIZE+1}–${Math.min(docPage*PAGE_SIZE,total)} of ${total}</span>` +
    Array.from({length:pages},(_,i)=>`<button class="page-num ${i+1===docPage?'active':''}" onclick="docPage=${i+1};renderDocumentsTable()">${i+1}</button>`).join('');
}

function exportDocumentsCSV() {
  const list = filteredSortedDocs();
  const header = 'File,Receipt No.,Amount,Currency,Status,Fiscal Code,Time';
  const rows = list.map(d => [d.fileName,d.receiptNo,d.amount,d.currency,d.status,d.fiscalCode,d.processedAt].map(v => JSON.stringify(v||'')).join(','));
  const csv = [header,...rows].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'documents.csv'; a.click();
}

// ─── Detail Drawer ─────────────────────────────────────────────────────────────
function setupDetailDrawer() {
  document.getElementById('closeDrawerBtn').addEventListener('click', closeDrawer);
  document.getElementById('detailDrawerOverlay').addEventListener('click', closeDrawer);
}

function setupPdfModal() {
  document.getElementById('closePdfModalBtn').addEventListener('click', closePdfModal);
  document.getElementById('pdfModalOverlay').addEventListener('click', closePdfModal);
  document.getElementById('closePdfModalFooterBtn').addEventListener('click', closePdfModal);
  document.getElementById('pdfModalDownloadBtn').addEventListener('click', downloadPreviewedFile);
  document.getElementById('pdfModalPrintBtn').addEventListener('click', printPreviewedFile);
}

function openDrawer(id) {
  const doc = documents.find(d => d.id == id);
  if (!doc) return;
  document.getElementById('drawerTitle').textContent = doc.fileName || doc.receiptNo || 'Document';
  const body = document.getElementById('drawerBody');
  body.innerHTML = `
    <div class="drawer-section">
      <div class="drawer-section-title">Receipt Details</div>
      <dl>
        ${kv('Receipt No.', doc.receiptNo)}
        ${kv('File', doc.fileName)}
        ${kv('Amount', doc.amount ? parseFloat(doc.amount).toFixed(2)+' '+(doc.currency||'') : '—')}
        ${kv('Status', statusPill(doc.status))}
        ${kv('Fiscal Code', doc.fiscalCode)}
        ${kv('Processed', doc.processedAt ? new Date(doc.processedAt).toLocaleString() : '—')}
      </dl>
    </div>
    ${doc.parseError ? `<div class="drawer-section"><div class="drawer-section-title">Parse Error</div><div class="why-failed-callout"><strong>Error</strong>${esc(doc.parseError)}</div></div>` : ''}
    ${doc.apiRequest  ? `<div class="drawer-section"><div class="collapsible-header" onclick="toggleCollapsible(this)"><span>API Request</span><span class="collapsible-icon">▶</span></div><div class="collapsible-body"><pre style="font-size:.72rem;overflow:auto;max-height:160px">${esc(JSON.stringify(doc.apiRequest,null,2))}</pre></div></div>` : ''}
    ${doc.apiResponse ? `<div class="drawer-section"><div class="collapsible-header" onclick="toggleCollapsible(this)"><span>API Response</span><span class="collapsible-icon">▶</span></div><div class="collapsible-body"><pre style="font-size:.72rem;overflow:auto;max-height:160px">${esc(JSON.stringify(doc.apiResponse,null,2))}</pre></div></div>` : ''}
    ${doc.retryHistory && doc.retryHistory.length ? `<div class="drawer-section"><div class="drawer-section-title">Retry History</div>${doc.retryHistory.map(r=>`<div class="drawer-kv"><dt>${new Date(r.at).toLocaleTimeString()}</dt><dd>${esc(r.result)}</dd></div>`).join('')}</div>` : ''}
  `;
  const footer = document.getElementById('drawerFooter');
  
  let buttons = '';
  if (doc.status === 'fiscalised') {
    buttons = `
      <button class="btn-primary" onclick="handleReprint('${id}')">Reprint</button>
      <button class="btn-secondary" onclick="handlePrintDocument('${id}')">Print</button>
      <button class="btn-secondary" onclick="handlePreviewPdf('${id}')">View PDF</button>
    `;
  } else {
    buttons = `
      <button class="btn-secondary" onclick="handleReSend('${id}')">Re-send</button>
      <button class="btn-secondary" onclick="handleReParse('${id}')">Re-parse</button>
      ${(doc.filePath || doc.invoiceData) ? `<button class="btn-secondary" onclick="handlePrintDocument('${id}')">Print</button>` : ''}
    `;
  }
  buttons += `<button class="btn-ghost" onclick="closeDrawer()">Close</button>`;
  
  footer.innerHTML = buttons;
  document.getElementById('detailDrawerOverlay').classList.add('open');
  setTimeout(() => document.getElementById('detailDrawer').classList.add('open'), 10);
}

function closeDrawer() {
  document.getElementById('detailDrawer').classList.remove('open');
  document.getElementById('detailDrawerOverlay').classList.remove('open');
}

function toggleCollapsible(header) {
  header.classList.toggle('open');
  const body = header.nextElementSibling;
  if (body) body.classList.toggle('open');
}

async function handleReSend(id) {
  const doc = documents.find(d => d.id == id);
  if (!doc) return;
  if (doc.fiscalCode) { if (!confirm('This receipt already has a fiscal code. Re-send anyway?')) return; }
  closeDrawer();
  await fiscalizeInvoice(doc.invoiceData || doc);
  showToast('Re-send queued', 'info');
}

async function handleReParse(id) {
  const doc = documents.find(d => d.id == id);
  if (!doc || !doc.filePath) { showToast('No file path stored', 'error'); return; }
  closeDrawer();
  showToast('Re-parsing file…', 'info');
  const r = await readTextFromFile(doc.filePath);
  if (!r.success) { showToast('Cannot read file: ' + r.error, 'error'); return; }

  const _rePinnedId = config.parserMode === 'pinned' ? (config.pinnedProfileId || null) : null;
  const parseResp = await window.fiscalBridgeAPI.parseText(r.text, _rePinnedId, null);
  const parseResult = parseResp?.result;

  if (parseResult && parseResult.profile) {
    const invoiceData = parseResp.fiscal;
    const isOk = parseResult.status !== 'needs_review' && invoiceData?.items?.length > 0;
    await window.fiscalBridgeAPI.updateDocument(id, {
      status: isOk ? 'queued' : 'needs_review',
      parseError: isOk ? null : ('Low confidence: ' + (parseResult.reason || '')),
      invoiceData: invoiceData || undefined,
    });
    if (isOk) showToast('Re-parsed, queued for fiscalisation', 'success');
    else showToast('Re-parsed but still needs review', 'warning');
  } else {
    // Legacy fallback
    const parser = new ReceiptParser(config);
    const legacyData = parser.parseReceipt(r.text, config.currencies || []);
    const invoiceData = _legacyToFiscalSchema(legacyData, config);
    if (!invoiceData.items || invoiceData.items.length === 0) {
      await window.fiscalBridgeAPI.updateDocument(id, {
        status: 'needs_review',
        parseError: 'No matching parser profile and the legacy parser found no line items',
      });
      showToast('Re-parsed but no line items found', 'warning');
    } else {
      await window.fiscalBridgeAPI.updateDocument(id, { status: 'queued', parseError: null, invoiceData });
      showToast('Re-parsed (legacy), queued for fiscalisation', 'success');
    }
  }
  documents = await window.fiscalBridgeAPI.getDocuments() || [];
  refreshDashboard();
}

async function handleReprint(id) {
  const doc = documents.find(d => d.id == id);
  if (!doc || !doc.invoiceData) { showToast('No invoice data available', 'error'); return; }
  if (!config.printerName) { showToast('No printer configured', 'error'); return; }
  
  closeDrawer();
  showToast('Reprinting receipt…', 'info');
  
  try {
    await printFiscalReceipt(doc.invoiceData, doc.apiResponse || {});
    showToast('Receipt reprinted', 'success');
  } catch (err) {
    showToast('Reprint failed: ' + err.message, 'error');
  }
}

async function handlePreviewPdf(id) {
  const doc = documents.find(d => d.id == id);
  if (!doc) { showToast('Document not found', 'error'); return; }
  pdfPreviewDoc = doc;

  const isPdfSource = !!doc.filePath && /\.pdf$/i.test(doc.fileName || doc.filePath);

  // Prefer the original document so the preview reflects the invoice on disk.
  // Pages are rasterised in the main process: Electron's PDF viewer cannot
  // render blob/data PDFs inside this window.
  if (isPdfSource) {
    showToast('Loading PDF preview…', 'info');
    try {
      const rendered = await window.fiscalBridgeAPI.renderPdfPages(doc.filePath, { maxPages: 10, dpi: 150 });
      if (rendered && rendered.success && rendered.pages && rendered.pages.length) {
        openPdfPagePreview(doc, rendered.pages);
        return;
      }
      console.warn('[Preview] PDF render failed:', rendered && rendered.error);
    } catch (err) {
      console.warn('[Preview] PDF render failed:', err.message);
    }
  }

  // Fiscalised document whose source is gone: fall back to the generated receipt
  if (doc.status === 'fiscalised' && doc.invoiceData && doc.apiResponse) {
    try {
      const tpl = PRINT_TEMPLATES[config.printTemplate || 'thermal80'] || PRINT_TEMPLATES.thermal80;
      const f = await _withQrImage(doc.invoiceData, doc.apiResponse);
      const html = buildReceiptHTML(doc.invoiceData, f, config);
      const blob = new Blob([html], { type: 'text/html' });
      const isA4 = tpl.format === 'a4';
      openPdfModal(URL.createObjectURL(blob), {
        a4: isA4,
        title: `Fiscal Receipt - ${doc.receiptNo || doc.fileName}`,
        meta: isA4 ? 'A4 · 210 × 297 mm' : tpl.label,
      });
      showToast('Loading fiscal receipt preview…', 'info');
    } catch (err) {
      showToast('Failed to load fiscal receipt: ' + err.message, 'error');
    }
    return;
  }

  showToast(isPdfSource
    ? 'Could not render this PDF — use Download to open it externally'
    : 'Preview is available for PDF files only', 'warning');
}

function showPdfModalShell({ title, meta = '' }) {
  document.getElementById('pdfModalTitle').textContent = title;
  document.getElementById('pdfModalMeta').textContent = meta;
  document.getElementById('pdfModalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('pdfModal').classList.add('open'), 10);
}

function openPdfPagePreview(doc, pages) {
  if (pdfPreviewBlobUrl) { URL.revokeObjectURL(pdfPreviewBlobUrl); pdfPreviewBlobUrl = null; }
  document.getElementById('pdfPreviewFrame').src = 'about:blank';
  document.getElementById('pdfSheet').hidden = true;

  const container = document.getElementById('pdfPages');
  container.hidden = false;
  container.innerHTML = '';

  const single = pages.length === 1;
  container.classList.toggle('pdf-pages--single', single);
  pdfPreviewMode = 'pdf';

  pages.forEach((page, i) => {
    const sheet = document.createElement('div');
    sheet.className = 'pdf-page' + (single ? ' pdf-page--single' : '');
    sheet.style.aspectRatio = `${page.width} / ${page.height}`;
    const img = document.createElement('img');
    img.src = page.dataUrl;
    img.alt = `Page ${i + 1}`;
    sheet.appendChild(img);
    container.appendChild(sheet);
  });

  const ratio = pages[0].width / pages[0].height;
  const sizeLabel = Math.abs(ratio - 210 / 297) < 0.02
    ? 'A4 · 210 × 297 mm'
    : `${pages[0].width} × ${pages[0].height} px`;
  showPdfModalShell({
    title: doc.fileName || 'PDF Preview',
    meta: single ? sizeLabel : `${pages.length} pages · ${sizeLabel}`,
  });
}

function openPdfModal(blobUrl, { a4 = true, title = 'Preview', meta = '' } = {}) {
  if (pdfPreviewBlobUrl) URL.revokeObjectURL(pdfPreviewBlobUrl);
  pdfPreviewBlobUrl = blobUrl;
  pdfPreviewMode = 'receipt';

  const pagesEl = document.getElementById('pdfPages');
  pagesEl.hidden = true;
  pagesEl.innerHTML = '';
  pagesEl.classList.remove('pdf-pages--single');

  const sheet = document.getElementById('pdfSheet');
  sheet.hidden = false;
  sheet.classList.toggle('pdf-sheet--a4', a4);
  sheet.classList.toggle('pdf-sheet--flow', !a4);

  // A4 receipts fill the sheet; thermal receipts keep their natural width
  document.getElementById('pdfPreviewFrame').src = blobUrl;

  showPdfModalShell({ title, meta });
}

function _printErrorText(err) {
  return String(err && err.message ? err.message : err)
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '');
}

async function printPdfDocument(doc) {
  showToast('Sending PDF to printer…', 'info');
  try {
    const r = await window.fiscalBridgeAPI.printPdfFile(doc.filePath, config.printerName || undefined);
    if (r && r.success) {
      showToast(r.usedDefault ? 'Configured printer unavailable — PDF sent to default printer' : 'PDF sent to printer', 'success');
    } else {
      showToast('Print failed: ' + ((r && r.error) || 'unknown error'), 'error');
    }
  } catch (err) {
    showToast('Print failed: ' + _printErrorText(err), 'error');
  }
}

async function printFiscalDocument(doc) {
  showToast('Printing fiscal receipt…', 'info');
  try {
    const tpl = PRINT_TEMPLATES[config.printTemplate || 'thermal80'] || PRINT_TEMPLATES.thermal80;
    const f = await _withQrImage(doc.invoiceData, doc.apiResponse || {});
    const html = buildReceiptHTML(doc.invoiceData, f, config);
    const r = await window.fiscalBridgeAPI.printReceipt(html, config.printerName, tpl.format);
    if (r && r.success === false) throw new Error(r.error || 'Print failed');
    showToast(r && r.usedDefault ? 'Configured printer unavailable — receipt sent to default printer' : 'Fiscal receipt sent to printer', 'success');
  } catch (err) {
    showToast('Print failed: ' + _printErrorText(err), 'error');
  }
}

async function handlePrintDocument(id) {
  const doc = documents.find(d => d.id == id);
  if (!doc) { showToast('Document not found', 'error'); return; }

  if (doc.filePath && /\.pdf$/i.test(doc.fileName || doc.filePath)) { await printPdfDocument(doc); return; }
  if (doc.invoiceData) { await printFiscalDocument(doc); return; }
  showToast('Nothing available to print', 'error');
}

async function printPreviewedFile() {
  const doc = pdfPreviewDoc;
  if (!doc) return;

  // Print exactly what the preview shows: the source PDF, or its fiscal receipt
  if (pdfPreviewMode === 'pdf' && doc.filePath) { await printPdfDocument(doc); return; }
  if (doc.invoiceData) { await printFiscalDocument(doc); return; }
  showToast('Nothing available to print', 'error');
}

async function downloadPreviewedFile() {
  const doc = pdfPreviewDoc;
  if (!doc) return;

  // Prefer the original file, matching what the preview shows
  if (doc.filePath) {
    try {
      const r = await window.fiscalBridgeAPI.readReceiptFile(doc.filePath);
      if (r && r.success) {
        const isPdf = /\.pdf$/i.test(doc.fileName || doc.filePath);
        _saveBlob(new Blob([r.content], { type: isPdf ? 'application/pdf' : 'application/octet-stream' }),
          doc.fileName || 'document');
        showToast('File downloaded', 'success');
        return;
      }
    } catch (err) {
      console.warn('[Preview] Download read failed:', err.message);
    }
  }

  // Source no longer on disk: download the generated receipt instead
  if (doc.status === 'fiscalised' && doc.invoiceData && doc.apiResponse) {
    try {
      const f = await _withQrImage(doc.invoiceData, doc.apiResponse);
      const html = buildReceiptHTML(doc.invoiceData, f, config);
      _saveBlob(new Blob([html], { type: 'text/html' }), `Fiscal_${doc.receiptNo || doc.fileName}.html`);
      showToast('Fiscal receipt downloaded', 'success');
    } catch (err) {
      showToast('Download failed: ' + err.message, 'error');
    }
    return;
  }

  showToast('Source file is no longer available to download', 'error');
}

function _saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


async function handleDownloadFile(id) {
  const doc = documents.find(d => d.id == id);
  if (!doc) { showToast('Document not found', 'error'); return; }
  
  // For fiscalised documents, download the generated fiscal receipt
  if (doc.status === 'fiscalised' && doc.invoiceData && doc.apiResponse) {
    try {
      const tpl = PRINT_TEMPLATES[config.printTemplate || 'thermal80'] || PRINT_TEMPLATES.thermal80;
      const f = await _withQrImage(doc.invoiceData, doc.apiResponse);
      const html = buildReceiptHTML(doc.invoiceData, f, config);
      
      // Create a blob with the HTML
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Fiscal_${doc.receiptNo || doc.fileName}.html`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Fiscal receipt downloaded', 'success');
    } catch (err) {
      showToast('Download failed: ' + err.message, 'error');
    }
  } else {
    // For non-fiscalised documents, download the source file
    if (!doc.filePath) { showToast('No file path stored', 'error'); return; }
    
    try {
      const r = await window.fiscalBridgeAPI.readReceiptFile(doc.filePath);
      if (r.success) {
        const blob = new Blob([r.content], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.fileName || 'download';
        a.click();
        URL.revokeObjectURL(url);
        showToast('File downloaded', 'success');
      } else {
        showToast('Failed to read file: ' + r.error, 'error');
      }
    } catch (err) {
      showToast('Download failed: ' + err.message, 'error');
    }
  }
}

function closePdfModal() {
  const pdfModalOverlay = document.getElementById('pdfModalOverlay');
  const pdfModal = document.getElementById('pdfModal');
  const pdfPreviewFrame = document.getElementById('pdfPreviewFrame');
  
  pdfModal.classList.remove('open');
  pdfModalOverlay.classList.remove('open');
  pdfPreviewFrame.src = 'about:blank';
  const pagesEl = document.getElementById('pdfPages');
  pagesEl.innerHTML = '';
  pagesEl.classList.add('pdf-pages--single');
  document.getElementById('pdfSheet').hidden = true;
  if (pdfPreviewBlobUrl) {
    URL.revokeObjectURL(pdfPreviewBlobUrl);
    pdfPreviewBlobUrl = null;
  }
  pdfPreviewDoc = null;
  pdfPreviewMode = null;
}

// ─── Receipt processing ────────────────────────────────────────────────────────
async function handleReceiptFile(data, existingDocId = null) {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  const fileName = data.filePath.split('/').pop();

  // Same path already in progress in this session — never process twice
  if (inFlightFiles.has(data.filePath)) {
    console.log(`[${timestamp}] [FILE] Already in flight, skipping: ${fileName}`);
    return;
  }

  // Leftover source from an earlier copy that was fiscalised but not unlinked
  const unlinkOwner = documents.find(d =>
    d.status === 'fiscalised' && d.unlinkPending === data.filePath
  );
  if (unlinkOwner) {
    console.log(`[${timestamp}] [FILE] Removing already-archived leftover: ${fileName}`);
    if (await archiveStuckDocument(unlinkOwner)) await reloadDocuments();
    return;
  }

  // Skip files already recorded (startup replay, duplicate watcher events).
  // Reconciliation passes existingDocId to reprocess its own record.
  const existingDoc = existingDocId
    ? documents.find(d => d.id === existingDocId)
    : documents.find(d => d.filePath === data.filePath);
  if (existingDoc && !existingDocId) {
    console.log(`[${timestamp}] [FILE] Skipping already processed file: ${fileName}`);
    // Fiscalised, but the file never left the inbox (earlier move failure)
    if (existingDoc.status === 'fiscalised' && await archiveStuckDocument(existingDoc)) {
      await reloadDocuments();
    }
    return;
  }

  inFlightFiles.add(data.filePath);
  console.log(`[${timestamp}] [FILE] Processing: ${fileName}`);
  watcherLastFile = Date.now();
  updateWatcherPill();
  showToast('Processing ' + fileName, 'info');
  const docId = 'doc-' + Date.now() + '-' + Math.random().toString(36).slice(2,7);

  const docRecord = existingDoc
    ? { ...existingDoc, filePath: data.filePath, status: 'queued', processedAt: new Date().toISOString(), parseError: undefined }
    : {
        id: docId,
        filePath: data.filePath,
        fileName: fileName,
        status: 'queued',
        processedAt: new Date().toISOString(),
      };
  const persisted = await window.fiscalBridgeAPI.addDocument(docRecord);
  documents = await window.fiscalBridgeAPI.getDocuments()||[];
  updateBadges();
  // Without a durable record there is no dedup — do not fiscalise
  if (!persisted) {
    console.error(`[${timestamp}] [FAIL] Could not persist document record for ${fileName}`);
    showToast('Cannot save document record — check disk permissions', 'error');
    inFlightFiles.delete(data.filePath);
    return;
  }

  try {
    console.log(`[${timestamp}] [FILE] Reading: ${data.filePath}`);
    const fileResult = await readTextFromFile(data.filePath);
    const fileType = fileResult.fromPdf ? 'PDF text' : 'text';
    console.log(`[${timestamp}] [FILE] Read ${fileType}: ${fileResult.success ? 'OK' : 'FAILED'}`);
    if (!fileResult.success) throw new Error('Cannot read file: ' + (fileResult.error || 'unknown'));

    // ── Profile-based parser: pinned profile or auto-detect ──
    // When pinned, pass the profile ID as profileRef so main.js loads it by ID.
    // When auto, pass null so main.js fingerprint-matches across all profiles.
    const _pinnedId = config.parserMode === 'pinned' ? (config.pinnedProfileId || null) : null;
    console.log(`[${timestamp}] [PARSE] Mode: ${config.parserMode}`);
    const parseResp = await window.fiscalBridgeAPI.parseText(fileResult.text, _pinnedId, null);
    const parseResult = parseResp?.result;
    console.log(`[${timestamp}] [PARSE] Result: ${parseResult?.status || 'No match'}, Profile: ${parseResult?.profile?.name || 'None'}`);

    let invoiceData;
    let parseWarnings = [];

    if (parseResult && parseResult.profile && parseResult.status !== 'needs_review') {
      // Profile engine succeeded — map to fiscalise schema
      console.log(`[${timestamp}] [PARSE] Using profile: ${parseResult.profile.name}`);
      invoiceData = parseResp.fiscal;
      parseWarnings = parseResult.validation_warnings || [];
      if (!invoiceData || !invoiceData.items || invoiceData.items.length === 0) {
        console.error(`[${timestamp}] [FAIL] Profile parser returned no items`);
        throw new Error('Profile parser returned no line items. Check the profile rules in Parser Lab.');
      }
      console.log(`[${timestamp}] [PARSE] Extracted ${invoiceData.items.length} items`);
    } else if (parseResult && parseResult.profile && parseResult.status === 'needs_review') {
      // Detected a profile but confidence too low — mark for review
      console.warn(`[${timestamp}] [REVIEW] Low confidence: ${parseResult.reason}`);
      await window.fiscalBridgeAPI.addDocument({
        ...docRecord,
        status: 'needs_review',
        parseError: 'Low confidence parse: ' + (parseResult.reason || '') +
          (parseResult.validation_warnings?.length ? ' | ' + parseResult.validation_warnings.map(w => w.message).join('; ') : ''),
      });
      documents = await window.fiscalBridgeAPI.getDocuments()||[];
      updateBadges();
      refreshDashboard();
      showToast('Needs review: ' + docRecord.fileName, 'warning');
      inFlightFiles.delete(data.filePath);
      return;
    } else {
      // No profile matched — fall back to legacy POS ReceiptParser
      console.log(`[${timestamp}] [PARSE] Using legacy parser`);
      const parser = new ReceiptParser(config);
      const legacyData = parser.parseReceipt(fileResult.text, config.currencies || []);
      // Map legacy shape → new fiscalise schema
      invoiceData = _legacyToFiscalSchema(legacyData, config);
      console.log(`[${timestamp}] [PARSE] Legacy extracted ${invoiceData.items?.length || 0} items`);
      // Never fiscalise an empty invoice
      if (!invoiceData.items || invoiceData.items.length === 0) {
        throw new Error('No matching parser profile and the legacy parser found no line items');
      }
    }

    console.log(`[${timestamp}] [API] Fiscalizing: ${invoiceData.invoiceNumber}`);
    const result = await fiscalizeInvoice(invoiceData);
    console.log(`[${timestamp}] [API] Result: ${result.success ? 'OK' : 'FAILED'}`);
    if (result.success) {
      const archive = await moveToTarget(data.filePath, data.targetFolder);
      console.log(`[${timestamp}] [FILE] Archive: ${archive.movePending ? 'FAILED' : 'OK'} → ${archive.filePath}`);
      if (archive.movePending) console.warn(`[${timestamp}] [FILE] Archiving failed; will retry automatically`);

      await window.fiscalBridgeAPI.addDocument({
        ...docRecord,
        filePath: archive.filePath,
        unlinkPending: archive.unlinkPending,
        movePending: archive.movePending || undefined,
        receiptNo: invoiceData.invoiceNumber,
        amount: _totalFromItems(invoiceData.items),
        currency: invoiceData.currency || 'USD',
        status: 'fiscalised',
        fiscalCode: result.data?.fiscalCode,
        invoiceData,
        apiResponse: result.data,
        parseWarnings: parseWarnings.length ? parseWarnings : undefined,
      });
      console.log(`[${timestamp}] [OK] Invoice ${invoiceData.invoiceNumber} fiscalized online — $${_totalFromItems(invoiceData.items)}`);
      showToast('Fiscalised: ' + (invoiceData.invoiceNumber || docRecord.fileName), 'success');
      showSystemNotification(
        'FiscalBridge - Fiscalisation Success',
        `Invoice ${invoiceData.invoiceNumber || 'Unknown'} fiscalised successfully`,
        'success'
      );
      if (config.printerName) {
        console.log(`[${timestamp}] [PRINT] Printing to: ${config.printerName}`);
        await printFiscalReceipt(invoiceData, result.data || {});
      }
    } else {
      const is4xx = /4\d\d/.test(String(result.status || ''));
      console.error(`[${timestamp}] [FAIL] Invoice ${invoiceData.invoiceNumber} — ${result.error || 'API error'}`);
      await window.fiscalBridgeAPI.addDocument({
        ...docRecord,
        status: is4xx ? 'needs_review' : 'retrying',
        parseError: result.error,
        apiResponse: result.data,
        invoiceData,
      });
      showToast((is4xx ? 'Needs review' : 'Retrying') + ': ' + (result.error || 'API error'), 'error');
      showSystemNotification(
        'FiscalBridge - Fiscalisation Error',
        `${is4xx ? 'Needs review' : 'Retrying'}: ${invoiceData.invoiceNumber || docRecord.fileName} - ${result.error || 'API error'}`,
        'error'
      );
    }
  } catch (err) {
    console.error(`[${timestamp}] [FAIL] Invoice ${docRecord.fileName} — ${err.message}`);
    await window.fiscalBridgeAPI.addDocument({ ...docRecord, status: 'needs_review', parseError: err.message });
    showToast('Failed: ' + err.message, 'error');
    showSystemNotification(
      'FiscalBridge - Processing Error',
      `Failed to process ${docRecord.fileName}: ${err.message}`,
      'error'
    );
  }
  await reloadDocuments();
  inFlightFiles.delete(data.filePath);
}

async function reloadDocuments() {
  documents = await window.fiscalBridgeAPI.getDocuments() || [];
  updateBadges();
  if (currentPage === 'dashboard') renderDashboard();
  if (currentPage === 'documents') renderDocumentsTable();
}

// read-receipt-file returns raw bytes for PDFs (used by preview/download);
// text parsers need the extracted text instead.
async function readTextFromFile(filePath) {
  const r = await window.fiscalBridgeAPI.readReceiptFile(filePath);
  if (!r || !r.success) return { success: false, error: (r && r.error) || 'Cannot read file' };
  if (!r.fromPdf) return { success: true, text: r.content, fromPdf: false };
  const ex = await window.fiscalBridgeAPI.extractPdfText(filePath);
  if (!ex || !ex.success) {
    return { success: false, error: (ex && ex.error) || 'PDF text extraction failed', fromPdf: true };
  }
  return { success: true, text: ex.text, fromPdf: true };
}

function _isInFolder(filePath, folder) {
  if (!filePath || !folder) return false;
  const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return norm(filePath).startsWith(norm(folder) + '/');
}

// Archive the receipt file and report what still needs doing if it fails.
async function moveToTarget(sourcePath, targetFolder) {
  const r = await window.fiscalBridgeAPI.moveReceiptFile(sourcePath, targetFolder);
  if (r.success) return { filePath: r.targetPath };
  // Copy is already in the target folder; only the source unlink remains
  if (r.copied) return { filePath: r.targetPath, unlinkPending: sourcePath };
  return { filePath: sourcePath, movePending: true };
}

// A fiscalised receipt must not stay in the inbox. Retries the pending unlink,
// or re-archives a file whose earlier move failed.
async function archiveStuckDocument(doc) {
  try {
    if (!doc || doc.status !== 'fiscalised' || !doc.filePath) return false;

    if (doc.unlinkPending) {
      if (await window.fiscalBridgeAPI.fileExists(doc.unlinkPending)) {
        const r = await window.fiscalBridgeAPI.deleteFile(doc.unlinkPending);
        if (!r || !r.success) return false;
      }
      await window.fiscalBridgeAPI.addDocument({ ...doc, unlinkPending: undefined });
      return true;
    }

    if (!config.targetFolder) return false;
    if (!_isInFolder(doc.filePath, config.sourceFolder)) return false;
    // Never touch files already in the target (also guards target-inside-source)
    if (_isInFolder(doc.filePath, config.targetFolder)) return false;
    if (!(await window.fiscalBridgeAPI.fileExists(doc.filePath))) return false;

    const archive = await moveToTarget(doc.filePath, config.targetFolder);
    if (archive.movePending) return false;
    await window.fiscalBridgeAPI.addDocument({
      ...doc,
      filePath: archive.filePath,
      unlinkPending: archive.unlinkPending,
      movePending: undefined,
    });
    return true;
  } catch (e) {
    console.error('[Cleanup] Failed to archive', doc && doc.filePath, e);
    return false;
  }
}

// Re-submit a document that previously failed transiently. Uses the stored
// invoice payload so the receipt is not re-read or re-parsed.
async function retryDocument(doc) {
  if (!doc.invoiceData || !doc.filePath) return;
  console.log('[Retry] Re-fiscalising', doc.invoiceData.invoiceNumber || doc.fileName);
  const result = await fiscalizeInvoice(doc.invoiceData);
  if (result.success) {
    const archive = config.targetFolder
      ? await moveToTarget(doc.filePath, config.targetFolder)
      : { filePath: doc.filePath };
    await window.fiscalBridgeAPI.addDocument({
      ...doc,
      filePath: archive.filePath,
      unlinkPending: archive.unlinkPending,
      movePending: archive.movePending || undefined,
      receiptNo: doc.invoiceData.invoiceNumber,
      amount: _totalFromItems(doc.invoiceData.items),
      currency: doc.invoiceData.currency || 'USD',
      status: 'fiscalised',
      fiscalCode: result.data?.fiscalCode,
      apiResponse: result.data,
      parseError: undefined,
    });
    showToast('Retried: ' + (doc.invoiceData.invoiceNumber || doc.fileName), 'success');
    if (config.printerName) await printFiscalReceipt(doc.invoiceData, result.data || {});
  } else {
    const is4xx = /4\d\d/.test(String(result.status || ''));
    await window.fiscalBridgeAPI.addDocument({
      ...doc,
      status: is4xx ? 'needs_review' : 'retrying',
      parseError: result.error,
      apiResponse: result.data,
    });
    if (is4xx) showToast('Needs review: ' + (doc.invoiceData.invoiceNumber || doc.fileName), 'error');
  }
}

// Startup/periodic recovery: queued and retrying records left behind by a crash
// or offline period would otherwise be skipped forever by the dedup check.
async function reconcileDocuments() {
  if (reconcilingDocs) return;
  reconcilingDocs = true;
  try {
    documents = await window.fiscalBridgeAPI.getDocuments() || [];
    if (config.apiEndpoint && config.apiKey) {
      const pending = documents.filter(d =>
        (d.status === 'retrying' || d.status === 'queued') && d.filePath
      );
      for (const doc of pending) {
        if (inFlightFiles.has(doc.filePath)) continue;
        const exists = await window.fiscalBridgeAPI.fileExists(doc.filePath);
        if (!exists) {
          await window.fiscalBridgeAPI.addDocument({
            ...doc,
            status: 'needs_review',
            parseError: 'Source file missing — cannot retry',
          });
          continue;
        }
        if (doc.invoiceData) {
          await retryDocument(doc);
        } else {
          await handleReceiptFile({
            filePath: doc.filePath,
            sourceFolder: config.sourceFolder,
            targetFolder: config.targetFolder,
          }, doc.id);
        }
      }
    }
    // Fiscalised receipts must not linger in the inbox
    for (const doc of documents) {
      if (doc.status !== 'fiscalised' || !doc.filePath) continue;
      const needsWork = doc.unlinkPending || doc.movePending ||
        (_isInFolder(doc.filePath, config.sourceFolder) && !_isInFolder(doc.filePath, config.targetFolder));
      if (!needsWork) continue;
      if (inFlightFiles.has(doc.filePath)) continue;
      if (doc.unlinkPending && inFlightFiles.has(doc.unlinkPending)) continue;
      await archiveStuckDocument(doc);
    }
  } catch (e) {
    console.error('[Retry] Reconciliation failed:', e);
  } finally {
    reconcilingDocs = false;
    await reloadDocuments();
  }
}

/** Map legacy ReceiptParser output → /api/zimra/transact schema */
function _legacyToFiscalSchema(d, cfg) {
  const vatRate = parseFloat(cfg.vatA || '0.155');
  const invoiceNumber = d.invoiceNumber || '';
  
  // Detect credit note: invoice number contains CR or CN
  const isCreditNote = /CR|CN/i.test(invoiceNumber);
  const invoiceFlag = isCreditNote ? '02' : '01';
  
  const items = (d.items || []).map(it => ({
    name:      it.itemName1 || it.itemCode || 'Item',
    quantity:  parseFloat(it.quantity) || 1,
    unitPrice: parseFloat(it.price)    || 0,
    taxType:   it.taxable === 'Exem' ? 'EXEMPT' : 'STANDARD',
    taxInclusive: (cfg.vatFlag === '1'),
    sku: it.itemCode !== '.' && it.itemCode !== '00000000' ? it.itemCode : undefined,
  }));
  return {
    items,
    invoiceNumber,
    currency: d.currency || 'USD',
    invoiceFlag,
    transactionType: isCreditNote ? 'CreditNote' : 'FiscalInvoice',
    ...(d.customerName ? { buyer: { name: d.customerName } } : {}),
  };
}

/** Sum excl line totals from fiscalise schema items (for display) */
function _totalFromItems(items) {
  return (items || []).reduce((s, it) => s + (it.quantity || 1) * (it.unitPrice || 0), 0).toFixed(2);
}


// ─── Core API (preserved) ─────────────────────────────────────────────────────
/** Build ITEMSXML for the RevMax transact endpoint from fiscalise-schema items. */
function _buildItemsXML(items) {
  const rows = (items || []).map(it => {
    const name = _escXml(it.name || it.description || 'Item');
    const qty  = parseFloat(it.quantity || 1).toFixed(2);
    const price = parseFloat(it.unitPrice || 0).toFixed(2);
    const taxRate = it.taxType === 'EXEMPT' ? 0 : (parseFloat(it.vatPct || 15));
    const lineTotal = (parseFloat(qty) * parseFloat(price)).toFixed(2);
    return `<ITEM><ITEMNAME1>${name}</ITEMNAME1><QTY>${qty}</QTY><PRICE>${price}</PRICE><TAXR>${taxRate}</TAXR><AMT>${lineTotal}</AMT>${it.sku ? `<ITEMCODE>${_escXml(it.sku)}</ITEMCODE>` : ''}</ITEM>`;
  }).join('');
  return `<ITEMS>${rows}</ITEMS>`;
}

/** Build CURRENCIES XML — at minimum, the invoice currency at rate 1. */
function _buildCurrenciesXML(currency) {
  return `<CurrenciesReceived><Currency><CURRENCY>${_escXml(currency || 'USD')}</CURRENCY><AMOUNT>1</AMOUNT><RATE>1</RATE></Currency></CurrenciesReceived>`;
}

function _escXml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function fiscalizeInvoice(invoiceData) {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  try {
    console.log(`[${timestamp}] [API] Fiscalizing: ${invoiceData.invoiceNumber}`);
    const items = invoiceData.items || [];
    const currency = invoiceData.currency || 'USD';
    
    // Detect credit note from invoice data
    const isCreditNote = invoiceData.transactionType === 'CreditNote' || /CR|CN/i.test(invoiceData.invoiceNumber || '');
    const invoiceFlag = isCreditNote ? '02' : '01';

    // Calculate totals from items (unitPrice is exclusive of tax)
    let netTotal = 0, taxTotal = 0;
    items.forEach(it => {
      const qty   = parseFloat(it.quantity || 1);
      const price = parseFloat(it.unitPrice || 0);
      const net   = qty * price;
      const rate  = it.taxType === 'EXEMPT' ? 0 : (parseFloat(it.vatPct || 15) / 100);
      netTotal  += net;
      taxTotal  += net * rate;
    });
    const invoiceAmount = (netTotal + taxTotal).toFixed(2);
    const invoiceTaxAmount = taxTotal.toFixed(2);

    const body = {
      CURRENCY:         currency,
      INVOICENUMBER:    invoiceData.invoiceNumber || '',
      INVOICEAMOUNT:    invoiceAmount,
      INVOICETAXAMOUNT: invoiceTaxAmount,
      INVOICEFLAG:      invoiceFlag,
      ITEMSXML:         _buildItemsXML(items),
      CURRENCIES:       _buildCurrenciesXML(currency),
      DATE:             new Date().toISOString(),
    };
    if (invoiceData.buyer?.name)     body.CUSTOMERNAME       = invoiceData.buyer.name;
    if (invoiceData.buyer?.vatNumber) body.CUSTOMERVATNUMBER  = invoiceData.buyer.vatNumber;
    if (invoiceData.buyer?.tin)       body.CUSTOMERTIN         = invoiceData.buyer.tin;

    const response = await fetch(`${config.apiEndpoint}/api/zimra/transact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey },
      body: JSON.stringify(body),
    });
    
    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      console.error(`[${timestamp}] [FAIL] Server returned non-JSON response: ${response.status}`);
      return { success: false, status: response.status, error: `Server returned ${response.status} ${response.statusText} \u2014 not JSON. Check your API endpoint.` };
    }
    const result = await response.json();
    // RevMax response: { Code, Message, QRcode, VerificationCode, Data: { receipt: { hash, qrCode, ... } } }
    const receipt = result.Data?.receipt || result.Data || {};
    const fiscalCode = receipt.hash || result.fiscalCode || '';
    const qrCode     = result.QRcode || receipt.qrCode || '';
    const verCode    = result.VerificationCode || receipt.verificationCode || '';
    const mapped = {
      fiscalCode,
      qrCode,
      verificationCode: verCode,
      receiptGlobalNo:  receipt.receiptGlobalNo,
      receiptCounter:   receipt.receiptCounter,
      fiscalDayNo:      result.FiscalDay || receipt.fiscalDayNo,
      message:           result.Message,
      raw:               result,
    };
    const ok = response.ok && (result.Code === '1' || result.Code === 1);
    if (ok) {
      console.log(`[${timestamp}] [OK] Invoice ${invoiceData.invoiceNumber} fiscalized online — $${invoiceAmount}`);
    } else {
      console.error(`[${timestamp}] [FAIL] Invoice ${invoiceData.invoiceNumber} — ${result.Message || 'API error'}`);
    }
    return ok
      ? { success: true, status: response.status, data: mapped }
      : { success: false, status: response.status, error: result.Message || 'API error', data: mapped };
  } catch (err) {
    console.error(`[${timestamp}] [FAIL] Invoice ${invoiceData.invoiceNumber} — ${err.message}`);
    return { success: false, status: 0, error: err.message };
  }
}

async function getDeviceStatus() {
  try {
    const response = await fetch(`${config.apiEndpoint}/api/zimra/device-status`, {
      headers: { 'x-api-key': config.apiKey },
    });
    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return { success: false, error: `Server returned ${response.status} ${response.statusText} \u2014 not JSON. Check your API endpoint in Settings.` };
    }
    const data = await response.json();
    return response.ok ? { success: true, data } : { success: false, error: data.message || `Error ${response.status}` };
  } catch (err) { return { success: false, error: err.message }; }
}

async function getCardDetails() {
  try {
    const response = await fetch(`${config.apiEndpoint}/api/zimra/device-details`, {
      headers: { 'x-api-key': config.apiKey },
    });
    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return { success: false, error: `Server returned ${response.status} ${response.statusText} \u2014 not JSON. Check your API endpoint in Settings.` };
    }
    const data = await response.json();
    return response.ok ? { success: true, data } : { success: false, error: data.message || `Error ${response.status}` };
  } catch (err) { return { success: false, error: err.message }; }
}

// (printFiscalReceipt is defined once, with the print templates further below.)

// ─── Parser Lab ───────────────────────────────────────────────────────────────
// ─── Parser Lab ───────────────────────────────────────────────────────────────
// In-memory draft of the currently-edited profile
let _draftProfile = null;
let _lastParseResult = null;  // for JSON output tab

function setupParserLab() {
  // Left tab toggle
  document.querySelectorAll('[data-ptab]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('[data-ptab]').forEach(x => x.classList.toggle('active', x===b));
      const isText = b.dataset.ptab === 'text';
      document.getElementById('ptab-text').style.display = isText ? 'flex' : 'none';
      document.getElementById('ptab-file').style.display = isText ? 'none' : 'block';
    });
  });
  // Right rule/output tab toggle
  document.querySelectorAll('[data-rtab]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('[data-rtab]').forEach(x => x.classList.toggle('active', x===b));
      ['rules','json','regression'].forEach(t => {
        const el = document.getElementById('rtab-' + t);
        if (el) el.style.display = b.dataset.rtab === t ? '' : 'none';
      });
    });
  });

  // Rules accordion toggle
  document.querySelectorAll('.rs-acc-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const acc = btn.closest('.rs-accordion');
      const body = acc.querySelector('.rs-acc-body');
      const isOpen = acc.classList.contains('open');
      acc.classList.toggle('open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
      body.style.display = isOpen ? 'none' : 'block';
    });
  });

  document.getElementById('loadTextBtn').addEventListener('click', () => {
    const raw = document.getElementById('parserRawText').value;

    if (!raw.trim()) { showToast('Paste some text first', 'warning'); return; }
    parseTextAndRender(raw);
  });

  document.getElementById('parserFileInput').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    parserCurrentFile = file.path;
    showToast('Loading file…', 'info');
    const r = await readTextFromFile(file.path);
    if (!r || !r.success) { showToast('Cannot read file', 'error'); return; }
    document.getElementById('parserRawText').value = r.text;
    parseTextAndRender(r.text);
  });

  document.getElementById('reRunParseBtn').addEventListener('click', () => {
    const text = document.getElementById('parserRawText').value;
    if (!text.trim()) { showToast('Load a file or paste text first','warning'); return; }
    parseTextAndRender(text);
  });

  document.getElementById('runLast20Btn').addEventListener('click', runOnLast20);
  document.getElementById('saveProfileVersionBtn').addEventListener('click', saveProfileVersion);

  document.getElementById('newProfileBtn').addEventListener('click', () => {
    _draftProfile = _blankProfile();
    applyProfileToForm(_draftProfile);
    document.getElementById('parserProfile').value = '';
    document.getElementById('profileVersionBadge').textContent = 'New';
    showToast('Blank profile created — edit rules then Save Version', 'info');
  });

  document.getElementById('dupProfileBtn').addEventListener('click', async () => {
    const p = profileFromForm();
    if (!p.id) { showToast('Select a profile to duplicate first','warning'); return; }
    p.id = p.id + '-copy';
    p.name = (p.name || p.id) + ' (Copy)';
    delete p.version;
    _draftProfile = p;
    applyProfileToForm(p);
    showToast('Duplicated – edit then Save Version', 'info');
  });

  document.getElementById('importProfileBtn').addEventListener('click', async () => {
    const r = await window.fiscalBridgeAPI.importProfileFile();
    if (!r || !r.success) { showToast(r?.error || 'Import cancelled','warning'); return; }
    await _reloadProfileList(r.profile.id);
    showToast('Profile imported: ' + r.profile.name, 'success');
  });

  document.getElementById('exportProfileBtn').addEventListener('click', async () => {
    const p = profileFromForm();
    if (!p.id) { showToast('No profile selected','warning'); return; }
    const r = await window.fiscalBridgeAPI.exportProfileFile(p.id, p.version);
    if (r?.success) showToast('Exported to ' + r.path, 'success');
    else showToast(r?.error || 'Export failed','error');
  });

  document.getElementById('delProfileBtn').addEventListener('click', async () => {
    const p = profileFromForm();
    if (!p.id) { showToast('No profile selected','warning'); return; }
    const ok = await showConfirm(`Delete all versions of "${p.name||p.id}"?`);
    if (!ok) return;
    await window.fiscalBridgeAPI.deleteProfile(p.id);
    await _reloadProfileList(null);
    showToast('Profile deleted','info');
  });

  document.getElementById('parserProfile').addEventListener('change', async e => {
    const id = e.target.value;
    if (!id) return;
    const r = await window.fiscalBridgeAPI.getProfile(id);
    if (r && r.success) { _draftProfile = r.profile; applyProfileToForm(r.profile); }
  });

  document.getElementById('addFingerprintBtn').addEventListener('click', () => {
    _addFingerprintRow({ type: 'text_contains', value: '' });
  });
  document.getElementById('addHeaderFieldBtn').addEventListener('click', () => {
    _addHeaderFieldRow({ name: '', label: '', type: 'string', required: false });
  });
  document.getElementById('addTotalsLabelBtn').addEventListener('click', () => {
    _addTotalLabelRow('', '');
  });

  document.getElementById('loadFailedBtn').addEventListener('click', async () => {
    const sel = document.getElementById('failedFilesSelect');
    const id = sel.value;
    if (!id) { showToast('Pick a file first','warning'); return; }
    const doc = documents.find(d => d.id == id);
    if (!doc || !doc.filePath) { showToast('No file path for this record','error'); return; }
    parserCurrentFile = doc.filePath;
    const r = await readTextFromFile(doc.filePath);
    if (!r.success) { showToast('Cannot read file','error'); return; }
    document.getElementById('parserRawText').value = r.text;
    parseTextAndRender(r.text);
    document.getElementById('reprocessFileBtn').dataset.docId = id;
    document.getElementById('reprocessFileBtn').style.display = '';
    showPage('parser');
  });

  document.getElementById('reprocessFileBtn').addEventListener('click', async () => {
    const id = document.getElementById('reprocessFileBtn').dataset.docId;
    await handleReParse(id);
  });

  document.getElementById('copyJsonBtn').addEventListener('click', () => {
    if (_lastParseResult) {
      navigator.clipboard.writeText(JSON.stringify(_lastParseResult, null, 2));
      showToast('Copied to clipboard','success');
    }
  });

  // Line role popover
  document.getElementById('linePopover').querySelectorAll('.popover-item').forEach(item => {
    item.addEventListener('click', () => applyLineRole(item.dataset.role));
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#linePopover') && !e.target.closest('.text-line')) {
      document.getElementById('linePopover').classList.remove('open');
    }
  });

  // Live re-run on rule change (debounced)
  ['pl-start','pl-end','pl-dot','pl-multi','pl-vata','pl-vate','pl-colmap','pl-skip',
   'pl-currencyIso','pl-dateFormat','pe-engine'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', debounce(() => {
      const text = document.getElementById('parserRawText').value;
      if (text.trim()) runParseLive(text);
    }, 500));
  });

  // Load profile list on boot
  _reloadProfileList(null);
}

async function _reloadProfileList(selectId) {
  const r = await window.fiscalBridgeAPI.listProfiles();
  const profiles = (r && r.success) ? r.profiles : [];
  const sel = document.getElementById('parserProfile');
  sel.innerHTML = '<option value="">— select profile —</option>' +
    profiles.map(p => `<option value="${esc(p.id)}">${esc(p.name || p.id)}</option>`).join('');

  if (selectId) {
    sel.value = selectId;
    const chosen = profiles.find(p => p.id === selectId);
    if (chosen) { _draftProfile = chosen; applyProfileToForm(chosen); }
  } else if (profiles.length) {
    sel.value = profiles[0].id;
    _draftProfile = profiles[0];
    applyProfileToForm(profiles[0]);
  }

  // Populate failed files dropdown
  const failedSel = document.getElementById('failedFilesSelect');
  const failed = documents.filter(d => d.status === 'needs_review');
  failedSel.innerHTML = '<option value="">— pick a file —</option>' +
    failed.map(d => `<option value="${d.id}">${esc(d.fileName||d.id)}</option>`).join('');
}

function _blankProfile() {
  return {
    id: 'new-profile-' + Date.now(),
    name: 'New Profile',
    system: '',
    priority: 5,
    detection: [],
    extraction: { engine: 'layout', page_range: 'all' },
    locale: { decimal_sep:'.', thousands_sep:',', currency_iso:'USD', currency_symbol:'$', date_format:'DD/MM/YYYY' },
    header_fields: [],
    parties: { supplier:{anchor:'',lines:4}, customer:{anchor:'',lines:4} },
    bank: { start_marker:'BANKING DETAILS' },
    line_items: { start_marker:'', start_line_offset:1, end_marker:'', item_dot_counter:2, multiline_products:'no', column_map:['description','qty','unit_price_excl','disc_pct','vat_pct','total_excl','total_incl'], code_split:{separator:' - ',position:'first'}, skip_patterns:[] },
    tax: { vat_standard_pct:15, vat_exempt_pct:0, price_basis:'exclusive' },
    totals: { label_map:{} },
    validation: { tolerance:0.02, checks:[{id:'lines_excl_sum',severity:'fail'},{id:'excl_plus_vat',severity:'fail'}], required_fields:['invoice_number','date','grand_total'] },
    post_processing: [{field:'description',op:'trim'},{field:'description',op:'collapse_spaces'}],
  };
}

// ── Form → profile ────────────────────────────────────────────────────────────
function profileFromForm() {
  const g = id => document.getElementById(id);
  const v = id => g(id) ? g(id).value.trim() : '';

  // Fingerprints
  const detection = [];
  document.querySelectorAll('#fingerprintList .fp-row').forEach(row => {
    const type  = row.querySelector('.fp-type')?.value  || 'text_contains';
    const value = row.querySelector('.fp-value')?.value || '';
    if (value) detection.push({ type, value });
  });

  // Header fields
  const header_fields = [];
  document.querySelectorAll('#headerFieldList .hf-row').forEach(row => {
    const name = row.querySelector('.hf-name')?.value.trim();
    const label= row.querySelector('.hf-label')?.value.trim();
    const type = row.querySelector('.hf-type')?.value || 'string';
    const req  = row.querySelector('.hf-req')?.checked || false;
    if (name) header_fields.push({ name, label, type, required: req });
  });

  // Totals label map
  const label_map = {};
  document.querySelectorAll('#totalsLabelList .tl-row').forEach(row => {
    const lbl  = row.querySelector('.tl-label')?.value.trim();
    const field= row.querySelector('.tl-field')?.value.trim();
    if (lbl && field) label_map[lbl] = field;
  });

  const colmap = v('pl-colmap').split(',').map(s=>s.trim()).filter(Boolean);
  const skip   = v('pl-skip').split(',').map(s=>s.trim()).filter(Boolean);

  return {
    id:       v('profileIdInput')   || _draftProfile?.id   || 'profile-' + Date.now(),
    name:     v('profileNameInput') || _draftProfile?.name || 'Profile',
    version:  _draftProfile?.version,
    system:   '',
    priority: 5,
    detection,
    extraction: { engine: v('pe-engine') || 'layout', page_range: v('pe-pageRange') || 'all' },
    locale: {
      decimal_sep:     v('pl-decSep')      || '.',
      thousands_sep:   v('pl-thouSep')     || ',',
      currency_iso:    v('pl-currencyIso') || 'USD',
      currency_symbol: v('pl-currencySym') || '',
      date_format:     v('pl-dateFormat')  || 'DD/MM/YYYY',
    },
    header_fields,
    parties: {
      supplier: { anchor: v('pp-supAnchor'),    lines: parseInt(v('pp-supLines'))||4 },
      customer: { anchor: v('pp-custAnchor'),   anchor_bottom: v('pp-custAnchorBot')||undefined, lines: parseInt(v('pp-custLines'))||4 },
    },
    bank: { start_marker: v('pb-bankStart') || 'BANKING DETAILS' },
    line_items: {
      start_marker:       v('pl-start'),
      start_line_offset:  parseInt(v('pl-startOffset'))||1,
      end_marker:         v('pl-end'),
      item_dot_counter:   parseInt(v('pl-dot'))||2,
      multiline_products: v('pl-multi') || 'no',
      column_map:         colmap.length ? colmap : ['description','qty','unit_price_excl','disc_pct','vat_pct','total_excl','total_incl'],
      code_split: { separator: v('pl-codeSplit') || ' - ', position: 'first' },
      skip_patterns: skip,
    },
    tax: {
      ...((typeof _draftProfile !== 'undefined' && _draftProfile && _draftProfile.tax) || {}),
      vat_standard_pct: parseFloat(v('pl-vata'))||15,
      vat_exempt_pct:   parseFloat(v('pl-vate'))||0,
      price_basis:      v('pl-priceBasis') || 'exclusive',
    },
    totals: { label_map },
    validation: {
      tolerance: parseFloat(v('pv-tol'))||0.02,
      checks: [
        { id:'lines_excl_sum', severity:'fail' },
        { id:'excl_plus_vat',  severity:'fail' },
        { id:'lines_incl_sum', severity:'warn' },
        { id:'allowed_vat_rates', severity:'warn', rates:[0, parseFloat(v('pl-vata'))||15] },
      ],
      required_fields: v('pv-required').split(',').map(s=>s.trim()).filter(Boolean),
    },
    post_processing: [
      { field:'description', op:'trim' },
      { field:'description', op:'collapse_spaces' },
    ],
  };
}

// ── Profile → form ────────────────────────────────────────────────────────────
function applyProfileToForm(p) {
  if (!p) return;
  const s = (id, val) => { const el=document.getElementById(id); if(el && val!==undefined && val!==null) el.value=val; };
  const locale = p.locale || {};
  const items  = p.line_items || {};
  const tax    = p.tax || {};

  s('profileNameInput', p.name || '');
  s('profileIdInput',   p.id   || '');
  document.getElementById('profileVersionBadge').textContent = p.version ? `v${p.version}` : '';

  // Detection
  const fpList = document.getElementById('fingerprintList');
  fpList.innerHTML = '';
  (p.detection || []).forEach(fp => _addFingerprintRow(fp));

  // Extraction
  s('pe-engine',    (p.extraction||{}).engine     || 'layout');
  s('pe-pageRange', (p.extraction||{}).page_range || 'all');

  // Locale
  s('pl-currencyIso', locale.currency_iso    || '');
  s('pl-currencySym', locale.currency_symbol || '');
  s('pl-dateFormat',  locale.date_format     || 'DD/MM/YYYY');
  s('pl-decSep',      locale.decimal_sep     || '.');
  s('pl-thouSep',     locale.thousands_sep   || ',');

  // Header fields
  const hfList = document.getElementById('headerFieldList');
  hfList.innerHTML = '';
  (p.header_fields || []).forEach(f => _addHeaderFieldRow(f));

  // Parties
  const sup  = (p.parties||{}).supplier || {};
  const cust = (p.parties||{}).customer || {};
  s('pp-supAnchor',    sup.anchor  || '');
  s('pp-supLines',     sup.lines   || 4);
  s('pp-custAnchor',   cust.anchor || '');
  s('pp-custAnchorBot',cust.anchor_bottom || '');
  s('pp-custLines',    cust.lines  || 4);

  // Line items
  s('pl-start',       items.start_marker       || '');
  s('pl-startOffset', items.start_line_offset  || 1);
  s('pl-end',         items.end_marker         || '');
  s('pl-dot',         items.item_dot_counter   ?? 2);
  s('pl-multi',       items.multiline_products || 'no');
  s('pl-colmap',      (items.column_map || []).join(', '));
  s('pl-codeSplit',   (items.code_split||{}).separator || ' - ');
  s('pl-skip',        (items.skip_patterns||[]).join(', '));

  // Tax
  s('pl-vata',       tax.vat_standard_pct ?? 15);
  s('pl-vate',       tax.vat_exempt_pct   ?? 0);
  s('pl-priceBasis', tax.price_basis      || 'exclusive');

  // Totals
  const tlList = document.getElementById('totalsLabelList');
  tlList.innerHTML = '';
  Object.entries((p.totals||{}).label_map||{}).forEach(([lbl,fld]) => _addTotalLabelRow(lbl,fld));

  // Bank
  s('pb-bankStart', (p.bank||{}).start_marker || 'BANKING DETAILS');

  // Validation
  s('pv-tol',      (p.validation||{}).tolerance || 0.02);
  s('pv-required', ((p.validation||{}).required_fields||[]).join(', '));
}

// ── Dynamic row builders ──────────────────────────────────────────────────────
function _addFingerprintRow(fp) {
  const row = document.createElement('div');
  row.className = 'fp-row flex items-center gap-2';
  row.innerHTML = `
    <select class="fp-type" style="width:140px;">
      <option value="text_contains">text_contains</option>
      <option value="text_contains_ci">text_contains_ci</option>
      <option value="regex">regex</option>
    </select>
    <input class="fp-value" type="text" value="${esc(fp.value||fp.pattern||'')}" placeholder="Pattern" style="flex:1;">
    <button class="btn-danger btn-sm" onclick="this.closest('.fp-row').remove()">✕</button>`;
  row.querySelector('.fp-type').value = fp.type || 'text_contains';
  document.getElementById('fingerprintList').appendChild(row);
}

function _addHeaderFieldRow(f) {
  const row = document.createElement('div');
  row.className = 'hf-row flex items-center gap-2';
  row.style.flexWrap = 'wrap';
  row.innerHTML = `
    <input class="hf-name"  type="text" value="${esc(f.name||'')}"  placeholder="field_name"  style="width:130px;">
    <input class="hf-label" type="text" value="${esc(f.label||f.label_regex||'')}" placeholder="Label:"  style="width:130px;">
    <select class="hf-type" style="width:90px;">
      <option value="string">string</option><option value="date">date</option>
      <option value="money">money</option><option value="percent">percent</option>
    </select>
    <label style="font-size:.75rem;cursor:pointer;"><input class="hf-req" type="checkbox" ${f.required?'checked':''} style="width:auto;margin-right:3px;">Required</label>
    <button class="btn-danger btn-sm" onclick="this.closest('.hf-row').remove()">✕</button>`;
  row.querySelector('.hf-type').value = f.type || 'string';
  document.getElementById('headerFieldList').appendChild(row);
}

function _addTotalLabelRow(lbl, field) {
  const row = document.createElement('div');
  row.className = 'tl-row flex items-center gap-2';
  row.innerHTML = `
    <input class="tl-label" type="text" value="${esc(lbl)}"  placeholder="Label on invoice" style="flex:1;">
    <select class="tl-field" style="width:160px;">
      <option value="total_excl">total_excl</option><option value="vat">vat</option>
      <option value="sub_total">sub_total</option><option value="rounding">rounding</option>
      <option value="grand_total">grand_total</option><option value="balance_due">balance_due</option>
    </select>
    <button class="btn-danger btn-sm" onclick="this.closest('.tl-row').remove()">✕</button>`;
  if (field) row.querySelector('.tl-field').value = field;
  document.getElementById('totalsLabelList').appendChild(row);
}

// ── Parse & render ────────────────────────────────────────────────────────────
function parseTextAndRender(text) {
  parserLines = text.split('\n');
  renderTextLines();
  runParseLive(text);
}

function renderTextLines() {
  const container = document.getElementById('parserTextLines');
  const p = profileFromForm();
  const startMarker = (p.line_items||{}).start_marker || '';
  const endMarker   = (p.line_items||{}).end_marker   || '';
  const dotN        = (p.line_items||{}).item_dot_counter ?? 2;
  // Build role map from markers
  let inItems = false;
  const autoRoles = {};
  parserLines.forEach((line, i) => {
    if (lineRoles[i]) { autoRoles[i] = lineRoles[i]; return; }
    if (startMarker && new RegExp(startMarker,'i').test(line)) { autoRoles[i] = 'role-start'; inItems = true; return; }
    if (endMarker   && new RegExp(endMarker,'i').test(line)  ) { autoRoles[i] = 'role-end';   inItems = false; return; }
    if (inItems) {
      const dots = (line.match(/\d+\.\d{2,}/g)||[]).length;
      if (dots >= dotN) autoRoles[i] = 'role-item';
    }
    const ltrim = line.trim().toUpperCase();
    if (/^(GRAND TOTAL|TOTAL:|BALANCE DUE|SUB.?TOTAL)/i.test(ltrim)) autoRoles[i] = 'role-total';
    if (/VAT/i.test(ltrim) && (line.match(/\d+\.\d{2}/g)||[]).length >= 1) autoRoles[i] = 'role-vat';
  });

  container.innerHTML = parserLines.map((line, i) => {
    const role = autoRoles[i] || '';
    return `<div class="text-line ${role}" data-ln="${i}">
      <span class="line-num">${i+1}</span>
      <span class="line-content">${esc(line)||'&nbsp;'}</span>
    </div>`;
  }).join('');
  container.querySelectorAll('.text-line').forEach(el => {
    el.addEventListener('click', e => { _popoverTarget = parseInt(el.dataset.ln); showLinePopover(e.clientX, e.clientY); });
  });
}

function showLinePopover(x, y) {
  const pop = document.getElementById('linePopover');
  pop.style.left = x + 'px';
  pop.style.top  = y + 'px';
  pop.classList.add('open');
}

function applyLineRole(role) {
  document.getElementById('linePopover').classList.remove('open');
  if (_popoverTarget === null) return;
  const idx = _popoverTarget;
  const line = parserLines[idx] || '';
  if (role === 'role-start') document.getElementById('pl-start').value = line.trim();
  if (role === 'role-end')   document.getElementById('pl-end').value   = line.trim();
  if (role === 'role-skip') {
    const skipEl = document.getElementById('pl-skip');
    const cur = skipEl.value.trim();
    skipEl.value = cur ? cur + ', ' + line.trim() : line.trim();
  }
  lineRoles[idx] = role;
  renderTextLines();
  runParseLive(document.getElementById('parserRawText').value || parserLines.join('\n'));
}

async function runParseLive(text) {
  const p = profileFromForm();
  try {
    // Send the draft profile object inline so unsaved edits are previewed live.
    const r = await window.fiscalBridgeAPI.parseText(text, p, null);
    const result = r?.result || null;
    if (!result) {
      document.getElementById('plr-itemCount').textContent = '✕ ' + (r?.error || 'Parse failed');
      return;
    }
    _lastParseResult = result;
    renderParsedItems(result);
    renderValidation(result);
    renderJsonOutput(result);
  } catch(e) {
    document.getElementById('plr-itemCount').textContent = '✕ Error: ' + e.message;
  }
}

function renderParsedItems(result) {
  const items = (result && result.line_items) || [];
  const tbody = document.getElementById('parsedItemsTbody');
  const cntEl = document.getElementById('plr-itemCount');
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:16px"><p>No items parsed yet.</p></div></td></tr>`;
    if (cntEl) cntEl.textContent = '0 items';
    return;
  }
  if (cntEl) cntEl.textContent = `✓ ${items.length} item${items.length>1?'s':''}`;
  tbody.innerHTML = items.map((item,i) => `
    <tr>
      <td>${i+1}</td>
      <td>${esc(item.code||'—')}</td>
      <td>${esc(item.description||'—')}</td>
      <td>${item.quantity??item.qty??1}</td>
      <td class="td-mono">${(item.unit_price_excl??item.unitPrice??0).toFixed(2)}</td>
      <td>${item.vat_pct??item.vatPct??'—'}</td>
      <td class="td-mono">${(item.total_excl??item.totalExcl??0).toFixed(2)}</td>
      <td class="td-mono">${(item.total_incl??item.totalIncl??0).toFixed(2)}</td>
    </tr>`).join('');
}

function renderValidation(result) {
  const pill = document.getElementById('parseValidationPill');
  const box  = document.getElementById('whyFailedBox');
  if (!result) {
    pill.innerHTML = `<span class="pill pill-warn">No parse result</span>`;
    box.style.display = 'none';
    return;
  }
  const warns = result.validation_warnings || [];
  const fails = warns.filter(w => w.severity === 'fail');
  const conf  = ((result.confidence||0)*100).toFixed(0);
  if (!fails.length) {
    pill.innerHTML = `<span class="pill pill-ok">✓ Valid &nbsp;·&nbsp; Confidence ${conf}%</span>`;
    box.style.display = 'none';
  } else {
    pill.innerHTML = `<span class="pill pill-fail">✕ ${fails.length} issue${fails.length>1?'s':''} &nbsp;·&nbsp; Confidence ${conf}%</span>`;
    box.innerHTML = `<strong>Issues</strong><ul style="margin:4px 0 0 14px">${warns.map(w=>`<li class="${w.severity==='fail'?'text-danger':''}">${esc(w.id)}: ${esc(w.message)}</li>`).join('')}</ul>`;
    box.style.display = '';
  }
}

function renderJsonOutput(result) {
  const pre  = document.getElementById('parseJsonOutput');
  const conf = document.getElementById('confidencePill');
  if (!result) { if(pre) pre.textContent = '{}'; return; }
  if (pre) pre.textContent = JSON.stringify(result, null, 2);
  if (conf) {
    const pct = ((result.confidence||0)*100).toFixed(0);
    conf.textContent = `Confidence: ${pct}%`;
    conf.style.background = pct >= 80 ? 'var(--primary)' : pct >= 50 ? '#b45309' : 'var(--danger)';
    conf.style.color = '#fff';
  }
}

async function runOnLast20() {
  const last20 = documents.slice(0, 20);
  if (!last20.length) { showToast('No documents in store yet','warning'); return; }
  showToast('Running parser on last 20 files…','info');
  const p = profileFromForm();
  let pass = 0, fail = 0, rows = [];
  for (const doc of last20) {
    try {
      if (!doc.filePath) { fail++; rows.push({name:doc.fileName||doc.id,status:'no path'}); continue; }
      const r = await readTextFromFile(doc.filePath);
      if (!r.success) { fail++; rows.push({name:doc.fileName,status:'read error'}); continue; }
      const pr = await window.fiscalBridgeAPI.parseText(r.text, p.id);
      const res = pr?.result;
      const ok = res && res.line_items && res.line_items.length > 0 && !res.validation_warnings?.some(w=>w.severity==='fail');
      if (ok) { pass++; rows.push({name:doc.fileName,status:'pass',items:res.line_items.length,conf:res.confidence}); }
      else { fail++; rows.push({name:doc.fileName,status:'fail',warns:(res?.validation_warnings||[]).map(w=>w.message).join('; ')}); }
    } catch(e) { fail++; rows.push({name:doc.fileName,status:'error',warns:e.message}); }
  }
  // Switch to regression tab
  document.querySelector('[data-rtab="regression"]')?.click();
  const el = document.getElementById('last20Result');
  el.innerHTML = `<div style="margin-bottom:8px;font-size:.78rem;color:var(--ink-muted)">
    <strong style="color:var(--primary)">${pass} passed</strong> / <strong style="color:var(--danger)">${fail} failed</strong> of ${rows.length} files</div>
  <div class="table-wrap"><table>
    <thead><tr><th>File</th><th>Status</th><th>Items</th><th>Confidence</th><th>Notes</th></tr></thead>
    <tbody>${rows.map(r=>`<tr>
      <td style="font-family:monospace;font-size:.72rem">${esc(r.name||'?')}</td>
      <td><span class="pill ${r.status==='pass'?'pill-ok':'pill-fail'}">${r.status}</span></td>
      <td>${r.items||'—'}</td>
      <td>${r.conf!=null?((r.conf*100).toFixed(0)+'%'):'—'}</td>
      <td style="font-size:.72rem;color:var(--danger)">${esc(r.warns||'')}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

async function saveProfileVersion() {
  const p = profileFromForm();
  if (!p.id || !p.name) { showToast('Set a profile name and ID first','warning'); return; }
  const r = await window.fiscalBridgeAPI.saveProfile(p);
  if (r && r.success) {
    _draftProfile = r.profile;
    await _reloadProfileList(r.profile.id);
    showToast(`Saved ${r.profile.name} v${r.profile.version}`,'success');
  } else {
    showToast('Save failed: ' + (r?.error||'unknown'),'error');
  }
}

// Legacy stubs kept for compatibility
function populateParserProfiles() { _reloadProfileList(null); }
function rulesFromForm() { return profileFromForm(); }
let _popoverTarget = null;
function openParserWithFile(docId) {
  const doc = documents.find(d=>d.id==docId);
  if (!doc) return;
  document.getElementById('failedFilesSelect').value = docId;
  showPage('parser');
}

// ─── Fiscal Device ─────────────────────────────────────────────────────────────
function setupFiscalDevice() {
  document.getElementById('refreshDeviceBtn').addEventListener('click', loadFiscalDevice);
  document.getElementById('runConnTestBtn').addEventListener('click', runConnectionTest);
  document.getElementById('loadCardDetailsBtn').addEventListener('click', loadCardDetails);
  document.querySelectorAll('[data-ftab]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('[data-ftab]').forEach(x=>x.classList.toggle('active',x===b));
      document.getElementById('ftab-status').style.display = b.dataset.ftab==='status'?'':'none';
      document.getElementById('ftab-card').style.display   = b.dataset.ftab==='card'  ?'':'none';
    });
  });
}

async function loadFiscalDevice() {
  const grid   = document.getElementById('fiscalDeviceGrid');
  const errEl  = document.getElementById('fiscalErrorState');
  grid.innerHTML = '<div class="skeleton skeleton-text" style="height:40px;grid-column:span 2"></div>';
  errEl.style.display = 'none';
  try {
    const r = await getDeviceStatus();
    const fc = await window.fiscalBridgeAPI.getFiscalConfig();
    // Also fetch device-details for TIN, company name, etc.
    let cardData = {};
    try { const cr = await getCardDetails(); if (cr.success) cardData = cr.data?.Data || cr.data || {}; } catch {}
    if (r.success) {
      // RevMax response: { Code, Message, DeviceID, DeviceSerialNumber, FiscalDay, Data: { fiscalDayStatus, ... } }
      const d = r.data?.Data || r.data || {};
      const merged = {
        ...fc,
        deviceId:           r.data?.DeviceID || cardData.REGISTRATIONNUMBER || fc.deviceId,
        deviceSerialNumber: r.data?.DeviceSerialNumber || cardData.SERIALNUMBER || fc.deviceSerialNumber,
        fiscalDayNo:        r.data?.FiscalDay || d.lastFiscalDayNo || fc.fiscalDayNo,
        fiscalDayStatus:    d.fiscalDayStatus || fc.fiscalDayStatus,
        receiptGlobalNo:    d.lastReceiptGlobalNo ?? fc.receiptGlobalNo,
        receiptCounter:     fc.receiptCounter,
        previousReceiptHash: fc.previousReceiptHash,
        environment:        fc.zimraEnvironment || fc.environment,
        branchName:         cardData.COMPANYNAME || fc.companyName,
        tin:                cardData.TIN || fc.tin,
        vatNumber:          cardData.VAT || fc.vatNumber,
      };
      Object.assign(config, merged);
      const fields = [
        ['Device ID',         merged.deviceId || '—'],
        ['Serial Number',     merged.deviceSerialNumber || '—'],
        ['Company',           merged.branchName || '—'],
        ['TIN',               merged.tin || '—'],
        ['Status',            merged.fiscalDayStatus || '—'],
        ['Fiscal Day No.',    merged.fiscalDayNo || '—'],
        ['Receipt Counter',   merged.receiptCounter ?? '—'],
        ['Global Receipt No.', merged.receiptGlobalNo ?? '—'],
        ['Last Hash',         merged.previousReceiptHash ? String(merged.previousReceiptHash).slice(0,16) + '…' : '—'],
        ['Environment',       merged.environment || '—'],
      ];
      grid.innerHTML = fields.map(([k,v])=>`
        <div style="padding:8px 0;border-bottom:1px solid var(--table-divider)">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-muted)">${esc(k)}</div>
          <div class="mono" style="margin-top:3px;font-size:.85rem">${esc(String(v))}</div>
        </div>`).join('');
      updateDeviceChip();
    } else {
      grid.innerHTML = '';
      errEl.innerHTML = `<strong>Error</strong> ${esc(r.error||'Unknown error')}<br><small style="opacity:.7">Check your API endpoint and key in Settings → Connection.</small>`;
      errEl.style.display = '';
    }
  } catch(e) {
    grid.innerHTML = '';
    errEl.innerHTML = `<strong>Exception</strong> ${esc(e.message)}`;
    errEl.style.display = '';
  }
}

async function loadCardDetails() {
  const el = document.getElementById('cardDetailsContent');
  el.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
  const r = await getCardDetails();
  if (r.success) {
    // RevMax response: outer { Code, Message, Data: { TIN, VAT, COMPANYNAME, ... } }
    const d = r.data?.Data || r.data || {};
    const labels = {
      TIN: 'TIN', BPN: 'Business Partner No.', VAT: 'VAT Number',
      COMPANYNAME: 'Company Name', ADDRESS: 'Address',
      REGISTRATIONNUMBER: 'Device Registration No.', SERIALNUMBER: 'Device Serial No.'
    };
    el.innerHTML = '<dl style="display:grid;grid-template-columns:160px 1fr;gap:8px;font-size:.85rem">'+
      Object.entries(d).map(([k,v])=>`<dt style="color:var(--ink-muted)">${esc(labels[k]||k)}</dt><dd class="mono">${esc(String(v))}</dd>`).join('')+'</dl>';
  } else {
    el.innerHTML = `<div class="why-failed-callout"><strong>Error</strong> ${esc(r.error)}</div>`;
  }
}

async function runConnectionTest() {
  showToast('Testing connection…','info');
  const r = await getDeviceStatus();
  if (r.success) { showToast('Connection OK – device ID: '+(r.data?.DeviceID||r.data?.deviceId||'ok'), 'success'); }
  else           { showToast('Connection failed: '+r.error, 'error'); }
  loadFiscalDevice();
}

// ─── Day Close ────────────────────────────────────────────────────────────────
let dcCurrentStep = 1;
function setupDayClose() {
  document.getElementById('dcRunChecksBtn').addEventListener('click', runDayClosePreChecks);
  document.getElementById('dcOpenDayBtn').addEventListener('click', handleOpenFiscalDay);
  document.getElementById('dcBackBtn').addEventListener('click', () => goToDCStep(dcCurrentStep - 1));
  document.querySelectorAll('input[name="dcOption"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('dcConfirmCloseBtn').disabled = false;
    });
  });
  document.getElementById('dcConfirmCloseBtn').addEventListener('click', submitDayClose);
  document.getElementById('dcOpenNextBtn').addEventListener('click', handleOpenFiscalDay);
  document.getElementById('dcDownloadZBtn').addEventListener('click', downloadZReport);
  document.getElementById('dcPrintZBtn').addEventListener('click', () => {
    const html = document.getElementById('dcResultContent').innerHTML;
    window.fiscalBridgeAPI.printReceipt(`<html><body style="font-family:monospace;padding:12px">${html}</body></html>`, config.printerName);
    showToast('Printing Z-Report…', 'info');
  });
}

function goToDCStep(step) {
  if (step < 1 || step > 4) return;
  dcCurrentStep = step;
  document.querySelectorAll('.day-step').forEach(el => el.classList.toggle('active', el.id === 'dc-step-' + step));
  document.querySelectorAll('[data-dcstep]').forEach(node => {
    const n = parseInt(node.dataset.dcstep);
    node.classList.toggle('active', n === step);
    node.classList.toggle('done', n < step);
  });
}

async function runDayClosePreChecks() {
  const btn = document.getElementById('dcRunChecksBtn');
  btn.textContent = 'Checking…'; btn.disabled = true;
  const list = document.getElementById('dcPrechecksList');
  const queued   = documents.filter(d => d.status === 'queued' || d.status === 'retrying').length;
  const reviewed = documents.filter(d => d.status === 'needs_review').length;
  let fdmsOk = false, fdmsLabel = 'Checking…';
  try {
    const dr = await getDeviceStatus();
    fdmsOk = !!dr.success;
    if (dr.success) {
      // RevMax: { Code, Message, DeviceID, Data: { fiscalDayStatus, lastFiscalDayNo, ... } }
      const status = dr.data?.Data?.fiscalDayStatus || dr.data?.fiscalDayStatus || '';
      fdmsLabel = status === 'FiscalDayOpened' ? 'Open' : status === 'FiscalDayClosed' ? 'Closed' : (status || 'OK');
      if (dr.data?.Data) Object.assign(config, dr.data.Data);
      if (dr.data?.DeviceID) config.deviceId = dr.data.DeviceID;
      if (dr.data?.FiscalDay) config.fiscalDayNo = dr.data.FiscalDay;
    } else {
      fdmsLabel = dr.error || 'Error';
    }
  } catch {}
  btn.textContent = 'Re-check'; btn.disabled = false;

  const checks = [
    { label:'FDMS connection',        ok: fdmsOk,       detail: fdmsLabel },
    { label:'Fiscal day is open',     ok: config.fiscalDayStatus==='FiscalDayOpen', detail: config.fiscalDayStatus||'Unknown' },
    { label:'All files fiscalised',   ok: queued === 0, detail: queued === 0 ? 'OK' : `${queued} still pending` },
    { label:'No files needing review',ok: reviewed === 0,detail: reviewed === 0 ? 'OK' : `${reviewed} file(s)` },
  ];
  const allOk = checks.every(c => c.ok);
  list.innerHTML = checks.map(c => `
    <li class="precheck-item">
      <span class="precheck-icon ${c.ok ? 'ok' : 'fail'}">${c.ok ? '✓' : '✕'}</span>
      <div class="precheck-desc"><strong>${esc(c.label)}</strong><span>${esc(c.detail)}</span></div>
    </li>`).join('');
  if (allOk) {
    list.innerHTML += `<li class="precheck-item"><span class="precheck-icon ok">✓</span><div class="precheck-desc"><strong>All checks passed</strong><span>Ready to close.</span></div></li>`;
  }
  renderDaySummary();
  goToDCStep(2);
}

function renderDaySummary() {
  const totalByCurrency = {};
  const countByStatus = { fiscalised:0, queued:0, retrying:0, needs_review:0 };
  documents.forEach(d => {
    if (countByStatus[d.status] !== undefined) countByStatus[d.status]++;
    if (d.status === 'fiscalised') {
      const c = d.currency || 'USD';
      totalByCurrency[c] = (totalByCurrency[c]||0) + (parseFloat(d.amount)||0);
    }
  });
  const fc = config;
  document.getElementById('dcSummaryContent').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div class="card" style="text-align:center"><div class="kpi-label">Fiscalised</div><div class="kpi-value" style="font-size:1.4rem">${countByStatus.fiscalised}</div></div>
      <div class="card" style="text-align:center"><div class="kpi-label">Pending/Retry</div><div class="kpi-value" style="font-size:1.4rem;${countByStatus.queued+countByStatus.retrying>0?'color:var(--danger)':''}">${countByStatus.queued+countByStatus.retrying}</div></div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">Revenue by Currency</div>
      ${Object.entries(totalByCurrency).length ? Object.entries(totalByCurrency).map(([c,v])=>`
        <div class="drawer-kv"><dt>${esc(c)}</dt><dd>${v.toFixed(2)}</dd></div>`).join('') : '<p class="text-muted text-sm">No revenue data.</p>'}
    </div>
    <div class="card">
      <div class="card-title">Fiscal Day Info</div>
      <div class="drawer-kv"><dt>Day No.</dt><dd>${fc.fiscalDayNo||'—'}</dd></div>
      <div class="drawer-kv"><dt>Status</dt><dd>${fc.fiscalDayStatus||'—'}</dd></div>
      <div class="drawer-kv"><dt>Last Receipt</dt><dd>${fc.lastReceiptCounter||'—'}</dd></div>
    </div>
    <div style="margin-top:14px;display:flex;justify-content:flex-end">
      <button class="btn-primary" onclick="goToDCStep(3)">Continue →</button>
    </div>`;
}

async function submitDayClose() {
  const option = [...document.querySelectorAll('input[name="dcOption"]')].find(r => r.checked);
  if (!option) { showToast('Pick an option first', 'warning'); return; }
  const btn = document.getElementById('dcConfirmCloseBtn');
  btn.textContent = 'Closing…'; btn.disabled = true;
  try {
    const response = await fetch(`${config.apiEndpoint}/api/zimra/day/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey }
    });
    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      showToast(`Server returned ${response.status} \u2014 not JSON. Check API endpoint.`, 'error');
      btn.textContent = 'Retry Close'; btn.disabled = false; return;
    }
    const result = await response.json();
    if (response.ok) {
      await window.fiscalBridgeAPI.closeFiscalDay();
      await window.fiscalBridgeAPI.appendAuditLog({ action:'dayClose', option: option.value, dayNo: config.fiscalDayNo });
      fiscalDayOpenTime = null;
      Object.assign(config, { fiscalDayStatus: 'FiscalDayClosed' });
      document.getElementById('dcResultContent').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          <h4>Fiscal Day ${config.fiscalDayNo||''} Closed</h4>
          <p>${new Date().toLocaleString()}</p>
        </div>
        ${result.fiscalCode ? `<div class="card" style="margin-top:12px"><div class="card-title">Fiscal Code</div><div class="mono">${esc(result.fiscalCode)}</div></div>` : ''}`;
      goToDCStep(4);
      showToast('Fiscal day closed successfully', 'success');
    } else {
      showToast('Close failed: '+(result.message||'Unknown error'), 'error');
      btn.textContent = 'Retry Close'; btn.disabled = false;
    }
  } catch(e) {
    showToast('Error: '+e.message, 'error');
    btn.textContent = 'Retry Close'; btn.disabled = false;
  }
}

async function handleOpenFiscalDay() {
  showConfirm('Open Fiscal Day?', 'This will start a new fiscal day. Ensure the previous day is closed first.', null, async () => {
    try {
      const response = await fetch(`${config.apiEndpoint}/api/zimra/day/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey }
      });
      const ct = response.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        showToast(`Server returned ${response.status} \u2014 not JSON. Check API endpoint.`, 'error'); return;
      }
      const result = await response.json();
      if (response.ok) {
        await window.fiscalBridgeAPI.openFiscalDay();
        Object.assign(config, { fiscalDayStatus: 'FiscalDayOpen', fiscalDate: new Date().toISOString() });
        fiscalDayOpenTime = Date.now();
        if (!fiscalDayTimerInterval) {
          fiscalDayTimerInterval = setInterval(updateFiscalDayTimer, 1000);
        }
        await window.fiscalBridgeAPI.appendAuditLog({ action:'dayOpen' });
        showToast('Fiscal day opened successfully', 'success');
        dcCurrentStep = 1; goToDCStep(1);
        refreshDashboard();
      } else {
        showToast('Open failed: '+(result.message||'Unknown error'), 'error');
      }
    } catch(e) { showToast('Error: '+e.message, 'error'); }
  });
}

function downloadZReport() {
  const content = document.getElementById('dcResultContent').textContent;
  const blob = new Blob([content], {type:'text/plain'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='z-report.txt'; a.click();
}


// ─── Settings ─────────────────────────────────────────────────────────────────
function setupSettings() {
  document.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      const sec = document.getElementById('ssec-' + item.dataset.ssec);
      if (sec) sec.classList.add('active');
    });
  });

  // Connection
  document.getElementById('cfg-test-conn').addEventListener('click', async () => {
    const ep = document.getElementById('cfg-endpoint').value;
    const key = document.getElementById('cfg-apikey').value;
    const res = document.getElementById('cfg-conn-result');
    try {
      const r = await fetch(ep+'/api/zimra/device-status', { headers:{'x-api-key':key} });
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        res.className = 'connection-test-result fail';
        res.textContent = `\u2715 Server returned ${r.status} ${r.statusText} \u2014 not JSON. Check the API endpoint URL.`;
        return;
      }
      const d = await r.json();
      res.className = 'connection-test-result ' + (r.ok ? 'ok' : 'fail');
      res.textContent = r.ok ? '✓ Connected – device: '+(d.DeviceID||d.deviceId||'ok') : '✕ Error: '+(d.Message||d.message||r.status);
    } catch(e) {
      res.className = 'connection-test-result fail';
      res.textContent = '✕ '+e.message;
    }
  });
  document.getElementById('cfg-save-connection').addEventListener('click', async () => {
    config.companyName = document.getElementById('cfg-company').value;
    config.country      = document.getElementById('cfg-country').value;
    config.apiEndpoint  = document.getElementById('cfg-endpoint').value.replace(/\/api\/?$/,'');
    config.apiKey       = document.getElementById('cfg-apikey').value;
    
    // Set default endpoint based on country if not provided
    if (!config.apiEndpoint) {
      if (config.country === 'LS') {
        config.apiEndpoint = 'https://lra.fiscalstack.co.zw/api/v1';
      } else {
        config.apiEndpoint = 'https://fiscalstack.co.zw/api/v1';
      }
    }
    
    await saveConfig(); showToast('Connection settings saved','success');
  });

  // Folders
  document.getElementById('cfg-browse-source').addEventListener('click', async () => {
    const f = await window.fiscalBridgeAPI.browseFolder();
    if (f) document.getElementById('cfg-source').value = f;
  });
  document.getElementById('cfg-browse-target').addEventListener('click', async () => {
    const f = await window.fiscalBridgeAPI.browseFolder();
    if (f) document.getElementById('cfg-target').value = f;
  });
  document.getElementById('cfg-browse-error').addEventListener('click', async () => {
    const f = await window.fiscalBridgeAPI.browseFolder();
    if (f) document.getElementById('cfg-error').value = f;
  });
  document.getElementById('cfg-save-folders').addEventListener('click', async () => {
    config.sourceFolder = document.getElementById('cfg-source').value;
    config.targetFolder = document.getElementById('cfg-target').value;
    config.errorFolder  = document.getElementById('cfg-error').value;
    await saveConfig(); showToast('Folder settings saved','success');
  });

  // Currencies
  document.getElementById('cfg-add-currency').addEventListener('click', () => addCurrencyRow('cfg-currency-list'));
  document.querySelectorAll('#ssec-currencies .suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => addCurrencyRow('cfg-currency-list', chip.dataset.kw, chip.dataset.name));
  });
  document.getElementById('cfg-save-currencies').addEventListener('click', async () => {
    config.currencies = getCurrenciesFromList('cfg-currency-list');
    await saveConfig(); await window.fiscalBridgeAPI.saveCurrencyConfig(config.currencies);
    showToast('Currencies saved','success');
  });

  // Parsing
  // ── Parser mode (auto-detect vs pin) ──
  const _syncPinnedRow = () => {
    const pinned = document.querySelector('input[name="parserMode"]:checked')?.value === 'pinned';
    const row = document.getElementById('pinnedProfileRow');
    if (row) row.style.display = pinned ? 'flex' : 'none';
    // Highlight active card
    document.getElementById('pmode-auto-card').style.borderColor   = !pinned ? 'var(--primary)' : 'var(--border)';
    document.getElementById('pmode-pinned-card').style.borderColor =  pinned ? 'var(--primary)' : 'var(--border)';
  };
  document.querySelectorAll('input[name="parserMode"]').forEach(r => r.addEventListener('change', _syncPinnedRow));
  _syncPinnedRow();

  document.getElementById('cfg-export-profile').addEventListener('click', () => {
    const prof = { productStartLine: document.getElementById('cfg-start').value, productEndLine: document.getElementById('cfg-end').value,
      itemDotCounter: document.getElementById('cfg-dot').value, multiLineProduct: document.getElementById('cfg-multi').value,
      vatA: document.getElementById('cfg-vata').value, vatE: document.getElementById('cfg-vate').value };
    const blob = new Blob([JSON.stringify(prof,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='profile.json';a.click();
  });
  document.getElementById('cfg-import-profile').addEventListener('click', () => document.getElementById('cfg-profile-file').click());
  document.getElementById('cfg-profile-file').addEventListener('change', async e => {
    const f=e.target.files[0]; if(!f) return;
    const p = JSON.parse(await f.text());
    if (p.productStartLine) document.getElementById('cfg-start').value = p.productStartLine;
    if (p.productEndLine)   document.getElementById('cfg-end').value   = p.productEndLine;
    if (p.itemDotCounter)   document.getElementById('cfg-dot').value   = p.itemDotCounter;
    if (p.multiLineProduct) document.getElementById('cfg-multi').value = p.multiLineProduct;
    if (p.vatA) document.getElementById('cfg-vata').value = p.vatA;
    if (p.vatE) document.getElementById('cfg-vate').value = p.vatE;
    showToast('Profile imported','success');
  });
  document.getElementById('cfg-save-parsing').addEventListener('click', async () => {
    // Parser mode + pinned profile
    config.parserMode      = document.querySelector('input[name="parserMode"]:checked')?.value || 'auto';
    config.pinnedProfileId = document.getElementById('cfg-pinned-profile')?.value || null;

    config.productStartLine = document.getElementById('cfg-start').value;
    config.productEndLine   = document.getElementById('cfg-end').value;
    config.itemDotCounter   = document.getElementById('cfg-dot').value;
    config.multiLineProduct = document.getElementById('cfg-multi').value;
    config.vatA = document.getElementById('cfg-vata').value;
    config.vatE = document.getElementById('cfg-vate').value;
    if (!config.parserProfiles || !config.parserProfiles.length) config.parserProfiles = [{}];
    Object.assign(config.parserProfiles[0], { productStartLine: config.productStartLine,
      productEndLine: config.productEndLine, itemDotCounter: config.itemDotCounter,
      multiLineProduct: config.multiLineProduct, vatA: config.vatA, vatE: config.vatE });
    await saveConfig(); showToast('Parsing settings saved','success');
  });

  // Printer
  document.getElementById('cfg-browse-logo').addEventListener('click', async () => {
    const f = await window.fiscalBridgeAPI.browseFile([{name:'Images',extensions:['png','jpg','jpeg']}]);
    if (f) document.getElementById('cfg-logo').value = f;
  });
  const cfgTestPrint = document.getElementById('cfg-test-print');
  if (cfgTestPrint) {
    cfgTestPrint.addEventListener('click', async () => {
      const pr = document.getElementById('cfg-printer').value;
      const el = document.getElementById('cfg-print-result');
      const html = `<html><body style="font-family:monospace;padding:12px;text-align:center"><h3>FiscalBridge</h3><p>Test print – ${new Date().toLocaleString()}</p></body></html>`;
      const r = await window.fiscalBridgeAPI.printReceipt(html, pr);
      el.textContent = r && r.success ? '✓ Print sent' : '✕ Print failed';
    });
  }
  const cfgSavePrinter = document.getElementById('cfg-save-printer');
  if (cfgSavePrinter) {
    cfgSavePrinter.addEventListener('click', async () => {
      config.printerName = document.getElementById('cfg-printer').value;
      config.logoFile    = document.getElementById('cfg-logo').value;
      // printTemplate is saved by saveTemplateBtn; here we just save printer+logo
      await saveConfig(); showToast('Printer settings saved','success');
    });
  }

  // Logs
  document.getElementById('refreshLogsBtn').addEventListener('click', loadLogs);
  document.getElementById('logLevelFilter').addEventListener('change', renderLogLines);
  document.getElementById('logSearchInput').addEventListener('input', debounce(renderLogLines, 300));
  document.getElementById('copyLogsBtn').addEventListener('click', () => {
    const el = document.getElementById('logViewer');
    const text = el.innerText;
    navigator.clipboard.writeText(text).then(() => showToast('Logs copied', 'success')).catch(() => showToast('Copy failed', 'error'));
  });
  const exportLogsBtn = document.getElementById('exportLogsBtn') || document.getElementById('exportDiagBtn');
  if (exportLogsBtn) exportLogsBtn.addEventListener('click', exportDiagnostics);
  
  // Load logs when logs section is opened
  const logsSection = document.getElementById('ssec-logs');
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.target.classList.contains('active')) {
        loadLogs();
      }
    });
  });
  observer.observe(logsSection, { attributes: true, attributeFilter: ['class'] });

  // Advanced
  document.getElementById('resetConfirmInput').addEventListener('input', e => {
    document.getElementById('resetCountersBtn').disabled = e.target.value !== 'reset';
  });
  document.getElementById('resetCountersBtn').addEventListener('click', () => {
    showConfirm('Reset Device Counters?','All receipt counters will be reset. This action is logged in the audit trail.','reset', async () => {
      try {
        // Reset counters endpoint doesn't exist on the server; this is a local-only action
        await window.fiscalBridgeAPI.appendAuditLog({ action:'resetCounters' });
        showToast('Counters reset (local only)', 'success');
        document.getElementById('resetConfirmInput').value='';
        document.getElementById('resetCountersBtn').disabled=true;
        return;
        await window.fiscalBridgeAPI.appendAuditLog({ action:'resetCounters' });
        if (r.ok) { showToast('Counters reset successfully','success'); document.getElementById('resetConfirmInput').value=''; document.getElementById('resetCountersBtn').disabled=true; }
        else       { showToast('Error: '+(result.message||'Unknown'),'error'); }
      } catch(e) { showToast('Error: '+e.message,'error'); }
    });
  });
  document.getElementById('clearCacheBtn').addEventListener('click', () => {
    showToast('Documentation cache cleared','success');
  });
  document.getElementById('exportDiagBtn2').addEventListener('click', exportDiagnostics);

  // About
  document.getElementById('wz-export-config-settings').addEventListener('click', exportConfigJSON);
  document.getElementById('wz-import-config-settings').addEventListener('click', () => document.getElementById('wz-import-file-settings').click());
  document.getElementById('wz-import-file-settings').addEventListener('change', e => importConfigJSON(e.target.files[0]));

  // Notifications
  document.getElementById('cfg-save-notifications').addEventListener('click', async () => {
    config.notifyOnFail  = document.getElementById('cfg-notify-fail').checked;
    config.notifyOnClose = document.getElementById('cfg-notify-close').checked;
    await saveConfig(); showToast('Notification preferences saved','success');
  });
}

async function populateSettings() {
  const s = id => document.getElementById(id);
  s('cfg-company').value    = config.companyName || '';
  s('cfg-country').value   = config.country || 'ZW';
  s('cfg-endpoint').value   = config.apiEndpoint  || '';
  s('cfg-apikey').value     = config.apiKey        || '';
  s('cfg-source').value     = config.sourceFolder  || '';
  s('cfg-target').value     = config.targetFolder  || '';
  s('cfg-error').value      = config.errorFolder   || '';
  s('cfg-start').value = config.productStartLine || (config.parserProfiles&&config.parserProfiles[0]&&config.parserProfiles[0].productStartLine) || '';
  s('cfg-end').value   = config.productEndLine   || (config.parserProfiles&&config.parserProfiles[0]&&config.parserProfiles[0].productEndLine)   || '';
  s('cfg-dot').value   = config.itemDotCounter   || '2';
  s('cfg-multi').value = config.multiLineProduct || '0';
  s('cfg-vata').value  = config.vatA || '15.5';
  s('cfg-vate').value  = config.vatE || '0';
  s('cfg-logo').value  = config.logoFile || '';
  if (s('cfg-notify-fail'))  s('cfg-notify-fail').checked  = config.notifyOnFail !== false;
  if (s('cfg-notify-close')) s('cfg-notify-close').checked = config.notifyOnClose !== false;

  // Template / print settings
  applyTemplateGridState(config.printTemplate || 'thermal80');
  if (s('cfg-print-format')) s('cfg-print-format').value = config.printFormat || 'thermal';
  if (s('cfg-show-logo'))    s('cfg-show-logo').value    = config.showLogo === false ? '0' : '1';
  if (s('cfg-show-qr'))      s('cfg-show-qr').value      = config.showQR   === false ? '0' : '1';

  // Printers
  try {
    const printers = await window.fiscalBridgeAPI.getPrinters();
    const pArr = Array.isArray(printers) ? printers.map(p => p.name || p) : [];
    s('cfg-printer').innerHTML = pArr.map(p=>`<option value="${esc(p)}" ${p===config.printerName?'selected':''}>${esc(p)}</option>`).join('');
  } catch {}

  // ── Parser mode (auto-detect vs pinned) ──
  const mode = config.parserMode || 'auto';
  const modeRadio = document.querySelector(`input[name="parserMode"][value="${mode}"]`);
  if (modeRadio) modeRadio.checked = true;
  try {
    const r = await window.fiscalBridgeAPI.listProfiles();
    const profiles = (r && r.success) ? r.profiles : [];
    const pinnedSel = s('cfg-pinned-profile');
    if (pinnedSel) {
      pinnedSel.innerHTML = '<option value="">— select profile —</option>' +
        profiles.map(p => `<option value="${p.id}" ${p.id === config.pinnedProfileId ? 'selected' : ''}>${p.name || p.id}</option>`).join('');
    }
  } catch {}
  // Sync row visibility + card highlight
  {
    const pinned = (config.parserMode === 'pinned');
    const row = document.getElementById('pinnedProfileRow');
    if (row) row.style.display = pinned ? 'flex' : 'none';
    const autoCard   = document.getElementById('pmode-auto-card');
    const pinnedCard = document.getElementById('pmode-pinned-card');
    if (autoCard)   autoCard.style.borderColor   = !pinned ? 'var(--primary)' : 'var(--border)';
    if (pinnedCard) pinnedCard.style.borderColor =  pinned ? 'var(--primary)' : 'var(--border)';
  }
  // Currency list
  renderCurrencyList('cfg-currency-list', config.currencies||[]);

  // Logs - loaded via MutationObserver when section becomes active
}

let rawLogLines = [];
async function loadLogs() {
  const r = await window.fiscalBridgeAPI.readLogFile(800);
  rawLogLines = r.success ? r.lines : ['No logs available.'];
  renderLogLines();
}
function renderLogLines() {
  const level  = document.getElementById('logLevelFilter').value;
  const search = document.getElementById('logSearchInput').value.toLowerCase();
  const lines  = rawLogLines.filter(l => {
    if (level  && !l.toLowerCase().includes('['+level+']')) return false;
    if (search && !l.toLowerCase().includes(search)) return false;
    return true;
  });
  const el = document.getElementById('logViewer');
  if (!lines.length) { el.innerHTML = '<div class="log-line text-muted">No matching log entries.</div>'; return; }
  el.innerHTML = lines.map(l => {
    const cls = l.includes('[error]') ? 'level-error' : l.includes('[warn]') ? 'level-warn' : l.includes('[debug]') ? 'level-debug' : 'level-info';
    return `<div class="log-line ${cls}">${esc(l)}</div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function exportDiagnostics() {
  showToast('Exporting diagnostics…','info');
  const r = await window.fiscalBridgeAPI.exportDiagnostics();
  if (r.success) showToast('Exported to: '+r.path,'success');
  else showToast('Export failed: '+r.error,'error');
}


// ─── Setup Wizard ─────────────────────────────────────────────────────────────
function openWizard() {
  document.getElementById('wizard-overlay').classList.add('open');
  goToWizardStep(1);
  // Populate printer dropdown
  window.fiscalBridgeAPI.getPrinters().then(printers => {
    const arr = Array.isArray(printers) ? printers.map(p => p.name || p) : [];
    document.getElementById('wz-printer').innerHTML = arr.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('') || '<option value="">No printers found</option>';
    if (config.printerName) document.getElementById('wz-printer').value = config.printerName;
  }).catch(()=>{});
  // Pre-fill from existing config
  const s = id => document.getElementById(id);
  s('wz-company').value      = config.companyName  || '';
  s('wz-endpoint').value     = config.apiEndpoint  || '';
  s('wz-apikey').value       = config.apiKey       || '';
  s('wz-source').value       = config.sourceFolder || '';
  s('wz-target').value       = config.targetFolder || '';
  s('wz-error').value        = config.errorFolder  || '';
  s('wz-start-marker').value = config.productStartLine || '';
  s('wz-end-marker').value   = config.productEndLine   || '';
  s('wz-dot-counter').value  = config.itemDotCounter   || 2;
  s('wz-multiline').value    = config.multiLineProduct || 0;
  s('wz-vata').value         = config.vatA  || '15.5';
  s('wz-vate').value         = config.vatE  || '0';
  if (config.printerName) s('wz-printer').value = config.printerName;
  if (config.logoFile)    s('wz-logo').value    = config.logoFile;
  renderCurrencyList('wz-currency-list', config.currencies||[]);

  // Wire wizard buttons
  document.getElementById('wz-back').addEventListener('click',   () => goToWizardStep(wizardStep - 1));
  document.getElementById('wz-next').addEventListener('click',   () => saveAndAdvanceWizard(1));
  document.getElementById('wz-back-2').addEventListener('click', () => goToWizardStep(1));
  document.getElementById('wz-next-2').addEventListener('click', () => saveAndAdvanceWizard(2));
  document.getElementById('wz-back-3').addEventListener('click', () => goToWizardStep(2));
  document.getElementById('wz-next-3').addEventListener('click', () => saveAndAdvanceWizard(3));
  document.getElementById('wz-back-4').addEventListener('click', () => goToWizardStep(3));
  document.getElementById('wz-next-4').addEventListener('click', () => saveAndAdvanceWizard(4));
  document.getElementById('wz-back-5').addEventListener('click', () => goToWizardStep(4));
  document.getElementById('wz-next-5').addEventListener('click', () => saveAndAdvanceWizard(5));
  document.getElementById('wz-back-6').addEventListener('click', () => goToWizardStep(5));
  document.getElementById('wz-finish').addEventListener('click', finishWizard);
  document.getElementById('wz-test-conn').addEventListener('click', testWizardConnection);
  document.getElementById('wz-browse-source').addEventListener('click', async () => { const f=await window.fiscalBridgeAPI.browseFolder(); if(f) document.getElementById('wz-source').value=f; });
  document.getElementById('wz-browse-target').addEventListener('click', async () => { const f=await window.fiscalBridgeAPI.browseFolder(); if(f) document.getElementById('wz-target').value=f; });
  document.getElementById('wz-browse-error').addEventListener('click',  async () => { const f=await window.fiscalBridgeAPI.browseFolder(); if(f) document.getElementById('wz-error').value=f; });
  document.getElementById('wz-browse-logo').addEventListener('click',   async () => { const f=await window.fiscalBridgeAPI.browseFile([{name:'Images',extensions:['png','jpg']}]); if(f) document.getElementById('wz-logo').value=f; });
  document.getElementById('wz-add-currency').addEventListener('click',  () => addCurrencyRow('wz-currency-list'));
  document.querySelectorAll('#wz-currency-list').forEach(()=>{});
  document.querySelectorAll('[data-kw]').forEach(chip => {
    chip.addEventListener('click', () => addCurrencyRow(chip.closest('[id]').id, chip.dataset.kw, chip.dataset.name));
  });
  document.getElementById('wz-test-print').addEventListener('click', async () => {
    const pr = document.getElementById('wz-printer').value;
    const el = document.getElementById('wz-print-result');
    const html = `<html><body style="font-family:monospace;padding:12px;width:72mm;text-align:center"><h3>${esc(config.companyName||'FiscalBridge')}</h3><p>Test Print</p><p>${new Date().toLocaleString()}</p></body></html>`;
    const r = await window.fiscalBridgeAPI.printReceipt(html, pr);
    el.textContent = r && r.success ? '✓ Sent to printer' : '✕ Print failed';
  });
  document.getElementById('wz-export-config').addEventListener('click', exportConfigJSON);
  document.getElementById('wz-import-config').addEventListener('click', () => document.getElementById('wz-import-file').click());
  document.getElementById('wz-import-file').addEventListener('change', e => importConfigJSON(e.target.files[0]));
  document.getElementById('wz-preset').addEventListener('change', applyParserPreset);
  document.getElementById('wz-try-file').addEventListener('change', runWizardTryIt);
}

function goToWizardStep(step) {
  if (step < 1) step = 1;
  if (step > 6) step = 6;
  wizardStep = step;
  document.querySelectorAll('.wizard-page').forEach(p => p.classList.toggle('active', parseInt(p.dataset.wpage)===step));
  document.querySelectorAll('.wizard-step-item').forEach(item => {
    const n = parseInt(item.dataset.wstep);
    item.classList.toggle('active', n===step);
    item.classList.toggle('done', n<step);
  });
  document.getElementById('wz-back').disabled = step === 1;
  if (step === 6) renderWizardSummary();
}

async function saveAndAdvanceWizard(fromStep) {
  const s = id => document.getElementById(id);
  if (fromStep === 1) {
    if (!s('wz-endpoint').value) { showToast('API endpoint is required','error'); return; }
    config.companyName = s('wz-company').value;
    config.apiEndpoint  = s('wz-endpoint').value.replace(/\/api\/?$/,'');
    config.apiKey       = s('wz-apikey').value;
  } else if (fromStep === 2) {
    if (!s('wz-source').value || !s('wz-target').value) { showToast('Source and target folders are required','error'); return; }
    config.sourceFolder = s('wz-source').value;
    config.targetFolder = s('wz-target').value;
    config.errorFolder  = s('wz-error').value;
  } else if (fromStep === 3) {
    config.currencies = getCurrenciesFromList('wz-currency-list');
    await window.fiscalBridgeAPI.saveCurrencyConfig(config.currencies);
  } else if (fromStep === 4) {
    config.productStartLine = s('wz-start-marker').value;
    config.productEndLine   = s('wz-end-marker').value;
    config.itemDotCounter   = s('wz-dot-counter').value;
    config.multiLineProduct = s('wz-multiline').value;
    config.vatA = s('wz-vata').value;
    config.vatE = s('wz-vate').value;
  } else if (fromStep === 5) {
    config.printerName = s('wz-printer').value;
    config.logoFile    = s('wz-logo').value;
  }
  await saveConfig();
  goToWizardStep(fromStep + 1);
}

async function testWizardConnection() {
  const ep  = document.getElementById('wz-endpoint').value;
  const key = document.getElementById('wz-apikey').value;
  const res = document.getElementById('wz-conn-result');
  res.className = 'connection-test-result'; res.textContent = 'Testing…'; res.style.display='block';
  try {
    const r = await fetch(ep.replace(/\/api\/?$/,'')+'/api/zimra/device-status', { headers:{'x-api-key':key} });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      res.className='connection-test-result fail';
      res.textContent = `\u2715 Server returned ${r.status} ${r.statusText} \u2014 not JSON. Check the API endpoint URL.`;
      return;
    }
    const d = await r.json();
    res.className = 'connection-test-result ' + (r.ok ? 'ok' : 'fail');
    res.textContent = r.ok ? '✓ Connected – device: '+(d.DeviceID||d.deviceId||'ok') : '✕ Error: '+(d.Message||d.message||r.statusText);
  } catch(e) { res.className='connection-test-result fail'; res.textContent='✕ '+e.message; }
}

function renderWizardSummary() {
  document.getElementById('wz-summary').innerHTML = `
    <div style="font-size:.82rem;display:grid;gap:12px;">
      <div><strong>Company:</strong> ${esc(config.companyName||'—')}</div>
      <div><strong>API Endpoint:</strong> ${esc(config.apiEndpoint||'—')}</div>
      <div><strong>Source Folder:</strong> ${esc(config.sourceFolder||'—')}</div>
      <div><strong>Target Folder:</strong> ${esc(config.targetFolder||'—')}</div>
      <div><strong>Currencies:</strong> ${(config.currencies||[]).map(c=>esc(c.keyword||c.name||c)).join(', ')||'—'}</div>
      <div><strong>Start Marker:</strong> ${esc(config.productStartLine||'—')}</div>
      <div><strong>End Marker:</strong> ${esc(config.productEndLine||'—')}</div>
      <div><strong>VAT Standard:</strong> ${esc(config.vatA||'—')}%</div>
      <div><strong>Printer:</strong> ${esc(config.printerName||'—')}</div>
      <div><strong>Print Format:</strong> ${esc(config.printFormat||'thermal')}</div>
      <div><strong>Template:</strong> ${esc(config.printTemplate||'standard')}</div>
    </div>`;
}

async function finishWizard() {
  config.setupComplete = true;
  await saveConfig();
  document.getElementById('wizard-overlay').classList.remove('open');
  showPage('dashboard');
  startMonitoring();
}

function applyParserPreset() {
  const preset = document.getElementById('wz-preset').value;
  const presets = {
    'generic-pos': { start:'Order No.', end:'Items count', dot:2, multi:0 },
    'sage':        { start:'Invoice No', end:'Total Items', dot:2, multi:1 },
    'pastel':      { start:'Tax Invoice', end:'Total VAT', dot:3, multi:0 },
  };
  const p = presets[preset]; if (!p) return;
  document.getElementById('wz-start-marker').value = p.start;
  document.getElementById('wz-end-marker').value   = p.end;
  document.getElementById('wz-dot-counter').value  = p.dot;
  document.getElementById('wz-multiline').value    = p.multi;
}

async function runWizardTryIt() {
  const inp = document.getElementById('wz-try-file');
  const file = inp.files && inp.files[0]; if (!file) return;
  const r = await readTextFromFile(file.path);
  const box = document.getElementById('wz-try-result');
  box.style.display = '';
  if (!r.success) { box.innerHTML=`<div class="why-failed-callout"><strong>Cannot read file</strong> ${esc(r.error)}</div>`; return; }
  const cfg = {
    ...config,
    productStartLine: document.getElementById('wz-start-marker').value,
    productEndLine:   document.getElementById('wz-end-marker').value,
    itemDotCounter:   document.getElementById('wz-dot-counter').value,
    multiLineProduct: document.getElementById('wz-multiline').value,
    currencies: config.currencies||[],
  };
  const result = new ReceiptParser(cfg).parseReceipt(r.text, cfg.currencies);
  const ok = result && result.items && result.items.length > 0;
  box.innerHTML = ok
    ? `<div style="background:var(--pill-ok-bg);color:var(--pill-ok-text);border-radius:8px;padding:10px 14px;font-size:.82rem">✓ Parsed ${result.items.length} items · Amount: ${result.invoiceAmount} ${result.currency||''}</div>`
    : `<div class="why-failed-callout"><strong>Parse failed</strong> No items found – adjust your start/end markers above.</div>`;
}

// ─── Receipt Templates (3 templates matching FiscalStack web app) ─────────────
// 1. thermal80  — Receipt48.tsx (80mm ZIMRA-compliant)
// 2. thermal58  — Receipt48.tsx (58mm compact)
// 3. modernA4   — invoice-templates.ts "Modern Blue" + pdf-document.tsx

// ── Shared helpers ────────────────────────────────────────────────────────────
function _thermalTaxGroups(items) {
  const groups = {};
  (items || []).forEach(i => {
    const rate  = parseFloat(i.taxRate || i.vatRate || i.vat_pct || 0);
    const qty   = parseFloat(i.qty || i.quantity || 1);
    const price = parseFloat(i.unitPrice || i.price || 0);
    const total = parseFloat(i.lineTotal || i.totalAmount || (qty * price));
    const taxAmt = (total * (rate / 100)) / (1 + rate / 100);
    const netAmt = total - taxAmt;
    const key = rate.toFixed(2);
    if (!groups[key]) groups[key] = { rate, net: 0, tax: 0, gross: 0, name: rate === 0 ? 'Exempt' : `${rate}%` };
    groups[key].net   += netAmt;
    groups[key].tax   += taxAmt;
    groups[key].gross += total;
  });
  return Object.values(groups);
}

function _fmtCode(c) { return (c || '').replace(/-/g, '').match(/.{1,4}/g)?.join('-') || c; }

// ── Template 1 & 2: Thermal — matches Receipt48.tsx exactly ───────────────────
function _buildThermal(width, invoice, fiscal, cfg) {
  const items     = invoice.items || [];
  const isVat     = !!(cfg.vatNumber || fiscal.vatNumber);
  const taxGroups = _thermalTaxGroups(items);
  const totalQty  = items.reduce((s, i) => s + parseFloat(i.qty || i.quantity || 1), 0);
  const currency  = invoice.currency || 'USD';

  const fiscalCode    = fiscal.fiscalCode    || invoice.fiscalCode    || '';
  const verCode       = fiscal.verificationCode || fiscal.receiptVerificationCode || '';
  const qrData        = fiscal.qrCode        || fiscal.qrCodeData     || invoice.qrCodeData || '';
  const receiptGlobal = fiscal.receiptGlobalNo || invoice.receiptGlobalNo || '';
  const receiptCtr    = fiscal.receiptCounter  || invoice.receiptCounter  || '';
  const fiscalDay     = fiscal.fiscalDayNo     || invoice.fiscalDayNo    || cfg.fiscalDayNo || '---';
  const deviceSerial  = cfg.fdmsDeviceSerialNo || cfg.deviceSerialNumber  || fiscal.deviceSerialNo || '---';
  const deviceId      = cfg.fdmsDeviceId       || cfg.deviceId            || fiscal.deviceId       || '---';

  const isFiscalised = !!(fiscalCode || receiptGlobal || verCode);
  const isCreditNote = invoice.transactionType === 'CreditNote' || fiscal.isCreditNote;
  const isDebitNote  = invoice.transactionType === 'DebitNote'  || fiscal.isDebitNote;
  let docTitle = isCreditNote ? 'CREDIT NOTE' : isDebitNote ? 'DEBIT NOTE'
    : isFiscalised ? (isVat ? 'FISCAL TAX INVOICE' : 'FISCAL INVOICE')
    : (isVat ? 'TAX INVOICE' : 'INVOICE');

  const receiptNo  = `${receiptCtr || '---'}/${receiptGlobal || '---'}`;
  const dateStr    = invoice.date
    ? new Date(invoice.date + 'T00:00:00').toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
    : new Date().toLocaleString('en-GB');
  const custRef    = invoice.invoiceNumber || '---';
  const isLesotho  = (cfg.country === 'Lesotho' || cfg.fiscalProvider === 'LEKUKA');
  const verifyUrl  = isLesotho ? 'https://invoice.rsl.org.ls/' : 'https://fdms.zimra.co.zw/verify';

  // Buyer block
  const buyerName = invoice.buyer?.name || '';
  const isWalkIn  = !buyerName || ['walk-in','walk in','guest','cash customer'].some(s => buyerName.toLowerCase().includes(s));
  const buyerBlock = !isWalkIn ? `
    <div class="sep"></div>
    <div class="bold underline">BUYER</div>
    <div>${esc(buyerName)}</div>
    ${invoice.buyer?.tin        ? `<div>TIN: ${esc(invoice.buyer.tin)}</div>`        : ''}
    ${invoice.buyer?.vatNumber  ? `<div>VAT No: ${esc(invoice.buyer.vatNumber)}</div>` : ''}
    ${invoice.buyer?.email      ? `<div>${esc(invoice.buyer.email)}</div>`            : ''}
    ${invoice.buyer?.phone      ? `<div>${esc(invoice.buyer.phone)}</div>`            : ''}
  ` : '';

  // Items — matching Receipt48 line layout
  const itemRows = items.map(i => {
    const qty   = parseFloat(i.qty || i.quantity || 1);
    const price = parseFloat(i.unitPrice || i.price || 0);
    const total = parseFloat(i.lineTotal || i.totalAmount || (qty * price));
    const desc  = esc(i.description || i.name || 'Item');
    const sub   = qty !== 1 ? `<div class="sub">${qty.toFixed(3)} each ${price.toFixed(2)}</div>` : '';
    return `<div class="row"><span class="desc">${desc}</span><span class="bold">${total.toFixed(2)}</span></div>${sub}`;
  }).join('');

  // Tax summary — matches Receipt48 block [40-44]
  const taxHtml = isVat ? `
    <div class="sep"></div>
    <div class="center bold underline">TAX SUMMARY</div>
    ${taxGroups.map(g => `
      <div class="taxrow">Tax Code ${esc(g.name)} (${g.rate}%)</div>
      <div class="row sub"><span>Net Amt</span><span>${g.net.toFixed(2)}</span></div>
      <div class="row sub"><span>VAT</span><span>${g.tax.toFixed(2)}</span></div>
      <div class="row sub bold"><span>Total Amt</span><span>${g.gross.toFixed(2)}</span></div>
    `).join('<div class="dotsep"></div>')}
  ` : '';

  const verCodeFmt = verCode ? _fmtCode(verCode) : fiscalCode ? _fmtCode(fiscalCode) : '';
  const qrBlock = `
    <div class="sep"></div>
    ${fiscal._qrImg ? `<div class="center"><img src="${fiscal._qrImg}" style="width:${width === '58mm' ? 110 : 150}px;height:auto"></div>`
      : qrData ? `<div class="center qr-place" data-qr="${esc(qrData)}"><canvas></canvas></div>` : ''}
    ${verCodeFmt ? `
      <div class="center small bold">VERIFICATION CODE:</div>
      <div class="center bold" style="word-break:break-all;font-size:10px">${esc(verCodeFmt)}</div>
    ` : !isFiscalised ? `<div class="center small" style="font-style:italic">Not yet fiscalised</div>` : ''}
    <div class="center small">Verify at: ${verifyUrl}</div>
  `;

  const logoHtml = cfg.logoFile ? `<div class="center"><img src="${esc(cfg.logoFile)}" style="max-height:60px;max-width:92%;margin-bottom:6px"></div>` : '';
  const invoiceTotal = parseFloat(invoice.total || invoice.invoiceAmount || 0);

  return `<html><head><style>
    @media print { @page { size: ${width} auto; margin: 0; } }
    *  { margin:0; padding:0; box-sizing:border-box; color:#000 !important; border-color:#000 !important; }
    body { font-family:'Courier New',Courier,monospace; font-size:10px; color:#000; width:${width}; padding:10px 8px; line-height:1.4; -webkit-font-smoothing:none; }
    .center  { text-align:center; }
    .bold    { font-weight:bold; }
    .underline { text-decoration:underline; }
    .small   { font-size:8px; }
    .sep     { border-top:1px dashed #000; margin:5px 0; }
    .dotsep  { border-top:1px dotted #aaa; margin:3px 0; }
    .row     { display:flex; justify-content:space-between; margin-bottom:2px; }
    .desc    { width:68%; word-break:break-word; }
    .sub     { font-size:9px; padding-left:8px; color:#444; }
    .taxrow  { font-size:9px; text-transform:uppercase; }
    canvas   { display:block; margin:0 auto; }
  </style></head><body>
    ${logoHtml}
    <div class="center bold" style="font-size:13px;text-transform:uppercase;margin-bottom:2px">${esc(cfg.companyName || '')}</div>
    ${cfg.branchName ? `<div class="center">${esc(cfg.branchName)}</div>` : ''}
    <div class="center">
      <p>TIN: ${esc(cfg.tin || '---')}</p>
      ${isVat && cfg.vatNumber ? `<p>VAT No: ${esc(cfg.vatNumber)}</p>` : ''}
    </div>
    ${cfg.address ? `<div class="center" style="white-space:pre-wrap">${esc(cfg.address)}</div>` : ''}
    ${cfg.phone   ? `<div class="center">Tel: ${esc(cfg.phone)}</div>` : ''}
    ${cfg.email   ? `<div class="center">${esc(cfg.email)}</div>` : ''}
    <div class="sep"></div>
    <div class="center bold" style="font-size:12px">${esc(docTitle)}</div>
    <div class="sep"></div>

    <div class="row"><span>Invoice No:</span><span class="bold">${esc(receiptNo)}</span></div>
    <div class="row"><span>Fiscal Day No:</span><span>${esc(String(fiscalDay))}</span></div>
    <div class="row"><span>Device Serial No:</span><span>${esc(deviceSerial)}</span></div>
    <div class="row"><span>Device ID:</span><span>${esc(deviceId)}</span></div>
    <div class="row"><span>Customer Ref No:</span><span>${esc(custRef)}</span></div>
    <div class="row"><span>Date &amp; Time:</span><span>${esc(dateStr)}</span></div>

    ${buyerBlock}
    <div class="sep"></div>

    ${itemRows}
    <div class="sep"></div>

    <div class="row bold" style="font-size:11px"><span>TOTAL (${esc(currency)})</span><span>${invoiceTotal.toFixed(2)}</span></div>
    <div class="sep" style="border-style:dotted"></div>
    <div class="row"><span class="small">TENDERED:</span><span>${parseFloat(invoice.paymentAmount || invoiceTotal).toFixed(2)}</span></div>
    <div class="row"><span class="small">CHANGE:</span><span>${parseFloat(invoice.change || 0).toFixed(2)}</span></div>
    <div class="sep"></div>

    <div>Number of Items: ${totalQty.toFixed(3)}</div>
    ${taxHtml}
    ${qrBlock}
    <div class="sep"></div>
    <div class="center small" style="font-style:italic">${esc(invoice.notes || 'Thank you for your business!')}</div>
    <div class="center small" style="margin-top:4px">Powered by FiscalStack</div>

    <script>
      document.querySelectorAll('.qr-place[data-qr]').forEach(function(el) {
        var data = el.getAttribute('data-qr');
        var canvas = el.querySelector('canvas');
        if (canvas && typeof QRCode !== 'undefined') {
          QRCode.toCanvas(canvas, data, { width: 160, margin: 1, errorCorrectionLevel: 'M' }, function() {});
        } else if (canvas) {
          el.innerHTML = '<div style="font-size:8px;word-break:break-all;text-align:center">' + data.slice(0,80) + '<\/div>';
        }
      });
    <\/script>
  </body></html>`;
}

// ── Template 3: Modern Blue A4 — mirrors client/src/components/invoices/pdf-document.tsx
//    with the "modern" palette from client/src/lib/invoice-templates.ts.
//    Units are pt so sizes match @react-pdf/renderer 1:1.
function _buildModernA4(invoice, fiscal, cfg) {
  fiscal = fiscal || {}; cfg = cfg || {}; invoice = invoice || {};
  // Palette: invoice-templates.ts → { id:"modern" }
  const T = { accent: cfg.accentColor || '#2563eb', secondary: '#dbeafe', page: '#ffffff', surface: '#f8fafc',
              text: '#0f172a', muted: '#64748b', border: '#dbe3ef', radius: 6 };
  const compact   = cfg.templateDensity === 'compact';
  const qrPlace   = cfg.qrPlacement || 'header-right'; // header-right | header-center | footer
  const n2        = v => (Number.isFinite(+v) ? (+v).toFixed(2) : '0.00');
  const fmtDate   = d => {
    if (!d) return '';
    const s = String(d);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);                 // ISO → dd/MM/yyyy without TZ shift
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const dt = new Date(s); return isNaN(dt) ? s : dt.toLocaleDateString('en-GB');
  };

  const isLesotho  = cfg.country === 'Lesotho' || cfg.fiscalProvider === 'LEKUKA';
  const authority  = isLesotho ? 'LEKUKA' : 'ZIMRA';
  const verifyUrl  = cfg.qrUrl || (isLesotho ? 'https://invoice.rsl.org.ls' : 'https://receipt.zimra.org');
  const vatReg     = !!(cfg.vatRegistered ?? (cfg.vatNumber || fiscal.vatNumber));

  const fiscalCode = fiscal.fiscalCode || invoice.fiscalCode || '';
  const qrData     = fiscal.qrCode || fiscal.qrCodeData || fiscal.qrUrl || invoice.qrCodeData || '';
  const qrImg      = fiscal._qrImg || invoice._qrImg || '';      // PNG data URL (generated via IPC)
  const rCounter   = fiscal.receiptCounter  ?? invoice.receiptCounter;
  const rGlobal    = fiscal.receiptGlobalNo ?? invoice.receiptGlobalNo;
  const fiscalDay  = fiscal.fiscalDayNo || invoice.fiscalDayNo || cfg.fiscalDayNo || 'N/A';
  const deviceId   = cfg.fdmsDeviceId || cfg.deviceId || 'N/A';
  const deviceSer  = cfg.fdmsDeviceSerialNo || cfg.deviceSerialNumber || 'N/A';
  const isFiscal   = !!(fiscalCode || qrData || rGlobal != null && rGlobal !== '');
  const txType     = invoice.transactionType || (fiscal.isCreditNote ? 'CreditNote' : fiscal.isDebitNote ? 'DebitNote' : '');
  const isQuote    = invoice.status === 'quote';

  // Verification code — same rule as web: last 16 chars of QR data, grouped by 4
  const vcRaw   = fiscal.verificationCode || (qrData ? String(qrData).slice(-16) : '') || fiscalCode;
  const verCode = String(vcRaw).replace(/-/g, '').match(/.{1,4}/g)?.join('-') || '';

  const title = isQuote ? 'OFFICIAL QUOTATION'
    : txType === 'CreditNote' ? 'CREDIT NOTE'
    : txType === 'DebitNote'  ? 'DEBIT NOTE'
    : isFiscal ? (vatReg ? 'FISCAL TAX INVOICE' : 'FISCAL INVOICE')
    : invoice.status === 'draft' ? 'DRAFT INVOICE' : (vatReg ? 'PROFORMA INVOICE' : 'TAX INVOICE');

  // Items — same exclusive / inclusive maths as pdf-document.tsx
  const isExclusive = invoice.taxInclusive === false;
  const items = (invoice.items || []).map(i => {
    const qty   = parseFloat(i.qty ?? i.quantity ?? 1) || 0;
    const price = parseFloat(i.unitPrice ?? i.price ?? 0) || 0;
    const rate  = vatReg ? parseFloat(i.taxRate ?? i.vatRate ?? i.vat_pct ?? 0) || 0 : 0;
    const name  = String(i.taxName || i.taxCode || '').toLowerCase();
    const isExempt = i.zimraTaxId == 1 || name.includes('exempt');
    const isZero   = !isExempt && (i.zimraTaxId == 2 || name.includes('zero') || rate === 0);
    let amtExcl, vat, totIncl;
    if (isExclusive) { amtExcl = price * qty; vat = amtExcl * rate / 100; totIncl = amtExcl + vat; }
    else {
      totIncl = (i.lineTotal != null && i.lineTotal !== '') ? parseFloat(i.lineTotal) : price * qty;
      vat = totIncl - totIncl / (1 + rate / 100); amtExcl = totIncl - vat;
    }
    return { raw: i, qty, price, rate, isExempt, isZero, amtExcl, vat, totIncl,
             code: i.hsCode || i.product?.hsCode || '0000' };
  });

  const vatCell = it => it.isExempt ? '-' : (it.isZero || it.vat === 0 ? '0.00' : n2(it.vat));
  const descCell = it => `<div>${esc(it.raw.description || it.raw.name || '')}</div>
      ${it.raw.serialNumber ? `<div style="font-size:7pt;color:${T.accent};font-weight:700;margin-top:1pt">S/N: ${esc(it.raw.serialNumber)}</div>` : ''}
      ${it.raw.notes ? `<div style="font-size:7pt;color:#64748b;margin-top:1pt;font-style:italic">Note: ${esc(it.raw.notes)}</div>` : ''}`;

  const cols = isExclusive
    ? [['Code','8%','left'],['Description','33%','left'],['Qty','8%','center'],['Price','10%','right'],['Amount<br>(excl.)','13%','right'],['VAT','12%','right'],['Total<br>(incl.)','16%','right']]
    : [['Code','10%','left'],['Description','40%','left'],['Qty','8%','center'],['Price','12%','right'],['VAT','15%','right'],['Total<br>(incl.)','15%','right']];

  const rowsHtml = items.length ? items.map((it, idx) => {
    const cells = isExclusive
      ? [it.code, descCell(it), it.qty, n2(it.price), n2(it.amtExcl), vatCell(it), n2(it.totIncl)]
      : [it.code, descCell(it), it.qty, n2(it.price), vatCell(it), n2(it.totIncl)];
    return `<tr style="border-bottom:1px solid ${T.border};${idx % 2 ? `background:${T.surface};` : ''}">${cells.map((c, ci) => {
      const [, w, al] = cols[ci];
      const extra = ci === 0 ? `color:#64748b;` : (ci === cells.length - 1 ? 'font-weight:700;' : '')
                  + (cols[ci][0] === 'VAT' ? 'font-size:8pt;color:#64748b;' : '');
      return `<td style="width:${w};text-align:${al};padding:5pt 4pt;vertical-align:top;${extra}">${ci === 1 ? c : esc(String(c))}</td>`;
    }).join('')}</tr>`;
  }).join('') : `<tr><td colspan="${cols.length}" style="padding:10pt;text-align:center;color:${T.muted};font-style:italic">No line items</td></tr>`;

  // Tax analysis grouped by rate (+ exempt flag)
  const groups = {};
  items.forEach(it => {
    const k = `${it.rate}-${it.isExempt ? 'E' : ''}`;
    const g = groups[k] || (groups[k] = { rate: it.rate, isExempt: it.isExempt, isZero: it.isZero, net: 0, vat: 0, tot: 0, name: it.raw.taxName });
    g.net += it.amtExcl; g.vat += it.vat; g.tot += it.amtExcl + it.vat;
  });
  const taxRows = Object.values(groups).map(g => `<tr>
      <td style="padding-top:2pt">${g.isExempt ? esc(g.name || 'Exempt') : `${n2(g.rate)}%`}</td>
      <td style="text-align:right;padding-top:2pt">${n2(g.net)}</td>
      <td style="text-align:right;padding-top:2pt">${g.isExempt ? '-' : (g.isZero || g.vat === 0 ? '0.00' : n2(g.vat))}</td>
      <td style="text-align:right;padding-top:2pt">${n2(g.tot)}</td></tr>`).join('');

  const sumNet = items.reduce((s, i) => s + i.amtExcl, 0);
  const sumVat = items.reduce((s, i) => s + i.vat, 0);
  const total    = invoice.total ?? invoice.invoiceAmount ?? (sumNet + sumVat);
  const taxAmt   = invoice.taxAmount ?? invoice.vatAmount ?? sumVat;
  const subtotal = invoice.subtotal ?? (parseFloat(total) - parseFloat(taxAmt));
  const currency = invoice.currency || 'USD';
  const qtySum   = items.reduce((s, i) => s + i.qty, 0);

  const qrTag = size => qrImg
    ? `<img src="${qrImg}" style="width:${size}pt;height:${size}pt;display:block">`
    : (qrData ? `<div style="width:${size}pt;font-size:5pt;word-break:break-all;color:${T.muted}">${esc(String(qrData).slice(0, 90))}</div>` : '');

  const buyer = invoice.buyer || invoice.customer || null;
  const buyerName = buyer && (buyer.name || buyer.buyerRegisterName || '');
  const isWalkIn = !buyerName || /walk.?in|guest|cash customer/i.test(buyerName);
  const fRow = (l, v) => `<div style="display:flex;margin-bottom:4pt"><span style="color:#64748b;width:44%;padding-right:6pt">${esc(l)}</span><span style="font-weight:700;color:#1e293b;flex:1">${esc(String(v ?? 'N/A'))}</span></div>`;
  const box = `border:1px solid ${T.border};background:${T.surface};border-radius:${T.radius}pt;`;
  const secTitle = `font-size:9pt;font-weight:700;text-transform:uppercase;color:${T.accent};border-bottom:1px solid #cbd5e1;padding-bottom:4pt;margin-bottom:6pt`;
  const bankBits = [
    cfg.bankName && `Bank: <b style="color:#1e293b">${esc(cfg.bankName)}</b>`,
    cfg.accountName && `Acc Name: <b style="color:#1e293b">${esc(cfg.accountName)}</b>`,
    cfg.accountNumber && `Acc No: <b style="color:#1e293b;font-family:Courier,monospace">${esc(cfg.accountNumber)}</b>`,
    cfg.branchCode && `Branch: <b style="color:#1e293b">${esc(cfg.branchCode)}</b>`,
  ].filter(Boolean);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)} ${esc(invoice.invoiceNumber || '')}</title><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { background:${T.page}; }
    body { font-family:Helvetica, Arial, sans-serif; font-size:9pt; color:${T.text}; padding:${compact ? 18 : 24}pt; width:210mm; min-height:297mm; position:relative; }
    table { border-collapse:collapse; width:100%; }
    tr { page-break-inside:avoid; }
    thead { display:table-header-group; }
    @page { size:A4; margin:0; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; width:auto; } }
  </style></head><body>
  ${invoice.status === 'paid' ? `<div style="position:absolute;top:250pt;left:150pt;font-size:100pt;color:rgba(5,150,105,.15);font-weight:700;transform:rotate(-30deg);pointer-events:none">PAID</div>` : ''}

  <!-- 0. Header: logo | verification | QR -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${compact ? 7 : 10}pt;padding-bottom:10pt;border-bottom:1px solid ${T.border}">
    <div style="width:28%">${cfg.logoFile ? `<img src="${esc(cfg.logoFile)}" style="width:108pt;height:50pt;object-fit:contain;object-position:left">` : ''}</div>
    <div style="width:44%;text-align:center;display:flex;flex-direction:column;align-items:center">
      ${qrPlace === 'header-center' ? `<div style="margin-bottom:3pt">${qrTag(62)}</div>` : ''}
      ${isFiscal && !isQuote ? `<div style="font-size:9pt;font-weight:700;color:#1e293b;margin-bottom:1pt">Verification Code: ${esc(verCode)}</div>
        <div style="font-size:7pt;color:blue">Verify at ${esc(verifyUrl)}</div>` : ''}
    </div>
    <div style="width:28%;display:flex;justify-content:flex-end">
      ${qrPlace === 'header-right' ? qrTag(68) : isQuote ? `<div style="text-align:right">
        <div style="font-size:8pt;color:#64748b;text-transform:uppercase;margin-bottom:2pt">Quote No.</div>
        <div style="font-size:11pt;font-weight:700;color:#1e293b;margin-bottom:4pt">${esc(invoice.invoiceNumber || '')}</div>
        <div style="font-size:8pt;color:#64748b">Date: ${esc(fmtDate(invoice.date || invoice.issueDate))}</div></div>` : ''}
    </div>
  </div>

  <!-- Title -->
  <div style="text-align:center;margin-bottom:12pt">
    <div style="font-size:${compact ? 14 : 16}pt;font-weight:700;text-transform:uppercase">${esc(title)}</div>
    <div style="width:60pt;height:2pt;background:${T.accent};margin:5pt auto 3pt"></div>
    <div style="font-size:8pt;color:#64748b">${isQuote ? 'Prepared quotation' : (isFiscal ? `${authority} fiscal document` : 'Customer document')}</div>
  </div>

  <!-- 2. Seller & Buyer -->
  <div style="display:flex;justify-content:space-between;margin-bottom:12pt">
    <div style="width:48%;padding:9pt;${box}">
      <div style="${secTitle}">SELLER</div>
      <div style="font-weight:700;color:#1e293b;font-size:10pt;margin-bottom:2pt">${esc(cfg.tradingName || cfg.companyName || '')}</div>
      <div style="line-height:1.4;color:#475569">
        ${cfg.address ? `<div>${esc(cfg.address)}</div>` : ''}
        ${(cfg.city || cfg.country) ? `<div>${esc([cfg.city, cfg.country].filter(Boolean).join(', '))}</div>` : ''}
        <div style="margin-top:4pt">TIN: ${esc(cfg.tin || 'N/A')}</div>
        <div>VAT No: ${esc(cfg.vatNumber || 'N/A')}</div>
        ${cfg.phone ? `<div>Phone: ${esc(cfg.phone)}</div>` : ''}
        ${cfg.email ? `<div>Email: ${esc(cfg.email)}</div>` : ''}
      </div>
    </div>
    <div style="width:48%;padding:9pt;${box}">
      <div style="${secTitle}">BUYER</div>
      <div style="line-height:1.4;color:#475569">${!isWalkIn ? `
        <div style="font-weight:700;color:#1e293b;font-size:10pt;margin-bottom:2pt">${esc(buyerName)}</div>
        <div>${esc(buyer.address || 'No Address')}</div>
        ${(buyer.city || buyer.country) ? `<div>${esc([buyer.city, buyer.country].filter(Boolean).join(' '))}</div>` : ''}
        <div style="margin-top:4pt">TIN: ${esc(buyer.tin || buyer.buyerTIN || 'N/A')}</div>
        <div>VAT No: ${esc(buyer.vatNumber || buyer.VATNumber || 'N/A')}</div>
        ${buyer.email ? `<div>Email: ${esc(buyer.email)}</div>` : ''}
        ${buyer.phone ? `<div>Phone: ${esc(buyer.phone)}</div>` : ''}`
        : `<div style="font-style:italic;color:#94a3b8">Walk-in Customer</div>`}
      </div>
    </div>
  </div>

  <!-- 3. Fiscal info grid -->
  <div style="${box}border-left:3pt solid ${T.accent};padding:10pt;margin-bottom:16pt;display:flex;justify-content:space-between">
    <div style="width:48%">
      ${fRow(isQuote ? 'Quote No:' : 'Invoice No:', !isQuote && rCounter != null && rCounter !== '' && rGlobal != null && rGlobal !== '' ? `${rCounter}/${rGlobal}` : (invoice.invoiceNumber || 'N/A'))}
      ${fRow(isQuote ? 'Reference No:' : 'Customer Reference No:', invoice.invoiceNumber || 'N/A')}
      ${!isQuote ? fRow('Fiscal Day No:', fiscalDay) : ''}
      ${invoice.poNumber ? fRow('PO Number:', invoice.poNumber) : ''}
    </div>
    <div style="width:48%">
      ${fRow('Date:', fmtDate(invoice.date || invoice.issueDate) || fmtDate(new Date().toISOString()))}
      ${isQuote && invoice.expiryDate ? fRow('Valid Until:', fmtDate(invoice.expiryDate)) : ''}
      ${!isQuote ? fRow('Fiscal Device ID:', deviceId) + fRow('Device Serial No:', deviceSer) : ''}
    </div>
  </div>

  ${(txType === 'CreditNote' || txType === 'DebitNote') && (invoice.relatedInvoiceNumber || invoice.relatedReceiptGlobalNo) ? `
  <div style="margin:6pt 0 12pt;padding:5pt;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-size:7pt">
    <div style="margin-bottom:3pt"><b style="color:#475569;text-transform:uppercase">${txType === 'CreditNote' ? 'CREDITED INVOICE' : 'DEBITED INVOICE'}</b>
      <span style="color:#64748b"> &nbsp;|&nbsp; Original Fiscal Reference</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:10pt">
      <span><span style="color:#64748b">Inv No: </span><b>${esc(invoice.relatedReceiptGlobalNo || 'N/A')}</b></span>
      <span><span style="color:#64748b">Date: </span><b>${esc(fmtDate(invoice.relatedInvoiceDate) || 'N/A')}</b></span>
      <span><span style="color:#64748b">Ref: </span><b>${esc(invoice.relatedInvoiceNumber || 'N/A')}</b></span>
      <span><span style="color:#64748b">ID: </span><b>${esc(deviceId)}</b></span>
      <span><span style="color:#64748b">Serial: </span><b>${esc(deviceSer)}</b></span>
    </div>
    ${invoice.notes ? `<div style="margin-top:3pt;font-size:8pt;font-style:italic;color:#64748b">Reason: ${esc(invoice.notes)}</div>` : ''}
  </div>` : ''}

  <!-- 4. Items -->
  <table style="margin-bottom:14pt">
    <thead><tr style="background:${T.accent}">${cols.map(([h, w, al], i) =>
      `<th style="width:${w};text-align:${al};color:#fff;font-size:8pt;font-weight:700;padding:6pt 4pt;${i === 0 ? `border-radius:${T.radius}pt 0 0 ${T.radius}pt;` : ''}${i === cols.length - 1 ? `border-radius:0 ${T.radius}pt ${T.radius}pt 0;` : ''}">${h}</th>`).join('')}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <!-- 5. Tax analysis + totals -->
  <div style="display:flex;justify-content:space-between;margin-top:10pt;padding-top:4pt;page-break-inside:avoid">
    <div style="width:46%;border:1px solid ${T.border};border-radius:${T.radius}pt;padding:8pt">
      <div style="${secTitle}">Tax Analysis</div>
      <table style="font-size:8pt">
        <thead><tr style="border-bottom:1px solid #e2e8f0;color:#64748b">
          <th style="width:25%;text-align:left;font-weight:400;padding-bottom:2pt">VAT %</th>
          <th style="width:25%;text-align:right;font-weight:400">Net.Amt</th>
          <th style="width:25%;text-align:right;font-weight:400">VAT</th>
          <th style="width:25%;text-align:right;font-weight:400">Amount</th></tr></thead>
        <tbody>${taxRows || `<tr><td colspan="4" style="padding-top:2pt;color:${T.muted}">—</td></tr>`}</tbody>
      </table>
    </div>
    <div style="width:46%;${box}padding:8pt">
      <div style="display:flex;justify-content:space-between;margin-bottom:2pt;padding-bottom:2pt;border-bottom:1px solid #f1f5f9">
        <span style="color:#64748b">Number of Items</span><b style="color:#1e293b">${+qtySum.toFixed(3)}</b></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4pt"><span>Total (excl. tax)</span><span>${n2(subtotal)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4pt"><span>Total VAT</span><span>${n2(taxAmt)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4pt"><span>Invoice total, ${esc(currency)}</span><span>${n2(total)}</span></div>
      <div style="display:flex;justify-content:space-between;border-top:1.5pt solid ${T.accent};padding-top:7pt;margin-top:5pt;font-size:12pt;font-weight:700">
        <span>Total amount ${vatReg ? '(incl. tax)' : ''}</span><span>${esc(currency)} ${n2(total)}</span></div>
    </div>
  </div>

  ${invoice.notes && txType !== 'CreditNote' && txType !== 'DebitNote' ? `
  <div style="margin-top:18pt;padding:10pt;${box}">
    <div style="font-size:8pt;font-weight:700;color:${T.accent};margin-bottom:4pt;text-transform:uppercase">${isQuote ? 'Terms &amp; Conditions' : 'Notes'}</div>
    <div style="color:#475569">${esc(invoice.notes)}</div>
  </div>` : ''}

  ${bankBits.length ? `
  <div style="margin-top:10pt;padding:8pt;${box}text-align:center">
    <div style="font-size:8pt;font-weight:700;color:${T.accent};margin-bottom:3pt">PAYMENT DETAILS</div>
    <div style="font-size:8pt;color:#475569">${bankBits.join(' <span style="color:#cbd5e1">&nbsp;|&nbsp;</span> ')}</div>
    <div style="font-size:6pt;color:#94a3b8;font-style:italic;margin-top:2pt">Please use Invoice Number as payment reference</div>
  </div>` : ''}

  ${qrPlace === 'footer' && (qrImg || qrData) ? `
  <div style="margin-top:12pt;padding:9pt;${box}display:flex;justify-content:center;align-items:center;page-break-inside:avoid">
    <div style="margin-right:12pt">${qrTag(70)}</div>
    <div>
      <div style="font-size:9pt;font-weight:700;color:${T.accent};margin-bottom:2pt">${authority} Verification QR</div>
      <div style="font-size:7pt;color:#64748b">Scan to verify this fiscal document.</div>
      ${verCode ? `<div style="font-size:7pt;color:#64748b;margin-top:2pt">Code: ${esc(verCode)}</div>` : ''}
    </div>
  </div>` : ''}

  <!-- 6. Footer -->
  <div style="margin-top:22pt;border-top:1px solid #e2e8f0;padding-top:10pt;text-align:center">
    <div style="font-size:8pt;color:#64748b;margin-bottom:3pt">${esc([cfg.tradingName || cfg.companyName, cfg.phone, cfg.email].filter(Boolean).join(' | '))}</div>
    <div style="font-size:7pt;color:${(isFiscal || !vatReg) ? '#94a3b8' : '#b45309'}">${(isFiscal || !vatReg) ? 'Thank you for your business.' : 'PROFORMA - NOT VALID FOR TAX PURPOSES'}</div>
  </div>
  </body></html>`;
}

/** Generate the QR PNG (via main process) and attach it to `fiscal._qrImg` before building HTML. */
async function _withQrImage(invoice, fiscal) {
  const f = { ...(fiscal || {}) };
  const data = f.qrCode || f.qrCodeData || f.qrUrl || (invoice && invoice.qrCodeData);
  if (data && !f._qrImg && window.fiscalBridgeAPI?.qrDataUrl) {
    try { const r = await window.fiscalBridgeAPI.qrDataUrl(data, 300); if (r?.success) f._qrImg = r.data; } catch {}
  }
  return f;
}

// ── The 3 canonical templates ─────────────────────────────────────────────────
const PRINT_TEMPLATES = {
  thermal80: {
    label:  'Fiscal Receipt — 80mm thermal',
    format: 'thermal',
    generate(invoice, fiscal, cfg) { return _buildThermal('80mm', invoice, fiscal, cfg); },
  },
  thermal58: {
    label:  'Compact Receipt — 58mm thermal',
    format: 'thermal',
    generate(invoice, fiscal, cfg) { return _buildThermal('58mm', invoice, fiscal, cfg); },
  },
  modernA4: {
    label:  'Modern Blue — A4 Invoice',
    format: 'a4',
    generate(invoice, fiscal, cfg) { return _buildModernA4(invoice, fiscal, cfg); },
  },
};
// Alias for old configs
PRINT_TEMPLATES.standard = PRINT_TEMPLATES.thermal80;

function buildReceiptHTML(invoice, fiscal, cfg) {
  const tpl = PRINT_TEMPLATES[cfg.printTemplate || 'thermal80'] || PRINT_TEMPLATES.thermal80;
  return tpl.generate(invoice, fiscal, cfg);
}


async function printFiscalReceipt(invoice, fiscal) {
  const tpl = PRINT_TEMPLATES[config.printTemplate || 'thermal80'] || PRINT_TEMPLATES.thermal80;
  const f = await _withQrImage(invoice, fiscal);
  const html = buildReceiptHTML(invoice, f, config);
  try { 
    const r = await window.fiscalBridgeAPI.printReceipt(html, config.printerName, tpl.format);
    if (r && r.success === false) throw new Error(r.error || 'Print failed');
    showSystemNotification(
      'FiscalBridge - Receipt Printed',
      r && r.usedDefault
        ? `Invoice ${invoice.invoiceNumber || 'Unknown'} sent to the default printer (configured printer unavailable)`
        : `Invoice ${invoice.invoiceNumber || 'Unknown'} printed successfully`,
      'success'
    );
  }
  catch(e) { 
    const message = _printErrorText(e);
    console.error('Print failed:', message);
    showSystemNotification(
      'FiscalBridge - Print Error',
      `Failed to print invoice ${invoice.invoiceNumber || 'Unknown'}: ${message}`,
      'error'
    );
  }
}


// ─── Confirm Dialog ────────────────────────────────────────────────────────────
let _confirmCallback = null;
function setupConfirmDialog() {
  document.getElementById('confirmCancelBtn').addEventListener('click', () => {
    document.getElementById('confirmDialog').classList.remove('open');
    _confirmCallback = null;
  });
  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    document.getElementById('confirmDialog').classList.remove('open');
    if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
  });
  document.getElementById('confirmInput').addEventListener('input', e => {
    const required = document.getElementById('confirmOkBtn').dataset.required;
    document.getElementById('confirmOkBtn').disabled = !!required && e.target.value !== required;
  });
}

function showConfirm(title, message, requiredWord, callback) {
  document.getElementById('confirmTitle').textContent   = title;
  document.getElementById('confirmMessage').textContent = message;
  const inputWrap = document.getElementById('confirmInputWrap');
  const okBtn     = document.getElementById('confirmOkBtn');
  if (requiredWord) {
    inputWrap.style.display = '';
    document.getElementById('confirmInputLabel').innerHTML = `Type <strong>${esc(requiredWord)}</strong> to confirm`;
    document.getElementById('confirmInput').value = '';
    okBtn.disabled = true;
    okBtn.dataset.required = requiredWord;
  } else {
    inputWrap.style.display = 'none';
    okBtn.disabled = false;
    delete okBtn.dataset.required;
  }
  _confirmCallback = callback;
  document.getElementById('confirmDialog').classList.add('open');
}

// ─── Currency list helpers ─────────────────────────────────────────────────────
function renderCurrencyList(containerId, currencies) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  (currencies||[]).forEach(c => addCurrencyRow(containerId, c.keyword||c, c.name||c));
}

function addCurrencyRow(containerId, keyword='', name='') {
  const container = document.getElementById(containerId);
  const row = document.createElement('div'); row.className = 'currency-row';
  row.innerHTML = `
    <input type="text" placeholder="Keyword (e.g. USD)" value="${esc(keyword)}" class="c-kw">
    <input type="text" placeholder="Name (e.g. US Dollar)" value="${esc(name)}" class="c-name">
    <button class="btn-ghost btn-icon" onclick="this.closest('.currency-row').remove()" aria-label="Remove">✕</button>`;
  container.appendChild(row);
}

function getCurrenciesFromList(containerId) {
  const rows = document.querySelectorAll(`#${containerId} .currency-row`);
  return [...rows].map(row => ({
    keyword: row.querySelector('.c-kw').value.trim(),
    name:    row.querySelector('.c-name').value.trim(),
  })).filter(c => c.keyword);
}

// ─── Config export / import ───────────────────────────────────────────────────
function exportConfigJSON() {
  const safe = { ...config };
  const includeSecrets = confirm('Include API key in export?');
  if (!includeSecrets) delete safe.apiKey;
  const blob = new Blob([JSON.stringify(safe,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='fiscalbridge-config.json'; a.click();
}

async function importConfigJSON(file) {
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    const migrated = migrateConfigV2(raw);
    Object.assign(config, migrated);
    await saveConfig();
    showToast('Config imported and migrated','success');
    populateSettings();
  } catch(e) { showToast('Import failed: '+e.message, 'error'); }
}

// ─── Header fiscal day badge ──────────────────────────────────────────────────
function renderHeaderFiscalStatus() {
  let pill = document.getElementById('headerFiscalPill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'headerFiscalPill';
    pill.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:.75rem;font-weight:600;padding:4px 10px;border-radius:999px;background:var(--pill-ok-bg);color:var(--pill-ok-text);flex-shrink:0;';
    // insert before the watcher pill
    const header = document.querySelector('.page-header');
    const watcherPill = document.getElementById('watcherPill');
    if (header && watcherPill) header.insertBefore(pill, watcherPill);
  }
  
  // Handle both camelCase and PascalCase field names from API
  const fiscalDayStatus = config.fiscalDayStatus || config.Data?.fiscalDayStatus;
  const fiscalDayNo = config.fiscalDayNo || config.FiscalDay || config.Data?.FiscalDay || config.Data?.lastFiscalDayNo;
  
  const isOpen = _fiscalDayOpen(fiscalDayStatus);
  const dayNo  = fiscalDayNo ? `Day ${fiscalDayNo}` : 'No Day';
  const company = config.companyName ? `${config.companyName} · ` : '';
  if (isOpen) {
    pill.style.background = 'var(--pill-ok-bg)';
    pill.style.color = 'var(--pill-ok-text)';
    pill.textContent = `${company}${dayNo} Open`;
  } else {
    pill.style.background = 'var(--pill-offline-bg)';
    pill.style.color = 'var(--pill-offline-text)';
    pill.textContent = `${company}${dayNo} Closed`;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function pad(n) { return String(n).padStart(2,'0'); }

function timeAgo(ts) {
  const sec = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec < 60)   return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec/60)}m ago`;
  return `${Math.round(sec/3600)}h ago`;
}

function statusPill(status) {
  const map = {
    fiscalised:   ['pill-ok',     'Fiscalised'],
    queued:       ['pill-queued', 'Queued'],
    retrying:     ['pill-queued', 'Retrying'],
    needs_review: ['pill-fail',   'Needs Review'],
  };
  const [cls,label] = map[status] || ['pill-queued','Unknown'];
  return `<span class="pill ${cls}">${label}</span>`;
}

function kv(label, value) {
  return `<div class="drawer-kv"><dt>${esc(label)}</dt><dd>${value||'—'}</dd></div>`;
}

function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ─── Template settings (now lives in the Printer section of index.html) ───────
// selectTemplate is called from onclick in the 3 template cards
function selectTemplate(key) {
  config.printTemplate = key;
  applyTemplateGridState(key);
  const tpl = PRINT_TEMPLATES[key];
  if (tpl) {
    const fmt = document.getElementById('cfg-print-format');
    if (fmt) fmt.value = tpl.format === 'a4' ? 'a4' : 'thermal';
  }
}

// Keep old name as alias for any remaining references
function selectPrintTemplate(key) { selectTemplate(key); }

function applyTemplateGridState(activeKey) {
  ['thermal80','thermal58','modernA4'].forEach(k => {
    const btn = document.getElementById('tpl-btn-' + k);
    if (btn) btn.classList.toggle('active', k === activeKey);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Wire the printer / template section buttons
  const saveTemplateBtn = document.getElementById('saveTemplateBtn');
  if (saveTemplateBtn) {
    saveTemplateBtn.addEventListener('click', async () => {
      config.printFormat   = (document.getElementById('cfg-print-format')?.value)  || 'thermal';
      config.showLogo      = (document.getElementById('cfg-show-logo')?.value)      !== '0';
      config.showQR        = (document.getElementById('cfg-show-qr')?.value)        !== '0';
      // printTemplate is set by selectTemplate()
      await saveConfig();
      showToast('Template settings saved', 'success');
    });
  }

  const previewBtn = document.getElementById('previewTemplateBtn');
  if (previewBtn) {
    previewBtn.addEventListener('click', async () => {
      const tpl = PRINT_TEMPLATES[config.printTemplate || 'thermal80'] || PRINT_TEMPLATES.thermal80;
      const sampleInvoice = {
        invoiceNumber: 'INV-DEMO-001', total: 183.99, taxAmount: 24.00, currency: 'USD', date: '2026-10-22',
        buyer: { name: 'Sample Customer' },
        items: [
          { description: 'PREPACK DOUBLE BRACKET WITH LID OAK PER 20', qty: 3, unitPrice: 15.65, lineTotal: 46.95, taxRate: 15, sku: 'RPREM19OAK20' },
          { description: 'BORING BIT', qty: 1, unitPrice: 113.04, lineTotal: 113.04, taxRate: 15, sku: '003569' },
        ],
      };
      const sampleFiscal = await _withQrImage(sampleInvoice, {
        fiscalCode: 'FC-9A2B-C48D-80FE', receiptGlobalNo: '42', receiptCounter: '7', fiscalDayNo: 3,
        qrCode: 'https://receipt.zimra.org/0000012345221020260000000042A1B2C3D4E5F60718',
      });
      const html = tpl.generate(sampleInvoice, sampleFiscal, config);
      // Open in a new window for preview
      const win = window.open('', '_blank', 'width=700,height=900,scrollbars=yes');
      if (win) { win.document.write(html); win.document.close(); }
    });
  }

  // Apply saved template state on load (called again after populateSettings)
  applyTemplateGridState(config.printTemplate || 'thermal80');

  // Wizard step 5: inject template selector
  const wzPrinterSection = document.querySelector('[data-wpage="5"] .wizard-body');
  if (wzPrinterSection && !document.getElementById('wz-template')) {
    const tplGroup = document.createElement('div'); tplGroup.className = 'form-group'; tplGroup.style.marginTop = '12px';
    tplGroup.innerHTML = `<label for="wz-template">Receipt Template</label>
      <select id="wz-template">
        <option value="thermal80">Fiscal Receipt — 80mm thermal</option>
        <option value="thermal58">Compact Receipt — 58mm thermal</option>
        <option value="modernA4">Modern Blue — A4 Invoice</option>
      </select>`;
    wzPrinterSection.insertBefore(tplGroup, wzPrinterSection.lastElementChild);
    document.getElementById('wz-template').value = config.printTemplate || 'thermal80';
  }
});

// Patch refreshDashboard to also update header fiscal pill and page-level subtitle
const _origRefreshDashboard = refreshDashboard;
refreshDashboard = function() {
  _origRefreshDashboard && _origRefreshDashboard();
  renderHeaderFiscalStatus();
};

// ─── Status Indicator ───────────────────────────────────────────────────────────
let currentStatus = { status: 'unknown', label: 'Checking…', color: '#C0C0C0', queueCount: 0 };

function setupStatusIndicator() {
  // Initial status fetch
  updateStatusDisplay();
  
  // Periodic status refresh (every 15 seconds, matching C# implementation)
  setInterval(updateStatusDisplay, 15000);
}

async function updateStatusDisplay() {
  try {
    const status = await window.fiscalBridgeAPI.getStatus();
    if (status) {
      currentStatus = status;
      renderStatusIndicator();
    }
  } catch (e) {
    console.error('Failed to fetch status:', e);
  }
}

function renderStatusIndicator() {
  const statusDot = document.getElementById('connectionStatusDot');
  const statusText = document.getElementById('connectionStatusText');
  const statusTooltip = document.getElementById('connectionStatusTooltip');
  
  if (statusDot) {
    statusDot.style.backgroundColor = currentStatus.color;
    statusDot.title = currentStatus.tooltip || currentStatus.label;
  }
  
  if (statusText) {
    statusText.textContent = currentStatus.label;
    statusText.style.color = currentStatus.color;
  }
  
  if (statusTooltip) {
    statusTooltip.textContent = currentStatus.tooltip || currentStatus.label;
  }
}

