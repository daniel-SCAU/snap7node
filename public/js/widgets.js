'use strict';

/* -- Toast helper ---------------------------------------------------------- */

function showToast(msg, type, duration) {
  if (type === undefined) type = 'info';
  if (duration === undefined) duration = 4000;
  var container = document.getElementById('toast-container');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(function() { toast.remove(); }, 300);
  }, duration);
}

/* -- State ----------------------------------------------------------------- */

var widgets = [];
var tags = [];
var tagValues = {};
var trendHistory = {};
var trendCharts = {};
var historyCharts = {};
var widgetViewModes = {};
var editMode = false;
var editingWidgetId = null;

var gridCols = 12;
var gridCellHeight = 80;
var gridGap = 12;
var currentTheme = 'dark';

var notificationRules = [];
var activeBanners = {};
var editingNotifId = null;

var clockIntervals = {};

var dragState = null;
var resizeState = null;

var modalType = 'value';
var modalColSpan = 2;
var modalRowSpan = 1;
var modalBargraphColor = 'blue';
var modalAccentColor = 'none';

/* -- Helpers ---------------------------------------------------------------- */

function genId() {
  return 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* -- Fetch helpers --------------------------------------------------------- */

async function loadTags() {
  try {
    var res = await fetch('/api/tags');
    var json = await res.json();
    tags = json.tags || [];
  } catch (_) { tags = []; }
}

async function loadWidgets() {
  try {
    var res = await fetch('/api/widgets');
    var json = await res.json();
    widgets = json.widgets || [];
  } catch (_) { widgets = []; }
}

async function loadGridSettings() {
  try {
    var res = await fetch('/api/settings');
    var data = await res.json();
    gridCols = data.gridCols || 12;
    gridCellHeight = data.gridCellHeight || 80;
    gridGap = data.gridGap || 12;
    currentTheme = data.theme || 'dark';
    applyTheme(currentTheme);
    applyGridSettings(gridCols, gridCellHeight, gridGap);
  } catch (_) {}
}

async function loadNotifications() {
  try {
    var res = await fetch('/api/notifications');
    var json = await res.json();
    notificationRules = json.rules || [];
  } catch (_) { notificationRules = []; }
}

/* -- Theme ----------------------------------------------------------------- */

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
}

async function switchTheme(theme) {
  applyTheme(theme);
  document.querySelectorAll('[data-theme-opt]').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.themeOpt === theme);
  });
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: theme }),
    });
  } catch (_) {}
}

/* -- Grid helpers ---------------------------------------------------------- */

function getWidgetPos(w) {
  return {
    x: w.x || 1,
    y: w.y || 1,
    w: w.w || w.colSpan || 2,
    h: w.h || w.rowSpan || 1,
  };
}

function autoAssignPositions(widgetList, cols) {
  var occupied = {};

  function cellKey(x, y) { return x + ',' + y; }

  function isRectFree(x, y, w, h) {
    for (var r = 0; r < h; r++) {
      for (var c = 0; c < w; c++) {
        if (occupied[cellKey(x + c, y + r)]) return false;
      }
    }
    return true;
  }

  function markRect(x, y, w, h) {
    for (var r = 0; r < h; r++) {
      for (var c = 0; c < w; c++) { occupied[cellKey(x + c, y + r)] = true; }
    }
  }

  function findFreePos(ww, wh) {
    for (var row = 1; row <= 1000; row++) {
      for (var col = 1; col <= cols - ww + 1; col++) {
        if (isRectFree(col, row, ww, wh)) return { x: col, y: row };
      }
    }
    return { x: 1, y: 1 };
  }

  var positioned   = widgetList.filter(function(w) { return w.x && w.y; });
  var unpositioned = widgetList.filter(function(w) { return !w.x || !w.y; });

  positioned.sort(function(a, b) { return (a.y - b.y) || (a.x - b.x); });

  positioned.forEach(function(w) {
    var ww = w.w || w.colSpan || 2;
    var wh = w.h || w.rowSpan || 1;
    if (isRectFree(w.x, w.y, ww, wh)) {
      markRect(w.x, w.y, ww, wh);
    } else {
      var pos = findFreePos(ww, wh);
      w.x = pos.x; w.y = pos.y; w.w = ww; w.h = wh;
      markRect(pos.x, pos.y, ww, wh);
    }
  });

  unpositioned.forEach(function(w) {
    var ww = w.w || w.colSpan || 2;
    var wh = w.h || w.rowSpan || 1;
    var pos = findFreePos(ww, wh);
    w.x = pos.x; w.y = pos.y; w.w = ww; w.h = wh;
    markRect(pos.x, pos.y, ww, wh);
  });
}

function applyGridSettings(cols, cellHeight, gap) {
  gridCols = cols; gridCellHeight = cellHeight; gridGap = gap;
  var grid = document.getElementById('widget-grid');
  if (grid) {
    grid.style.setProperty('--grid-cols', cols);
    grid.style.setProperty('--grid-cell-height', cellHeight + 'px');
    grid.style.setProperty('--grid-gap', gap + 'px');
    grid.style.gap = gap + 'px';
  }
}

/* -- Grid settings modal --------------------------------------------------- */

function openGridSettingsModal() {
  document.getElementById('grid-cols-input').value = gridCols;
  document.getElementById('grid-cell-height-input').value = gridCellHeight;
  document.getElementById('grid-gap-input').value = gridGap;
  document.getElementById('grid-settings-modal').classList.remove('hidden');
}

async function saveGridSettings() {
  var cols  = Math.max(4,  Math.min(24,  parseInt(document.getElementById('grid-cols-input').value,        10) || 12));
  var cellH = Math.max(40, Math.min(300, parseInt(document.getElementById('grid-cell-height-input').value, 10) || 80));
  var gap   = Math.max(0,  Math.min(40,  parseInt(document.getElementById('grid-gap-input').value,         10) || 12));
  applyGridSettings(cols, cellH, gap);
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gridCols: cols, gridCellHeight: cellH, gridGap: gap }),
    });
    showToast('Grid settings saved', 'success', 2500);
  } catch (e) { showToast('Save failed: ' + e.message, 'error'); }
  document.getElementById('grid-settings-modal').classList.add('hidden');
}

/* -- PLC Status ------------------------------------------------------------ */

function updatePlcBadge(status) {
  var badge = document.getElementById('plc-status-badge');
  if (!badge) return;
  if (status.connected) {
    badge.className = 'status-dot connected';
    badge.querySelector('.label').textContent = 'PLC Connected';
  } else {
    badge.className = 'status-dot disconnected';
    badge.querySelector('.label').textContent = status.error ? 'PLC Error' : 'PLC Disconnected';
  }
}

/* -- Trend history --------------------------------------------------------- */

var MAX_TREND = 500;

function pushTrend(tagName, value) {
  if (!trendHistory[tagName]) trendHistory[tagName] = { labels: [], values: [], timestamps: [] };
  var hist = trendHistory[tagName];
  var now = new Date();
  var label = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  hist.labels.push(label); hist.values.push(value); hist.timestamps.push(now.getTime());
  if (hist.labels.length > MAX_TREND) { hist.labels.shift(); hist.values.shift(); hist.timestamps.shift(); }
}

function getTrendSlice(tagName, mode, count, timeMs) {
  var hist = trendHistory[tagName] || { labels: [], values: [], timestamps: [] };
  if (mode === 'time' && timeMs) {
    var cutoff = Date.now() - timeMs;
    var ts = hist.timestamps || [];
    var idx = ts.length;
    for (var i = 0; i < ts.length; i++) {
      if (ts[i] >= cutoff) { idx = i; break; }
    }
    return { labels: hist.labels.slice(idx), values: hist.values.slice(idx) };
  }
  var n = count || 30;
  return { labels: hist.labels.slice(-n), values: hist.values.slice(-n) };
}

/* -- localStorage-backed history (long-term trends) ----------------------- */

var HISTORY_MAX_POINTS = 1440; // default fallback

