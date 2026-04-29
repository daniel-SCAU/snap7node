'use strict';

/* ── Toast ────────────────────────────────────────────────────────────────── */

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

/* ── State ────────────────────────────────────────────────────────────────── */

let widgets = [];          // widget config array (order = display order)
let tags = [];             // tag definitions from /api/tags
let tagValues = {};        // tagName -> current value
let trendHistory = {};     // tagName -> { labels: [], values: [] }
let trendCharts = {};      // widgetId -> Chart instance
let editMode = false;
let editingWidgetId = null; // null = adding new, string = editing existing

// Modal form state
let modalType = 'value';
let modalColSpan = 1;
let modalRowSpan = 1;
let modalBargraphColor = 'blue';

/* ── ID generator ─────────────────────────────────────────────────────────── */

function genId() {
  return 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

/* ── Fetch helpers ────────────────────────────────────────────────────────── */

async function loadTags() {
  try {
    const res = await fetch('/api/tags');
    const json = await res.json();
    tags = json.tags || [];
  } catch (_) {
    tags = [];
  }
}

async function loadWidgets() {
  try {
    const res = await fetch('/api/widgets');
    const json = await res.json();
    widgets = json.widgets || [];
  } catch (_) {
    widgets = [];
  }
}

/* ── PLC Status ────────────────────────────────────────────────────────────── */

function updatePlcBadge(status) {
  const badge = document.getElementById('plc-status-badge');
  if (!badge) return;
  if (status.connected) {
    badge.className = 'status-dot connected';
    badge.querySelector('.label').textContent = 'PLC Connected';
  } else {
    badge.className = 'status-dot disconnected';
    badge.querySelector('.label').textContent = status.error ? 'PLC Error' : 'PLC Disconnected';
  }
}

/* ── Trend history management ─────────────────────────────────────────────── */

const MAX_TREND = 200;

function initTrendHistory(tagName, maxPoints) {
  if (!trendHistory[tagName]) {
    trendHistory[tagName] = { labels: [], values: [] };
  }
}

function pushTrend(tagName, value) {
  if (!trendHistory[tagName]) trendHistory[tagName] = { labels: [], values: [] };
  const hist = trendHistory[tagName];
  const label = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  hist.labels.push(label);
  hist.values.push(value);
  if (hist.labels.length > MAX_TREND) {
    hist.labels.shift();
    hist.values.shift();
  }
}

function getTrendSlice(tagName, maxPoints) {
  const hist = trendHistory[tagName] || { labels: [], values: [] };
  const n = maxPoints || 30;
  return {
    labels: hist.labels.slice(-n),
    values: hist.values.slice(-n),
  };
}

/* ── Tag badge helper ─────────────────────────────────────────────────────── */

function getTagBadgeText(w) {
  if (w.type === 'group') {
    const n = (w.config && Array.isArray(w.config.tagNames)) ? w.config.tagNames.length : 0;
    return `${n} tag${n !== 1 ? 's' : ''}`;
  }
  if (w.type === 'iframe') {
    try {
      return new URL((w.config && w.config.url) || '').hostname || 'iframe';
    } catch (_) {
      return 'iframe';
    }
  }
  return w.tagName || '';
}

/* ── Widget rendering ─────────────────────────────────────────────────────── */

function renderAll() {
  // Destroy existing trend charts to avoid canvas reuse errors
  for (const id of Object.keys(trendCharts)) {
    if (trendCharts[id]) {
      trendCharts[id].destroy();
      delete trendCharts[id];
    }
  }

  const grid = document.getElementById('widget-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (widgets.length === 0) {
    grid.innerHTML = `
      <div class="widget-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
        <h3>No widgets yet</h3>
        <p>Click <strong>Edit Layout</strong> → <strong>Add Widget</strong> to create your first widget.</p>
      </div>`;
    return;
  }

  widgets.forEach((w, idx) => {
    const card = buildWidgetCard(w, idx);
    grid.appendChild(card);
  });

  // Init charts after DOM insertion
  widgets.forEach((w) => {
    if (w.type === 'trend') {
      initTrendChart(w);
    }
  });

  // Apply current values
  applyAllValues();
}

function buildWidgetCard(w, idx) {
  const card = document.createElement('div');
  card.className = `widget-card widget-col-${w.colSpan || 1} widget-row-${w.rowSpan || 1}`;
  card.dataset.id = w.id;
  card.dataset.idx = idx;

  card.innerHTML = `
    <!-- Drag handle (edit mode only) -->
    <div class="widget-drag-handle" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/>
        <circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/>
        <circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>
      </svg>
    </div>

    <!-- Edit buttons (edit mode only) -->
    <div class="widget-edit-actions">
      <button class="widget-edit-btn btn-edit" title="Edit widget" data-id="${w.id}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="widget-edit-btn btn-delete" title="Remove widget" data-id="${w.id}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
          <path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>

    <!-- Widget content -->
    <div class="widget-header">
      <span class="widget-label">${escHtml(w.label)}</span>
      <span class="widget-tag-badge">${escHtml(getTagBadgeText(w))}</span>
    </div>
    <div class="widget-body" id="wbody-${w.id}">
      ${buildWidgetBody(w)}
    </div>`;

  // Drag-and-drop
  card.setAttribute('draggable', 'true');
  card.addEventListener('dragstart', onDragStart);
  card.addEventListener('dragover', onDragOver);
  card.addEventListener('dragleave', onDragLeave);
  card.addEventListener('drop', onDrop);
  card.addEventListener('dragend', onDragEnd);

  // Edit / delete buttons
  card.querySelector('.btn-edit').addEventListener('click', (e) => {
    e.stopPropagation();
    openEditModal(w.id);
  });
  card.querySelector('.btn-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteWidget(w.id);
  });

  // Write widget send button
  if (w.type === 'write') {
    const sendBtn = card.querySelector('.widget-write-send');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => handleWrite(w));
    }
    const toggle = card.querySelector('.widget-write-toggle-btn');
    if (toggle) {
      toggle.addEventListener('click', () => handleBoolToggle(w));
    }
  }

  return card;
}

