'use strict';

/* ── Toast ───────────────────────────────────────────────────────────────── */

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

/* ── PLC status via Socket.io ────────────────────────────────────────────── */

let plcConnected = false;

const socket = io();
socket.on('plcStatus', (status) => updatePlcBadge(status.connected, status.error));
socket.on('plcData',   ({ status }) => updatePlcBadge(status.connected, status.error));

function updatePlcBadge(connected, error) {
  plcConnected = connected;
  const badge = document.getElementById('plc-status-badge');
  if (!badge) return;
  badge.className = `status-dot ${connected ? 'connected' : 'disconnected'}`;
  badge.querySelector('.label').textContent = connected ? 'PLC Connected' : (error ? `PLC Error` : 'PLC Disconnected');
}

/* ── State ───────────────────────────────────────────────────────────────── */

let tags = [];           // array of tag definition objects
let editingName = null;  // name of tag being edited (null = new tag)

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function addressLabel(tag) {
  if (tag.area === 'DB') {
    if (tag.dataType === 'Bool') return `DB${tag.dbNumber}.DBX${tag.byteOffset}.${tag.bitOffset}`;
    const suffix = { Byte: 'B', Word: 'W', Int: 'W', DWord: 'D', DInt: 'D', Real: 'D' }[tag.dataType] || '';
    return `DB${tag.dbNumber}.DB${suffix}${tag.byteOffset}`;
  }
  // MK area
  if (tag.dataType === 'Bool')  return `%M${tag.byteOffset}.${tag.bitOffset}`;
  if (tag.dataType === 'Byte')  return `%MB${tag.byteOffset}`;
  if (tag.dataType === 'Word' || tag.dataType === 'Int') return `%MW${tag.byteOffset}`;
  return `%MD${tag.byteOffset}`;
}

function formatValue(tag, raw) {
  if (raw === undefined || raw === null) return '—';
  if (tag.dataType === 'Bool') return raw ? '1 (true)' : '0 (false)';
  if (tag.dataType === 'Real') return Number(raw).toFixed(4);
  return String(raw);
}

function makeWriteInput(tag) {
  if (tag.dataType === 'Bool') {
    const sel = document.createElement('select');
    sel.className = 'write-input bool-select';
    sel.innerHTML = '<option value="true">true (1)</option><option value="false">false (0)</option>';
    return sel;
  }
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.step = tag.dataType === 'Real' ? 'any' : '1';
  inp.className = 'write-input';
  inp.placeholder = 'value';
  return inp;
}

/* ── Render tag table ────────────────────────────────────────────────────── */

