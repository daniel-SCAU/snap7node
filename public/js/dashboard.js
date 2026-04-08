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
  cameraCanvas:     document.getElementById('camera-canvas'),
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
  setValueAnimated(els.currentBatch,fmt(data.currentBatch));
  setValueAnimated(els.mesBatch,    fmt(data.mesBatch));
  setValueAnimated(els.ocrCode,     fmt(data.actualBatchCodeOCR));

  // Detail panel
  setValueAnimated(els.triggerOffset,     fmt(data.triggerOffset));
  setValueAnimated(els.enableVision,      data.enableVision ? 'ON' : 'OFF');
  setValueAnimated(els.ocrDetail,         fmt(data.actualBatchCodeOCR));
  setValueAnimated(els.currentBatchDetail,fmt(data.currentBatch));
  setValueAnimated(els.mesBatchDetail,    fmt(data.mesBatch));

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

/* ── Camera stream (jsmpeg over WebSocket) ───────────────────────────────── */

let jsmpegPlayer = null;
let cameraConnected = false;

function initCamera(settings) {
  if (els.cameraUrlDisplay) {
    els.cameraUrlDisplay.textContent = settings.cameraRtspUrl || '—';
  }

  // Extract host for display
  try {
    const url = new URL(settings.cameraRtspUrl || 'rtsp://192.168.1.73');
    if (els.cameraIpLabel) els.cameraIpLabel.textContent = url.hostname;
  } catch (_) {}

  if (!els.cameraCanvas) return;
  if (!window.JSMpeg) {
    if (els.cameraOverlayText) els.cameraOverlayText.textContent = 'jsmpeg not loaded';
    return;
  }

  // Destroy previous player
  if (jsmpegPlayer) {
    try { jsmpegPlayer.destroy(); } catch (_) {}
    jsmpegPlayer = null;
  }

  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProto}//${location.host}/camera-stream`;

  if (els.cameraOverlayText) els.cameraOverlayText.textContent = 'Connecting to camera stream…';
  if (els.cameraOverlay) els.cameraOverlay.classList.remove('hidden');
  if (els.liveBadge) els.liveBadge.classList.add('hidden');

  jsmpegPlayer = new window.JSMpeg.Player(wsUrl, {
    canvas: els.cameraCanvas,
    autoplay: true,
    audio: false,
    onSourceEstablished: () => {
      cameraConnected = true;
      if (els.cameraStatus) {
        els.cameraStatus.className = 'status-dot connected';
        els.cameraStatus.querySelector('span:last-child').textContent = 'Live';
      }
      if (els.cameraOverlay) els.cameraOverlay.classList.add('hidden');
      if (els.liveBadge) els.liveBadge.classList.remove('hidden');
    },
    onSourceCompleted: () => {
      cameraConnected = false;
      if (els.cameraStatus) {
        els.cameraStatus.className = 'status-dot disconnected';
        els.cameraStatus.querySelector('span:last-child').textContent = 'Offline';
      }
      if (els.cameraOverlay) {
        els.cameraOverlay.classList.remove('hidden');
        if (els.cameraOverlayText) els.cameraOverlayText.textContent = 'Stream ended – reconnecting…';
      }
      if (els.liveBadge) els.liveBadge.classList.add('hidden');
    },
  });
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

/* ── Init ────────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  initChart();

  // Fetch settings and init camera
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    initCamera(settings);
  } catch (e) {
    initCamera({ cameraRtspUrl: 'rtsp://192.168.1.73/LiveStream' });
  }
});
