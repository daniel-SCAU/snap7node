'use strict';

const fs = require('fs');
const path = require('path');

const WIDGETS_FILE = path.join(__dirname, '..', 'widgets.json');

/**
 * Widget definition schema:
 *   id        {string}  – unique identifier
 *   type      {string}  – "value" | "trend" | "indicator" | "write"
 *   tagName   {string}  – name of the tag from the tag list to bind
 *   label     {string}  – display label
 *   colSpan   {number}  – grid column span (1–6)
 *   rowSpan   {number}  – grid row span (1–4)
 *   config    {object}  – type-specific configuration
 *     unit        {string}  – unit suffix shown after value
 *     decimals    {number}  – decimal places for numeric display
 *     trendLength {number}  – number of history points for trend chart
 *     writeMin    {number|null} – min value for write control
 *     writeMax    {number|null} – max value for write control
 *     writeStep   {number}  – step for numeric write control
 */

function load() {
  try {
    if (fs.existsSync(WIDGETS_FILE)) {
      const raw = fs.readFileSync(WIDGETS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('[widgets] Failed to load widgets:', e.message);
  }
  return [];
}

function save(widgets) {
  try {
    fs.writeFileSync(WIDGETS_FILE, JSON.stringify(widgets, null, 2), 'utf8');
  } catch (e) {
    throw new Error(`Failed to save widgets: ${e.message}`);
  }
}

function getAll() {
  return load();
}

function create(widget) {
  const widgets = load();
  if (widgets.find((w) => w.id === widget.id)) {
    throw new Error(`Widget "${widget.id}" already exists`);
  }
  widgets.push(widget);
  save(widgets);
  return widget;
}

function update(id, patch) {
  const widgets = load();
  const idx = widgets.findIndex((w) => w.id === id);
  if (idx === -1) throw new Error(`Widget "${id}" not found`);
  widgets[idx] = Object.assign({}, widgets[idx], patch);
  save(widgets);
  return widgets[idx];
}

function remove(id) {
  const widgets = load();
  const idx = widgets.findIndex((w) => w.id === id);
  if (idx === -1) throw new Error(`Widget "${id}" not found`);
  widgets.splice(idx, 1);
  save(widgets);
}

function reorder(ids) {
  const widgets = load();
  const map = Object.fromEntries(widgets.map((w) => [w.id, w]));
  const reordered = ids.map((id) => map[id]).filter(Boolean);
  // Append any widgets not in the ids list at the end
  const idSet = new Set(ids);
  widgets.forEach((w) => { if (!idSet.has(w.id)) reordered.push(w); });
  save(reordered);
  return reordered;
}

function replaceAll(newWidgets) {
  save(newWidgets);
}

module.exports = { getAll, create, update, remove, reorder, replaceAll };
