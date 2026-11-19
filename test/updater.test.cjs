'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The updater needs Electron, so the version comparison is read out of the file and tried on its own.
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'updater.js'), 'utf8');
const body = source.slice(source.indexOf('function compareVersions'), source.indexOf('const isNewer'));
const compareVersions = new Function(`${body}; return compareVersions;`)();
const newer = (a, b) => compareVersions(a, b) > 0;

test('a newer test build is a newer version', () => {
  assert.ok(newer('1.0.0-alpha.1', '1.0.0-alpha.0'));
  assert.ok(newer('1.0.0-alpha.10', '1.0.0-alpha.9'), 'numbers are numbers, not text');
  assert.ok(newer('v1.0.0-alpha.2', '1.0.0-alpha.1'), 'a leading v is ignored');
  assert.ok(!newer('1.0.0-alpha.0', '1.0.0-alpha.1'));
  assert.equal(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.1'), 0);
});

test('a release beats its own test builds, and a later number beats an earlier one', () => {
  assert.ok(newer('1.0.0', '1.0.0-alpha.5'));
  assert.ok(newer('1.0.0-beta.1', '1.0.0-alpha.9'));
  assert.ok(!newer('1.0.0-alpha.1', '1.0.0'));
  assert.ok(newer('1.0.1', '1.0.0'));
  assert.ok(newer('1.10.0', '1.9.0'));
  assert.ok(newer('2.0.0-alpha.1', '1.99.99'));
  assert.ok(newer('1.0.0-alpha.1.1', '1.0.0-alpha.1'), 'more parts win when the rest is equal');
});

test('the app asks for test builds, and for the same update file a release workflow uploads', () => {
  assert.match(source, /allowPrerelease = true/);
  assert.match(source, /channel = 'latest'/);
  const pkg = require('../package.json');
  assert.deepEqual(pkg.build.publish.map((p) => [p.provider, p.owner, p.repo, p.channel]), [['github', 'neogentrics', 'rt-author-desk', 'latest']]);
  assert.ok(pkg.dependencies['electron-updater']);
  const release = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(release, /release\/latest\.yml/);
  assert.match(release, /release\/latest-linux\.yml/);
  assert.match(release, /prerelease: \$\{\{ contains\(steps\.tag\.outputs\.name, '-'\) \}\}/);
});
