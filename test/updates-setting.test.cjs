'use strict';
// "Look for new versions by itself": the one thing the app contacts is GitHub, to ask about a newer version, and the person can turn it off.
// These tests show that off really means no contact, that a check the person asks for still works, and that the setting is kept and cleaned.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Settings } = require('../src/main/settings');
const { DEFAULT_SETTINGS, cleanSettings } = require('../src/shared/themes');

test('looking for updates is on unless it was turned off, and nothing else turns it off', () => {
  assert.equal(DEFAULT_SETTINGS.autoUpdate, true);
  assert.equal(cleanSettings({}).autoUpdate, true);
  assert.equal(cleanSettings({ autoUpdate: false }).autoUpdate, false);
  for (const odd of [0, 'false', null, undefined, 'no', [], {}]) assert.equal(cleanSettings({ autoUpdate: odd }).autoUpdate, true, `${JSON.stringify(odd)}`);
  assert.equal(cleanSettings(null).autoUpdate, true, 'a damaged settings file leaves it on');
});

test('the choice is kept, only a real yes or no changes it, and the window may change it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
  const settings = new Settings(dir);
  assert.equal(settings.values.autoUpdate, true);
  settings.saveFromWindow({ autoUpdate: false });
  assert.equal(new Settings(dir).values.autoUpdate, false, 'it is still off after a restart');
  settings.saveFromWindow({ autoUpdate: 'maybe' });
  assert.equal(settings.values.autoUpdate, false, 'a value that is not true or false is ignored, and the choice stands');
  settings.saveFromWindow({ theme: 'system' });
  assert.equal(settings.values.autoUpdate, false, 'and changing something else does not touch it');
  settings.saveFromWindow({ autoUpdate: true });
  assert.equal(new Settings(dir).values.autoUpdate, true);
});

// The updater is loaded against a stand-in for Electron, so what it asks of the network can be counted.
function loadUpdater(calls) {
  const key = require.resolve('electron');
  const before = require.cache[key];
  const fake = { app: { isPackaged: true, getVersion: () => '1.0.0' }, net: { fetch: async (url) => { calls.push(url); return { status: 404 }; } } };
  require.cache[key] = { id: key, filename: key, loaded: true, exports: fake };
  const file = require.resolve('../src/main/updater.js');
  delete require.cache[file];
  try {
    return require('../src/main/updater.js');
  } finally {
    if (before) require.cache[key] = before; else delete require.cache[key];
    delete require.cache[file];
  }
}

test('turned off, the app never asks GitHub by itself, and a check the person asks for still goes ahead', async (t) => {
  const calls = [];
  const { Updater } = loadUpdater(calls);
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const disabled = process.env.RTAD_DISABLE_UPDATES;
  delete process.env.RTAD_DISABLE_UPDATES;
  Object.defineProperty(process, 'platform', { value: 'darwin' }); // a Mac only looks and is told, which is the plainest path to count
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const later = () => new Promise((resolve) => setImmediate(resolve));
  const HOUR = 60 * 60 * 1000;
  try {
    let on = true;
    const updater = new Updater(() => {}, { autoCheck: () => on });
    updater.start();
    t.mock.timers.tick(8_000);
    await later();
    assert.equal(calls.length, 1, 'with the setting on, it looks soon after it starts');
    assert.match(calls[0], /^https:\/\/api\.github\.com\/repos\/neogentrics\/rt-author-desk\/releases/, 'and only at this project\'s releases');

    on = false;
    t.mock.timers.tick(30 * HOUR);
    await later();
    assert.equal(calls.length, 1, 'with it off, days of waiting ask nothing');

    const asked = await updater.check();
    assert.equal(calls.length, 2, 'but Check for Updates, asked for by hand, goes ahead');
    assert.equal(asked.state, 'current');

    on = true;
    t.mock.timers.tick(6 * HOUR);
    await later();
    assert.ok(calls.length >= 3, 'and turned back on, it looks again');
  } finally {
    Object.defineProperty(process, 'platform', platform);
    if (disabled !== undefined) process.env.RTAD_DISABLE_UPDATES = disabled;
    t.mock.timers.reset();
  }
});

test('a copy that is run from its source, or told not to, does not look at all', async (t) => {
  const calls = [];
  const { Updater } = loadUpdater(calls);
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const updater = new Updater(() => {}); // the stand-in says it is installed, so this is the env that turns it off
  process.env.RTAD_DISABLE_UPDATES = '1';
  try {
    updater.start();
    t.mock.timers.tick(7 * 60 * 60 * 1000);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 0);
    assert.equal((await updater.check()).state, 'off');
  } finally {
    delete process.env.RTAD_DISABLE_UPDATES;
    t.mock.timers.reset();
  }
});
