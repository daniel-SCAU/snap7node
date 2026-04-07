'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const { Server: SocketIOServer } = require('socket.io');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
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

// ─── RTSP → WebSocket proxy (MPEG-1 via ffmpeg → jsmpeg) ─────────────────────

const cameraWss = new WebSocketServer({ noServer: true });
const cameraClients = new Set();
let ffmpegProcess = null;
let ffmpegRtspUrl = null;

function startFfmpeg(rtspUrl) {
  if (ffmpegProcess) {
    const proc = ffmpegProcess;
    ffmpegProcess = null;
    proc.kill('SIGTERM');
    // Escalate to SIGKILL after 3 s if still running
    setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, 3000);
  }
  ffmpegRtspUrl = rtspUrl;

  console.log(`[RTSP] Starting ffmpeg stream from ${rtspUrl}`);
  const args = [
    '-loglevel', 'error',
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl,
    '-f', 'mpegts',
    '-codec:v', 'mpeg1video',
    '-b:v', '800k',
    '-r', '15',
    '-s', '800x600',
    '-bf', '0',
    'pipe:1',
  ];

  const proc = spawn('ffmpeg', args);
  ffmpegProcess = proc;

  proc.on('error', (err) => {
    ffmpegProcess = null;
    const msg = err.code === 'ENOENT'
      ? 'ffmpeg not found – install ffmpeg to enable camera streaming'
      : `ffmpeg error: ${err.message}`;
    console.warn(`[RTSP] ${msg}`);
    // Notify all connected camera clients
    for (const ws of cameraClients) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(JSON.stringify({ type: 'error', message: msg })); } catch (_) {}
      }
    }
  });

  proc.stdout.on('data', (chunk) => {
    for (const ws of cameraClients) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(chunk); } catch (_) {}
      }
    }
  });

  proc.stderr.on('data', (d) => console.error('[ffmpeg]', d.toString().trim()));

  proc.on('close', (code) => {
    ffmpegProcess = null;
    if (cameraClients.size > 0 && code !== null) {
      console.warn(`[RTSP] ffmpeg exited (${code}), restarting in 3s…`);
      setTimeout(() => {
        if (cameraClients.size > 0) startFfmpeg(settingsModule.load().cameraRtspUrl);
      }, 3000);
    }
  });
}

cameraWss.on('connection', (ws) => {
  cameraClients.add(ws);
  console.log(`[RTSP] Client connected (total: ${cameraClients.size})`);

  if (cameraClients.size === 1 || !ffmpegProcess) {
    const { cameraRtspUrl } = settingsModule.load();
    startFfmpeg(cameraRtspUrl);
  }

  ws.on('close', () => {
    cameraClients.delete(ws);
    console.log(`[RTSP] Client disconnected (remaining: ${cameraClients.size})`);
    if (cameraClients.size === 0 && ffmpegProcess) {
      const proc = ffmpegProcess;
      ffmpegProcess = null;
      proc.kill('SIGTERM');
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, 3000);
    }
  });
});

// Upgrade HTTP → WS for /camera-stream path only
httpServer.on('upgrade', (req, socket, head) => {
  if (req.url === '/camera-stream') {
    cameraWss.handleUpgrade(req, socket, head, (ws) => {
      cameraWss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

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
