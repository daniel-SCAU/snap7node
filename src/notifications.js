'use strict';

const fs = require('fs');
const path = require('path');

const NOTIFICATIONS_FILE = path.join(__dirname, '..', 'notifications.json');

const VALID_CONDITIONS = ['gt', 'lt', 'gte', 'lte', 'eq', 'ne'];
const VALID_SEVERITIES = ['info', 'warning', 'error'];

function load() {
  try {
    if (fs.existsSync(NOTIFICATIONS_FILE)) {
      const raw = fs.readFileSync(NOTIFICATIONS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('[notifications] Failed to load notifications:', e.message);
  }
  return [];
}

function save(rules) {
  try {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(rules, null, 2), 'utf8');
  } catch (e) {
    throw new Error(`Failed to save notifications: ${e.message}`);
  }
}

function getAll() {
  return load();
}

function create(rule) {
  const rules = load();
  if (rules.find((r) => r.id === rule.id)) {
    throw new Error(`Notification rule "${rule.name || rule.id}" already exists`);
  }
  rules.push(rule);
  save(rules);
  return rule;
}

function update(id, patch) {
  const rules = load();
  const idx = rules.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error(`Notification rule not found`);
  rules[idx] = Object.assign({}, rules[idx], patch);
  save(rules);
  return rules[idx];
}

function remove(id) {
  const rules = load();
  const idx = rules.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error(`Notification rule not found`);
  rules.splice(idx, 1);
  save(rules);
}

function replaceAll(newRules) {
  save(newRules);
}

module.exports = { getAll, create, update, remove, replaceAll, VALID_CONDITIONS, VALID_SEVERITIES };