function getLocalHistoryData(tagName) {
  try {
    var raw = localStorage.getItem('wh_' + tagName);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { timestamps: [], values: [] };
}

function saveLocalHistoryData(tagName, data) {
  try { localStorage.setItem('wh_' + tagName, JSON.stringify(data)); } catch (_) {}
}

function pushHistoryData(tagName, value, maxPoints) {
  if (value === null || value === undefined) return;
  var limit = maxPoints || HISTORY_MAX_POINTS;
  var data = getLocalHistoryData(tagName);
  data.timestamps.push(Date.now());
  data.values.push(value);
  if (data.timestamps.length > limit) {
    data.timestamps = data.timestamps.slice(-limit);
    data.values = data.values.slice(-limit);
  }
  saveLocalHistoryData(tagName, data);
}

function getHistorySlice(tagName, mode, count, timeMs) {
  var data = getLocalHistoryData(tagName);
  if (mode === 'time' && timeMs) {
    var cutoff = Date.now() - timeMs;
    var idx = data.timestamps.length;
    for (var i = 0; i < data.timestamps.length; i++) {
      if (data.timestamps[i] >= cutoff) { idx = i; break; }
    }
    var ts = data.timestamps.slice(idx);
    var vs = data.values.slice(idx);
    return {
      labels: ts.map(function(t) { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }),
      values: vs,
    };
  }
  var n = count || 30;
  var ts2 = data.timestamps.slice(-n);
  var vs2 = data.values.slice(-n);
  return {
    labels: ts2.map(function(t) { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }),
    values: vs2,
  };
}

function getWidgetMode(wId, defaultCount) {
  return widgetViewModes[wId] || { mode: 'updates', count: defaultCount || 30 };
}

/* -- Tag badge helper ------------------------------------------------------ */

function getTagBadgeText(w) {
  if (w.type === 'group') {
    var n = (w.config && Array.isArray(w.config.tagNames)) ? w.config.tagNames.length : 0;
    return n + ' tag' + (n !== 1 ? 's' : '');
  }
  if (w.type === 'iframe') {
    try { return new URL((w.config && w.config.url) || '').hostname || 'no URL'; } catch (_) { return 'invalid URL'; }
  }
  if (w.type === 'clock') return 'clock';
  if (w.type === 'history') return (w.tagName || '') + ' (hist)';
  return w.tagName || '';
}

/* -- Clock management ------------------------------------------------------ */

function updateClock(id) {
  var timeEl = document.getElementById('wclock-' + id);
  var dateEl = document.getElementById('wclock-date-' + id);
  if (!timeEl) { clearInterval(clockIntervals[id]); delete clockIntervals[id]; return; }
  var now = new Date();
  timeEl.textContent = now.toLocaleTimeString();
  if (dateEl) dateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

/* -- Widget rendering ------------------------------------------------------ */

function renderAll() {
  Object.keys(clockIntervals).forEach(function(id) { clearInterval(clockIntervals[id]); });
  clockIntervals = {};
  Object.keys(trendCharts).forEach(function(id) {
    if (trendCharts[id]) { trendCharts[id].destroy(); delete trendCharts[id]; }
  });
  Object.keys(historyCharts).forEach(function(id) {
    if (historyCharts[id]) { historyCharts[id].destroy(); delete historyCharts[id]; }
  });
  var grid = document.getElementById('widget-grid');
  if (!grid) return;
  grid.innerHTML = '';
  if (widgets.length === 0) {
    grid.innerHTML = '<div class="widget-empty-state">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>' +
      '<rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' +
      '<h3>No widgets yet</h3>' +
      '<p>Click <strong>Edit Layout</strong> &rarr; <strong>Add Widget</strong> to create your first widget.</p>' +
      '</div>';
    return;
  }
  widgets.forEach(function(w, idx) { grid.appendChild(buildWidgetCard(w, idx)); });
  widgets.forEach(function(w) {
    if (w.type === 'trend') initTrendChart(w);
    if (w.type === 'history') initHistoryChart(w);
    if (w.type === 'clock') {
      clockIntervals[w.id] = setInterval(function() { updateClock(w.id); }, 1000);
      updateClock(w.id);
    }
  });
  applyAllValues();
}

function buildWidgetCard(w, idx) {
  var pos = getWidgetPos(w);
  var card = document.createElement('div');
  card.className = 'widget-card';
  card.dataset.id = w.id;
  card.dataset.idx = idx;
  card.style.gridColumn = pos.x + ' / span ' + pos.w;
  card.style.gridRow    = pos.y + ' / span ' + pos.h;
  if (w.accentColor && w.accentColor !== 'none') card.dataset.accent = w.accentColor;

  card.innerHTML =
    '<div class="widget-drag-handle" aria-hidden="true">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/>' +
        '<circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/>' +
        '<circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>' +
      '</svg></div>' +
    '<div class="widget-edit-actions">' +
      '<button class="widget-edit-btn btn-edit" title="Edit widget" data-id="' + escHtml(w.id) + '">' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
          '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
          '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>' +
        '</svg></button>' +
      '<button class="widget-edit-btn btn-delete" title="Remove widget" data-id="' + escHtml(w.id) + '">' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
          '<polyline points="3 6 5 6 21 6"/>' +
          '<path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>' +
          '<path d="M9 6V4h6v2"/>' +
        '</svg></button>' +
    '</div>' +
    '<div class="widget-header">' +
      '<span class="widget-label">' + escHtml(w.label) + '</span>' +
      '<span class="widget-tag-badge">' + escHtml(getTagBadgeText(w)) + '</span>' +
    '</div>' +
    '<div class="widget-body" id="wbody-' + w.id + '">' + buildWidgetBody(w) + '</div>' +
    '<div class="widget-resize-handle" title="Resize">' +
      '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M 10 0 L 10 10 L 0 10" fill="none" stroke="currentColor" stroke-width="2"/></svg>' +
    '</div>';

  var dragHandle = card.querySelector('.widget-drag-handle');
  if (dragHandle) dragHandle.addEventListener('pointerdown', function(e) { startDrag(e, w); });

  var resizeHandle = card.querySelector('.widget-resize-handle');
  if (resizeHandle) resizeHandle.addEventListener('pointerdown', function(e) { startResize(e, w); });

  card.querySelector('.btn-edit').addEventListener('click', function(e) {
    e.stopPropagation(); openEditModal(w.id);
  });
  card.querySelector('.btn-delete').addEventListener('click', function(e) {
    e.stopPropagation(); deleteWidget(w.id);
  });

  if (w.type === 'write') {
    var sendBtn = card.querySelector('.widget-write-send');
    if (sendBtn) sendBtn.addEventListener('click', function() { handleWrite(w); });
    var toggle = card.querySelector('.widget-write-toggle-btn');
    if (toggle) toggle.addEventListener('click', function() { handleBoolToggle(w); });
  }
  if (w.type === 'button') {
    var btn = card.querySelector('#wbtn-' + w.id);
    if (btn) btn.addEventListener('click', function() { handleButtonClick(w); });
  }
  if (w.type === 'slider') {
    var slider = card.querySelector('#wslider-' + w.id);
    var valEl  = card.querySelector('#wslider-val-' + w.id);
    if (slider) {
      slider.addEventListener('input', function() { if (valEl) valEl.textContent = slider.value; });
      slider.addEventListener('change', function() { handleSliderChange(w, slider); });
    }
  }
  if (w.type === 'trend' || w.type === 'history') {
    card.querySelectorAll('.trend-mode-btn').forEach(function(modeBtn) {
      modeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var mode = modeBtn.dataset.mode;
        var wm = { mode: mode };
        if (mode === 'updates') {
          wm.count = parseInt(modeBtn.dataset.count, 10) || 30;
        } else {
          wm.timeMs = parseInt(modeBtn.dataset.timems, 10) || 300000;
        }
        widgetViewModes[w.id] = wm;
        card.querySelectorAll('.trend-mode-btn').forEach(function(b) { b.classList.remove('active'); });
        modeBtn.classList.add('active');
        if (w.type === 'trend') updateTrendChart(w);
        else updateHistoryChart(w);
      });
    });
  }
  return card;
}

