'use strict';
// Backups. A backup is one closed file: the encrypted library, the key slots that open it, and a note of what it holds. It is
// safe to leave in OneDrive or Dropbox, where a live database isn't, and it is checked before anything is ever replaced.
// Nothing runs on a schedule until a folder is chosen.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { strFromU8, strToU8, unzipSync, zipSync } = require('fflate');
const { APPLICATION_ID, copyDatabase, migrate, openDatabase } = require('./storage/database');
const { KEY_FILE, openWithAppSlot, writeFileSafely } = require('./storage/keys');
const { DATABASE_FILE } = require('./storage/library');
const { STEPS } = require('./storage/schema');

const APP = 'rt-author-desk';
const ENDING = '.rtadbackup';
const PREFIX = 'RT Author Desk backup ';
const NOTE = 'backup.json';
const EVERY_MS = { hour: 3_600_000, day: 86_400_000, week: 604_800_000 };
const CHECK_MS = 10 * 60 * 1000;
const FIRST_CHECK_MS = 30 * 1000;

class BackupError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BackupError';
  }
}

const stamp = (date) => date.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
const fileNameFor = (date) => `${PREFIX}${stamp(date)}${ENDING}`;
const isBackupName = (name) => name.startsWith(PREFIX) && name.endsWith(ENDING);

// What the library holds, for the note in a backup and for the person deciding whether to restore it.
function summarize(db) {
  const count = (table) => {
    try {
      return db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
    } catch {
      return 0;
    }
  };
  return { books: count('books'), editions: count('editions'), listings: count('listings'), isbns: count('isbns'), saleLines: count('sale_lines') };
}

