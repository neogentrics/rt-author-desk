'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApi } = require('../src/main/api');
const { Catalog, CatalogError } = require('../src/main/catalog');
const { findClashes } = require('../src/main/clashes');
const { Library } = require('../src/main/storage/library');
const { KEEP_DAYS, Trash, TrashError } = require('../src/main/trash');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const refused = (fn, pattern) => assert.throws(fn, (e) => e instanceof TrashError && pattern.test(e.message), String(pattern));
const count = (library, table) => library.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;

// A book with an ebook on KDP (priced) and an audiobook with two recordings, and a number held by the ebook's paperback twin.
function start() {
  let clock = new Date('2026-11-18T12:00:00Z');
  const library = new Library(temp(), { now: () => clock }).open();
  const catalog = new Catalog(library);
  const trash = new Trash(library, { now: () => clock });
  const book = catalog.saveBook({ title: 'Tidewater' });
  const ebook = catalog.saveEdition({ book_id: book.id, format: 'ebook', release_date: '2026-12-01' });
  const paperback = catalog.saveEdition({ book_id: book.id, format: 'paperback', page_count: 300 });
  const audio = catalog.saveEdition({ book_id: book.id, format: 'audiobook', length_minutes: 500 });
  const kdp = catalog.saveListing({ edition_id: ebook.id, store_id: 'store-kdp', status: 'live', store_item_id: 'B0TEST0001' });
  catalog.setPrice({ listingId: kdp.id, marketplace: 'US', currency: 'USD', amount: '4.99', fromDate: '2026-01-01' });
  catalog.setPrice({ listingId: kdp.id, marketplace: 'UK', currency: 'GBP', amount: '3.99', fromDate: '2026-01-01' });
  const isbn = catalog.addIsbn({ number: '9780306406157', editionId: paperback.id });
  const human = catalog.saveRecording({ edition_id: audio.id, voice: 'human', read_by: 'Sam Reader' });
  const auto = catalog.saveRecording({ edition_id: audio.id, voice: 'synthesized', replacing: 'waiting', replaced_by_id: human.id });
  const acx = catalog.saveListing({ edition_id: audio.id, store_id: 'store-acx', status: 'live', recording_id: human.id });
  return { library, catalog, trash, book, ebook, paperback, audio, kdp, acx, isbn, human, auto, tick: (days) => { clock = new Date(clock.getTime() + days * 86_400_000); } };
}
const snapshot = (library) => JSON.stringify(['books', 'editions', 'listings', 'prices', 'recordings', 'isbns'].map((t) => library.db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()));

test('a removed book waits in the Trash, and comes back as it was, with its own id and its own dates', () => {
  const { library, catalog, trash, book } = start();
  const lone = catalog.saveBook({ title: 'A Quiet Harbour', subtitle: 'Planned', notes: 'Not started' });
  const before = library.get('books', lone.id);
  trash.removeBook(lone.id);
  assert.equal(library.get('books', lone.id), null);
  const [item] = trash.list();
  assert.deepEqual([item.kind, item.label, item.daysLeft, item.restorable], ['book', 'A Quiet Harbour', 30, true]);
  trash.restore(item.id);
  assert.deepEqual(library.get('books', lone.id), before, 'every field, the id and the dates');
  assert.deepEqual(trash.list(), []);
  assert.ok(book);
  library.close();
});

test('a book that still has editions cannot be removed, as before, and nothing goes to the Trash', () => {
  const { library, trash, book } = start();
  assert.throws(() => trash.removeBook(book.id), (e) => e instanceof CatalogError && /still has 3 editions/.test(e.message));
  assert.deepEqual(trash.list(), []);
  assert.ok(library.get('books', book.id));
  library.close();
});