function buildWidgetBody(w) {
  switch (w.type) {
    case 'value':
      return `
        <div class="widget-value-display" id="wval-${w.id}">—</div>
        <div class="widget-value-unit">${escHtml((w.config && w.config.unit) || '')}</div>`;

    case 'trend':
      return `<canvas class="widget-trend-canvas" id="wchart-${w.id}"></canvas>`;

    case 'indicator':
      return `
        <div class="widget-indicator-wrap">
          <div class="widget-led led-off" id="wled-${w.id}"></div>
          <span class="widget-led-state state-off" id="wled-state-${w.id}">—</span>
        </div>`;

    case 'write': {
      const tag = tags.find((t) => t.name === w.tagName);
      const isBool = tag && tag.dataType === 'Bool';
      if (isBool) {
        return `
          <div class="widget-write-toggle">
            <button class="widget-write-toggle-btn btn btn-secondary" id="wwrite-btn-${w.id}">Toggle</button>
            <span class="widget-current-val" id="wwrite-cur-${w.id}">Current: —</span>
          </div>`;
      }
      const cfg = w.config || {};
      const minAttr  = cfg.writeMin  != null ? `min="${cfg.writeMin}"`  : '';
      const maxAttr  = cfg.writeMax  != null ? `max="${cfg.writeMax}"`  : '';
      const stepAttr = cfg.writeStep != null ? `step="${cfg.writeStep}"` : 'step="1"';
      return `
        <div class="widget-write-form">
          <input class="widget-write-input" id="wwrite-input-${w.id}" type="number"
            ${minAttr} ${maxAttr} ${stepAttr} placeholder="value" />
          <button class="widget-write-send" id="wwrite-btn-${w.id}">Send</button>
        </div>
        <div class="widget-current-val" id="wwrite-cur-${w.id}">Current: —</div>`;
    }

    case 'bargraph': {
      const cfg = w.config || {};
      const min = cfg.min != null ? cfg.min : 0;
      const max = cfg.max != null ? cfg.max : 100;
      const unit = cfg.unit || '';
      const color = cfg.color || 'blue';
      return `
        <div class="widget-bar-wrap">
          <div class="widget-bar-track">
            <div class="widget-bar-fill widget-bar-${escHtml(color)}" id="wbar-${w.id}" style="width:0%"></div>
          </div>
          <div class="widget-bar-labels">
            <span>${escHtml(String(min))}${escHtml(unit)}</span>
            <span class="widget-bar-value" id="wbar-val-${w.id}">—</span>
            <span>${escHtml(String(max))}${escHtml(unit)}</span>
          </div>
        </div>`;
    }

    case 'iframe': {
      const cfg = w.config || {};
      const url = cfg.url || '';
      if (!url) {
        return `<span style="color:var(--text-muted);font-size:0.8rem">No URL configured</span>`;
      }
      return `<iframe class="widget-iframe" src="${escHtml(url)}" loading="lazy" sandbox="allow-scripts allow-forms"></iframe>`;
    }

    case 'group': {
      const cfg = w.config || {};
      const tagNames = Array.isArray(cfg.tagNames) ? cfg.tagNames : [];
      if (tagNames.length === 0) {
        return `<span style="color:var(--text-muted);font-size:0.8rem">No tags configured</span>`;
      }
      const rows = tagNames.map((tn) => `
        <div class="widget-group-row">
          <span class="widget-group-tag">${escHtml(tn)}</span>
          <span class="widget-group-value" id="wgroup-val-${w.id}-${escHtml(tn)}">—</span>
        </div>`).join('');
      return `<div class="widget-group-list">${rows}</div>`;
    }

    default:
      return `<span style="color:var(--text-muted);font-size:0.8rem">Unknown widget type</span>`;
  }
}