function buildWidgetBody(w) {
  switch (w.type) {
    case 'value':
      return '<div class="widget-value-display" id="wval-' + w.id + '">&#8212;</div>' +
             '<div class="widget-value-unit">' + escHtml((w.config && w.config.unit) || '') + '</div>';

    case 'trend': {
      var defaultCount = (w.config && w.config.trendLength) || 30;
      var wm = widgetViewModes[w.id] || { mode: 'updates', count: defaultCount };
      var tCounts = [30, 100, 200];
      var tTimes  = [
        { ms: 60000,    lbl: '1m'  },
        { ms: 300000,   lbl: '5m'  },
        { ms: 900000,   lbl: '15m' },
        { ms: 3600000,  lbl: '1h'  },
      ];
      var tBtns = tCounts.map(function(c) {
        var a = (wm.mode === 'updates' && wm.count === c) ? ' active' : '';
        return '<button class="trend-mode-btn' + a + '" data-mode="updates" data-count="' + c + '">' + c + '</button>';
      }).join('');
      tBtns += '<span class="trend-mode-sep"></span>';
      tBtns += tTimes.map(function(t) {
        var a = (wm.mode === 'time' && wm.timeMs === t.ms) ? ' active' : '';
        return '<button class="trend-mode-btn' + a + '" data-mode="time" data-timems="' + t.ms + '">' + t.lbl + '</button>';
      }).join('');
      return '<div class="widget-trend-controls">' + tBtns + '</div>' +
             '<canvas class="widget-trend-canvas" id="wchart-' + w.id + '"></canvas>';
    }

    case 'history': {
      var hwm = widgetViewModes[w.id] || { mode: 'time', timeMs: 60000 };
      var hCounts = [30, 100, 500];
      var hTimes  = [
        { ms: 60000,    lbl: '1m'  },
        { ms: 300000,   lbl: '5m'  },
        { ms: 900000,   lbl: '15m' },
        { ms: 3600000,  lbl: '1h'  },
        { ms: 14400000, lbl: '4h'  },
        { ms: 86400000, lbl: '24h' },
      ];
      var hBtns = hCounts.map(function(c) {
        var a = (hwm.mode === 'updates' && hwm.count === c) ? ' active' : '';
        return '<button class="trend-mode-btn' + a + '" data-mode="updates" data-count="' + c + '">' + c + '</button>';
      }).join('');
      hBtns += '<span class="trend-mode-sep"></span>';
      hBtns += hTimes.map(function(t) {
        var a = (hwm.mode === 'time' && hwm.timeMs === t.ms) ? ' active' : '';
        return '<button class="trend-mode-btn' + a + '" data-mode="time" data-timems="' + t.ms + '">' + t.lbl + '</button>';
      }).join('');
      return '<div class="widget-trend-controls">' + hBtns + '</div>' +
             '<canvas class="widget-trend-canvas" id="wchart-' + w.id + '"></canvas>';
    }

    case 'indicator':
      return '<div class="widget-indicator-wrap">' +
               '<div class="widget-led led-off" id="wled-' + w.id + '"></div>' +
               '<span class="widget-led-state state-off" id="wled-state-' + w.id + '">&#8212;</span>' +
             '</div>';

    case 'write': {
      var tag = tags.find(function(t) { return t.name === w.tagName; });
      var isBool = tag && tag.dataType === 'Bool';
      if (isBool) {
        return '<div class="widget-write-toggle">' +
          '<button class="widget-write-toggle-btn btn btn-secondary" id="wwrite-btn-' + w.id + '">Toggle</button>' +
          '<span class="widget-current-val" id="wwrite-cur-' + w.id + '">Current: &#8212;</span>' +
          '</div>';
      }
      var cfg = w.config || {};
      var minAttr  = cfg.writeMin  != null ? 'min="' + cfg.writeMin  + '"' : '';
      var maxAttr  = cfg.writeMax  != null ? 'max="' + cfg.writeMax  + '"' : '';
      var stepAttr = cfg.writeStep != null ? 'step="' + cfg.writeStep + '"' : 'step="1"';
      return '<div class="widget-write-form">' +
        '<input class="widget-write-input" id="wwrite-input-' + w.id + '" type="number" ' +
          minAttr + ' ' + maxAttr + ' ' + stepAttr + ' placeholder="value" />' +
        '<button class="widget-write-send" id="wwrite-btn-' + w.id + '">Send</button>' +
        '</div>' +
        '<div class="widget-current-val" id="wwrite-cur-' + w.id + '">Current: &#8212;</div>';
    }

    case 'bargraph': {
      var cfg2 = w.config || {};
      var min2 = cfg2.min != null ? cfg2.min : 0;
      var max2 = cfg2.max != null ? cfg2.max : 100;
      var unit2 = cfg2.unit || '';
      var color2 = cfg2.color || 'blue';
      return '<div class="widget-bar-wrap">' +
        '<div class="widget-bar-track">' +
          '<div class="widget-bar-fill widget-bar-' + escHtml(color2) + '" id="wbar-' + w.id + '" style="width:0%"></div>' +
        '</div>' +
        '<div class="widget-bar-labels">' +
          '<span>' + escHtml(String(min2)) + escHtml(unit2) + '</span>' +
          '<span class="widget-bar-value" id="wbar-val-' + w.id + '">&#8212;</span>' +
          '<span>' + escHtml(String(max2)) + escHtml(unit2) + '</span>' +
        '</div></div>';
    }

    case 'iframe': {
      var cfg3 = w.config || {};
      var url = cfg3.url || '';
      if (!url) return '<span style="color:var(--text-muted);font-size:0.8rem">No URL configured</span>';
      return '<iframe class="widget-iframe" src="' + escHtml(url) + '" loading="lazy" sandbox="allow-scripts allow-forms"></iframe>';
    }

    case 'group': {
      var cfg4 = w.config || {};
      var tagNames = Array.isArray(cfg4.tagNames) ? cfg4.tagNames : [];
      if (tagNames.length === 0) return '<span style="color:var(--text-muted);font-size:0.8rem">No tags configured</span>';
      var rows = tagNames.map(function(tn) {
        return '<div class="widget-group-row">' +
          '<span class="widget-group-tag">' + escHtml(tn) + '</span>' +
          '<span class="widget-group-value" id="wgroup-val-' + w.id + '-' + escHtml(tn) + '">&#8212;</span>' +
          '</div>';
      }).join('');
      return '<div class="widget-group-list">' + rows + '</div>';
    }

    case 'gauge': {
      var cfg5 = w.config || {};
      return '<div class="widget-gauge-wrap">' +
        '<svg class="widget-gauge-svg" viewBox="0 0 120 80" id="wgauge-' + w.id + '">' +
          '<path d="M 10 75 A 55 55 0 0 1 110 75" fill="none" stroke="var(--border)" stroke-width="10" stroke-linecap="round"/>' +
          '<path d="M 10 75 A 55 55 0 0 1 110 75" fill="none" stroke="var(--accent-blue)" stroke-width="10" stroke-linecap="round"' +
            ' stroke-dasharray="173" stroke-dashoffset="173" id="wgauge-arc-' + w.id + '" style="transition:stroke-dashoffset 0.5s ease"/>' +
        '</svg>' +
        '<div class="widget-gauge-value" id="wgauge-val-' + w.id + '">&#8212;</div>' +
        '<div class="widget-gauge-unit">' + escHtml((cfg5.unit) || '') + '</div>' +
        '</div>';
    }

    case 'button':
      return '<div style="display:flex;flex-direction:column;align-items:center;gap:8px">' +
        '<button class="widget-btn-large" id="wbtn-' + w.id + '">&#8212;</button>' +
        '<div class="widget-btn-cur" id="wbtn-cur-' + w.id + '">&#8212;</div>' +
        '</div>';

    case 'clock':
      return '<div class="widget-clock-wrap">' +
        '<div class="widget-clock-time" id="wclock-' + w.id + '">--:--:--</div>' +
        '<div class="widget-clock-date" id="wclock-date-' + w.id + '"></div>' +
        '</div>';

    case 'slider': {
      var cfg6 = w.config || {};
      var sMin  = cfg6.min  != null ? cfg6.min  : 0;
      var sMax  = cfg6.max  != null ? cfg6.max  : 100;
      var sStep = cfg6.step != null ? cfg6.step : 1;
      return '<div class="widget-slider-wrap">' +
        '<div class="widget-slider-row">' +
          '<input class="widget-slider-input" id="wslider-' + w.id + '" type="range"' +
            ' min="' + sMin + '" max="' + sMax + '" step="' + sStep + '" value="' + sMin + '" />' +
          '<span class="widget-slider-val" id="wslider-val-' + w.id + '">' + sMin + '</span>' +
        '</div>' +
        '<div class="widget-slider-cur" id="wslider-cur-' + w.id + '">Current PLC: &#8212;</div>' +
        '</div>';
    }

    default:
      return '<span style="color:var(--text-muted);font-size:0.8rem">Unknown widget type</span>';
  }
}

/* -- Apply values ---------------------------------------------------------- */

function applyAllValues() {
  widgets.forEach(function(w) {
    if (w.type === 'group') applyGroupValues(w);
    else applyValue(w, tagValues[w.tagName]);
  });
}

function applyGroupValues(w) {
  var tagNames = (w.config && Array.isArray(w.config.tagNames)) ? w.config.tagNames : [];
  tagNames.forEach(function(tn) {
    var el = document.getElementById('wgroup-val-' + w.id + '-' + tn);
    if (!el) return;
    var val = tagValues[tn];
    if (val === null || val === undefined) { el.textContent = '\u2014'; el.className = 'widget-group-value'; }
    else {
      var tag = tags.find(function(t) { return t.name === tn; });
      var isBool = tag && tag.dataType === 'Bool';
      if (isBool) {
        var on = val === true || val === 1;
        el.textContent = on ? 'ON' : 'OFF';
        el.className = 'widget-group-value ' + (on ? 'group-on' : 'group-off');
      } else { el.textContent = String(val); el.className = 'widget-group-value'; }
    }
  });
}

