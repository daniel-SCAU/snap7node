'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');

const settingsModule = require('./src/settings');
const plcClient = require('./src/plc');
const tagsModule = require('./src/tags');
const widgetStore = require('./src/widgetstore');
const notificationsModule = require('./src/notifications');

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

app.get('/api/plc/trigger-offset', async (req, res) => {
  if (!plcClient.isConnected) {
    return res.status(503).json({ ok: false, error: 'PLC not connected', value: null });
  }
  try {
    const data = await plcClient.readAll();
    res.json({ ok: true, value: data.triggerOffset });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, value: null });
  }
});

app.post('/api/plc/trigger-offset', async (req, res) => {
  const { value } = req.body;
  const num = parseInt(value, 10);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1 || num > 2000) {
    return res.status(400).json({ ok: false, error: 'value must be an integer between 1 and 2000' });
  }
  try {
    await plcClient.writeTriggerOffset(num);
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

// ─── Tags API ─────────────────────────────────────────────────────────────────

const VALID_AREAS     = ['MK', 'DB'];
const VALID_DATATYPES = ['Bool', 'Byte', 'Word', 'Int', 'DWord', 'DInt', 'Real'];

function validateTag(body) {
  const { name, area, dbNumber, byteOffset, bitOffset, dataType } = body;
  if (!name || typeof name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*$/.test(name)) {
    return 'name must be a non-empty string starting with a letter or underscore (alphanumeric/_ with optional dot-separated segments)';
  }
  if (!VALID_AREAS.includes(area)) return `area must be one of: ${VALID_AREAS.join(', ')}`;
  if (area === 'DB' && (!Number.isInteger(Number(dbNumber)) || Number(dbNumber) < 1)) {
    return 'dbNumber must be a positive integer for DB area';
  }
  if (!Number.isInteger(Number(byteOffset)) || Number(byteOffset) < 0) {
    return 'byteOffset must be a non-negative integer';
  }
  if (!VALID_DATATYPES.includes(dataType)) return `dataType must be one of: ${VALID_DATATYPES.join(', ')}`;
  if (dataType === 'Bool') {
    const bit = Number(bitOffset);
    if (!Number.isInteger(bit) || bit < 0 || bit > 7) return 'bitOffset must be 0-7 for Bool type';
  }
  return null;
}

// List all tags
app.get('/api/tags', (req, res) => {
  res.json({ ok: true, tags: tagsModule.getAll() });
});

// Create a tag
app.post('/api/tags', (req, res) => {
  const err = validateTag(req.body);
  if (err) return res.status(400).json({ ok: false, error: err });
  try {
    const { name, area, dbNumber, byteOffset, bitOffset, dataType } = req.body;
    const tag = {
      name,
      area,
      dbNumber:   area === 'DB' ? parseInt(dbNumber, 10) : 0,
      byteOffset: parseInt(byteOffset, 10),
      bitOffset:  dataType === 'Bool' ? parseInt(bitOffset, 10) : 0,
      dataType,
    };
    const created = tagsModule.create(tag);
    res.status(201).json({ ok: true, tag: created });
  } catch (e) {
    res.status(409).json({ ok: false, error: e.message });
  }
});

// Update a tag
app.put('/api/tags/:name', (req, res) => {
  const err = validateTag({ ...req.body, name: req.body.name || req.params.name });
  if (err) return res.status(400).json({ ok: false, error: err });
  try {
    const { name, area, dbNumber, byteOffset, bitOffset, dataType } = req.body;
    const patch = {
      name: name || req.params.name,
      area,
      dbNumber:   area === 'DB' ? parseInt(dbNumber, 10) : 0,
      byteOffset: parseInt(byteOffset, 10),
      bitOffset:  dataType === 'Bool' ? parseInt(bitOffset, 10) : 0,
      dataType,
    };
    const updated = tagsModule.update(req.params.name, patch);
    res.json({ ok: true, tag: updated });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

// Delete a tag
app.delete('/api/tags/:name', (req, res) => {
  try {
    tagsModule.remove(req.params.name);
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

// Read a tag value from the PLC
app.get('/api/tags/:name/value', async (req, res) => {
  if (!plcClient.isConnected) {
    return res.status(503).json({ ok: false, error: 'PLC not connected', value: null });
  }
  const tag = tagsModule.getByName(req.params.name);
  if (!tag) return res.status(404).json({ ok: false, error: `Tag "${req.params.name}" not found` });
  try {
    const value = await plcClient.readTag(tag);
    res.json({ ok: true, value });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, value: null });
  }
});

// Write a value to a tag on the PLC
app.post('/api/tags/:name/value', async (req, res) => {
  if (!plcClient.isConnected) {
    return res.status(503).json({ ok: false, error: 'PLC not connected' });
  }
  const tag = tagsModule.getByName(req.params.name);
  if (!tag) return res.status(404).json({ ok: false, error: `Tag "${req.params.name}" not found` });
  if (req.body.value === undefined || req.body.value === null) {
    return res.status(400).json({ ok: false, error: 'value is required' });
  }
  try {
    await plcClient.writeTag(tag, req.body.value);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Widgets API ──────────────────────────────────────────────────────────────

const VALID_WIDGET_TYPES = ['value', 'trend', 'indicator', 'write', 'bargraph', 'iframe', 'group', 'gauge', 'button', 'clock', 'slider'];

// Widget types that do not require a linked tag
const TAGLESS_WIDGET_TYPES = ['iframe', 'group', 'clock'];

function validateWidget(body) {
  const { id, type, tagName, label, colSpan, rowSpan, x, y, w, h } = body;
  if (!id || typeof id !== 'string') return 'id must be a non-empty string';
  if (!VALID_WIDGET_TYPES.includes(type)) return `type must be one of: ${VALID_WIDGET_TYPES.join(', ')}`;
  if (!TAGLESS_WIDGET_TYPES.includes(type)) {
    if (!tagName || typeof tagName !== 'string') return 'tagName must be a non-empty string';
  }
  if (!label || typeof label !== 'string') return 'label must be a non-empty string';

  const hasSpan = colSpan !== undefined || rowSpan !== undefined;
  const hasDims = w !== undefined || h !== undefined;

  if (!hasSpan && !hasDims) {
    return 'widget must have either (colSpan, rowSpan) or (w, h)';
  }

  if (hasSpan) {
    const cs = Number(colSpan);
    if (!Number.isInteger(cs) || cs < 1) return 'colSpan must be a positive integer';
    const rs = Number(rowSpan);
    if (!Number.isInteger(rs) || rs < 1) return 'rowSpan must be a positive integer';
  }

  if (hasDims) {
    const wn = Number(w);
    if (!Number.isInteger(wn) || wn < 1) return 'w must be a positive integer';
    const hn = Number(h);
    if (!Number.isInteger(hn) || hn < 1) return 'h must be a positive integer';
  }

  if (x !== undefined) {
    const xn = Number(x);
    if (!Number.isInteger(xn) || xn < 1) return 'x must be a positive integer';
  }
  if (y !== undefined) {
    const yn = Number(y);
    if (!Number.isInteger(yn) || yn < 1) return 'y must be a positive integer';
  }

  return null;
}

// List all widgets
app.get('/api/widgets', (req, res) => {
  res.json({ ok: true, widgets: widgetStore.getAll() });
});

// Create a widget
app.post('/api/widgets', (req, res) => {
  const err = validateWidget(req.body);
  if (err) return res.status(400).json({ ok: false, error: err });
  try {
    const { id, type, tagName, label, colSpan, rowSpan, config, x, y, w, h, accentColor } = req.body;
    const widget = {
      id,
      type,
      tagName,
      label,
      colSpan: colSpan !== undefined ? parseInt(colSpan, 10) : (w !== undefined ? parseInt(w, 10) : 2),
      rowSpan: rowSpan !== undefined ? parseInt(rowSpan, 10) : (h !== undefined ? parseInt(h, 10) : 1),
      config: config || {},
    };
    if (x !== undefined) widget.x = parseInt(x, 10);
    if (y !== undefined) widget.y = parseInt(y, 10);
    if (w !== undefined) widget.w = parseInt(w, 10);
    if (h !== undefined) widget.h = parseInt(h, 10);
    if (accentColor !== undefined) widget.accentColor = accentColor;
    const created = widgetStore.create(widget);
    res.status(201).json({ ok: true, widget: created });
  } catch (e) {
    res.status(409).json({ ok: false, error: e.message });
  }
});

// Update a widget
app.put('/api/widgets/:id', (req, res) => {
  const err = validateWidget({ ...req.body, id: req.body.id || req.params.id });
  if (err) return res.status(400).json({ ok: false, error: err });
  try {
    const { type, tagName, label, colSpan, rowSpan, config, x, y, w, h, accentColor } = req.body;
    const patch = {
      type,
      tagName,
      label,
      colSpan: colSpan !== undefined ? parseInt(colSpan, 10) : (w !== undefined ? parseInt(w, 10) : undefined),
      rowSpan: rowSpan !== undefined ? parseInt(rowSpan, 10) : (h !== undefined ? parseInt(h, 10) : undefined),
      config: config || {},
    };
    if (patch.colSpan === undefined) delete patch.colSpan;
    if (patch.rowSpan === undefined) delete patch.rowSpan;
    if (x !== undefined) patch.x = parseInt(x, 10);
    if (y !== undefined) patch.y = parseInt(y, 10);
    if (w !== undefined) patch.w = parseInt(w, 10);
    if (h !== undefined) patch.h = parseInt(h, 10);
    if (accentColor !== undefined) patch.accentColor = accentColor;
    const updated = widgetStore.update(req.params.id, patch);
    res.json({ ok: true, widget: updated });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

// Delete a widget
app.delete('/api/widgets/:id', (req, res) => {
  try {
    widgetStore.remove(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

// Reorder widgets
app.post('/api/widgets/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ ok: false, error: 'ids must be an array' });
  try {
    const reordered = widgetStore.reorder(ids);
    res.json({ ok: true, widgets: reordered });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Notifications API ────────────────────────────────────────────────────────

const VALID_CONDITIONS = notificationsModule.VALID_CONDITIONS;
const VALID_SEVERITIES = notificationsModule.VALID_SEVERITIES;

function validateNotificationRule(body) {
  const { id, name, tagName, condition, threshold, severity, enabled } = body;
  if (!id || typeof id !== 'string') return 'id must be a non-empty string';
  if (!name || typeof name !== 'string') return 'name must be a non-empty string';
  if (tagName !== undefined && tagName !== '' && typeof tagName !== 'string') return 'tagName must be a string';
  if (!VALID_CONDITIONS.includes(condition)) return `condition must be one of: ${VALID_CONDITIONS.join(', ')}`;
  if (threshold === undefined || threshold === null || !Number.isFinite(Number(threshold))) return 'threshold must be a number';
  if (!VALID_SEVERITIES.includes(severity)) return `severity must be one of: ${VALID_SEVERITIES.join(', ')}`;
  if (enabled !== undefined && typeof enabled !== 'boolean') return 'enabled must be a boolean';
  return null;
}

app.get('/api/notifications', (req, res) => {
  res.json({ ok: true, rules: notificationsModule.getAll() });
});

app.post('/api/notifications', (req, res) => {
  const err = validateNotificationRule(req.body);
  if (err) return res.status(400).json({ ok: false, error: err });
  try {
    const { id, name, tagName, condition, threshold, message, severity, enabled } = req.body;
    const rule = {
      id,
      name,
      tagName: tagName || '',
      condition,
      threshold: Number(threshold),
      message: message || '',
      severity,
      enabled: enabled !== false,
    };
    const created = notificationsModule.create(rule);
    res.status(201).json({ ok: true, rule: created });
  } catch (e) {
    res.status(409).json({ ok: false, error: e.message });
  }
});

app.put('/api/notifications/:id', (req, res) => {
  const err = validateNotificationRule({ ...req.body, id: req.body.id || req.params.id });
  if (err) return res.status(400).json({ ok: false, error: err });
  try {
    const { name, tagName, condition, threshold, message, severity, enabled } = req.body;
    const patch = {
      name,
      tagName: tagName || '',
      condition,
      threshold: Number(threshold),
      message: message || '',
      severity,
      enabled: enabled !== false,
    };
    const updated = notificationsModule.update(req.params.id, patch);
    res.json({ ok: true, rule: updated });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

app.delete('/api/notifications/:id', (req, res) => {
  try {
    notificationsModule.remove(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

// ─── Export / Import ──────────────────────────────────────────────────────────

// Export: returns a single JSON bundle of settings + tags + widgets
app.get('/api/export', (req, res) => {
  const bundle = {
    exportedAt: new Date().toISOString(),
    settings:      settingsModule.load(),
    tags:          tagsModule.getAll(),
    widgets:       widgetStore.getAll(),
    notifications: notificationsModule.getAll(),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="dashboard-config.json"');
  res.setHeader('Content-Type', 'application/json');
  res.json(bundle);
});

// Import: accepts a bundle and restores settings + tags + widgets
app.post('/api/import', (req, res) => {
  const { settings, tags, widgets, notifications } = req.body;
  const errors = [];

  if (tags !== undefined) {
    if (!Array.isArray(tags)) {
      errors.push('tags must be an array');
    } else {
      tags.forEach((t, i) => {
        const err = validateTag(t);
        if (err) errors.push(`tags[${i}]: ${err}`);
      });
    }
  }

  if (widgets !== undefined) {
    if (!Array.isArray(widgets)) {
      errors.push('widgets must be an array');
    } else {
      widgets.forEach((w, i) => {
        const err = validateWidget(w);
        if (err) errors.push(`widgets[${i}]: ${err}`);
      });
    }
  }

  if (notifications !== undefined) {
    if (!Array.isArray(notifications)) {
      errors.push('notifications must be an array');
    } else {
      notifications.forEach((n, i) => {
        const err = validateNotificationRule(n);
        if (err) errors.push(`notifications[${i}]: ${err}`);
      });
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ ok: false, errors });
  }

  try {
    if (settings && typeof settings === 'object') {
      settingsModule.save(settings);
    }
    if (Array.isArray(tags)) {
      tagsModule.replaceAll(tags);
    }
    if (Array.isArray(widgets)) {
      widgetStore.replaceAll(widgets);
    }
    if (Array.isArray(notifications)) {
      notificationsModule.replaceAll(notifications);
    }
    // Reconnect PLC with (potentially updated) settings
    if (settings && typeof settings === 'object') {
      plcClient.disconnect();
      tryConnectPlc(settingsModule.load());
    }
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

      // Read all user-defined tags and emit values for widget dashboard
      const allTags = tagsModule.getAll();
      if (allTags.length > 0) {
        const tagValues = {};
        for (const tag of allTags) {
          try {
            tagValues[tag.name] = await plcClient.readTag(tag);
          } catch (_) {
            tagValues[tag.name] = null;
          }
        }
        io.emit('tagValues', tagValues);
      }
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

// Serve Vue SPA for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
httpServer.listen(PORT, HOST, () => {
  console.log(`\n✅  Vision Dashboard running at http://localhost:${PORT}\n`);
  const settings = settingsModule.load();
  tryConnectPlc(settings);
});
