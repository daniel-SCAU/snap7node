'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');

const settingsModule = require('./src/settings');
const plcClient = require('./src/plc');

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Settings API ─────────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  res.json(settingsModule.load());
});

app.post('/api/settings', (req, res) => {
  try {
    const saved = settingsModule.save(req.body);
    // Reconnect PLC with new settings
    plcClient.disconnect();
    tryConnectPlc(saved);
    res.json({ ok: true, settings: saved });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── PLC write API ────────────────────────────────────────────────────────────

app.get('/api/plc/system-enable', async (req, res) => {
  if (!plcClient.isConnected) {
    return res.status(503).json({ ok: false, error: 'PLC not connected', value: null });
  }
  try {
    const data = await plcClient.readAll();
    res.json({ ok: true, value: data.enableVision });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, value: null });
  }
});

app.post('/api/plc/system-enable', async (req, res) => {
  const { value } = req.body;
  if (typeof value !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'value must be a boolean' });
  }
  try {
    await plcClient.writeSystemEnable(value);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/plc/mes-batch', async (req, res) => {
  const { value } = req.body;
  const num = parseInt(value, 10);
  if (!Number.isFinite(num)) {
    return res.status(400).json({ ok: false, error: 'value must be an integer' });
  }
  try {
    await plcClient.writeMesBatch(num);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── PLC polling ──────────────────────────────────────────────────────────────

let plcPollTimer = null;
let plcStatus = { connected: false, error: null, lastUpdate: null };

async function tryConnectPlc(settings) {
  try {
    await plcClient.connect(settings);
    plcStatus.connected = true;
    plcStatus.error = null;
    console.log(`[PLC] Connected to ${settings.plcIp}`);
    startPolling(settings);
  } catch (e) {
    plcStatus.connected = false;
    plcStatus.error = e.message;
    console.warn(`[PLC] Connection failed: ${e.message}. Retrying in 5s…`);
    setTimeout(() => tryConnectPlc(settingsModule.load()), 5000);
  }
}

function startPolling(settings) {
  if (plcPollTimer) clearInterval(plcPollTimer);
  // Clamp to a safe range regardless of user-supplied value
  const rawInterval = parseInt(settings.pollIntervalMs, 10);
  const interval = Number.isFinite(rawInterval)
    ? Math.min(Math.max(rawInterval, 200), 30000)
    : 1000;

  plcPollTimer = setInterval(async () => {
    const currentSettings = settingsModule.load();
    try {
      if (!plcClient.isConnected) {
        clearInterval(plcPollTimer);
        plcPollTimer = null;
        await tryConnectPlc(currentSettings);
        return;
      }
      const data = await plcClient.readAll();
      plcStatus.connected = true;
      plcStatus.error = null;
      plcStatus.lastUpdate = new Date().toISOString();
      io.emit('plcData', { status: plcStatus, data });
    } catch (e) {
      plcStatus.connected = false;
      plcStatus.error = e.message;
      plcClient.disconnect();
      clearInterval(plcPollTimer);
      plcPollTimer = null;
      io.emit('plcStatus', plcStatus);
      console.warn(`[PLC] Read error: ${e.message}. Reconnecting…`);
      setTimeout(() => tryConnectPlc(settingsModule.load()), 3000);
    }
  }, interval);
}

// ─── Socket.io connection ─────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);
  socket.emit('plcStatus', plcStatus);
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
httpServer.listen(PORT, HOST, () => {
  console.log(`\n✅  Vision Dashboard running at http://localhost:${PORT}\n`);
  const settings = settingsModule.load();
  tryConnectPlc(settings);
});
