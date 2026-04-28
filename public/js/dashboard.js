'use strict';

/* ── Utility helpers ─────────────────────────────────────────────────────── */

function showToast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function fmt(value) {
  if (value === null || value === undefined) return '—';
  return typeof value === 'number' ? value.toLocaleString() : String(value);
}

// Display integers without locale comma separators (e.g. batch codes: 1234567 not 1,234,567)
function fmtId(value) {
  if (value === null || value === undefined) return '—';
  return String(value);
}

function setValueAnimated(el, newText) {
  if (!el) return;
  if (el.textContent === newText) return;
  el.textContent = newText;
  el.classList.remove('flash');
  void el.offsetWidth; // reflow to restart animation
  el.classList.add('flash');
}

/* ── Element references ──────────────────────────────────────────────────── */

const els = {
  plcBadge:      document.getElementById('plc-status-badge'),
  lastUpdate:    document.getElementById('last-update'),
  visionBadge:   document.getElementById('vision-badge'),
  indicatorGood: document.getElementById('indicator-good'),
  indicatorBad:  document.getElementById('indicator-bad'),
  goodState:     document.getElementById('good-state'),
  badState:      document.getElementById('bad-state'),

  goodReads:     document.getElementById('val-goodReads'),
  badReads:      document.getElementById('val-badReads'),
  totalBags:     document.getElementById('val-totalBags'),
  currentBatch:  document.getElementById('val-currentBatch'),
  mesBatch:      document.getElementById('val-mesBatch'),
  ocrCode:       document.getElementById('val-actualBatchCodeOCR'),

  triggerOffset:    document.getElementById('val-triggerOffset'),
  enableVision:     document.getElementById('val-enableVision'),
  ocrDetail:        document.getElementById('val-ocrDetail'),
  currentBatchDetail: document.getElementById('val-currentBatchDetail'),
  mesBatchDetail:   document.getElementById('val-mesBatchDetail'),

  oee:              document.getElementById('val-oee'),
  batchStr:         document.getElementById('val-batchStr'),
  lastBatchStartStr:document.getElementById('val-lastBatchStartStr'),
  lastBatchBBStr:   document.getElementById('val-lastBatchBBStr'),
  lastBagNo:        document.getElementById('val-lastBagNo'),

  beforeDateDInt:   document.getElementById('val-beforeDateDInt'),
  prodDateDInt:     document.getElementById('val-prodDateDInt'),
  bagNoDInt:        document.getElementById('val-bagNoDInt'),

  lastGoodCountTotal:   document.getElementById('val-lastGoodCountTotal'),
  lastRejectCountTotal: document.getElementById('val-lastRejectCountTotal'),
  deltaGood:            document.getElementById('val-deltaGood'),
  deltaReject:          document.getElementById('val-deltaReject'),
  internalTimestamp_s:  document.getElementById('val-internalTimestamp'),
  logTimer_s:           document.getElementById('val-logTimer'),
  logSequence:          document.getElementById('val-logSequence'),
  availability:         document.getElementById('val-availability'),
  performance:          document.getElementById('val-performance'),
  quality:              document.getElementById('val-quality'),
  oeeReal:              document.getElementById('val-oeeReal'),

  qualityPct:       document.getElementById('quality-pct'),
  qualityBar:       document.getElementById('quality-bar'),
  progressGoodLabel:document.getElementById('progress-good-label'),
  progressTotalLabel:document.getElementById('progress-total-label'),

  cameraStatus:     document.getElementById('camera-status'),
  cameraIpLabel:    document.getElementById('camera-ip-label'),
  cameraUrlDisplay: document.getElementById('camera-url-display'),
  cameraOverlay:    document.getElementById('camera-overlay'),
  cameraOverlayText:document.getElementById('camera-overlay-text'),
  liveBadge:        document.getElementById('live-badge'),
};

/* ── PLC status ──────────────────────────────────────────────────────────── */

function updatePlcStatus(status) {
  if (!els.plcBadge) return;
  if (status.connected) {
    els.plcBadge.className = 'status-dot connected';
    els.plcBadge.querySelector('.label').textContent = 'PLC Connected';
  } else {
    els.plcBadge.className = 'status-dot disconnected';
    els.plcBadge.querySelector('.label').textContent = status.error
      ? 'PLC Error'
      : 'PLC Disconnected';
  }
}

