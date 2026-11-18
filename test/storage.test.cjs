'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DATABASE_FILE, Library } = require('../src/main/storage/library');
const { WrongKeyError, openDatabase } = require('../src/main/storage/database');
const { runChecks } = require('../src/main/self-test');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));

test('a new library is encrypted, and a wrong key is refused', () => {
  const dir = temp();
  const secret = `Secret${crypto.randomBytes(4).toString('hex')}`;
  const library = new Library(dir).open();
  library.put('books', { title: secret });
  library.close();
  const bytes = fs.readFileSync(path.join(dir, DATABASE_FILE));
  assert.ok(!bytes.includes(Buffer.from(secret)));
  assert.ok(!bytes.subarray(0, 16).toString('latin1').startsWith('SQLite format 3'));
  assert.throws(() => openDatabase(path.join(dir, DATABASE_FILE), crypto.randomBytes(32)), WrongKeyError);
});

test('every record has a permanent random ID, and every change is logged', () => {
  const dir = temp();
  let library = new Library(dir, { deviceId: 'device-a' }).open();
  const series = library.put('series', { name: 'A Made-up Series' });
  const book = library.put('books', { title: 'Book One', series_id: series.id, series_number: '1' });
  assert.match(book.id, /^[0-9a-f-]{36}$/);
  library.put('books', { id: book.id, business_status: 'live' });
  const changes = library.changesSince(0);
  assert.deepEqual(changes.map((c) => [c.record_table, c.op, c.fields.join()]), [
    ['series', 'put', 'name'],
    ['books', 'put', 'title,series_id,series_number'],
    ['books', 'put', 'business_status'],
  ]);
  assert.ok(changes.every((c) => c.device_id === 'device-a'));
  library.close();

  library = new Library(dir).open();
  assert.equal(library.get('books', book.id).business_status, 'live');
  assert.equal(library.info().step, 1);
  library.close();
});

test('a removal leaves a marker that outlives the record for 90 days', () => {
  const dir = temp();
  let now = new Date('2026-01-01T00:00:00Z');
  const library = new Library(dir, { now: () => now }).open();
  const book = library.put('books', { title: 'Gone' });
  library.remove('books', book.id);
  assert.equal(library.get('books', book.id), null);
  assert.deepEqual(library.removals().map((r) => r.record_id), [book.id]);
  assert.equal(library.changesSince(0).at(-1).op, 'remove');
  now = new Date('2026-03-01T00:00:00Z');
  assert.equal(library.forgetOldRemovals(), 0);
  now = new Date('2026-04-15T00:00:00Z');
  assert.equal(library.forgetOldRemovals(), 1);
  library.close();
});

test('only known tables and fields reach the database', () => {
  const library = new Library(temp()).open();
  assert.throws(() => library.put('books; DROP TABLE books', { title: 'x' }), /Unknown table/);
  assert.throws(() => library.put('books', { 'title = 1; --': 'x' }), /Not a field/);
  assert.throws(() => library.put('books', { business_status: 'sold out' }), /CHECK constraint/);
  library.close();
});

test('the self-test passes outside a packaged build', () => {
  const dir = temp();
  const { checks } = runChecks(dir);
  assert.deepEqual(checks.filter((c) => !c.passed), []);
});