function applyValue(w, value) {
  switch (w.type) {
    case 'value': {
      var el = document.getElementById('wval-' + w.id);
      if (!el) return;
      var cfg = w.config || {};
      var decimals = cfg.decimals != null ? parseInt(cfg.decimals, 10) : 2;
      var display = '\u2014';
      if (value !== null && value !== undefined) {
        display = typeof value === 'number' ? value.toFixed(Math.max(0, decimals)) : String(value);
      }
      if (el.textContent !== display) {
        el.textContent = display;
        el.classList.remove('widget-flash'); void el.offsetWidth; el.classList.add('widget-flash');
      }
      break;
    }
    case 'indicator': {
      var led = document.getElementById('wled-' + w.id);
      var stateEl = document.getElementById('wled-state-' + w.id);
      if (!led || !stateEl) return;
      var on2 = value === true || value === 1;
      led.className = 'widget-led ' + (on2 ? 'led-on' : 'led-off');
      stateEl.className = 'widget-led-state ' + (on2 ? 'state-on' : 'state-off');
      stateEl.textContent = (value === null || value === undefined) ? '\u2014' : (on2 ? 'ON' : 'OFF');
      break;
    }
    case 'write': {
      var curEl = document.getElementById('wwrite-cur-' + w.id);
      if (curEl && value !== null && value !== undefined) curEl.textContent = 'Current: ' + value;
      var tagW = tags.find(function(t) { return t.name === w.tagName; });
      if (tagW && tagW.dataType === 'Bool') {
        var btn2 = document.getElementById('wwrite-btn-' + w.id);
        if (btn2) {
          var on3 = value === true || value === 1;
          btn2.textContent = on3 ? 'Turn OFF' : 'Turn ON';
          btn2.style.background = on3 ? 'var(--accent-red)' : 'var(--accent-green)';
        }
      }
      break;
    }
    case 'trend': break;
    case 'history': break;
    case 'bargraph': {
      var bar = document.getElementById('wbar-' + w.id);
      var barValEl = document.getElementById('wbar-val-' + w.id);
      if (!bar || !barValEl) return;
      var bcfg = w.config || {};
      var bMin  = bcfg.min != null ? Number(bcfg.min) : 0;
      var bMax  = bcfg.max != null ? Number(bcfg.max) : 100;
      var bDec  = bcfg.decimals != null ? Math.max(0, parseInt(bcfg.decimals, 10)) : 1;
      var bUnit = bcfg.unit || '';
      if (value === null || value === undefined) { bar.style.width = '0%'; barValEl.textContent = '\u2014'; }
      else {
        var num = Number(value);
        var pct = Math.min(100, Math.max(0, ((num - bMin) / ((bMax - bMin) || 1)) * 100));
        bar.style.width = pct + '%';
        barValEl.textContent = num.toFixed(bDec) + (bUnit ? '\u00a0' + bUnit : '');
      }
      break;
    }
    case 'gauge': {
      var arc = document.getElementById('wgauge-arc-' + w.id);
      var gValEl = document.getElementById('wgauge-val-' + w.id);
      if (!arc || !gValEl) return;
      var gcfg = w.config || {};
      var gMin  = gcfg.min != null ? Number(gcfg.min) : 0;
      var gMax  = gcfg.max != null ? Number(gcfg.max) : 100;
      var gDec  = gcfg.decimals != null ? Math.max(0, parseInt(gcfg.decimals, 10)) : 1;
      var gUnit = gcfg.unit || '';
      var totalDash = 173;
      if (value === null || value === undefined) { arc.setAttribute('stroke-dashoffset', totalDash); gValEl.textContent = '\u2014'; }
      else {
        var gNum = Number(value);
        var gPct = Math.min(1, Math.max(0, (gNum - gMin) / ((gMax - gMin) || 1)));
        arc.setAttribute('stroke-dashoffset', totalDash * (1 - gPct));
        gValEl.textContent = gNum.toFixed(gDec) + (gUnit ? ' ' + gUnit : '');
      }
      break;
    }
    case 'button': {
      var btnEl = document.getElementById('wbtn-' + w.id);
      var btnCurEl = document.getElementById('wbtn-cur-' + w.id);
      if (!btnEl) return;
      var btnTag = tags.find(function(t) { return t.name === w.tagName; });
      var isBool2 = btnTag && btnTag.dataType === 'Bool';
      if (isBool2) {
        var on4 = value === true || value === 1;
        btnEl.textContent = on4 ? 'ON' : 'OFF';
        btnEl.className = 'widget-btn-large ' + (on4 ? 'btn-on' : 'btn-off');
        if (btnCurEl) btnCurEl.textContent = on4 ? '\u25cf Active' : '\u25cb Inactive';
      } else {
        btnEl.textContent = 'Send'; btnEl.className = 'widget-btn-large';
        if (btnCurEl && value !== null && value !== undefined) btnCurEl.textContent = 'Current: ' + value;
      }
      break;
    }
    case 'clock': break;
    case 'slider': {
      var slCurEl = document.getElementById('wslider-cur-' + w.id);
      if (slCurEl && value !== null && value !== undefined) slCurEl.textContent = 'Current PLC: ' + value;
      break;
    }
  }
}

/* -- Trend charts ---------------------------------------------------------- */

function initTrendChart(w) {
  var canvas = document.getElementById('wchart-' + w.id);
  if (!canvas || typeof Chart === 'undefined') return;
  if (trendCharts[w.id]) trendCharts[w.id].destroy();
  var wMode = widgetViewModes[w.id] || { mode: 'updates', count: (w.config && w.config.trendLength) || 30 };
  var slice = getTrendSlice(w.tagName, wMode.mode, wMode.count, wMode.timeMs);
  trendCharts[w.id] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: slice.labels,
      datasets: [{ label: w.label, data: slice.values, borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#475569', font: { size: 10 }, maxRotation: 0, maxTicksLimit: 6 }, grid: { color: 'rgba(30,41,59,0.8)' } },
        y: { ticks: { color: '#475569', font: { size: 10 } }, grid: { color: 'rgba(30,41,59,0.8)' }, beginAtZero: false },
      },
    },
  });
}

function updateTrendChart(w) {
  var chart = trendCharts[w.id];
  if (!chart) return;
  var wMode = widgetViewModes[w.id] || { mode: 'updates', count: (w.config && w.config.trendLength) || 30 };
  var slice = getTrendSlice(w.tagName, wMode.mode, wMode.count, wMode.timeMs);
  chart.data.labels = slice.labels;
  chart.data.datasets[0].data = slice.values;
  chart.update('none');
}

/* -- History charts -------------------------------------------------------- */

function initHistoryChart(w) {
  var canvas = document.getElementById('wchart-' + w.id);
  if (!canvas || typeof Chart === 'undefined') return;
  if (historyCharts[w.id]) historyCharts[w.id].destroy();
  var wMode = widgetViewModes[w.id] || { mode: 'time', timeMs: 60000 };
  var slice = getHistorySlice(w.tagName, wMode.mode, wMode.count, wMode.timeMs);
  historyCharts[w.id] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: slice.labels,
      datasets: [{ label: w.label, data: slice.values, borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#475569', font: { size: 10 }, maxRotation: 0, maxTicksLimit: 6 }, grid: { color: 'rgba(30,41,59,0.8)' } },
        y: { ticks: { color: '#475569', font: { size: 10 } }, grid: { color: 'rgba(30,41,59,0.8)' }, beginAtZero: false },
      },
    },
  });
}

function updateHistoryChart(w) {
  var chart = historyCharts[w.id];
  if (!chart) return;
  var wMode = widgetViewModes[w.id] || { mode: 'time', timeMs: 60000 };
  var slice = getHistorySlice(w.tagName, wMode.mode, wMode.count, wMode.timeMs);
  chart.data.labels = slice.labels;
  chart.data.datasets[0].data = slice.values;
  chart.update('none');
}

/* -- Write actions --------------------------------------------------------- */

async function handleWrite(w) {
  var input = document.getElementById('wwrite-input-' + w.id);
  if (!input) return;
  var raw = input.value.trim();
  if (raw === '') { showToast('Enter a value first', 'error', 2500); return; }
  var num = parseFloat(raw);
  if (!Number.isFinite(num)) { showToast('Invalid number', 'error', 2500); return; }
  try {
    var res = await fetch('/api/tags/' + encodeURIComponent(w.tagName) + '/value', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: num }),
    });
    var json = await res.json();
    if (json.ok) { showToast(w.label + ': wrote ' + num, 'success', 2500); input.value = ''; }
    else showToast('Write failed: ' + json.error, 'error');
  } catch (e) { showToast('Write error: ' + e.message, 'error'); }
}