function applyAllValues() {
  widgets.forEach((w) => {
    if (w.type === 'group') {
      applyGroupValues(w);
    } else {
      applyValue(w, tagValues[w.tagName]);
    }
  });
}

function applyGroupValues(w) {
  const tagNames = (w.config && Array.isArray(w.config.tagNames)) ? w.config.tagNames : [];
  tagNames.forEach((tn) => {
    const el = document.getElementById(`wgroup-val-${w.id}-${tn}`);
    if (!el) return;
    const val = tagValues[tn];
    if (val === null || val === undefined) {
      el.textContent = '—';
      el.className = 'widget-group-value';
    } else {
      const tag = tags.find((t) => t.name === tn);
      const isBool = tag && tag.dataType === 'Bool';
      if (isBool) {
        const on = val === true || val === 1;
        el.textContent = on ? 'ON' : 'OFF';
        el.className = `widget-group-value ${on ? 'group-on' : 'group-off'}`;
      } else {
        el.textContent = String(val);
        el.className = 'widget-group-value';
      }
    }
  });
}

function applyValue(w, value) {
  switch (w.type) {
    case 'value': {
      const el = document.getElementById(`wval-${w.id}`);
      if (!el) return;
      const cfg = w.config || {};
      const decimals = cfg.decimals != null ? parseInt(cfg.decimals, 10) : 2;
      let display = '—';
      if (value !== null && value !== undefined) {
        display = typeof value === 'number' ? value.toFixed(Math.max(0, decimals)) : String(value);
      }
      if (el.textContent !== display) {
        el.textContent = display;
        el.classList.remove('widget-flash');
        void el.offsetWidth;
        el.classList.add('widget-flash');
      }
      break;
    }

    case 'indicator': {
      const led = document.getElementById(`wled-${w.id}`);
      const stateEl = document.getElementById(`wled-state-${w.id}`);
      if (!led || !stateEl) return;
      const on = value === true || value === 1;
      led.className = `widget-led ${on ? 'led-on' : 'led-off'}`;
      stateEl.className = `widget-led-state ${on ? 'state-on' : 'state-off'}`;
      stateEl.textContent = value === null || value === undefined ? '—' : (on ? 'ON' : 'OFF');
      break;
    }

    case 'write': {
      const curEl = document.getElementById(`wwrite-cur-${w.id}`);
      if (curEl && value !== null && value !== undefined) {
        curEl.textContent = `Current: ${value}`;
      }
      // Also update toggle button text for Bool
      const tag = tags.find((t) => t.name === w.tagName);
      if (tag && tag.dataType === 'Bool') {
        const btn = document.getElementById(`wwrite-btn-${w.id}`);
        if (btn) {
          const on = value === true || value === 1;
          btn.textContent = on ? 'Turn OFF' : 'Turn ON';
          btn.style.background = on ? 'var(--accent-red)' : 'var(--accent-green)';
        }
      }
      break;
    }

    case 'trend': {
      // trend chart updated separately
      break;
    }

    case 'bargraph': {
      const bar   = document.getElementById(`wbar-${w.id}`);
      const valEl = document.getElementById(`wbar-val-${w.id}`);
      if (!bar || !valEl) return;
      const cfg  = w.config || {};
      const min  = cfg.min != null ? Number(cfg.min) : 0;
      const max  = cfg.max != null ? Number(cfg.max) : 100;
      const dec  = cfg.decimals != null ? Math.max(0, parseInt(cfg.decimals, 10)) : 1;
      const unit = cfg.unit || '';
      if (value === null || value === undefined) {
        bar.style.width = '0%';
        valEl.textContent = '—';
      } else {
        const num = Number(value);
        const range = max - min || 1;
        const pct = Math.min(100, Math.max(0, ((num - min) / range) * 100));
        bar.style.width = pct + '%';
        valEl.textContent = num.toFixed(dec) + (unit ? '\u00a0' + unit : '');
      }
      break;
    }
  }
}