test('an edition takes its listings, prices and recordings to the Trash, and brings every one back exactly', () => {
  const { library, trash, ebook, audio } = start();
  const before = snapshot(library);
  trash.removeEdition(ebook.id);
  assert.equal(count(library, 'editions'), 2);
  assert.equal(count(library, 'listings'), 1, 'the ebook\'s KDP listing went with it');
  assert.equal(count(library, 'prices'), 0, 'and its two prices');
  trash.removeEdition(audio.id);
  assert.equal(count(library, 'recordings'), 0, 'recordings go with their edition, and are not left behind');
  assert.equal(count(library, 'listings'), 0);
  assert.deepEqual(trash.list().map((i) => i.label), ['Tidewater: audiobook', 'Tidewater: ebook']);

  for (const item of trash.list()) trash.restore(item.id);
  assert.equal(snapshot(library), before, 'every record is back, field for field');
  assert.equal(count(library, 'trash_items'), 0);
  library.close();
});

test('the numbers an edition held go back to it, unless something else has taken them', () => {
  const { library, catalog, trash, paperback, isbn } = start();
  trash.removeEdition(paperback.id);
  assert.equal(library.get('isbns', isbn.id).edition_id, null, 'the number is back in the register, free');
  trash.restore(trash.list()[0].id);
  assert.equal(library.get('isbns', isbn.id).edition_id, paperback.id);

  trash.removeEdition(paperback.id);
  const other = catalog.saveEdition({ book_id: library.list('books')[0].id, format: 'hardcover' });
  catalog.assignIsbn(isbn.id, other.id);
  trash.restore(trash.list()[0].id);
  assert.equal(library.get('isbns', isbn.id).edition_id, other.id, 'the number stays where it was put since');
  library.close();
});

test('a listing goes to the Trash with its prices and comes back with them', () => {
  const { library, trash, kdp } = start();
  trash.removeListing(kdp.id);
  assert.deepEqual([count(library, 'listings'), count(library, 'prices')], [1, 0]);
  assert.equal(trash.list()[0].label, 'Tidewater: ebook on Amazon KDP');
  trash.restore(trash.list()[0].id);
  assert.deepEqual([count(library, 'listings'), count(library, 'prices')], [2, 2]);
  assert.equal(library.get('listings', kdp.id).store_item_id, 'B0TEST0001');
  library.close();
});

test('something cannot come back before what it belongs to, and the Trash says why in words', () => {
  const { library, catalog, trash, book, ebook, paperback, audio, kdp } = start();
  trash.removeListing(kdp.id);
  trash.removeEdition(ebook.id);
  const [edition, listing] = trash.list();
  assert.equal(listing.restorable, false);
  assert.match(listing.why, /Its edition is in the Trash too/);
  refused(() => trash.restore(listing.id), /Its edition is in the Trash too/);
  trash.restore(edition.id);
  assert.equal(trash.list().find((i) => i.kind === 'listing').restorable, true);

  // an edition whose book has been removed
  trash.removeEdition(paperback.id);
  trash.removeEdition(audio.id);
  trash.removeEdition(ebook.id);
  catalog.removeBook(book.id);
  const stuck = trash.list().find((i) => i.label === 'Tidewater: paperback');
  assert.match(stuck.why, /book is gone/);
  library.close();
});

test('the same book in the Trash is found, so its editions say to bring the book back first', () => {
  const { library, catalog, trash, book, ebook, paperback, audio } = start();
  for (const e of [ebook, paperback, audio]) trash.removeEdition(e.id);
  trash.removeBook(book.id);
  const items = trash.list();
  assert.ok(items.filter((i) => i.kind === 'edition').every((i) => /book is in the Trash too/.test(i.why)));
  trash.restore(items.find((i) => i.kind === 'book').id);
  assert.ok(trash.list().filter((i) => i.kind === 'edition').every((i) => i.restorable));
  for (const i of trash.list()) trash.restore(i.id);
  assert.equal(catalog.editionsOf(book.id).length, 3);
  library.close();
});

test('a listing cannot come back over a newer one for the same edition and store', () => {
  const { library, catalog, trash, ebook, kdp } = start();
  trash.removeListing(kdp.id);
  catalog.saveListing({ edition_id: ebook.id, store_id: 'store-kdp', status: 'planned' });
  const [item] = trash.list();
  assert.equal(item.restorable, false);
  assert.match(item.why, /listed on Amazon KDP again since/);
  refused(() => trash.restore(item.id), /listed on Amazon KDP again/);
  trash.deleteForever(item.id);
  assert.deepEqual(trash.list(), []);
  library.close();
});

