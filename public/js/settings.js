'use strict';

/* ── Toast helper ────────────────────────────────────────────────────────── */

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

/* ── Defaults ────────────────────────────────────────────────────────────── */

const DEFAULTS = {
  plcIp: '192.168.1.10',
  plcRack: 0,
  plcSlot: 1,
  cameraIp: '192.168.1.73',
  cameraUrl: 'http://192.168.1.73/',
  pollIntervalMs: 1000,
};

/* ── DOM refs ────────────────────────────────────────────────────────────── */

const fields = {
  plcIp:         document.getElementById('plcIp'),
  plcRack:       document.getElementById('plcRack'),
  plcSlot:       document.getElementById('plcSlot'),
  pollIntervalMs:document.getElementById('pollIntervalMs'),
  cameraIp:      document.getElementById('cameraIp'),
  cameraUrl:     document.getElementById('cameraUrl'),
};


const systemEnableToggle = document.getElementById('systemEnable');

/* ── Load settings ───────────────────────────────────────────────────────── */

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    applyToForm(data);
  } catch (e) {
    showToast('Could not load settings: ' + e.message, 'error');
    applyToForm(DEFAULTS);
  }
}

function applyToForm(data) {
  for (const [key, el] of Object.entries(fields)) {
    if (el && data[key] !== undefined) {
      el.value = data[key];
    }
  }
}

/* ── Load system enable state from PLC ───────────────────────────────────── */

async function loadSystemEnable() {
  if (!systemEnableToggle) return;
  try {
    const res = await fetch('/api/plc/system-enable');
    const json = await res.json();
    if (json.ok && json.value !== null) {
      systemEnableToggle.checked = json.value;
    }
  } catch (_) {
    // PLC may not be connected; leave default (checked = enabled)
  }
}

/* ── Save settings ───────────────────────────────────────────────────────── */

async function saveSettings() {
  const payload = {};
  for (const [key, el] of Object.entries(fields)) {
    if (!el) continue;
    const val = el.value.trim();
    if (key === 'plcRack' || key === 'plcSlot' || key === 'pollIntervalMs') {
      payload[key] = parseInt(val, 10) || 0;
    } else {
      payload[key] = val;
    }
  }

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.ok) {
      showToast('Settings saved successfully', 'success');
      const fb = document.getElementById('save-feedback');
      if (fb) { fb.style.display = 'block'; setTimeout(() => (fb.style.display = 'none'), 4000); }
    } else {
      showToast('Save failed: ' + json.error, 'error');
    }
  } catch (e) {
    showToast('Save error: ' + e.message, 'error');
  }

  // Also write system enable to PLC
  if (systemEnableToggle) {
    await writeSystemEnable(systemEnableToggle.checked);
  }
}

/* ── Write system enable to PLC ──────────────────────────────────────────── */

async function writeSystemEnable(value) {
  try {
    const res = await fetch('/api/plc/system-enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    const json = await res.json();
    if (!json.ok) {
      showToast('System Enable write failed: ' + json.error, 'error');
    }
  } catch (e) {
    showToast('System Enable write error: ' + e.message, 'error');
  }
}

/* ── Wire up events ──────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadSystemEnable();

  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveSettings);

  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      applyToForm(DEFAULTS);
      if (systemEnableToggle) systemEnableToggle.checked = true;
      showToast('Form reset to defaults (not saved yet)', 'info');
    });
  }

  // Toggle writes immediately to PLC on change
  if (systemEnableToggle) {
    systemEnableToggle.addEventListener('change', () => {
      writeSystemEnable(systemEnableToggle.checked);
      showToast(systemEnableToggle.checked ? 'System Enable: ON' : 'System Enable: OFF', 'info', 2000);
    });
  }
});