async function handleBoolToggle(w) {
  var currentVal = tagValues[w.tagName];
  var newVal = !(currentVal === true || currentVal === 1);
  try {
    var res = await fetch('/api/tags/' + encodeURIComponent(w.tagName) + '/value', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: newVal }),
    });
    var json = await res.json();
    if (json.ok) showToast(w.label + ': set to ' + (newVal ? 'ON' : 'OFF'), 'success', 2500);
    else showToast('Write failed: ' + json.error, 'error');
  } catch (e) { showToast('Write error: ' + e.message, 'error'); }
}

async function handleButtonClick(w) {
  var tag = tags.find(function(t) { return t.name === w.tagName; });
  var isBool = tag && tag.dataType === 'Bool';
  if (isBool) { await handleBoolToggle(w); return; }
  var preset = (w.config && w.config.preset != null) ? w.config.preset : 1;
  await handleWriteValue(w, preset);
}

async function handleWriteValue(w, value) {
  try {
    var res = await fetch('/api/tags/' + encodeURIComponent(w.tagName) + '/value', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: value }),
    });
    var json = await res.json();
    if (json.ok) showToast(w.label + ': wrote ' + value, 'success', 2500);
    else showToast('Write failed: ' + json.error, 'error');
  } catch (e) { showToast('Write error: ' + e.message, 'error'); }
}

async function handleSliderChange(w, sliderEl) {
  var val = parseFloat(sliderEl.value);
  await handleWriteValue(w, val);
}

/* -- Drag (pointer events) ------------------------------------------------- */

function startDrag(e, w) {
  if (!editMode) return;
  e.preventDefault();
  var pos = getWidgetPos(w);
  var card = document.querySelector('.widget-card[data-id="' + w.id + '"]');
  if (!card) return;
  var cardRect = card.getBoundingClientRect();
  var ghost = document.createElement('div');
  ghost.className = 'widget-drag-ghost';
  ghost.style.width  = cardRect.width  + 'px';
  ghost.style.height = cardRect.height + 'px';
  ghost.style.left   = cardRect.left   + 'px';
  ghost.style.top    = cardRect.top    + 'px';
  document.body.appendChild(ghost);
  var placeholder = document.createElement('div');
  placeholder.className = 'widget-drop-placeholder';
  placeholder.style.gridColumn = pos.x + ' / span ' + pos.w;
  placeholder.style.gridRow    = pos.y + ' / span ' + pos.h;
  var grid = document.getElementById('widget-grid');
  grid.appendChild(placeholder);
  card.classList.add('being-dragged');
  dragState = {
    widgetId: w.id, startX: e.clientX, startY: e.clientY,
    origX: pos.x, origY: pos.y, w: pos.w, h: pos.h,
    ghost: ghost, placeholder: placeholder, card: card,
  };
}

function startResize(e, w) {
  if (!editMode) return;
  e.preventDefault(); e.stopPropagation();
  var pos = getWidgetPos(w);
  var card = document.querySelector('.widget-card[data-id="' + w.id + '"]');
  if (!card) return;
  resizeState = {
    widgetId: w.id, startX: e.clientX, startY: e.clientY,
    origX: pos.x, origY: pos.y, origW: pos.w, origH: pos.h, card: card,
  };
}

function onPointerMove(e) {
  if (dragState) {
    var dx = e.clientX - dragState.startX;
    var dy = e.clientY - dragState.startY;
    var rect = dragState.card.getBoundingClientRect();
    dragState.ghost.style.left = (rect.left + dx) + 'px';
    dragState.ghost.style.top  = (rect.top  + dy) + 'px';
    var grid = document.getElementById('widget-grid');
    var gridRect = grid.getBoundingClientRect();
    var cellW = (gridRect.width - (gridCols - 1) * gridGap) / gridCols;
    var relX = e.clientX - gridRect.left;
    var relY = e.clientY - gridRect.top;
    var rawX = Math.round(relX / (cellW + gridGap)) + 1;
    var rawY = Math.round(relY / (gridCellHeight + gridGap)) + 1;
    var newX = Math.max(1, Math.min(gridCols - dragState.w + 1, rawX));
    var newY = Math.max(1, rawY);
    dragState.placeholder.style.gridColumn = newX + ' / span ' + dragState.w;
    dragState.placeholder.style.gridRow    = newY + ' / span ' + dragState.h;
    dragState.targetX = newX;
    dragState.targetY = newY;
  }
  if (resizeState) {
    var dx2 = e.clientX - resizeState.startX;
    var dy2 = e.clientY - resizeState.startY;
    var grid2 = document.getElementById('widget-grid');
    var gridRect2 = grid2.getBoundingClientRect();
    var cellW2 = (gridRect2.width - (gridCols - 1) * gridGap) / gridCols;
    var cellH2 = gridCellHeight + gridGap;
    var rawW = resizeState.origW + Math.round(dx2 / (cellW2 + gridGap));
    var rawH = resizeState.origH + Math.round(dy2 / cellH2);
    var newW = Math.max(1, Math.min(gridCols - resizeState.origX + 1, rawW));
    var newH = Math.max(1, rawH);
    resizeState.card.style.gridColumn = resizeState.origX + ' / span ' + newW;
    resizeState.card.style.gridRow    = resizeState.origY + ' / span ' + newH;
    resizeState.newW = newW;
    resizeState.newH = newH;
  }
}

async function onPointerUp() {
  if (dragState) {
    dragState.card.classList.remove('being-dragged');
    dragState.ghost.remove();
    dragState.placeholder.remove();
    if (dragState.targetX !== undefined && dragState.targetY !== undefined) {
      var w = widgets.find(function(x) { return x.id === dragState.widgetId; });
      if (w) {
        var pos2 = getWidgetPos(w);
        w.x = dragState.targetX; w.y = dragState.targetY;
        dragState.card.style.gridColumn = w.x + ' / span ' + pos2.w;
        dragState.card.style.gridRow    = w.y + ' / span ' + pos2.h;
        await saveWidgetPosition(w);
      }
    }
    dragState = null;
  }
  if (resizeState) {
    var w2 = widgets.find(function(x) { return x.id === resizeState.widgetId; });
    if (w2 && resizeState.newW !== undefined) {
      w2.w = resizeState.newW; w2.h = resizeState.newH;
      w2.colSpan = w2.w; w2.rowSpan = w2.h;
      await saveWidgetPosition(w2);
    }
    resizeState = null;
  }
}

async function saveWidgetPosition(w) {
  try {
    var pos3 = getWidgetPos(w);
    await fetch('/api/widgets/' + encodeURIComponent(w.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, w, { x: pos3.x, y: pos3.y, w: pos3.w, h: pos3.h, colSpan: pos3.w, rowSpan: pos3.h })),
    });
  } catch (_) {}
}

/* -- Delete widget --------------------------------------------------------- */

async function deleteWidget(id) {
  try {
    var res = await fetch('/api/widgets/' + encodeURIComponent(id), { method: 'DELETE' });
    var json = await res.json();
    if (json.ok) {
      if (trendCharts[id]) { trendCharts[id].destroy(); delete trendCharts[id]; }
      if (historyCharts[id]) { historyCharts[id].destroy(); delete historyCharts[id]; }
      if (clockIntervals[id]) { clearInterval(clockIntervals[id]); delete clockIntervals[id]; }
      delete widgetViewModes[id];
      widgets = widgets.filter(function(w) { return w.id !== id; });
      renderAll();
      if (editMode) applyEditMode(true);
      showToast('Widget removed', 'info', 2000);
    } else showToast('Delete failed: ' + json.error, 'error');
  } catch (e) { showToast('Delete error: ' + e.message, 'error'); }
}

/* -- Edit mode ------------------------------------------------------------- */

function applyEditMode(on) {
  editMode = on;
  var grid = document.getElementById('widget-grid');
  if (grid) grid.classList.toggle('edit-mode', on);
  var editBtn = document.getElementById('edit-toggle-btn');
  var addBtn  = document.getElementById('add-widget-btn');
  var doneBtn = document.getElementById('done-edit-btn');
  if (editBtn) editBtn.classList.toggle('hidden', on);
  if (addBtn)  addBtn.classList.toggle('hidden', !on);
  if (doneBtn) doneBtn.classList.toggle('hidden', !on);
}

/* -- Notifications --------------------------------------------------------- */