test('a series that has gone since leaves a restored book without one, instead of pointing at nothing', () => {
  const { library, catalog, trash } = start();
  const series = catalog.saveSeries({ name: 'The Tidewater Books' });
  const lone = catalog.saveBook({ title: 'Book Three', series_id: series.id, series_number: '3' });
  trash.removeBook(lone.id);
  library.remove('series', series.id);
  trash.restore(trash.list()[0].id);
  const back = library.get('books', lone.id);
  assert.deepEqual([back.series_id, back.series_number], [null, null]);
  library.close();
});

test('after 30 days it is removed for good, and not a day sooner', () => {
  const { library, catalog, trash, tick } = start();
  const lone = catalog.saveBook({ title: 'Old' });
  trash.removeBook(lone.id);
  tick(KEEP_DAYS - 1);
  assert.equal(trash.purge(), 0);
  assert.equal(trash.list()[0].daysLeft, 1);
  tick(0.5);
  assert.equal(trash.list()[0].daysLeft, 1, 'a part of a day left is still a day');
  tick(1);
  assert.equal(trash.list()[0].daysLeft, 0);
  assert.equal(trash.purge(), 1);
  assert.deepEqual(trash.list(), []);
  assert.ok(library.removals().some((r) => r.record_table === 'trash_items'), 'even that leaves its marker, as everything does');
  library.close();
});

test('deleting one thing for good, and emptying the Trash', () => {
  const { library, catalog, trash } = start();
  const a = catalog.saveBook({ title: 'A' });
  const b = catalog.saveBook({ title: 'B' });
  trash.removeBook(a.id);
  trash.removeBook(b.id);
  const [first] = trash.list();
  trash.deleteForever(first.id);
  assert.equal(trash.list().length, 1);
  refused(() => trash.deleteForever(first.id), /isn't in the Trash any more/);
  refused(() => trash.restore('nope'), /isn't in the Trash any more/);
  assert.equal(trash.empty(), 1);
  assert.deepEqual(trash.list(), []);
  library.close();
});

test('removing and restoring leaves no trace in what the clash checks see', () => {
  const { library, trash, ebook, audio } = start();
  const before = JSON.stringify(findClashes(library, { today: '2026-11-18' }).map((c) => c.key));
  trash.removeEdition(audio.id);
  trash.removeEdition(ebook.id);
  for (const item of trash.list()) trash.restore(item.id);
  assert.equal(JSON.stringify(findClashes(library, { today: '2026-11-18' }).map((c) => c.key)), before);
  library.close();
});

test('the window can remove, list, restore and delete, and gets plain words when it cannot', () => {
  const library = new Library(temp()).open();
  const { call } = createApi(library, { now: () => new Date('2026-11-18T12:00:00Z'), locale: 'en-US' });
  const ok = (name, args) => { const r = call(name, args); assert.equal(r.ok, true, `${name}: ${r.message}`); return r.value; };
  const book = ok('saveBook', { title: 'Tidewater' });
  const edition = ok('saveEdition', { book_id: book.id, format: 'ebook' });
  ok('saveListing', { edition_id: edition.id, store_id: 'store-kdp' });
  assert.equal(call('removeBook', { id: book.id }).ok, false);
  ok('removeEdition', { id: edition.id });
  ok('removeBook', { id: book.id });
  const items = ok('trash');
  assert.deepEqual(items.map((i) => i.kind), ['book', 'edition']);
  assert.equal(call('restoreTrash', { id: items[1].id }).ok, false);
  assert.match(call('restoreTrash', { id: items[1].id }).message, /book is in the Trash too/);
  ok('restoreTrash', { id: items[0].id });
  ok('restoreTrash', { id: items[1].id });
  assert.equal(ok('books')[0].formats[0], 'ebook');
  ok('removeListing', { id: ok('book', { id: book.id }).editions[0].listings[0].id });
  assert.equal(ok('emptyTrash'), 1);
  assert.equal(call('deleteTrash', { id: 'nope' }).ok, false);
  library.close();
});
