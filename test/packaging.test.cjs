'use strict';
// What goes into the built app. electron-builder has a trap: a system's own list of files (win, mac or linux) that only leaves things out makes
// it put "include everything" in front of it, and then the whole project folder (the docs, the tests, any private files on the computer that
// builds) goes into the app. Version 1.0.0 shipped that way. These tests keep each list saying what to include.
const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('../package.json');

const INCLUDE = ['src/main/**', 'src/shared/**', 'src/renderer/**', 'package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];
const positive = (list) => list.filter((pattern) => !pattern.startsWith('!'));

test('the app is built from its own source, its package file and its license files, and nothing else', () => {
  assert.deepEqual(positive(build.files), INCLUDE);
  for (const pattern of build.files) assert.ok(!/^!?\*\*\/\*$/.test(pattern), `${pattern} would include everything`);
});

for (const system of ['win', 'mac', 'linux']) {
  test(`${system}: its own list of files also says what to include, so the packager does not add "include everything" before it`, () => {
    const list = build[system].files;
    assert.deepEqual(positive(list), INCLUDE);
    assert.ok(list.some((pattern) => pattern.startsWith('!') && pattern.includes('prebuilds')), 'and it still leaves out the other systems\' native files');
  });
}

test('every system leaves out the native files of the others, and keeps its own', () => {
  const left = (system) => build[system].files.filter((pattern) => pattern.includes('prebuilds')).join(' ');
  assert.ok(left('win').includes('darwin') && left('win').includes('linux'));
  assert.ok(left('mac').includes('win32') && left('mac').includes('linux'));
  assert.ok(left('linux').includes('win32') && left('linux').includes('darwin'));
});

test('the built app turns off the ways Electron lets another program use it, and loads its code only from its own archive', () => {
  // Electron can be told by an environment variable or a command-line flag to act as a plain Node program or to open a debugger, which would let
  // anything that can start the app run its own code with the app's reach. These switches, set when the app is built, remove those ways in.
  assert.deepEqual(build.electronFuses, { runAsNode: false, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false, onlyLoadAppFromAsar: true });
  assert.notEqual(build.asar, false, 'the app is packed into one archive, which is what onlyLoadAppFromAsar needs');
});

test('installing the project runs no program of its own, and every dependency is the exact file its lock says, from the public registry', () => {
  const pkg = require('../package.json');
  // These run on a plain npm install or npm ci of this project, on every contributor's computer and in the pipeline.
  const lifecycle = ['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare'];
  assert.deepEqual(Object.keys(pkg.scripts).filter((name) => lifecycle.includes(name)), []);

  const lock = require('../package-lock.json');
  assert.equal(lock.lockfileVersion, 3);
  const wrong = [];
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!name) continue; // the project itself
    if (entry.link || entry.inBundle) wrong.push(`${name}: is a link or bundled, not downloaded`);
    else if (!/^https:\/\/registry\.npmjs\.org\//.test(entry.resolved ?? '')) wrong.push(`${name}: comes from ${entry.resolved ?? 'nowhere'}`);
    else if (!/^sha512-/.test(entry.integrity ?? '')) wrong.push(`${name}: has no sha512 integrity`);
  }
  assert.deepEqual(wrong, []);
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, range] of Object.entries(pkg[group] ?? {})) assert.match(range, /^[\^~]?\d+\.\d+\.\d+$/, `${name} is a plain version, not an address, a branch or a tag`);
  }
});

test('the lock file names the same version as the package, so npm sees no mismatch', () => {
  const lock = require('../package-lock.json');
  assert.equal(lock.version, require('../package.json').version);
  assert.equal(lock.packages[''].version, require('../package.json').version);
});