function renderTable() {
  const tbody   = document.getElementById('tag-tbody');
  const empty   = document.getElementById('tags-empty');
  const tableWr = document.getElementById('tag-table-wrap');

  tbody.innerHTML = '';

  if (tags.length === 0) {
    empty.classList.remove('hidden');
    tableWr.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  tableWr.classList.remove('hidden');

  for (const tag of tags) {
    const tr = document.createElement('tr');
    tr.dataset.name = tag.name;

    // Name
    const tdName = document.createElement('td');
    tdName.className = 'tag-name-cell';
    tdName.textContent = tag.name;

    // Area badge
    const tdArea = document.createElement('td');
    const areaBadge = document.createElement('span');
    areaBadge.className = `area-badge ${tag.area.toLowerCase()}`;
    areaBadge.textContent = tag.area;
    tdArea.appendChild(areaBadge);

    // Address
    const tdAddr = document.createElement('td');
    tdAddr.className = 'address-cell';
    tdAddr.textContent = addressLabel(tag);

    // Type badge
    const tdType = document.createElement('td');
    const typeBadge = document.createElement('span');
    typeBadge.className = 'type-badge';
    typeBadge.textContent = tag.dataType;
    tdType.appendChild(typeBadge);

    // Current value
    const tdVal = document.createElement('td');
    tdVal.className = 'value-cell stale';
    tdVal.id = `val-${tag.name}`;
    tdVal.textContent = '—';

    // Write input + button
    const tdWrite = document.createElement('td');
    const writeWrap = document.createElement('div');
    writeWrap.className = 'write-input-wrap';
    const writeInput = makeWriteInput(tag);
    writeInput.id = `write-input-${tag.name}`;
    const writeBtn = document.createElement('button');
    writeBtn.className = 'btn-icon-sm write-btn';
    writeBtn.title = 'Write value to PLC';
    writeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
    writeBtn.addEventListener('click', () => handleWrite(tag.name));
    writeWrap.appendChild(writeInput);
    writeWrap.appendChild(writeBtn);
    tdWrite.appendChild(writeWrap);

    // Actions
    const tdActions = document.createElement('td');
    tdActions.className = 'col-actions';
    const actionDiv = document.createElement('div');
    actionDiv.className = 'action-btns';

    const readBtn = document.createElement('button');
    readBtn.className = 'btn-icon-sm read-btn';
    readBtn.title = 'Read from PLC';
    readBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>`;
    readBtn.addEventListener('click', () => handleRead(tag.name));

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-icon-sm edit-btn';
    editBtn.title = 'Edit tag';
    editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    editBtn.addEventListener('click', () => openEditModal(tag.name));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon-sm del-btn';
    delBtn.title = 'Delete tag';
    delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    delBtn.addEventListener('click', () => openDeleteModal(tag.name));

    actionDiv.appendChild(readBtn);
    actionDiv.appendChild(editBtn);
    actionDiv.appendChild(delBtn);
    tdActions.appendChild(actionDiv);

    tr.appendChild(tdName);
    tr.appendChild(tdArea);
    tr.appendChild(tdAddr);
    tr.appendChild(tdType);
    tr.appendChild(tdVal);
    tr.appendChild(tdWrite);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }
}

/* ── Read / Write handlers ───────────────────────────────────────────────── */

async function handleRead(name) {
  const valEl = document.getElementById(`val-${name}`);
  if (valEl) {
    valEl.className = 'value-cell';
    valEl.innerHTML = '<span class="spinner"></span>';
  }
  try {
    const res  = await fetch(`/api/tags/${encodeURIComponent(name)}/value`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    const tag = tags.find((t) => t.name === name);
    if (valEl) {
      valEl.className = 'value-cell';
      valEl.textContent = formatValue(tag, json.value);
    }
  } catch (e) {
    if (valEl) { valEl.className = 'value-cell error-val'; valEl.textContent = e.message; }
    showToast(`Read "${name}" failed: ${e.message}`, 'error');
  }
}

async function handleWrite(name) {
  const tag = tags.find((t) => t.name === name);
  if (!tag) return;
  const inputEl = document.getElementById(`write-input-${name}`);
  if (!inputEl) return;

  let value;
  if (tag.dataType === 'Bool') {
    value = inputEl.value === 'true';
  } else if (tag.dataType === 'Real') {
    value = parseFloat(inputEl.value);
    if (!Number.isFinite(value)) { showToast('Invalid float value', 'error'); return; }
  } else {
    value = parseInt(inputEl.value, 10);
    if (!Number.isFinite(value)) { showToast('Invalid integer value', 'error'); return; }
  }

  try {
    const res  = await fetch(`/api/tags/${encodeURIComponent(name)}/value`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    showToast(`"${name}" written successfully`, 'success', 2500);
    // Refresh displayed value after write
    await handleRead(name);
  } catch (e) {
    showToast(`Write "${name}" failed: ${e.message}`, 'error');
  }
}

async function readAllTags() {
  for (const tag of tags) {
    await handleRead(tag.name);
  }
}

/* ── Load tags ───────────────────────────────────────────────────────────── */

async function loadTags() {
  try {
    const res  = await fetch('/api/tags');
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    tags = json.tags;
    renderTable();
  } catch (e) {
    showToast('Failed to load tags: ' + e.message, 'error');
  }
}

/* ── Modal helpers ───────────────────────────────────────────────────────── */

function getModalFields() {
  return {
    name:       document.getElementById('tag-name'),
    dataType:   document.getElementById('tag-datatype'),
    area:       document.getElementById('tag-area'),
    dbNumber:   document.getElementById('tag-db-number'),
    byteOffset: document.getElementById('tag-byte-offset'),
    bitOffset:  document.getElementById('tag-bit-offset'),
  };
}

function updateModalVisibility() {
  const f = getModalFields();
  const isDB   = f.area.value === 'DB';
  const isBool = f.dataType.value === 'Bool';
  document.getElementById('db-number-group').style.display  = isDB   ? '' : 'none';
  document.getElementById('bit-offset-group').style.display = isBool ? '' : 'none';
}

function openAddModal() {
  editingName = null;
  const f = getModalFields();
  f.name.value       = '';
  f.dataType.value   = 'Int';
  f.area.value       = 'MK';
  f.dbNumber.value   = '';
  f.byteOffset.value = '';
  f.bitOffset.value  = '0';
  f.name.disabled    = false;
  document.getElementById('modal-title').innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
    Add Tag`;
  document.getElementById('modal-save-btn').textContent = 'Save Tag';
  updateModalVisibility();
  document.getElementById('tag-modal').classList.remove('hidden');
  f.name.focus();
}

function openEditModal(name) {
  const tag = tags.find((t) => t.name === name);
  if (!tag) return;
  editingName = name;
  const f = getModalFields();
  f.name.value       = tag.name;
  f.dataType.value   = tag.dataType;
  f.area.value       = tag.area;
  f.dbNumber.value   = tag.dbNumber || '';
  f.byteOffset.value = tag.byteOffset;
  f.bitOffset.value  = String(tag.bitOffset || 0);
  f.name.disabled    = false;
  const titleEl = document.getElementById('modal-title');
  titleEl.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
    Edit Tag`;
  document.getElementById('modal-save-btn').textContent = 'Update Tag';
  updateModalVisibility();
  document.getElementById('tag-modal').classList.remove('hidden');
}

function closeTagModal() {
  document.getElementById('tag-modal').classList.add('hidden');
  editingName = null;
}

async function saveTag() {
  const f = getModalFields();
  const payload = {
    name:       f.name.value.trim(),
    dataType:   f.dataType.value,
    area:       f.area.value,
    dbNumber:   parseInt(f.dbNumber.value, 10) || 0,
    byteOffset: parseInt(f.byteOffset.value, 10),
    bitOffset:  parseInt(f.bitOffset.value, 10) || 0,
  };

  if (!payload.name) { showToast('Tag name is required', 'error'); return; }
  if (isNaN(payload.byteOffset)) { showToast('Byte offset is required', 'error'); return; }

  try {
    let res;
    if (editingName) {
      res = await fetch(`/api/tags/${encodeURIComponent(editingName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    showToast(editingName ? `Tag "${payload.name}" updated` : `Tag "${payload.name}" created`, 'success');
    closeTagModal();
    await loadTags();
  } catch (e) {
    showToast(`Save failed: ${e.message}`, 'error');
  }
}

/* ── Delete modal ────────────────────────────────────────────────────────── */

let pendingDeleteName = null;

function openDeleteModal(name) {
  pendingDeleteName = name;
  document.getElementById('delete-tag-name').textContent = name;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
  pendingDeleteName = null;
  document.getElementById('delete-modal').classList.add('hidden');
}

async function confirmDelete() {
  if (!pendingDeleteName) return;
  const name = pendingDeleteName;
  closeDeleteModal();
  try {
    const res  = await fetch(`/api/tags/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    showToast(`Tag "${name}" deleted`, 'info');
    await loadTags();
  } catch (e) {
    showToast(`Delete failed: ${e.message}`, 'error');
  }
}

/* ── Wire up events ──────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  loadTags();

  document.getElementById('add-tag-btn').addEventListener('click', openAddModal);
  document.getElementById('read-all-btn').addEventListener('click', readAllTags);

  // Tag modal
  document.getElementById('modal-close-btn').addEventListener('click', closeTagModal);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeTagModal);
  document.getElementById('modal-save-btn').addEventListener('click', saveTag);

  const areaSelect     = document.getElementById('tag-area');
  const dataTypeSelect = document.getElementById('tag-datatype');
  areaSelect.addEventListener('change', updateModalVisibility);
  dataTypeSelect.addEventListener('change', updateModalVisibility);

  // Close modal on backdrop click
  document.getElementById('tag-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeTagModal();
  });

  // Delete modal
  document.getElementById('delete-modal-close').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-cancel-btn').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-confirm-btn').addEventListener('click', confirmDelete);

  document.getElementById('delete-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDeleteModal();
  });
});
