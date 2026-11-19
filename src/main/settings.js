'use strict';
// How this person likes the app to look. It lives beside the library, not inside it, so the look is right before anything is
// unlocked and survives a library being replaced. Copied from RT Story Tracker's way of doing it.
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_SETTINGS, cleanSettings } = require('../shared/themes');
const { writeFileSafely } = require('./storage/keys');

class Settings {
  constructor(root) {
    this.file = path.join(root, 'settings.json');
    this.values = cleanSettings(this.read());
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  // Anything the window sends is checked one setting at a time. A value that makes no sense is ignored, and the setting keeps
  // what it had, so a bad request can't reach the file or undo a choice.
  save(changes) {
    const next = { ...this.values };
    for (const [key, raw] of Object.entries(changes && typeof changes === 'object' ? changes : {})) {
      if (!Object.hasOwn(DEFAULT_SETTINGS, key)) continue;
      const cleaned = cleanSettings({ [key]: raw })[key];
      if (cleaned !== DEFAULT_SETTINGS[key] || String(raw) === String(DEFAULT_SETTINGS[key])) next[key] = cleaned;
    }
    this.values = cleanSettings(next);
    writeFileSafely(this.file, `${JSON.stringify(this.values, null, 2)}\n`);
    return this.values;
  }
}

module.exports = { Settings };
