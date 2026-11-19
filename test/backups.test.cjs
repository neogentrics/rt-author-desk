'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { strToU8, zipSync, unzipSync } = require('fflate');
const { BackupError, BackupSchedule, createBackup, isBackupName, listBackups, prune, restoreBackup, verifyBackup } = require('../src/main/backups');
const { Catalog } = require('../src/main/catalog');
const { Library } = require('../src/main/storage/library');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const refused = (fn, pattern) => assert.throws(fn, (e) => e instanceof BackupError && pattern.test(e.message), String(pattern));
const NOW = new Date('2026-11-18T14:30:05.123Z');

function start(userData = temp()) {
  const library = new Library(path.join(userData, 'library')).open();
  const catalog = new Catalog(library);
  catalog.saveBook({ title: 'Tidewater' });
  catalog.saveBook({ title: 'Low Water' });
  return { userData, library, catalog };
}

test('a backup is one closed file with a clear name, holding the encrypted library and its key', () => {
  const { library } = start();
  const folder = path.join(temp(), 'my backups');
  const made = createBackup(library, folder, { now: () => NOW, version: '1.0.0-alpha.2' });
  assert.equal(path.basename(made.file), 'RT Author Desk backup 2026-11-18T14-30-05Z.rtadbackup');
  assert.deepEqual(fs.readdirSync(folder), ['RT Author Desk backup 2026-11-18T14-30-05Z.rtadbackup'], 'only the finished file is left, and the folder was made');
  const inside = unzipSync(new Uint8Array(fs.readFileSync(made.file)));
  assert.deepEqual(Object.keys(inside).sort(), ['backup.json', 'keys.json', 'library.db']);
  const note = JSON.parse(Buffer.from(inside['backup.json']).toString());
  assert.deepEqual([note.app, note.version, note.createdAt, note.holds.books], ['rt-author-desk', '1.0.0-alpha.2', '2026-11-18T14:30:05.123Z', 2]);
  assert.ok(!Buffer.from(fs.readFileSync(made.file)).includes(Buffer.from('Tidewater')), 'a title is not readable in the file');
  library.close();
});

test('a backup is checked before it is trusted, and says what is in it', () => {
  const { library } = start();
  const made = createBackup(library, temp(), { now: () => NOW, version: '1.0.0-alpha.2' });
  const info = verifyBackup(made.file);
  assert.deepEqual([info.version, info.createdAt, info.holds.books, info.holds.editions], ['1.0.0-alpha.2', '2026-11-18T14:30:05.123Z', 2, 0]);
  assert.ok(info.bytes > 0);
  library.close();
});

