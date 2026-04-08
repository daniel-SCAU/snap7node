'use strict';

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', 'settings.json');

const DEFAULT_SETTINGS = {
  plcIp: '192.168.1.10',
  plcRack: 0,
  plcSlot: 1,
  cameraIp: '192.168.1.73',
  cameraRtspUrl: 'rtsp://192.168.1.73/LiveStream',
  pollIntervalMs: 1000,
};

function load() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    }
  } catch (e) {
    console.error('[settings] Failed to load settings, using defaults:', e.message);
  }
  return Object.assign({}, DEFAULT_SETTINGS);
}

function save(settings) {
  const merged = Object.assign(load(), settings);
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = { load, save, DEFAULT_SETTINGS };