/* ── Trend charts ─────────────────────────────────────────────────────────── */

function initTrendChart(w) {
  const canvas = document.getElementById(`wchart-${w.id}`);
  if (!canvas || typeof Chart === 'undefined') return;
  if (trendCharts[w.id]) {
    trendCharts[w.id].destroy();
  }
  const maxPts = (w.config && w.config.trendLength) || 30;
  const slice = getTrendSlice(w.tagName, maxPts);
  trendCharts[w.id] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: slice.labels,
      datasets: [{
        label: w.label,
        data: slice.values,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: '#475569', font: { size: 10 }, maxRotation: 0, maxTicksLimit: 6 },
          grid: { color: 'rgba(30,41,59,0.8)' },
        },
        y: {
          ticks: { color: '#475569', font: { size: 10 } },
          grid: { color: 'rgba(30,41,59,0.8)' },
          beginAtZero: false,
        },
      },
    },
  });
}

function updateTrendChart(w, value) {
  const chart = trendCharts[w.id];
  if (!chart) return;
  const maxPts = (w.config && w.config.trendLength) || 30;
  const slice = getTrendSlice(w.tagName, maxPts);
  chart.data.labels = slice.labels;
  chart.data.datasets[0].data = slice.values;
  chart.update('none');
}

/* ── Write actions ────────────────────────────────────────────────────────── */

async function handleWrite(w) {
  const input = document.getElementById(`wwrite-input-${w.id}`);
  if (!input) return;
  const raw = input.value.trim();
  if (raw === '') { showToast('Enter a value first', 'error', 2500); return; }
  const num = parseFloat(raw);
  if (!Number.isFinite(num)) { showToast('Invalid number', 'error', 2500); return; }

  try {
    const res = await fetch(`/api/tags/${encodeURIComponent(w.tagName)}/value`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: num }),
    });
    const json = await res.json();
    if (json.ok) {
      showToast(`${w.label}: wrote ${num}`, 'success', 2500);
      input.value = '';
    } else {
      showToast('Write failed: ' + json.error, 'error');
    }
  } catch (e) {
    showToast('Write error: ' + e.message, 'error');
  }
}

async function handleBoolToggle(w) {
  const currentVal = tagValues[w.tagName];
  const newVal = !(currentVal === true || currentVal === 1);
  try {
    const res = await fetch(`/api/tags/${encodeURIComponent(w.tagName)}/value`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: newVal }),
    });
    const json = await res.json();
    if (json.ok) {
      showToast(`${w.label}: set to ${newVal ? 'ON' : 'OFF'}`, 'success', 2500);
    } else {
      showToast('Write failed: ' + json.error, 'error');
    }
  } catch (e) {
    showToast('Write error: ' + e.message, 'error');
  }
}

/* ── Drag-and-Drop reorder ───────────────────────────────────────────────── */

let dragSrcId = null;

function onDragStart(e) {
  if (!editMode) { e.preventDefault(); return; }
  dragSrcId = e.currentTarget.dataset.id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcId);
}