/* ── PLC data rendering ──────────────────────────────────────────────────── */

let prevGood = null;
let prevBad  = null;

function renderData(data) {
  setValueAnimated(els.goodReads,   fmt(data.goodReads));
  setValueAnimated(els.badReads,    fmt(data.badReads));
  setValueAnimated(els.totalBags,   fmt(data.totalBags));
  setValueAnimated(els.currentBatch,fmtId(data.currentBatch));
  setValueAnimated(els.mesBatch,    fmtId(data.mesBatch));
  setValueAnimated(els.ocrCode,     fmtId(data.actualBatchCodeOCR));

  // Detail panel
  setValueAnimated(els.triggerOffset,     fmt(data.triggerOffset));
  setValueAnimated(els.enableVision,      data.enableVision ? 'ON' : 'OFF');
  setValueAnimated(els.ocrDetail,         fmtId(data.actualBatchCodeOCR));
  setValueAnimated(els.currentBatchDetail,fmtId(data.currentBatch));
  setValueAnimated(els.mesBatchDetail,    fmtId(data.mesBatch));

  // Vision enable badge
  if (els.visionBadge) {
    els.visionBadge.className = 'vision-badge ' + (data.enableVision ? 'enabled' : 'disabled');
    els.visionBadge.textContent = data.enableVision ? '● Vision Enabled' : '○ Vision Disabled';
  }

  // Quality progress bar
  const total = (data.goodReads || 0) + (data.badReads || 0);
  if (total > 0 && els.qualityBar) {
    const pct = Math.round((data.goodReads / total) * 100);
    els.qualityBar.style.width = pct + '%';
    if (els.qualityPct) els.qualityPct.textContent = pct + '%';
    if (pct < 80) {
      els.qualityBar.style.background = 'linear-gradient(90deg, var(--accent-red), var(--accent-yellow))';
    } else {
      els.qualityBar.style.background = 'linear-gradient(90deg, var(--accent-blue), var(--accent-cyan))';
    }
  }
  if (els.progressGoodLabel) els.progressGoodLabel.textContent = `Good: ${fmt(data.goodReads)}`;
  if (els.progressTotalLabel) els.progressTotalLabel.textContent = `Total: ${fmt(total)}`;

  // OEE metric card – use PLC-calculated value when available, fall back to ratio
  if (els.oee) {
    if (data.oee != null && data.totalBags > 0) {
      setValueAnimated(els.oee, (data.oee * 100).toFixed(1) + '%');
    } else {
      const oeeTotal = data.totalBags || 0;
      if (oeeTotal > 0) {
        const oeePct = Math.round(((data.goodReads || 0) / oeeTotal) * 100);
        setValueAnimated(els.oee, oeePct + '%');
      } else {
        setValueAnimated(els.oee, 'N/A');
      }
    }
  }

  // Batch data
  setValueAnimated(els.batchStr,          data.batchStr          || '—');
  setValueAnimated(els.lastBatchStartStr, data.lastBatchStartStr  || '—');
  setValueAnimated(els.lastBatchBBStr,    data.lastBatchBBStr     || '—');
  setValueAnimated(els.lastBagNo,         data.lastBagNo          || '—');

  // Merker DInt batch fields
  setValueAnimated(els.beforeDateDInt, fmtId(data.beforeDateDInt));
  setValueAnimated(els.prodDateDInt,   fmtId(data.prodDateDInt));
  setValueAnimated(els.bagNoDInt,      fmtId(data.bagNoDInt));

  // OEE data
  setValueAnimated(els.lastGoodCountTotal,   fmt(data.lastGoodCountTotal));
  setValueAnimated(els.lastRejectCountTotal, fmt(data.lastRejectCountTotal));
  setValueAnimated(els.deltaGood,            fmt(data.deltaGood));
  setValueAnimated(els.deltaReject,          fmt(data.deltaReject));
  setValueAnimated(els.internalTimestamp_s,  data.internalTimestamp_s != null ? data.internalTimestamp_s.toFixed(3) : '—');
  setValueAnimated(els.logTimer_s,           data.logTimer_s != null ? data.logTimer_s.toFixed(3) : '—');
  setValueAnimated(els.logSequence,          fmt(data.logSequence));
  setValueAnimated(els.availability,         data.availability != null ? (data.availability * 100).toFixed(1) + '%' : '—');
  setValueAnimated(els.performance,          data.performance  != null ? (data.performance  * 100).toFixed(1) + '%' : '—');
  setValueAnimated(els.quality,              data.quality      != null ? (data.quality      * 100).toFixed(1) + '%' : '—');
  setValueAnimated(els.oeeReal,              data.oee          != null ? (data.oee          * 100).toFixed(1) + '%' : '—');

  // Read result indicators
  const goodActive = data.lastReadGood;
  const badActive  = data.lastReadBad;

  if (els.indicatorGood) {
    els.indicatorGood.className = 'read-indicator' + (goodActive ? ' good-active' : '');
    if (els.goodState) els.goodState.textContent = goodActive ? 'Active – GOOD READ' : 'Inactive';
  }
  if (els.indicatorBad) {
    els.indicatorBad.className = 'read-indicator' + (badActive ? ' bad-active' : '');
    if (els.badState) els.badState.textContent = badActive ? 'Active – BAD READ' : 'Inactive';
  }

  // Toast on state change
  if (prevGood !== null && !prevGood && goodActive) {
    showToast('✅ Good Read detected!', 'success', 3000);
  }
  if (prevBad !== null && !prevBad && badActive) {
    showToast('❌ Bad Read detected!', 'error', 3000);
  }
  prevGood = goodActive;
  prevBad  = badActive;

  // History chart
  pushHistory(data.goodReads, data.badReads);
}

