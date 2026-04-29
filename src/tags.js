'use strict';

const fs = require('fs');
const path = require('path');

const TAGS_FILE = path.join(__dirname, '..', 'tags.json');

/**
 * Tag definition schema:
 *   name       {string}  – unique identifier
 *   area       {string}  – "MK" (Merker) or "DB" (Data Block)
 *   dbNumber   {number}  – DB number (used only when area === "DB")
 *   byteOffset {number}  – byte start address
 *   bitOffset  {number}  – bit index within byte (0-7); used only for Bool type
 *   dataType   {string}  – "Bool" | "Byte" | "Word" | "Int" | "DWord" | "DInt" | "Real"
 */

function load() {
  try {
    if (fs.existsSync(TAGS_FILE)) {
      const raw = fs.readFileSync(TAGS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('[tags] Failed to load tags:', e.message);
  }
  return [];
}

function save(tags) {
  try {
    fs.writeFileSync(TAGS_FILE, JSON.stringify(tags, null, 2), 'utf8');
  } catch (e) {
    throw new Error(`Failed to save tags to disk: ${e.message}`);
  }
}

function getAll() {
  return load();
}

function getByName(name) {
  return load().find((t) => t.name === name) || null;
}

function create(tag) {
  const tags = load();
  if (tags.find((t) => t.name === tag.name)) {
    throw new Error(`Tag "${tag.name}" already exists`);
  }
  tags.push(tag);
  save(tags);
  return tag;
}

function update(name, patch) {
  const tags = load();
  const idx = tags.findIndex((t) => t.name === name);
  if (idx === -1) throw new Error(`Tag "${name}" not found`);
  // If renaming, ensure new name is not taken
  if (patch.name && patch.name !== name && tags.find((t) => t.name === patch.name)) {
    throw new Error(`Tag "${patch.name}" already exists`);
  }
  tags[idx] = Object.assign({}, tags[idx], patch);
  save(tags);
  return tags[idx];
}

function remove(name) {
  const tags = load();
  const idx = tags.findIndex((t) => t.name === name);
  if (idx === -1) throw new Error(`Tag "${name}" not found`);
  tags.splice(idx, 1);
  save(tags);
}

/**
 * Replace the entire tag list. Validation must be performed by the caller
 * (see server.js /api/import) before invoking this function.
 */
function replaceAll(newTags) {
  save(newTags);
}

module.exports = { getAll, getByName, create, update, remove, replaceAll };