function onDragOver(e) {
  if (!editMode || !dragSrcId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  if (target.dataset.id !== dragSrcId) {
    target.classList.add('drag-over');
  }
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onDrop(e) {
  if (!editMode || !dragSrcId) return;
  e.preventDefault();
  const targetId = e.currentTarget.dataset.id;
  e.currentTarget.classList.remove('drag-over');
  if (targetId === dragSrcId) return;

  const srcIdx = widgets.findIndex((w) => w.id === dragSrcId);
  const tgtIdx = widgets.findIndex((w) => w.id === targetId);
  if (srcIdx === -1 || tgtIdx === -1) return;

  // Move srcIdx to tgtIdx
  const [moved] = widgets.splice(srcIdx, 1);
  widgets.splice(tgtIdx, 0, moved);

  saveWidgetOrder();
  renderAll();
  if (editMode) applyEditMode(true);
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  dragSrcId = null;
  document.querySelectorAll('.widget-card').forEach((c) => c.classList.remove('drag-over'));
}

async function saveWidgetOrder() {
  try {
    await fetch('/api/widgets/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: widgets.map((w) => w.id) }),
    });
  } catch (_) {}
}

/* ── Delete widget ───────────────────────────────────────────────────────── */

async function deleteWidget(id) {
  try {
    const res = await fetch(`/api/widgets/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.ok) {
      if (trendCharts[id]) {
        trendCharts[id].destroy();
        delete trendCharts[id];
      }
      widgets = widgets.filter((w) => w.id !== id);
      renderAll();
      if (editMode) applyEditMode(true);
      showToast('Widget removed', 'info', 2000);
    } else {
      showToast('Delete failed: ' + json.error, 'error');
    }
  } catch (e) {
    showToast('Delete error: ' + e.message, 'error');
  }
}

/* ── Edit mode ───────────────────────────────────────────────────────────── */

function applyEditMode(on) {
  editMode = on;
  const grid = document.getElementById('widget-grid');
  if (grid) {
    grid.classList.toggle('edit-mode', on);
  }
  const editBtn = document.getElementById('edit-toggle-btn');
  const addBtn  = document.getElementById('add-widget-btn');
  const doneBtn = document.getElementById('done-edit-btn');

  if (editBtn) editBtn.classList.toggle('hidden', on);
  if (addBtn)  addBtn.classList.toggle('hidden', !on);
  if (doneBtn) doneBtn.classList.toggle('hidden', !on);
}

/* ── Modal: column-span picker ───────────────────────────────────────────── */

function buildColSpanGrid() {
  const grid = document.getElementById('col-span-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let col = 1; col <= 6; col++) {
    const cell = document.createElement('div');
    cell.className = 'size-cell' + (col <= modalColSpan ? ' selected-col' : '');
    cell.dataset.col = col;
    cell.addEventListener('mouseover', () => highlightCols(col));
    cell.addEventListener('mouseout', () => highlightCols(modalColSpan));
    cell.addEventListener('click', () => {
      modalColSpan = col;
      highlightCols(col);
      const hint = document.getElementById('col-span-hint');
      if (hint) hint.textContent = `Width: ${col} column${col > 1 ? 's' : ''}`;
    });
    grid.appendChild(cell);
  }
}

function highlightCols(n) {
  document.querySelectorAll('#col-span-grid .size-cell').forEach((cell) => {
    const col = parseInt(cell.dataset.col, 10);
    cell.classList.toggle('selected-col', col <= n);
  });
}

/* ── Modal: open / close ─────────────────────────────────────────────────── */

function openAddModal() {
  editingWidgetId = null;
  modalType = 'value';
  modalColSpan = 1;
  modalRowSpan = 1;
  modalBargraphColor = 'blue';

  const titleEl = document.getElementById('widget-modal-title');
  if (titleEl) titleEl.lastChild.textContent = ' Add Widget';

  // Reset form
  const tagSel = document.getElementById('modal-tag-select');
  if (tagSel) populateTagSelect(tagSel, '');
  const groupSel = document.getElementById('modal-group-tags');
  if (groupSel) populateGroupTagSelect(groupSel, []);
  const labelIn = document.getElementById('modal-label');
  if (labelIn) labelIn.value = '';
  setModalType('value');
  buildColSpanGrid();

  document.querySelectorAll('.row-size-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.row === '1');
  });

  // Reset option fields
  const unitIn = document.getElementById('modal-unit');
  if (unitIn) unitIn.value = '';
  const decIn = document.getElementById('modal-decimals');
  if (decIn) decIn.value = '2';
  const trendIn = document.getElementById('modal-trend-length');
  if (trendIn) trendIn.value = '30';
  const wMinIn = document.getElementById('modal-write-min');
  if (wMinIn) wMinIn.value = '';
  const wMaxIn = document.getElementById('modal-write-max');
  if (wMaxIn) wMaxIn.value = '';
  const wStepIn = document.getElementById('modal-write-step');
  if (wStepIn) wStepIn.value = '1';
  const bgMinIn = document.getElementById('modal-bargraph-min');
  if (bgMinIn) bgMinIn.value = '0';
  const bgMaxIn = document.getElementById('modal-bargraph-max');
  if (bgMaxIn) bgMaxIn.value = '100';
  const bgUnitIn = document.getElementById('modal-bargraph-unit');
  if (bgUnitIn) bgUnitIn.value = '';
  const bgDecIn = document.getElementById('modal-bargraph-decimals');
  if (bgDecIn) bgDecIn.value = '1';
  setBargraphColor('blue');
  const iframeUrlIn = document.getElementById('modal-iframe-url');
  if (iframeUrlIn) iframeUrlIn.value = '';

  showModal();
}

function openEditModal(id) {
  const w = widgets.find((x) => x.id === id);
  if (!w) return;
  editingWidgetId = id;
  modalType = w.type || 'value';
  modalColSpan = w.colSpan || 1;
  modalRowSpan = w.rowSpan || 1;
  modalBargraphColor = (w.config && w.config.color) || 'blue';

  const titleEl = document.getElementById('widget-modal-title');
  if (titleEl) titleEl.lastChild.textContent = ' Edit Widget';

  const tagSel = document.getElementById('modal-tag-select');
  if (tagSel) populateTagSelect(tagSel, w.tagName);
  const groupSel = document.getElementById('modal-group-tags');
  if (groupSel) {
    const selected = (w.config && Array.isArray(w.config.tagNames)) ? w.config.tagNames : [];
    populateGroupTagSelect(groupSel, selected);
  }

  const labelIn = document.getElementById('modal-label');
  if (labelIn) labelIn.value = w.label || '';

  setModalType(modalType);
  buildColSpanGrid();
  highlightCols(modalColSpan);
  const hint = document.getElementById('col-span-hint');
  if (hint) hint.textContent = `Width: ${modalColSpan} column${modalColSpan > 1 ? 's' : ''}`;

  document.querySelectorAll('.row-size-btn').forEach((b) => {
    b.classList.toggle('active', parseInt(b.dataset.row, 10) === modalRowSpan);
  });

  // Fill type-specific config
  const cfg = w.config || {};
  const unitIn = document.getElementById('modal-unit');
  if (unitIn) unitIn.value = cfg.unit || '';
  const decIn = document.getElementById('modal-decimals');
  if (decIn) decIn.value = cfg.decimals != null ? cfg.decimals : 2;
  const trendIn = document.getElementById('modal-trend-length');
  if (trendIn) trendIn.value = cfg.trendLength || 30;
  const wMinIn = document.getElementById('modal-write-min');
  if (wMinIn) wMinIn.value = cfg.writeMin != null ? cfg.writeMin : '';
  const wMaxIn = document.getElementById('modal-write-max');
  if (wMaxIn) wMaxIn.value = cfg.writeMax != null ? cfg.writeMax : '';
  const wStepIn = document.getElementById('modal-write-step');
  if (wStepIn) wStepIn.value = cfg.writeStep != null ? cfg.writeStep : 1;

  // Bar graph config
  const bgMinIn = document.getElementById('modal-bargraph-min');
  if (bgMinIn) bgMinIn.value = cfg.min != null ? cfg.min : 0;
  const bgMaxIn = document.getElementById('modal-bargraph-max');
  if (bgMaxIn) bgMaxIn.value = cfg.max != null ? cfg.max : 100;
  const bgUnitIn = document.getElementById('modal-bargraph-unit');
  if (bgUnitIn) bgUnitIn.value = cfg.unit || '';
  const bgDecIn = document.getElementById('modal-bargraph-decimals');
  if (bgDecIn) bgDecIn.value = cfg.decimals != null ? cfg.decimals : 1;
  setBargraphColor(cfg.color || 'blue');

  // IFrame config
  const iframeUrlIn = document.getElementById('modal-iframe-url');
  if (iframeUrlIn) iframeUrlIn.value = cfg.url || '';

  showModal();
}

function showModal() {
  const modal = document.getElementById('widget-modal');
  if (modal) {
    modal.classList.remove('hidden');
    const labelIn = document.getElementById('modal-label');
    if (labelIn) labelIn.focus();
  }
}

function closeModal() {
  const modal = document.getElementById('widget-modal');
  if (modal) modal.classList.add('hidden');
  editingWidgetId = null;
}

function formatTagMeta(t) {
  const location = t.area === 'DB' ? `DB${t.dbNumber}` : t.area;
  return `${t.name}  (${t.dataType}, ${location} byte ${t.byteOffset})`;
}

function populateTagSelect(sel, selectedName) {
  sel.innerHTML = '<option value="">— select a tag —</option>';
  tags.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.name;
    opt.textContent = formatTagMeta(t);
    if (t.name === selectedName) opt.selected = true;
    sel.appendChild(opt);
  });
}

function populateGroupTagSelect(sel, selectedNames) {
  const set = new Set(selectedNames || []);
  sel.innerHTML = '';
  tags.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.name;
    opt.textContent = formatTagMeta(t);
    if (set.has(t.name)) opt.selected = true;
    sel.appendChild(opt);
  });
}

function setBargraphColor(color) {
  modalBargraphColor = color || 'blue';
  document.querySelectorAll('#bargraph-color-grid .bar-color-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.color === modalBargraphColor);
  });
}

function setModalType(type) {
  modalType = type;
  document.querySelectorAll('.type-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.type === type);
  });

  // Hide the single-tag picker for types that don't use a single tag
  const tagPickerGroup = document.getElementById('modal-tag-picker-group');
  if (tagPickerGroup) {
    tagPickerGroup.classList.toggle('hidden', type === 'iframe' || type === 'group');
  }

  // Show relevant option panels
  const valueOpts    = document.getElementById('modal-value-opts');
  const trendOpts    = document.getElementById('modal-trend-opts');
  const writeOpts    = document.getElementById('modal-write-opts');
  const bargraphOpts = document.getElementById('modal-bargraph-opts');
  const iframeOpts   = document.getElementById('modal-iframe-opts');
  const groupOpts    = document.getElementById('modal-group-opts');
  if (valueOpts)    valueOpts.classList.toggle('hidden', type !== 'value');
  if (trendOpts)    trendOpts.classList.toggle('hidden', type !== 'trend');
  if (writeOpts)    writeOpts.classList.toggle('hidden', type !== 'write');
  if (bargraphOpts) bargraphOpts.classList.toggle('hidden', type !== 'bargraph');
  if (iframeOpts)   iframeOpts.classList.toggle('hidden', type !== 'iframe');
  if (groupOpts)    groupOpts.classList.toggle('hidden', type !== 'group');
}

/* ── Modal: save ─────────────────────────────────────────────────────────── */

async function saveWidget() {
  const tagSel  = document.getElementById('modal-tag-select');
  const labelIn = document.getElementById('modal-label');
  const isTagless = modalType === 'iframe' || modalType === 'group';
  const tagName = isTagless ? '' : (tagSel ? tagSel.value : '');
  const label   = labelIn ? labelIn.value.trim() : '';

  if (!isTagless && !tagName) { showToast('Please select a tag', 'error', 2500); return; }
  if (!label) { showToast('Please enter a label', 'error', 2500); return; }

  const cfg = {};
  if (modalType === 'value') {
    const u = document.getElementById('modal-unit');
    const d = document.getElementById('modal-decimals');
    cfg.unit     = u ? u.value.trim() : '';
    cfg.decimals = d ? parseInt(d.value, 10) : 2;
  }
  if (modalType === 'trend') {
    const t = document.getElementById('modal-trend-length');
    cfg.trendLength = t ? Math.max(5, Math.min(200, parseInt(t.value, 10) || 30)) : 30;
  }
  if (modalType === 'write') {
    const mn   = document.getElementById('modal-write-min');
    const mx   = document.getElementById('modal-write-max');
    const st   = document.getElementById('modal-write-step');
    cfg.writeMin  = mn && mn.value.trim() !== '' ? parseFloat(mn.value) : null;
    cfg.writeMax  = mx && mx.value.trim() !== '' ? parseFloat(mx.value) : null;
    cfg.writeStep = st && st.value.trim() !== '' ? parseFloat(st.value) : 1;
  }
  if (modalType === 'bargraph') {
    const bgMin  = document.getElementById('modal-bargraph-min');
    const bgMax  = document.getElementById('modal-bargraph-max');
    const bgUnit = document.getElementById('modal-bargraph-unit');
    const bgDec  = document.getElementById('modal-bargraph-decimals');
    cfg.min      = bgMin && bgMin.value.trim() !== '' ? parseFloat(bgMin.value) : 0;
    cfg.max      = bgMax && bgMax.value.trim() !== '' ? parseFloat(bgMax.value) : 100;
    cfg.unit     = bgUnit ? bgUnit.value.trim() : '';
    cfg.decimals = bgDec ? Math.max(0, parseInt(bgDec.value, 10)) : 1;
    cfg.color    = modalBargraphColor || 'blue';
  }
  if (modalType === 'iframe') {
    const urlIn = document.getElementById('modal-iframe-url');
    cfg.url = urlIn ? urlIn.value.trim() : '';
    if (!cfg.url) { showToast('Please enter a URL', 'error', 2500); return; }
  }
  if (modalType === 'group') {
    const groupSel = document.getElementById('modal-group-tags');
    cfg.tagNames = groupSel ? Array.from(groupSel.selectedOptions).map((o) => o.value) : [];
    if (cfg.tagNames.length === 0) { showToast('Please select at least one tag', 'error', 2500); return; }
  }

  const payload = {
    id:       editingWidgetId || genId(),
    type:     modalType,
    tagName,
    label,
    colSpan:  modalColSpan,
    rowSpan:  modalRowSpan,
    config:   cfg,
  };

  try {
    let res, json;
    if (editingWidgetId) {
      res  = await fetch(`/api/widgets/${encodeURIComponent(editingWidgetId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      json = await res.json();
      if (json.ok) {
        const idx = widgets.findIndex((w) => w.id === editingWidgetId);
        if (idx !== -1) widgets[idx] = json.widget;
        showToast('Widget updated', 'success', 2500);
      } else {
        showToast('Update failed: ' + json.error, 'error');
        return;
      }
    } else {
      res  = await fetch('/api/widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      json = await res.json();
      if (json.ok) {
        widgets.push(json.widget);
        showToast('Widget added', 'success', 2500);
      } else {
        showToast('Create failed: ' + json.error, 'error');
        return;
      }
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
    return;
  }

  closeModal();
  renderAll();
  if (editMode) applyEditMode(true);
}

/* ── HTML escaping ───────────────────────────────────────────────────────── */

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Socket.io ───────────────────────────────────────────────────────────── */

const socket = io();

socket.on('connect', () => {
  showToast('Connected to server', 'info', 2000);
});

socket.on('disconnect', () => {
  showToast('Disconnected from server', 'error', 4000);
  updatePlcBadge({ connected: false, error: 'Server disconnected' });
});

socket.on('plcStatus', (status) => {
  updatePlcBadge(status);
});

socket.on('plcData', ({ status }) => {
  updatePlcBadge(status);
});

socket.on('tagValues', (values) => {
  // Only push trend history for tags used by trend-type widgets
  const trendTagNames = new Set(
    widgets.filter((w) => w.type === 'trend').map((w) => w.tagName)
  );

  Object.entries(values).forEach(([name, value]) => {
    if (trendTagNames.has(name) && value !== null && value !== undefined) {
      pushTrend(name, value);
    }
  });

  Object.assign(tagValues, values);

  // Update widget displays
  widgets.forEach((w) => {
    if (w.type === 'group') {
      applyGroupValues(w);
    } else {
      const val = tagValues[w.tagName];
      if (val !== undefined) {
        applyValue(w, val);
        if (w.type === 'trend') {
          updateTrendChart(w, val);
        }
      }
    }
  });
});

/* ── Init ─────────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadTags(), loadWidgets()]);
  renderAll();

  // Edit toggle
  document.getElementById('edit-toggle-btn').addEventListener('click', () => {
    applyEditMode(true);
  });

  document.getElementById('done-edit-btn').addEventListener('click', () => {
    applyEditMode(false);
  });

  // Add widget button
  document.getElementById('add-widget-btn').addEventListener('click', () => {
    openAddModal();
  });

  // Modal close / cancel
  document.getElementById('widget-modal-close').addEventListener('click', closeModal);
  document.getElementById('widget-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('widget-modal-confirm').addEventListener('click', saveWidget);

  // Close on backdrop click
  document.getElementById('widget-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('widget-modal')) closeModal();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Widget type buttons
  document.querySelectorAll('.type-btn').forEach((btn) => {
    btn.addEventListener('click', () => setModalType(btn.dataset.type));
  });

  // Row span buttons
  document.querySelectorAll('.row-size-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      modalRowSpan = parseInt(btn.dataset.row, 10);
      document.querySelectorAll('.row-size-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
    });
  });

  // Bargraph colour buttons
  document.querySelectorAll('#bargraph-color-grid .bar-color-btn').forEach((btn) => {
    btn.addEventListener('click', () => setBargraphColor(btn.dataset.color));
  });

  buildColSpanGrid();
});