// Writes the backup into a folder. The folder is made if it isn't there. The file appears all at once, or not at all.
function createBackup(library, folder, { now = () => new Date(), version = '' } = {}) {
  if (!folder || typeof folder !== 'string') throw new BackupError('Choose a folder for the backups first.');
  const date = now();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-backup-'));
  try {
    const copy = path.join(work, DATABASE_FILE);
    copyDatabase(library.db, library.file, copy);
    const keys = fs.readFileSync(path.join(library.dir, KEY_FILE));
    const info = library.info();
    const note = {
      app: APP, format: 1, createdAt: date.toISOString(), version: String(version), step: info.step, libraryId: info.id,
      holds: summarize(library.db),
    };
    const bytes = Buffer.from(zipSync({
      [NOTE]: strToU8(`${JSON.stringify(note, null, 2)}\n`),
      [KEY_FILE]: new Uint8Array(keys),
      [DATABASE_FILE]: new Uint8Array(fs.readFileSync(copy)),
    }, { level: 0 })); // the database is already encrypted, so squeezing it would only cost time
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, fileNameFor(date));
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, bytes);
    fs.renameSync(temp, file);
    return { file, bytes: bytes.length, note };
  } catch (error) {
    if (error instanceof BackupError) throw error;
    if (['EACCES', 'EPERM', 'ENOENT', 'ENOSPC', 'EROFS', 'ENOTDIR'].includes(error.code)) {
      throw new BackupError(`The backup couldn't be saved to that folder: ${error.code === 'ENOSPC' ? 'there is no room left' : error.code === 'ENOENT' || error.code === 'ENOTDIR' ? "it isn't there" : "this app isn't allowed to write there"}.`);
    }
    throw error;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// The three parts of a backup, read with the sizes in the file checked and not trusted. This app writes a backup uncompressed, so each part's two
// sizes are the same and none can be bigger than the file it is in. A file that says otherwise was not made by this app, and its sizes must not
// be used to ask for memory: a made-up file could name several gigabytes for each part.
function readParts(bytes) {
  return unzipSync(bytes, {
    filter: (entry) => {
      if (![NOTE, KEY_FILE, DATABASE_FILE].includes(entry.name)) return false;
      if (entry.compression !== 0 || entry.size !== entry.originalSize || entry.originalSize > bytes.length) throw new BackupError('The sizes in that file do not add up.');
      return true;
    },
  });
}

// What a library at this step holds, and nothing more: its tables and their indexes. It is made fresh, so it is exactly what this app makes.
function expectedObjects(step, work) {
  const file = path.join(work, 'expected.db');
  const key = crypto.randomBytes(32);
  const fresh = openDatabase(file, key);
  try {
    migrate(fresh, file, { steps: STEPS.filter((s) => s.version <= step) });
    return new Set(fresh.prepare('SELECT type, name FROM sqlite_master').all().map((o) => `${o.type}:${o.name}`));
  } finally {
    fresh.close();
    key.fill(0);
  }
}

// Opens a backup far enough to be sure it is a whole, working library from this app, and says what's in it. Nothing is changed.
function verifyBackup(file) {
  let files;
  try {
    files = readParts(new Uint8Array(fs.readFileSync(file)));
  } catch (error) {
    throw new BackupError("That file isn't a backup this app made, or it has been damaged.");
  }
  if (!files[NOTE] || !files[KEY_FILE] || !files[DATABASE_FILE]) throw new BackupError("That file isn't a complete backup: part of it is missing.");
  let note;
  try {
    note = JSON.parse(strFromU8(files[NOTE]));
  } catch {
    throw new BackupError("That file isn't a backup this app made, or it has been damaged.");
  }
  if (note?.app !== APP || note.format !== 1) throw new BackupError('That backup was made by a different app, or by a version this one cannot read.');
  const latest = STEPS.at(-1).version;
  if (Number(note.step) > latest) throw new BackupError(`That backup was made by a newer version of RT Author Desk (it is at step ${note.step}, and this version knows up to ${latest}). Update the app, then restore it.`);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-verify-'));
  let db;
  try {
    fs.writeFileSync(path.join(work, KEY_FILE), files[KEY_FILE]);
    fs.writeFileSync(path.join(work, DATABASE_FILE), files[DATABASE_FILE]);
    let key;
    try {
      key = openWithAppSlot(work);
    } catch {
      throw new BackupError('That backup is protected by a password, which this version of the app can not open yet.');
    }
    try {
      db = openDatabase(path.join(work, DATABASE_FILE), key);
    } catch {
      throw new BackupError("That backup can't be opened with its own key, so it is damaged.");
    } finally {
      key.fill(0);
    }
    const checked = db.pragma('integrity_check', { simple: true });
    if (checked !== 'ok') throw new BackupError('That backup is damaged: the library inside it fails its own check.');
    // Its key is the app's own, which anyone can make a pair with, so a file that opens proves nothing about who made it. What is in it is
    // checked instead: it must be a library of this app at a step this app knows, holding the tables and indexes that step makes and nothing
    // else. A database with a trigger, a view or a table of its own is one this app never made, and is refused before it is ever used.
    const step = db.pragma('user_version', { simple: true });
    if (!Number.isInteger(step) || step < 1 || step > latest || db.pragma('application_id', { simple: true }) !== APPLICATION_ID) {
      throw new BackupError("That file isn't a library made by this app.");
    }
    const expected = expectedObjects(step, work);
    const strange = db.prepare('SELECT type, name FROM sqlite_master').all().filter((o) => !expected.has(`${o.type}:${o.name}`));
    if (strange.length) throw new BackupError('That backup has things in it that this app never makes (such as a trigger, a view or a table of its own), so it was not made by this app, and it is not safe to open.');
    return { ...note, holds: summarize(db), bytes: fs.statSync(file).size };
  } finally {
    db?.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// Puts a backup in place of the library, which must be closed. What was there is not deleted: it is moved aside, whole, so a
// restore can be undone by hand. If anything goes wrong part way, the library is put back as it was.
function restoreBackup({ userData, file, now = () => new Date() }) {
  const info = verifyBackup(file);
  const files = readParts(new Uint8Array(fs.readFileSync(file)));
  const live = path.join(userData, 'library');
  const aside = path.join(userData, `library-before-restore-${stamp(now())}`);
  const moved = fs.existsSync(live);
  if (moved) fs.renameSync(live, aside);
  try {
    fs.mkdirSync(live, { recursive: true });
    fs.writeFileSync(path.join(live, DATABASE_FILE), files[DATABASE_FILE]);
    writeFileSafely(path.join(live, KEY_FILE), strFromU8(files[KEY_FILE]));
  } catch (error) {
    fs.rmSync(live, { recursive: true, force: true });
    if (moved) fs.renameSync(aside, live);
    throw error;
  }
  return { info, aside: moved ? aside : null };
}

// The backups in a folder, newest first, each with its date from its name.
function listBackups(folder) {
  let names = [];
  try {
    names = fs.readdirSync(folder).filter(isBackupName);
  } catch {
    return [];
  }
  return names.sort().reverse().map((name) => ({ name, file: path.join(folder, name), bytes: fs.statSync(path.join(folder, name)).size }));
}

// Keeps the newest few. Only files this app named are ever touched.
function prune(folder, keep) {
  const old = listBackups(folder).slice(Math.max(1, keep));
  for (const item of old) fs.rmSync(item.file, { force: true });
  return old.length;
}

// Backs up on a schedule, to the folder the person chose, when something has changed since the last one.
class BackupSchedule {
  constructor({ getLibrary, settings, stateFile, version, now = () => new Date() }) {
    this.getLibrary = getLibrary;
    this.settings = settings;
    this.file = stateFile;
    this.version = version;
    this.now = now;
    this.state = this.#read();
    this.lastError = null;
    this.timers = [];
  }

  #read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  start() {
    this.timers.push(setTimeout(() => this.runIfDue(), FIRST_CHECK_MS), setInterval(() => this.runIfDue(), CHECK_MS));
    this.timers.forEach((timer) => timer.unref());
  }

  stop() {
    this.timers.forEach((timer) => { clearTimeout(timer); clearInterval(timer); });
    this.timers = [];
  }

  status() {
    return { last: this.state.at ?? null, lastFile: this.state.name ?? null, error: this.lastError };
  }

  #seq(library) {
    return library.db.prepare('SELECT coalesce(max(seq), 0) AS n FROM changes').get().n;
  }

  due(library = this.getLibrary()) {
    const { backupEvery } = this.settings.values;
    if (!library || backupEvery === 'off' || !this.settings.values.backupFolder) return false;
    if (this.state.seq === this.#seq(library)) return false; // nothing has changed, and a copy of the same thing would only push older ones out
    return !this.state.at || this.now().getTime() - new Date(this.state.at).getTime() >= EVERY_MS[backupEvery];
  }

  runIfDue() {
    return this.due() ? this.run() : { saved: false };
  }

  // Asked for by hand: it always makes a copy.
  run() {
    const library = this.getLibrary();
    const { backupFolder, backupKeep } = this.settings.values;
    if (!library) throw new BackupError('Your library is not open.');
    if (!backupFolder) throw new BackupError('Choose a folder for the backups first.');
    try {
      const made = createBackup(library, backupFolder, { now: this.now, version: this.version });
      this.state = { at: made.note.createdAt, seq: this.#seq(library), name: path.basename(made.file) };
      writeFileSafely(this.file, `${JSON.stringify(this.state, null, 2)}\n`);
      const pruned = prune(backupFolder, backupKeep);
      this.lastError = null;
      return { saved: true, file: made.file, bytes: made.bytes, pruned };
    } catch (error) {
      this.lastError = error.message;
      throw error;
    }
  }
}

module.exports = { BackupError, BackupSchedule, ENDING, PREFIX, createBackup, fileNameFor, isBackupName, listBackups, prune, restoreBackup, verifyBackup };
