'use strict';
// The legal notices cover what really ships, and nothing that ships has a license nobody has looked at.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BEGIN, END, shipped, update } = require('../scripts/make-notices.cjs');

const text = fs.readFileSync(path.join(__dirname, '..', 'THIRD_PARTY_NOTICES.md'), 'utf8');

test('the list of what ships inside the app, with its licenses, is up to date (run npm run notices if it is not)', () => {
  assert.ok(text.includes(BEGIN) && text.includes(END), 'the markers are there');
  assert.equal(update(text), text, 'THIRD_PARTY_NOTICES.md is out of date: run npm run notices');
});

test('every package that ships is named in the notices, and the packages left out of the build are not claimed', () => {
  const left = ['node-addon-api'];
  for (const { name, version } of shipped()) {
    assert.ok(text.includes(name), `${name} is named`);
    assert.ok(text.includes(version) || /\| [\w.-]+ \| \d+\.x \|/.test(text), `${name} ${version}: the version is written down`);
  }
  for (const name of left) assert.ok(!shipped().some((item) => item.name === name), `${name} is not shipped`);
});

test('every package that ships has a license that allows it to be passed on in an app, and a new one has to be looked at before it is', () => {
  // These ask only that their notice goes with them, which the notices and each package's own license file do. Anything else (a copyleft
  // license, or none) is a decision for the owner, and this fails until the list below is changed on purpose.
  const allowed = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'BlueOak-1.0.0', 'Python-2.0', '0BSD', 'CC0-1.0']);
  const odd = shipped().filter((item) => !allowed.has(item.license)).map((item) => `${item.name} (${item.license})`);
  assert.deepEqual(odd, []);
});

test('the fonts that travel with the app have their license files beside them', () => {
  const folder = path.join(__dirname, '..', 'src', 'renderer', 'fonts');
  const files = fs.readdirSync(folder);
  assert.ok(files.includes('LICENSE-Inter.txt') && files.includes('LICENSE-Atkinson-Hyperlegible.txt'));
  for (const name of ['LICENSE-Inter.txt', 'LICENSE-Atkinson-Hyperlegible.txt']) {
    assert.match(fs.readFileSync(path.join(folder, name), 'utf8'), /SIL OPEN FONT LICENSE/i, `${name} is the SIL Open Font License`);
  }
});