function evaluateNotifications(values) {
  notificationRules.forEach(function(rule) {
    if (!rule.enabled) { hideBanner(rule.id); return; }
    var val = values[rule.tagName];
    if (val === null || val === undefined) { hideBanner(rule.id); return; }
    var num = Number(val);
    var thr = Number(rule.threshold);
    var triggered = false;
    switch (rule.condition) {
      case 'gt':  triggered = num > thr;   break;
      case 'gte': triggered = num >= thr;  break;
      case 'lt':  triggered = num < thr;   break;
      case 'lte': triggered = num <= thr;  break;
      case 'eq':  triggered = num === thr; break;
      case 'ne':  triggered = num !== thr; break;
    }
    if (triggered) showBanner(rule);
    else hideBanner(rule.id);
  });
}

function showBanner(rule) {
  if (activeBanners[rule.id]) return;
  var area = document.getElementById('notification-banner-area');
  if (!area) return;
  var div = document.createElement('div');
  div.className = 'notification-banner ' + rule.severity;
  div.dataset.ruleId = rule.id;
  div.innerHTML = '<span>' + escHtml(rule.message || rule.name) + '</span>' +
    '<button class="banner-close" title="Dismiss">\u00d7</button>';
  div.querySelector('.banner-close').addEventListener('click', function() {
    if (activeBanners[rule.id]) { activeBanners[rule.id].remove(); delete activeBanners[rule.id]; }
  });
  area.appendChild(div);
  activeBanners[rule.id] = div;
}

function hideBanner(ruleId) {
  var el = activeBanners[ruleId];
  if (el && el.parentNode) el.remove();
  delete activeBanners[ruleId];
}

/* -- Notifications modal --------------------------------------------------- */

function openNotificationsModal() {
  renderNotifList();
  document.getElementById('notifications-modal').classList.remove('hidden');
}

function closeNotificationsModal() {
  document.getElementById('notifications-modal').classList.add('hidden');
}

function renderNotifList() {
  var body = document.getElementById('notif-modal-body');
  if (!body) return;
  if (notificationRules.length === 0) {
    body.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">No notification rules yet. Click "+ Add Rule" to create one.</p>';
    return;
  }

  // Build DOM nodes to avoid inline onclick XSS
  body.innerHTML = '';
  notificationRules.forEach(function(rule) {
    var row = document.createElement('div');
    row.className = 'notif-rule-row';
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)';

    var info = document.createElement('div');
    var nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'font-weight:600;font-size:0.9rem';
    nameSpan.textContent = rule.name;
    var metaSpan = document.createElement('span');
    metaSpan.style.cssText = 'font-size:0.72rem;color:var(--text-muted);margin-left:8px';
    metaSpan.textContent = rule.tagName + ' ' + rule.condition + ' ' + rule.threshold;
    info.appendChild(nameSpan);
    info.appendChild(metaSpan);
    if (!rule.enabled) {
      var disSpan = document.createElement('span');
      disSpan.style.cssText = 'font-size:0.7rem;color:var(--text-muted);margin-left:6px';
      disSpan.textContent = '(disabled)';
      info.appendChild(disSpan);
    }

    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px';

    var editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary';
    editBtn.style.cssText = 'padding:4px 10px;font-size:0.75rem';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', function() { openNotifRuleModal(rule.id); });

    var delBtn = document.createElement('button');
    delBtn.className = 'btn btn-secondary';
    delBtn.style.cssText = 'padding:4px 10px;font-size:0.75rem;border-color:var(--accent-red)';
    delBtn.textContent = 'Del';
    delBtn.addEventListener('click', function() { deleteNotifRule(rule.id); });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    row.appendChild(info);
    row.appendChild(actions);
    body.appendChild(row);
  });
}

function openNotifRuleModal(id) {
  editingNotifId = id || null;
  var titleEl = document.getElementById('notif-rule-modal-title');
  if (titleEl) titleEl.textContent = id ? 'Edit Rule' : 'Add Rule';
  var tagSel = document.getElementById('nr-tag');
  if (tagSel) {
    tagSel.innerHTML = '<option value="">-- select a tag --</option>';
    tags.forEach(function(t) {
      var o = document.createElement('option');
      o.value = t.name; o.textContent = t.name;
      tagSel.appendChild(o);
    });
  }
  if (id) {
    var rule = notificationRules.find(function(r) { return r.id === id; });
    if (rule) {
      document.getElementById('nr-name').value      = rule.name || '';
      if (tagSel) tagSel.value                       = rule.tagName || '';
      document.getElementById('nr-condition').value  = rule.condition || 'gt';
      document.getElementById('nr-threshold').value  = rule.threshold != null ? rule.threshold : 0;
      document.getElementById('nr-message').value    = rule.message || '';
      document.getElementById('nr-severity').value   = rule.severity || 'warning';
      document.getElementById('nr-enabled').checked  = rule.enabled !== false;
    }
  } else {
    document.getElementById('nr-name').value      = '';
    if (tagSel) tagSel.value                       = '';
    document.getElementById('nr-condition').value  = 'gt';
    document.getElementById('nr-threshold').value  = '';
    document.getElementById('nr-message').value    = '';
    document.getElementById('nr-severity').value   = 'warning';
    document.getElementById('nr-enabled').checked  = true;
  }
  document.getElementById('notif-rule-modal').classList.remove('hidden');
}

