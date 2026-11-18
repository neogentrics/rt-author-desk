'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Catalog, CatalogError } = require('../src/main/catalog');
const { migrate, openDatabase } = require('../src/main/storage/database');
const { Library } = require('../src/main/storage/library');
const { BUILT_IN_STORES, STEPS } = require('../src/main/storage/schema');
const { daysBetween, isRealDate } = require('../src/shared/dates');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const fresh = () => {
  const library = new Library(temp()).open();
  return { library, catalog: new Catalog(library) };
};
const refused = (fn, pattern) => assert.throws(fn, (error) => error instanceof CatalogError && pattern.test(error.message), String(pattern));

// A library saved by step 1, the way an earlier build would have left it, must open and keep everything.
test('a library from step 1 moves forward to step 2 without losing anything', () => {
  const dir = temp();
  const file = path.join(dir, 'old.db');
  const key = crypto.randomBytes(32);
  let db = openDatabase(file, key);
  migrate(db, file, { steps: [STEPS[0]] });
  db.prepare(
    "INSERT INTO books (id, title, created_at, updated_at, device_id) VALUES ('b1', 'Made-up Book', '2026-01-01', '2026-01-01', 'd')",
  ).run();
  assert.equal(db.pragma('user_version', { simple: true }), 1);
  db.close();

  db = openDatabase(file, key);
  const result = migrate(db, file, { steps: STEPS });
  assert.deepEqual([result.from, result.to], [1, STEPS.at(-1).version]);
  assert.ok(result.backup && fs.existsSync(result.backup), 'a copy is kept from before the change');
  assert.equal(db.prepare("SELECT title FROM books WHERE id = 'b1'").get().title, 'Made-up Book');
  assert.equal(db.prepare('SELECT count(*) AS n FROM stores').get().n, BUILT_IN_STORES.length);
  db.close();
});

test('every library starts with the nine stores, with fixed IDs', () => {
  const { library } = fresh();
  const stores = library.list('stores');
  assert.equal(stores.length, 9);
  assert.ok(stores.every((s) => s.id.startsWith('store-') && s.active === 1));
  assert.deepEqual(stores.find((s) => s.id === 'store-acx').kind, 'audio');
  // A built-in store is an ordinary record: it can be renamed, switched off, or sit beside one of your own.
  library.put('stores', { id: 'store-kobo', active: 0 });
  library.put('stores', { name: 'My Own Shop' });
  assert.equal(library.get('stores', 'store-kobo').active, 0);
  assert.equal(library.list('stores').length, 10);
  library.close();
});

test('a book needs a title, and can only be removed once its editions are gone', () => {
  const { library, catalog } = fresh();
  refused(() => catalog.saveBook({ title: '   ' }), /needs a title/);
  const book = catalog.saveBook({ title: 'Book One' });
  const edition = catalog.saveEdition({ book_id: book.id, format: 'paperback' });
  refused(() => catalog.removeBook(book.id), /still has 1 edition\. Remove it first/);
  catalog.removeEdition(edition.id);
  catalog.removeBook(book.id);
  assert.equal(library.get('books', book.id), null);
  library.close();
});

