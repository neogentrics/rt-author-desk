'use strict';
// The library: one encrypted database for everything in the business, as in docs/design/data-model.md.
// Its random key is kept in keys.json, locked by key slots (keys.js, shared with RT Story Tracker). Until a password is
// set, the app slot opens it, which keeps other programs out of the file but isn't secrecy: a password comes in v1.2.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { databaseInfo, migrate, openDatabase } = require('./database');
const { KEY_FILE, createKeys, openWithAppSlot } = require('./keys');
const { STEPS, TABLES } = require('./schema');

const DATABASE_FILE = 'library.db';
const REMOVAL_DAYS = 90;

class Library {
  constructor(dir, { deviceId, now = () => new Date() } = {}) {
    this.dir = dir;
    this.now = now;
    this.deviceId = deviceId ?? crypto.randomUUID();
    this.db = null;
  }

  get file() {
    return path.join(this.dir, DATABASE_FILE);
  }

  // Makes the library the first time, then opens it.
  open() {
    fs.mkdirSync(this.dir, { recursive: true });
    let key;
    if (fs.existsSync(path.join(this.dir, KEY_FILE))) key = openWithAppSlot(this.dir);
    else {
      if (fs.existsSync(this.file)) throw new Error('The library has no key file, so it can\'t be opened.');
      key = createKeys(this.dir, crypto.randomUUID());
    }
    this.db = openDatabase(this.file, key);
    key.fill(0);
    this.migration = migrate(this.db, this.file, { steps: STEPS, now: this.now });
    this.db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('library_id', crypto.randomUUID());
    this.db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('created_at', this.now().toISOString());
    return this;
  }

  close() {
    this.db?.close();
    this.db = null;
  }

  info() {
    const meta = Object.fromEntries(this.db.prepare('SELECT key, value FROM meta').all().map((row) => [row.key, row.value]));
    return { id: meta.library_id, createdAt: meta.created_at, step: this.db.pragma('user_version', { simple: true }), ...databaseInfo(this.db) };
  }

  static columns(table) {
    const columns = TABLES[table];
    if (!columns) throw new Error(`Unknown table: ${table}`);
    return columns;
  }

  // Adds a record, or changes the fields given. Every call is one logged change.
  put(table, record) {
    const allowed = Library.columns(table);
    const fields = Object.keys(record).filter((key) => key !== 'id');
    const unknown = fields.filter((key) => !allowed.includes(key));
    if (unknown.length) throw new Error(`Not a field of ${table}: ${unknown.join(', ')}`);
    const at = this.now().toISOString();
    const id = record.id ?? crypto.randomUUID();
    this.db.transaction(() => {
      const exists = this.db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id);
      if (exists) {
        if (fields.length) {
          const sets = fields.map((key) => `${key} = @${key}`).join(', ');
          this.db.prepare(`UPDATE ${table} SET ${sets}, updated_at = @at, device_id = @device WHERE id = @id`)
            .run({ ...pick(record, fields), at, device: this.deviceId, id });
        }
      } else {
        const names = ['id', ...fields, 'created_at', 'updated_at', 'device_id'];
        this.db.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map((n) => `@${n}`).join(', ')})`)
          .run({ ...pick(record, fields), id, created_at: at, updated_at: at, device_id: this.deviceId });
        this.db.prepare('DELETE FROM removals WHERE record_table = ? AND record_id = ?').run(table, id);
      }
      this.db.prepare('INSERT INTO changes (record_table, record_id, op, fields, device_id, at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(table, id, 'put', fields.join(','), this.deviceId, at);
    })();
    return this.get(table, id);
  }

  get(table, id) {
    Library.columns(table);
    return this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) ?? null;
  }

  list(table) {
    Library.columns(table);
    return this.db.prepare(`SELECT * FROM ${table} ORDER BY created_at, id`).all();
  }

  // A removal leaves a marker, so another computer learns the record is gone rather than sending it back.
  remove(table, id) {
    Library.columns(table);
    const at = this.now().toISOString();
    this.db.transaction(() => {
      const { changes } = this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
      if (!changes) return;
      this.db.prepare('INSERT OR REPLACE INTO removals (record_table, record_id, removed_at, device_id) VALUES (?, ?, ?, ?)')
        .run(table, id, at, this.deviceId);
      this.db.prepare('INSERT INTO changes (record_table, record_id, op, fields, device_id, at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(table, id, 'remove', '', this.deviceId, at);
    })();
  }

  changesSince(seq) {
    return this.db.prepare('SELECT * FROM changes WHERE seq > ? ORDER BY seq').all(seq)
      .map((row) => ({ ...row, fields: row.fields ? row.fields.split(',') : [] }));
  }

  removals() {
    return this.db.prepare('SELECT * FROM removals ORDER BY removed_at').all();
  }

  // Markers older than 90 days are dropped. A computer that's been away longer than that syncs from a full copy.
  forgetOldRemovals() {
    const cutoff = new Date(this.now().getTime() - REMOVAL_DAYS * 86_400_000).toISOString();
    return this.db.prepare('DELETE FROM removals WHERE removed_at < ?').run(cutoff).changes;
  }
}

// SQLite has no true and false, so a checkbox's value is stored as 1 or 0.
function pick(record, fields) {
  return Object.fromEntries(fields.map((key) => {
    const value = record[key] ?? null;
    return [key, typeof value === 'boolean' ? Number(value) : value];
  }));
}

module.exports = { DATABASE_FILE, Library, REMOVAL_DAYS };