test('a file that is not a backup, a damaged one, one that is missing a part, and one from another app are all refused in words', () => {
  const { library } = start();
  const made = createBackup(library, temp(), { now: () => NOW });
  const folder = temp();
  const write = (name, bytes) => { const f = path.join(folder, name); fs.writeFileSync(f, bytes); return f; };
  refused(() => verifyBackup(write('a.rtadbackup', Buffer.from('not a backup at all'))), /isn't a backup this app made/);
  refused(() => verifyBackup(path.join(folder, 'missing.rtadbackup')), /isn't a backup this app made/);

  const parts = unzipSync(new Uint8Array(fs.readFileSync(made.file)));
  const without = { ...parts };
  delete without['keys.json'];
  refused(() => verifyBackup(write('b.rtadbackup', Buffer.from(zipSync(without)))), /part of it is missing/);

  const other = { ...parts, 'backup.json': strToU8(JSON.stringify({ app: 'rt-story-tracker', format: 1, step: 1 })) };
  refused(() => verifyBackup(write('c.rtadbackup', Buffer.from(zipSync(other)))), /different app/);

  const newer = { ...parts, 'backup.json': strToU8(JSON.stringify({ app: 'rt-author-desk', format: 1, step: 999 })) };
  refused(() => verifyBackup(write('d.rtadbackup', Buffer.from(zipSync(newer)))), /newer version of RT Author Desk/);

  const bad = Buffer.from(parts['library.db']);
  for (let i = 4096; i < Math.min(bad.length, 12288); i += 1) bad[i] ^= 0xff; // scribble over some pages
  const damaged = { ...parts, 'library.db': new Uint8Array(bad) };
  refused(() => verifyBackup(write('e.rtadbackup', Buffer.from(zipSync(damaged)))), /damaged|can't be opened/);
  library.close();
});

test('restoring puts the backup in place of the library and keeps what was there, whole, to one side', () => {
  const { userData, library, catalog } = start();
  const made = createBackup(library, temp(), { now: () => NOW });
  catalog.saveBook({ title: 'Made after the backup' });
  assert.equal(library.list('books').length, 3);
  library.close();

  const done = restoreBackup({ userData, file: made.file, now: () => new Date('2026-11-19T09:00:00Z') });
  assert.equal(done.info.holds.books, 2);
  assert.equal(path.basename(done.aside), 'library-before-restore-2026-11-19T09-00-00Z');

  const restored = new Library(path.join(userData, 'library')).open();
  assert.deepEqual(restored.list('books').map((b) => b.title).sort(), ['Low Water', 'Tidewater']);
  restored.close();
  const kept = new Library(done.aside).open();
  assert.equal(kept.list('books').length, 3, 'the library as it was before is untouched');
  kept.close();
});

test('a restore that fails part way puts the library back as it was', () => {
  const { userData, library, catalog } = start();
  const made = createBackup(library, temp(), { now: () => NOW });
  catalog.saveBook({ title: 'Later' });
  library.close();
  const write = fs.writeFileSync;
  fs.writeFileSync = (file, ...rest) => {
    if (String(file).includes(`${path.sep}library${path.sep}library.db`)) throw new Error('the disk is full');
    return write(file, ...rest);
  };
  try {
    assert.throws(() => restoreBackup({ userData, file: made.file }), /disk is full/);
  } finally {
    fs.writeFileSync = write;
  }
  assert.deepEqual(fs.readdirSync(userData), ['library'], 'nothing is left over');
  const back = new Library(path.join(userData, 'library')).open();
  assert.equal(back.list('books').length, 3, 'and the library is as it was');
  back.close();
});

test('a restore with nothing to put aside still works, for a computer that has no library yet', () => {
  const { library } = start();
  const made = createBackup(library, temp(), { now: () => NOW });
  library.close();
  const fresh = temp();
  const done = restoreBackup({ userData: fresh, file: made.file });
  assert.equal(done.aside, null);
  const opened = new Library(path.join(fresh, 'library')).open();
  assert.equal(opened.list('books').length, 2);
  opened.close();
});

test('only this app\'s own backups are listed or pruned, newest kept', () => {
  const folder = temp();
  const names = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'].map((d) => `RT Author Desk backup ${d}T10-00-00Z.rtadbackup`);
  for (const n of names) fs.writeFileSync(path.join(folder, n), 'x');
  fs.writeFileSync(path.join(folder, 'holiday photos.zip'), 'x');
  fs.writeFileSync(path.join(folder, 'RT Author Desk backup notes.txt'), 'x');
  assert.deepEqual(listBackups(folder).map((b) => b.name), [...names].reverse());
  assert.equal(isBackupName('holiday photos.zip'), false);
  assert.equal(prune(folder, 2), 2);
  assert.deepEqual(listBackups(folder).map((b) => b.name), [names[3], names[2]]);
  assert.ok(fs.existsSync(path.join(folder, 'holiday photos.zip')) && fs.existsSync(path.join(folder, 'RT Author Desk backup notes.txt')));
  assert.equal(prune(folder, 0), 1, 'at least one is always kept');
  assert.deepEqual(listBackups(path.join(folder, 'nowhere')), []);
});

function schedule(overrides = {}) {
  const { userData, library, catalog } = start();
  let clock = new Date('2026-11-18T10:00:00Z');
  const settings = { values: { backupFolder: path.join(userData, 'backups-out'), backupEvery: 'day', backupKeep: 3, ...overrides } };
  const s = new BackupSchedule({ getLibrary: () => library, settings, stateFile: path.join(userData, 'backups.json'), version: '1.0.0', now: () => clock });
  return { s, library, catalog, settings, userData, tick: (ms) => { clock = new Date(clock.getTime() + ms); }, folder: settings.values.backupFolder };
}

test('nothing runs until a folder is chosen and a schedule is set', () => {
  const off = schedule({ backupEvery: 'off' });
  assert.equal(off.s.due(), false);
  assert.deepEqual(off.s.runIfDue(), { saved: false });
  const none = schedule({ backupFolder: '' });
  assert.equal(none.s.due(), false);
  refused(() => none.s.run(), /Choose a folder/);
  assert.equal(none.s.status().last, null);
});

test('a backup is made when something has changed and the time is up, and not otherwise', () => {
  const t = schedule();
  assert.equal(t.s.due(), true, 'the first one is due at once');
  const first = t.s.runIfDue();
  assert.equal(first.saved, true);
  assert.equal(listBackups(t.folder).length, 1);
  assert.equal(t.s.due(), false, 'nothing has changed');
  t.tick(3 * 86_400_000);
  assert.equal(t.s.due(), false, 'still nothing has changed, however long it has been');
  t.catalog.saveBook({ title: 'New' });
  assert.equal(t.s.due(), true);
  t.s.runIfDue();
  assert.equal(listBackups(t.folder).length, 2);
  t.catalog.saveBook({ title: 'Newer' });
  t.tick(3_600_000);
  assert.equal(t.s.due(), false, 'changed, but a day has not passed');
  t.tick(86_400_000);
  assert.equal(t.s.due(), true);
  assert.equal(t.s.status().last, '2026-11-21T10:00:00.000Z');
  assert.match(t.s.status().lastFile, /^RT Author Desk backup 2026-11-21T10-00-00Z\.rtadbackup$/);
});

test('asking by hand always makes a copy, the oldest go when there are more than the number to keep, and the record survives a restart', () => {
  const t = schedule({ backupKeep: 2 });
  for (let i = 0; i < 4; i += 1) { t.s.run(); t.tick(60_000); }
  assert.equal(listBackups(t.folder).length, 2);
  const again = new BackupSchedule({ getLibrary: () => t.library, settings: t.settings, stateFile: path.join(t.userData, 'backups.json'), version: '1.0.0' });
  assert.equal(again.status().last, t.s.status().last);
  assert.equal(again.due(), false, 'it remembers that nothing has changed since');
});

test('a folder that cannot be written to is said in words, and the schedule carries on', () => {
  const t = schedule();
  const blocked = path.join(t.userData, 'a file');
  fs.writeFileSync(blocked, 'x');
  t.settings.values.backupFolder = path.join(blocked, 'inside');
  refused(() => t.s.run(), /couldn't be saved to that folder/);
  assert.match(t.s.status().error, /couldn't be saved/);
  t.settings.values.backupFolder = path.join(t.userData, 'fine');
  assert.equal(t.s.run().saved, true);
  assert.equal(t.s.status().error, null);
});