/* ── History trend chart ─────────────────────────────────────────────────── */

const HISTORY_LEN = 30;
const historyGood = Array(HISTORY_LEN).fill(null);
const historyBad  = Array(HISTORY_LEN).fill(null);
const historyLabels = Array(HISTORY_LEN).fill('');
let historyChart = null;

function initChart() {
  const canvas = document.getElementById('history-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const ctx = canvas.getContext('2d');
  historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: historyLabels,
      datasets: [
        {
          label: 'Good Reads',
          data: historyGood,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Bad Reads',
          data: historyBad,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      animation: { duration: 300 },
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 10 },
        },
      },
      scales: {
        x: {
          ticks: { color: '#475569', font: { size: 10 }, maxRotation: 0 },
          grid: { color: 'rgba(30,41,59,0.8)' },
        },
        y: {
          ticks: { color: '#475569', font: { size: 10 } },
          grid: { color: 'rgba(30,41,59,0.8)' },
          beginAtZero: true,
        },
      },
    },
  });
}

function pushHistory(good, bad) {
  if (!historyChart) return;
  const now = new Date();
  const label = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  historyGood.push(good);
  historyBad.push(bad);
  historyLabels.push(label);
  if (historyGood.length > HISTORY_LEN) {
    historyGood.shift();
    historyBad.shift();
    historyLabels.shift();
  }
  historyChart.update('none');
}

/* ── Camera stream (iframe) ──────────────────────────────────────────────── */

function initCamera(settings) {
  const cameraUrl = settings.cameraUrl || '';

  if (els.cameraUrlDisplay) {
    els.cameraUrlDisplay.textContent = cameraUrl || '—';
  }

  try {
    const url = new URL(cameraUrl);
    if (els.cameraIpLabel) els.cameraIpLabel.textContent = url.hostname;
  } catch (_) {}

  const iframeEl = document.getElementById('camera-iframe');
  if (!iframeEl) return;

  if (!cameraUrl) {
    if (els.cameraOverlayText) els.cameraOverlayText.textContent = 'No camera URL configured';
    return;
  }

  if (els.cameraOverlayText) els.cameraOverlayText.textContent = 'Loading camera…';
  if (els.cameraOverlay) els.cameraOverlay.classList.remove('hidden');
  if (els.liveBadge) els.liveBadge.classList.add('hidden');

  iframeEl.onload = () => {
    if (els.cameraStatus) {
      els.cameraStatus.className = 'status-dot connected';
      els.cameraStatus.querySelector('span:last-child').textContent = 'Live';
    }
    if (els.cameraOverlay) els.cameraOverlay.classList.add('hidden');
    if (els.liveBadge) els.liveBadge.classList.remove('hidden');
  };

  iframeEl.onerror = () => {
    if (els.cameraStatus) {
      els.cameraStatus.className = 'status-dot disconnected';
      els.cameraStatus.querySelector('span:last-child').textContent = 'Offline';
    }
    if (els.cameraOverlay) {
      els.cameraOverlay.classList.remove('hidden');
      if (els.cameraOverlayText) els.cameraOverlayText.textContent = 'Camera unavailable';
    }
    if (els.liveBadge) els.liveBadge.classList.add('hidden');
  };

  iframeEl.src = cameraUrl;
}

