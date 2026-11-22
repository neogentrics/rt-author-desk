'use strict';
// What the project says about privacy has to be true. These are the sentences that were once too strong, and the checks that keep them from
// coming back: the app does contact GitHub to look for a new version, and a backup is only as private as the folder it is kept in.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// Every place a person could read a promise about their data. The changelog is left out because it quotes the old words to say they were wrong.
const WHERE = ['README.md', 'SECURITY.md', 'ROADMAP.md', 'CONTRIBUTING.md', 'src/shared/help.js', 'src/renderer/prefs.js', 'src/renderer/welcome.js', 'src/renderer/about.js', 'docs/design/vault-and-privacy.md', 'docs/design/data-model.md', 'docs/product-plan.md', 'docs/decisions.md'];

const TOO_STRONG = [
  [/nothing (?:is sent|leaves|goes) (?:anywhere|the computer|your computer)/i, 'says nothing is sent, without saying that the app asks GitHub about a new version'],
  [/nothing leaves (?:the|your) computer/i, 'says nothing leaves the computer'],
  [/safe in (?:onedrive|dropbox)/i, 'says a backup is safe in a cloud folder, when it is only as private as the folder'],
  [/still encrypted, so/i, 'says a backup is safe because it is encrypted, when its key is in it'],
  [/that nothing else can read/i, 'says nothing else can read the library'],
  [/a copied file is a garbled mess\.(?! Designed)/i, 'says a copied file is unreadable, when its key is kept beside it today'],
];

test('nothing the project says about privacy is stronger than what the app does', () => {
  const found = [];
  for (const name of WHERE) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const [pattern, why] of TOO_STRONG) {
      const at = text.search(pattern);
      if (at >= 0) found.push(`${name} line ${text.slice(0, at).split('\n').length}: ${why}`);
    }
  }
  assert.deepEqual(found, []);
});

test('the places a person reads about privacy all say the two things that matter', () => {
  const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
  // The app asks GitHub about new versions, and that can be turned off.
  for (const name of ['README.md', 'SECURITY.md', 'src/shared/help.js', 'docs/design/vault-and-privacy.md']) assert.match(read(name), /GitHub/, `${name} says the app contacts GitHub`);
  assert.match(read('src/renderer/prefs.js'), /Look for new versions by itself/);
  // A backup is not secret.
  for (const name of ['README.md', 'src/shared/help.js', 'src/renderer/prefs.js', 'docs/design/vault-and-privacy.md']) assert.match(read(name), /not secret|only as private as/, `${name} says a backup is not secret`);
});