async function saveNotifRule() {
  var name      = document.getElementById('nr-name').value.trim();
  var tagName   = document.getElementById('nr-tag').value;
  var condition = document.getElementById('nr-condition').value;
  var threshold = parseFloat(document.getElementById('nr-threshold').value);
  var message   = document.getElementById('nr-message').value.trim();
  var severity  = document.getElementById('nr-severity').value;
  var enabled   = document.getElementById('nr-enabled').checked;
  if (!name)    { showToast('Please enter a rule name', 'error', 2500);    return; }
  if (!tagName) { showToast('Please select a tag', 'error', 2500);         return; }
  if (!Number.isFinite(threshold)) { showToast('Please enter a threshold value', 'error', 2500); return; }
  var payload = {
    id: editingNotifId || ('n_' + Date.now().toString(36)),
    name: name, tagName: tagName, condition: condition, threshold: threshold,
    message: message, severity: severity, enabled: enabled,
  };
  try {
    var res;
    if (editingNotifId) {
      res = await fetch('/api/notifications/' + encodeURIComponent(editingNotifId), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
    } else {
      res = await fetch('/api/notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
    }
    var json = await res.json();
    if (json.ok) {
      showToast('Rule saved', 'success', 2500);
      await loadNotifications();
      document.getElementById('notif-rule-modal').classList.add('hidden');
      renderNotifList();
    } else showToast('Save failed: ' + json.error, 'error');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function deleteNotifRule(id) {
  try {
    var res = await fetch('/api/notifications/' + encodeURIComponent(id), { method: 'DELETE' });
    var json = await res.json();
    if (json.ok) {
      hideBanner(id);
      await loadNotifications();
      renderNotifList();
      showToast('Rule deleted', 'info', 2000);
    } else showToast('Delete failed: ' + json.error, 'error');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

/* -- Modal: column-span picker --------------------------------------------- */

function buildColSpanGrid() {
  var grid = document.getElementById('col-span-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (var col = 1; col <= Math.min(gridCols, 12); col++) {
    (function(col) {
      var cell = document.createElement('div');
      cell.className = 'size-cell' + (col <= modalColSpan ? ' selected-col' : '');
      cell.dataset.col = col;
      cell.addEventListener('mouseover', function() { highlightCols(col); });
      cell.addEventListener('mouseout',  function() { highlightCols(modalColSpan); });
      cell.addEventListener('click', function() {
        modalColSpan = col; highlightCols(col);
        var hint = document.getElementById('col-span-hint');
        if (hint) hint.textContent = 'Width: ' + col + ' column' + (col > 1 ? 's' : '');
      });
      grid.appendChild(cell);
    })(col);
  }
}

function highlightCols(n) {
  document.querySelectorAll('#col-span-grid .size-cell').forEach(function(cell) {
    cell.classList.toggle('selected-col', parseInt(cell.dataset.col, 10) <= n);
  });
}

/* -- Widget accent color --------------------------------------------------- */

function setModalAccentColor(color) {
  modalAccentColor = color || 'none';
  document.querySelectorAll('#widget-color-grid .widget-color-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.color === modalAccentColor);
  });
}

function setBargraphColor(color) {
  modalBargraphColor = color || 'blue';
  document.querySelectorAll('#bargraph-color-grid .bar-color-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.color === modalBargraphColor);
  });
}

/* -- Modal: set type ------------------------------------------------------- */

function setModalType(type) {
  modalType = type;
  document.querySelectorAll('.type-btn[data-type]').forEach(function(b) {
    b.classList.toggle('active', b.dataset.type === type);
  });
  var tagPickerGroup = document.getElementById('modal-tag-picker-group');
  if (tagPickerGroup) {
    tagPickerGroup.classList.toggle('hidden', type === 'iframe' || type === 'group' || type === 'clock');
  }
  var panels = {
    'modal-value-opts':    type === 'value',
    'modal-trend-opts':    type === 'trend',
    'modal-write-opts':    type === 'write',
    'modal-bargraph-opts': type === 'bargraph',
    'modal-iframe-opts':   type === 'iframe',
    'modal-group-opts':    type === 'group',
    'modal-gauge-opts':    type === 'gauge',
    'modal-slider-opts':   type === 'slider',
    'modal-history-opts':  type === 'history',
  };
  Object.keys(panels).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !panels[id]);
  });
}

/* -- Modal: open / close --------------------------------------------------- */

function openAddModal() {
  editingWidgetId = null;
  modalType = 'value'; modalColSpan = 2; modalRowSpan = 1; modalBargraphColor = 'blue';
  var titleEl = document.getElementById('widget-modal-title');
  if (titleEl) titleEl.lastChild.textContent = ' Add Widget';
  var tagSel = document.getElementById('modal-tag-select');
  if (tagSel) populateTagSelect(tagSel, '');
  var groupSel = document.getElementById('modal-group-tags');
  if (groupSel) populateGroupTagSelect(groupSel, []);
  var labelIn = document.getElementById('modal-label');
  if (labelIn) labelIn.value = '';
  setModalType('value');
  buildColSpanGrid();
  document.querySelectorAll('.row-size-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.row === '1'); });
  var defaults = {
    'modal-unit': '', 'modal-decimals': '2', 'modal-trend-length': '30',
    'modal-write-min': '', 'modal-write-max': '', 'modal-write-step': '1',
    'modal-bargraph-min': '0', 'modal-bargraph-max': '100', 'modal-bargraph-unit': '', 'modal-bargraph-decimals': '1',
    'modal-iframe-url': '', 'modal-gauge-min': '0', 'modal-gauge-max': '100', 'modal-gauge-unit': '', 'modal-gauge-decimals': '1',
    'modal-slider-min': '0', 'modal-slider-max': '100', 'modal-slider-step': '1', 'modal-slider-unit': '',
    'modal-history-maxpts': '720',
  };
  Object.keys(defaults).forEach(function(id) { var el = document.getElementById(id); if (el) el.value = defaults[id]; });
  setBargraphColor('blue');
  setModalAccentColor('none');
  showModal();
}

function openEditModal(id) {
  var w = widgets.find(function(x) { return x.id === id; });
  if (!w) return;
  editingWidgetId = id;
  var pos = getWidgetPos(w);
  modalType = w.type || 'value'; modalColSpan = pos.w; modalRowSpan = pos.h;
  modalBargraphColor = (w.config && w.config.color) || 'blue';
  var titleEl = document.getElementById('widget-modal-title');
  if (titleEl) titleEl.lastChild.textContent = ' Edit Widget';
  var tagSel = document.getElementById('modal-tag-select');
  if (tagSel) populateTagSelect(tagSel, w.tagName);
  var groupSel = document.getElementById('modal-group-tags');
  if (groupSel) {
    var selected = (w.config && Array.isArray(w.config.tagNames)) ? w.config.tagNames : [];
    populateGroupTagSelect(groupSel, selected);
  }
  var labelIn = document.getElementById('modal-label');
  if (labelIn) labelIn.value = w.label || '';
  setModalType(modalType);
  buildColSpanGrid();
  highlightCols(modalColSpan);
  var hint = document.getElementById('col-span-hint');
  if (hint) hint.textContent = 'Width: ' + modalColSpan + ' column' + (modalColSpan > 1 ? 's' : '');
  document.querySelectorAll('.row-size-btn').forEach(function(b) {
    b.classList.toggle('active', parseInt(b.dataset.row, 10) === modalRowSpan);
  });
  var cfg = w.config || {};
  var setVal = function(elId, val) { var el = document.getElementById(elId); if (el && val !== undefined) el.value = val; };
  setVal('modal-unit',              cfg.unit     || '');
  setVal('modal-decimals',          cfg.decimals != null ? cfg.decimals : 2);
  setVal('modal-trend-length',      cfg.trendLength || 30);
  setVal('modal-write-min',         cfg.writeMin != null ? cfg.writeMin : '');
  setVal('modal-write-max',         cfg.writeMax != null ? cfg.writeMax : '');
  setVal('modal-write-step',        cfg.writeStep != null ? cfg.writeStep : 1);
  setVal('modal-bargraph-min',      cfg.min != null ? cfg.min : 0);
  setVal('modal-bargraph-max',      cfg.max != null ? cfg.max : 100);
  setVal('modal-bargraph-unit',     cfg.unit || '');
  setVal('modal-bargraph-decimals', cfg.decimals != null ? cfg.decimals : 1);
  setVal('modal-iframe-url',        cfg.url || '');
  setVal('modal-gauge-min',         cfg.min != null ? cfg.min : 0);
  setVal('modal-gauge-max',         cfg.max != null ? cfg.max : 100);
  setVal('modal-gauge-unit',        cfg.unit || '');
  setVal('modal-gauge-decimals',    cfg.decimals != null ? cfg.decimals : 1);
  setVal('modal-slider-min',        cfg.min  != null ? cfg.min  : 0);
  setVal('modal-slider-max',        cfg.max  != null ? cfg.max  : 100);
  setVal('modal-slider-step',       cfg.step != null ? cfg.step : 1);
  setVal('modal-slider-unit',       cfg.unit || '');
  setVal('modal-history-maxpts',    cfg.maxPoints != null ? cfg.maxPoints : 720);
  setBargraphColor(cfg.color || 'blue');
  setModalAccentColor(w.accentColor || 'none');
  showModal();
}

function showModal() {
  var modal = document.getElementById('widget-modal');
  if (modal) { modal.classList.remove('hidden'); var labelIn = document.getElementById('modal-label'); if (labelIn) labelIn.focus(); }
}

function closeModal() {
  var modal = document.getElementById('widget-modal');
  if (modal) modal.classList.add('hidden');
  editingWidgetId = null;
}

function formatTagMeta(t) {
  var location = t.area === 'DB' ? 'DB' + t.dbNumber : t.area;
  return t.name + '  (' + t.dataType + ', ' + location + ' byte ' + t.byteOffset + ')';
}

function populateTagSelect(sel, selectedName) {
  sel.innerHTML = '<option value="">-- select a tag --</option>';
  tags.forEach(function(t) {
    var opt = document.createElement('option');
    opt.value = t.name; opt.textContent = formatTagMeta(t);
    if (t.name === selectedName) opt.selected = true;
    sel.appendChild(opt);
  });
}

function populateGroupTagSelect(sel, selectedNames) {
  var set = new Set(selectedNames || []);
  sel.innerHTML = '';
  tags.forEach(function(t) {
    var opt = document.createElement('option');
    opt.value = t.name; opt.textContent = formatTagMeta(t);
    if (set.has(t.name)) opt.selected = true;
    sel.appendChild(opt);
  });
}

/* -- Modal: save ----------------------------------------------------------- */

async function saveWidget() {
  var tagSel  = document.getElementById('modal-tag-select');
  var labelIn = document.getElementById('modal-label');
  var isTagless = modalType === 'iframe' || modalType === 'group' || modalType === 'clock';
  var tagName = isTagless ? '' : (tagSel ? tagSel.value : '');
  var label   = labelIn ? labelIn.value.trim() : '';
  if (!isTagless && !tagName) { showToast('Please select a tag', 'error', 2500); return; }
  if (!label) { showToast('Please enter a label', 'error', 2500); return; }

  var cfg = {};
  if (modalType === 'value') {
    var u = document.getElementById('modal-unit');
    var d = document.getElementById('modal-decimals');
    cfg.unit = u ? u.value.trim() : ''; cfg.decimals = d ? parseInt(d.value, 10) : 2;
  }
  if (modalType === 'trend') {
    var t = document.getElementById('modal-trend-length');
    cfg.trendLength = t ? Math.max(5, Math.min(200, parseInt(t.value, 10) || 30)) : 30;
  }
  if (modalType === 'write') {
    var mn = document.getElementById('modal-write-min');
    var mx = document.getElementById('modal-write-max');
    var st = document.getElementById('modal-write-step');
    cfg.writeMin  = mn && mn.value.trim() !== '' ? parseFloat(mn.value) : null;
    cfg.writeMax  = mx && mx.value.trim() !== '' ? parseFloat(mx.value) : null;
    cfg.writeStep = st && st.value.trim() !== '' ? parseFloat(st.value) : 1;
  }
  if (modalType === 'bargraph') {
    cfg.min = parseFloat(document.getElementById('modal-bargraph-min').value) || 0;
    cfg.max = parseFloat(document.getElementById('modal-bargraph-max').value) || 100;
    cfg.unit = (document.getElementById('modal-bargraph-unit') || {}).value || '';
    cfg.decimals = parseInt((document.getElementById('modal-bargraph-decimals') || {}).value, 10) || 1;
    cfg.color = modalBargraphColor || 'blue';
  }
  if (modalType === 'iframe') {
    var urlIn = document.getElementById('modal-iframe-url');
    cfg.url = urlIn ? urlIn.value.trim() : '';
    if (!cfg.url) { showToast('Please enter a URL', 'error', 2500); return; }
  }
  if (modalType === 'group') {
    var groupSel = document.getElementById('modal-group-tags');
    cfg.tagNames = groupSel ? Array.from(groupSel.selectedOptions).map(function(o) { return o.value; }) : [];
    if (cfg.tagNames.length === 0) { showToast('Please select at least one tag', 'error', 2500); return; }
  }
  if (modalType === 'gauge') {
    cfg.min = parseFloat(document.getElementById('modal-gauge-min').value) || 0;
    cfg.max = parseFloat(document.getElementById('modal-gauge-max').value) || 100;
    cfg.unit = (document.getElementById('modal-gauge-unit') || {}).value || '';
    cfg.decimals = parseInt((document.getElementById('modal-gauge-decimals') || {}).value, 10) || 1;
  }
  if (modalType === 'slider') {
    cfg.min  = parseFloat(document.getElementById('modal-slider-min').value) || 0;
    cfg.max  = parseFloat(document.getElementById('modal-slider-max').value) || 100;
    cfg.step = parseFloat(document.getElementById('modal-slider-step').value) || 1;
    cfg.unit = (document.getElementById('modal-slider-unit') || {}).value || '';
  }
  if (modalType === 'history') {
    var hMp = document.getElementById('modal-history-maxpts');
    cfg.maxPoints = hMp ? Math.max(50, Math.min(2000, parseInt(hMp.value, 10) || 720)) : 720;
  }

  var existingPos = null;
  if (editingWidgetId) {
    var existing = widgets.find(function(w) { return w.id === editingWidgetId; });
    if (existing) existingPos = getWidgetPos(existing);
  }

  var payload = {
    id: editingWidgetId || genId(),
    type: modalType, tagName: tagName, label: label,
    colSpan: modalColSpan, rowSpan: modalRowSpan,
    w: modalColSpan, h: modalRowSpan,
    config: cfg, accentColor: modalAccentColor,
  };
  if (existingPos) { payload.x = existingPos.x; payload.y = existingPos.y; }

  try {
    var res, json;
    if (editingWidgetId) {
      res  = await fetch('/api/widgets/' + encodeURIComponent(editingWidgetId), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      json = await res.json();
      if (json.ok) {
        var idx = widgets.findIndex(function(w) { return w.id === editingWidgetId; });
        if (idx !== -1) widgets[idx] = json.widget;
        showToast('Widget updated', 'success', 2500);
      } else { showToast('Update failed: ' + json.error, 'error'); return; }
    } else {
      res  = await fetch('/api/widgets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      json = await res.json();
      if (json.ok) { widgets.push(json.widget); showToast('Widget added', 'success', 2500); }
      else { showToast('Create failed: ' + json.error, 'error'); return; }
    }
  } catch (e) { showToast('Error: ' + e.message, 'error'); return; }

  closeModal();
  autoAssignPositions(widgets, gridCols);
  renderAll();
  if (editMode) applyEditMode(true);
}

/* -- Socket.io -------------------------------------------------------------- */

var socket = io();

socket.on('connect',    function() { showToast('Connected to server', 'info', 2000); });
socket.on('disconnect', function() {
  showToast('Disconnected from server', 'error', 4000);
  updatePlcBadge({ connected: false, error: 'Server disconnected' });
});
socket.on('plcStatus', function(status) { updatePlcBadge(status); });
socket.on('plcData',   function(d) { updatePlcBadge(d.status); });

socket.on('tagValues', function(values) {
  var trendTagNames = new Set(widgets.filter(function(w) { return w.type === 'trend'; }).map(function(w) { return w.tagName; }));
  Object.keys(values).forEach(function(name) {
    var value = values[name];
    if (trendTagNames.has(name) && value !== null && value !== undefined) pushTrend(name, value);
  });
  widgets.filter(function(w) { return w.type === 'history'; }).forEach(function(w) {
    var value = values[w.tagName];
    if (value !== null && value !== undefined) {
      pushHistoryData(w.tagName, value, (w.config && w.config.maxPoints) || HISTORY_MAX_POINTS);
    }
  });
  Object.assign(tagValues, values);
  widgets.forEach(function(w) {
    if (w.type === 'group') applyGroupValues(w);
    else {
      var val = tagValues[w.tagName];
      if (val !== undefined) {
        applyValue(w, val);
        if (w.type === 'trend') updateTrendChart(w);
        if (w.type === 'history') updateHistoryChart(w);
      }
    }
  });
  evaluateNotifications(tagValues);
});

/* -- Init ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', async function() {
  await Promise.all([loadTags(), loadWidgets(), loadGridSettings(), loadNotifications()]);
  autoAssignPositions(widgets, gridCols);
  renderAll();

  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup',   onPointerUp);

  document.getElementById('edit-toggle-btn').addEventListener('click', function() { applyEditMode(true); });
  document.getElementById('done-edit-btn').addEventListener('click',   function() { applyEditMode(false); });
  document.getElementById('add-widget-btn').addEventListener('click',  function() { openAddModal(); });

  document.getElementById('widget-modal-close').addEventListener('click',   closeModal);
  document.getElementById('widget-modal-cancel').addEventListener('click',  closeModal);
  document.getElementById('widget-modal-confirm').addEventListener('click', saveWidget);
  document.getElementById('widget-modal').addEventListener('click', function(e) {
    if (e.target === document.getElementById('widget-modal')) closeModal();
  });
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });

  document.querySelectorAll('.type-btn[data-type]').forEach(function(btn) {
    btn.addEventListener('click', function() { setModalType(btn.dataset.type); });
  });
  document.querySelectorAll('.row-size-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      modalRowSpan = parseInt(btn.dataset.row, 10);
      document.querySelectorAll('.row-size-btn').forEach(function(b) { b.classList.toggle('active', b === btn); });
    });
  });
  document.querySelectorAll('#bargraph-color-grid .bar-color-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { setBargraphColor(btn.dataset.color); });
  });
  document.querySelectorAll('#widget-color-grid .widget-color-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { setModalAccentColor(btn.dataset.color); });
  });
  buildColSpanGrid();

  /* Grid settings modal */
  document.getElementById('grid-settings-btn').addEventListener('click',   openGridSettingsModal);
  document.getElementById('grid-modal-close').addEventListener('click',    function() { document.getElementById('grid-settings-modal').classList.add('hidden'); });
  document.getElementById('grid-modal-cancel').addEventListener('click',   function() { document.getElementById('grid-settings-modal').classList.add('hidden'); });
  document.getElementById('grid-modal-save').addEventListener('click',     saveGridSettings);

  /* Notifications modal */
  document.getElementById('notifications-btn').addEventListener('click',      openNotificationsModal);
  document.getElementById('notif-modal-close').addEventListener('click',      closeNotificationsModal);
  document.getElementById('notif-modal-close-btn').addEventListener('click',  closeNotificationsModal);
  document.getElementById('notif-add-rule-btn').addEventListener('click',     function() { openNotifRuleModal(null); });
  document.getElementById('notif-rule-modal-close').addEventListener('click', function() { document.getElementById('notif-rule-modal').classList.add('hidden'); });
  document.getElementById('notif-rule-cancel').addEventListener('click',      function() { document.getElementById('notif-rule-modal').classList.add('hidden'); });
  document.getElementById('notif-rule-save').addEventListener('click',        saveNotifRule);

  /* Theme modal */
  document.getElementById('theme-btn').addEventListener('click',             function() { document.getElementById('theme-modal').classList.remove('hidden'); });
  document.getElementById('theme-modal-close').addEventListener('click',     function() { document.getElementById('theme-modal').classList.add('hidden'); });
  document.getElementById('theme-modal-close-btn').addEventListener('click', function() { document.getElementById('theme-modal').classList.add('hidden'); });
  document.querySelectorAll('[data-theme-opt]').forEach(function(btn) {
    btn.addEventListener('click', function() { switchTheme(btn.dataset.themeOpt); });
  });
});