/* ── Socket.io ───────────────────────────────────────────────────────────── */

const socket = io();

socket.on('connect', () => {
  showToast('Connected to dashboard server', 'info', 2000);
});

socket.on('disconnect', () => {
  showToast('Disconnected from server', 'error', 4000);
  updatePlcStatus({ connected: false, error: 'Server disconnected' });
});

socket.on('plcStatus', (status) => {
  updatePlcStatus(status);
  if (!status.connected && status.error) {
    showToast(`PLC: ${status.error}`, 'error', 5000);
  }
});

socket.on('plcData', ({ status, data }) => {
  updatePlcStatus(status);
  renderData(data);
  if (els.lastUpdate) {
    els.lastUpdate.textContent = new Date().toLocaleTimeString();
  }
});

/* ── New Batch virtual keypad ────────────────────────────────────────────── */

let keypadValue = '0';

function openBatchModal() {
  keypadValue = '0';
  updateKeypadDisplay();
  const modal = document.getElementById('batch-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('visible');
  }
}

function closeBatchModal() {
  const modal = document.getElementById('batch-modal');
  if (modal) {
    modal.classList.remove('visible');
    modal.classList.add('hidden');
  }
}

function updateKeypadDisplay() {
  const display = document.getElementById('keypad-display');
  if (display) display.textContent = keypadValue;
}

function keypadPress(key) {
  if (keypadValue === '0') {
    keypadValue = key;
  } else {
    if (keypadValue.length < 10) {
      const next = keypadValue + key;
      if (parseInt(next, 10) <= 2147483647) keypadValue = next;
    }
  }
  updateKeypadDisplay();
}

function keypadBackspace() {
  if (keypadValue.length <= 1) {
    keypadValue = '0';
  } else {
    keypadValue = keypadValue.slice(0, -1);
  }
  updateKeypadDisplay();
}

async function confirmNewBatch() {
  const num = parseInt(keypadValue, 10);
  if (!Number.isFinite(num) || num < -2147483648 || num > 2147483647) {
    showToast('Value must be a valid 32-bit integer (−2 147 483 648 to 2 147 483 647)', 'error');
    return;
  }
  try {
    const res = await fetch('/api/plc/mes-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: num }),
    });
    const json = await res.json();
    if (json.ok) {
      showToast(`MES Batch set to ${num}`, 'success');
      closeBatchModal();
    } else {
      showToast('Write failed: ' + json.error, 'error');
    }
  } catch (e) {
    showToast('Write error: ' + e.message, 'error');
  }
}

/* ── Init ────────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  initChart();

  // Fetch settings and init camera
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    initCamera(settings);
  } catch (e) {
    initCamera({ cameraUrl: 'http://192.168.1.73/' });
  }

  // New Batch button
  const newBatchBtn = document.getElementById('new-batch-btn');
  if (newBatchBtn) newBatchBtn.addEventListener('click', openBatchModal);

  const modalCloseBtn = document.getElementById('modal-close-btn');
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeBatchModal);

  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeBatchModal);

  const modalConfirmBtn = document.getElementById('modal-confirm-btn');
  if (modalConfirmBtn) modalConfirmBtn.addEventListener('click', confirmNewBatch);

  const keypadBackspaceBtn = document.getElementById('keypad-backspace');
  if (keypadBackspaceBtn) keypadBackspaceBtn.addEventListener('click', keypadBackspace);

  document.querySelectorAll('.keypad-btn[data-key]').forEach((btn) => {
    btn.addEventListener('click', () => keypadPress(btn.dataset.key));
  });

  // Close modal on backdrop click
  const modal = document.getElementById('batch-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeBatchModal();
    });
  }
});
