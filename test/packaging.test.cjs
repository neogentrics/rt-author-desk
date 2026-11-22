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