test('an edition checks its format, date, numbers and book', () => {
  const { library, catalog } = fresh();
  const book = catalog.saveBook({ title: 'Book One' });
  refused(() => catalog.saveEdition({ format: 'ebook' }), /belongs to a book/);
  refused(() => catalog.saveEdition({ book_id: book.id }), /Choose a format/);
  refused(() => catalog.saveEdition({ book_id: 'nope', format: 'ebook' }), /That book isn't in your library/);
  refused(() => catalog.saveEdition({ book_id: book.id, format: 'scroll' }), /not a format/);
  refused(() => catalog.saveEdition({ book_id: book.id, format: 'ebook', release_date: '2027-02-30' }), /not a real date/);
  refused(() => catalog.saveEdition({ book_id: book.id, format: 'ebook', release_date: 'March 2027' }), /not a real date/);
  refused(() => catalog.saveEdition({ book_id: book.id, format: 'paperback', page_count: 0 }), /Page count/);
  refused(() => catalog.saveEdition({ book_id: book.id, format: 'paperback', page_count: 12.5 }), /Page count/);
  refused(() => catalog.saveEdition({ book_id: book.id, format: 'audiobook', page_count: 300 }), /length, not a page count/);
  refused(() => catalog.saveEdition({ book_id: book.id, format: 'ebook', length_minutes: 600 }), /Only an audiobook/);

  const paperback = catalog.saveEdition({ book_id: book.id, format: 'paperback', page_count: 320, trim_size: '5.5 x 8.5 in', release_date: '2027-03-14' });
  assert.equal(paperback.cover_status, 'not started');
  // Changing one field later is checked against what is already there.
  refused(() => catalog.saveEdition({ id: paperback.id, length_minutes: 60 }), /Only an audiobook/);
  refused(() => catalog.saveEdition({ id: paperback.id, format: 'audiobook' }), /length, not a page count/);
  const updated = catalog.saveEdition({ id: paperback.id, cover_status: 'final', release_date: null });
  assert.equal(updated.cover_status, 'final');
  assert.equal(updated.release_date, null);
  library.close();
});

test('editions of a book come back in the order a person reads them', () => {
  const { library, catalog } = fresh();
  const book = catalog.saveBook({ title: 'Book One' });
  for (const format of ['audiobook', 'hardcover', 'ebook', 'paperback']) catalog.saveEdition({ book_id: book.id, format });
  assert.deepEqual(catalog.editionsOf(book.id).map((e) => e.format), ['ebook', 'paperback', 'hardcover', 'audiobook']);
  library.close();
});

test('an ISBN is checked, stored as an ISBN-13, and can only be in the register once', () => {
  const { library, catalog } = fresh();
  const book = catalog.saveBook({ title: 'Book One' });
  const paperback = catalog.saveEdition({ book_id: book.id, format: 'paperback' });
  const hardcover = catalog.saveEdition({ book_id: book.id, format: 'hardcover' });

  refused(() => catalog.addIsbn({ number: '9780306406158' }), /isn't a good ISBN\. The last digit should be 7/);
  refused(() => catalog.addIsbn({ number: '' }), /That isn't a good ISBN/);

  const isbn = catalog.addIsbn({ number: '0-306-40615-2', editionId: paperback.id });
  assert.equal(isbn.isbn, '9780306406157');
  refused(() => catalog.addIsbn({ number: '978-0-306-40615-7', editionId: hardcover.id }), /already in your register, on Book One: paperback/);
  library.close();
});

test('an edition can hold several ISBNs, and a store\'s free one must name its store', () => {
  const { library, catalog } = fresh();
  const book = catalog.saveBook({ title: 'Book One' });
  const paperback = catalog.saveEdition({ book_id: book.id, format: 'paperback' });
  refused(() => catalog.addIsbn({ number: '9780306406157', issuer: 'store' }), /has to say which store/);
  refused(() => catalog.addIsbn({ number: '9780306406157', issuer: 'store', storeId: 'store-nowhere' }), /That store/);
  refused(() => catalog.addIsbn({ number: '9780306406157', issuer: 'lent' }), /Who issued it/);
  catalog.addIsbn({ number: '9780306406157', issuer: 'store', storeId: 'store-kdp', editionId: paperback.id });
  catalog.addIsbn({ number: '9780804429573', issuer: 'bought', editionId: paperback.id });
  assert.deepEqual(catalog.isbnsOf(paperback.id).map((i) => i.issuer), ['store', 'bought']);
  library.close();
});

test('removing an edition keeps its ISBNs in the register, free to use again', () => {
  const { library, catalog } = fresh();
  const book = catalog.saveBook({ title: 'Book One' });
  const old = catalog.saveEdition({ book_id: book.id, format: 'paperback' });
  const isbn = catalog.addIsbn({ number: '9780306406157', editionId: old.id });
  catalog.removeEdition(old.id);
  assert.deepEqual(catalog.spareIsbns().map((i) => i.id), [isbn.id]);
  const reworked = catalog.saveEdition({ book_id: book.id, format: 'paperback', label: 'reworked' });
  catalog.assignIsbn(isbn.id, reworked.id);
  assert.equal(catalog.isbnsOf(reworked.id).length, 1);
  assert.equal(catalog.describeEdition(reworked.id), 'Book One: paperback, reworked');
  library.close();
});

test('an ISBN that fails its check can be kept when the caller says so, for the move from Notion', () => {
  const { library, catalog } = fresh();
  const kept = catalog.addIsbn({ number: '978-0-306-40615-8', allowInvalid: true });
  assert.equal(kept.isbn, '9780306406158');
  refused(() => catalog.addIsbn({ number: '', allowInvalid: true }), /isn't a good ISBN/);
  library.close();
});

test('dates are real days, and the gap between two is counted in whole days', () => {
  assert.equal(isRealDate('2028-02-29'), true);
  assert.equal(isRealDate('2027-02-29'), false);
  assert.equal(isRealDate('2100-02-29'), false);
  assert.equal(isRealDate('2027-13-01'), false);
  assert.equal(isRealDate('2027-1-1'), false);
  assert.equal(daysBetween('2027-01-01', '2027-03-01'), 59);
  assert.equal(daysBetween('2027-03-01', '2027-01-01'), -59);
  assert.equal(daysBetween('2027-10-30', '2027-11-01'), 2);
  assert.throws(() => daysBetween('2027-02-30', '2027-03-01'), /Not a real date/);
});
