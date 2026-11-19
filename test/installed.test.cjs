'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { APP_ID, APP_NAME, launchPathFor, readInstalled, removeInstalled, sharedFolder, writeInstalled } = require('../src/main/installed');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const program = () => {
  const file = path.join(temp(), process.platform === 'win32' ? 'RT Author Desk.exe' : 'rt-author-desk');
  fs.writeFileSync(file, 'x', { mode: 0o755 });
  return file;
};

test('the file says who this app is, which version it is, and where it starts', () => {
  const shared = temp();
  const launch = program();
  assert.equal(writeInstalled(shared, { version: '1.0.0-alpha.1', launch }), true);
  const file = path.join(shared, 'installed', 'rt-author-desk.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { id: 'rt-author-desk', name: 'RT Author Desk', version: '1.0.0-alpha.1', launch, protocol: 1 });
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))), ['id', 'name', 'version', 'launch', 'protocol'], 'the same keys, in the same order, as the other apps');
  assert.equal(APP_ID, 'rt-author-desk');
  assert.equal(APP_NAME, 'RT Author Desk');
});

test('an update changes the version in it, and writing the same thing twice leaves the file alone', () => {
  const shared = temp();
  const launch = program();
  writeInstalled(shared, { version: '1.0.0-alpha.1', launch });
  const file = path.join(shared, 'installed', 'rt-author-desk.json');
  const before = fs.statSync(file).mtimeMs;
  const text = fs.readFileSync(file, 'utf8');
  writeInstalled(shared, { version: '1.0.0-alpha.1', launch });
  assert.equal(fs.readFileSync(file, 'utf8'), text);
  assert.equal(fs.statSync(file).mtimeMs, before, 'not rewritten');
  writeInstalled(shared, { version: '1.0.0-alpha.2', launch });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, '1.0.0-alpha.2');
  assert.deepEqual(fs.readdirSync(path.join(shared, 'installed')), ['rt-author-desk.json'], 'no half-written file is left behind');
});

test('it holds no secrets, and nothing that is not a real path is written', () => {
  const shared = temp();
  assert.equal(writeInstalled(shared, { version: '1.0.0', launch: 'relative/path' }), false);
  assert.equal(writeInstalled(shared, { version: '1.0.0', launch: '' }), false);
  assert.equal(writeInstalled(shared, { version: '1.0.0', launch: undefined }), false);
  assert.equal(writeInstalled(shared, { version: '1.0.0', launch: path.resolve('/', 'x'.repeat(2000)) }), false);
  assert.equal(writeInstalled(shared, { id: '../escape', version: '1.0.0', launch: program() }), false, 'an id cannot leave the folder');
  assert.equal(fs.existsSync(path.join(shared, 'installed')), false);
  writeInstalled(shared, { version: ' 1.0.0\u202e ', name: 'RT\u0000 Author Desk', launch: program() });
  const info = JSON.parse(fs.readFileSync(path.join(shared, 'installed', 'rt-author-desk.json'), 'utf8'));
  assert.deepEqual([info.version, info.name], ['1.0.0', 'RT Author Desk'], 'control and direction characters are dropped');
  assert.deepEqual(Object.keys(info), ['id', 'name', 'version', 'launch', 'protocol']);
});

test('the other apps can read it, and a file for a program that is gone is cleared away', () => {
  const shared = temp();
  const launch = program();
  writeInstalled(shared, { version: '1.0.0-alpha.1', launch });
  assert.deepEqual(readInstalled(shared), [{ id: 'rt-author-desk', name: 'RT Author Desk', version: '1.0.0-alpha.1', launch, known: true }]);
  fs.rmSync(launch);
  assert.deepEqual(readInstalled(shared), []);
  assert.equal(fs.existsSync(path.join(shared, 'installed', 'rt-author-desk.json')), false, 'cleared');
  assert.deepEqual(readInstalled(path.join(shared, 'nowhere')), []);
});

test('uninstalling takes it back', () => {
  const shared = temp();
  writeInstalled(shared, { version: '1.0.0', launch: program() });
  removeInstalled(shared);
  assert.deepEqual(fs.readdirSync(path.join(shared, 'installed')), []);
  removeInstalled(shared, '../escape');
  removeInstalled(shared);
});

test('what to start: the AppImage, the .app on a Mac, or the program', () => {
  assert.equal(launchPathFor({ execPath: '/tmp/.mount_x/rt-author-desk', appImage: '/home/me/RTAuthorDesk.AppImage', platform: 'linux' }), '/home/me/RTAuthorDesk.AppImage');
  assert.equal(launchPathFor({ execPath: '/Applications/RT Author Desk.app/Contents/MacOS/RT Author Desk', platform: 'darwin' }), '/Applications/RT Author Desk.app');
  assert.equal(launchPathFor({ execPath: 'C:\\Users\\me\\AppData\\Local\\Programs\\RT Author Desk\\RT Author Desk.exe', platform: 'win32' }), 'C:\\Users\\me\\AppData\\Local\\Programs\\RT Author Desk\\RT Author Desk.exe');
});

test('the shared folder is the same place for every Recon Towers app', () => {
  assert.equal(sharedFolder({ env: {}, platform: 'win32', home: 'C:\\Users\\me' }), path.join('C:\\Users\\me', 'AppData', 'Roaming', 'Recon Towers', 'app-link'));
  assert.equal(sharedFolder({ env: { APPDATA: 'D:\\Roaming' }, platform: 'win32', home: 'x' }), path.join('D:\\Roaming', 'Recon Towers', 'app-link'));
  assert.equal(sharedFolder({ env: {}, platform: 'darwin', home: '/Users/me' }), '/Users/me/Library/Application Support/Recon Towers/app-link');
  assert.equal(sharedFolder({ env: {}, platform: 'linux', home: '/home/me' }), '/home/me/.config/Recon Towers/app-link');
  assert.equal(sharedFolder({ env: { XDG_CONFIG_HOME: '/cfg' }, platform: 'linux', home: '/home/me' }), '/cfg/Recon Towers/app-link');
  assert.equal(sharedFolder({ env: { NMR_LINK_DIR: '/here' }, platform: 'linux', home: '/home/me' }), '/here', 'the tests can name their own folder');
});

test('the Windows installer writes the same file, with the version in it, and takes it away again', () => {
  const nsh = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8');
  assert.match(nsh, /customInstall/);
  assert.match(nsh, /customUnInstall/);
  assert.match(nsh, /"version": "\$\{VERSION\}"/);
  assert.match(nsh, /rt-author-desk\.json/);
  assert.ok(!/story-tracker|Story Tracker/.test(nsh), 'no other app\'s name is left in it');
  assert.equal(require('../package.json').build.nsis.include, 'build/installer.nsh');
});
