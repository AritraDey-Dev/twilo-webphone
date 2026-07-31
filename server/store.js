const fs = require('fs');
const path = require('path');

// Received SMS live in a plain JSON file — zero native deps, survives restarts.
const FILE = path.join(__dirname, 'sms-store.json');
const MAX = 500;

function read() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

function write(list) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
  } catch {
    /* noop */
  }
}

function addSms(msg) {
  const list = read();
  const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...msg };
  list.unshift(entry);
  write(list.slice(0, MAX));
  return entry;
}

function listSms() {
  return read();
}

module.exports = { addSms, listSms };
