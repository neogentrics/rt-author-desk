'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Catalog, CatalogError } = require('../src/main/catalog');
const { migrate, openDatabase } = require('../src/main/storage/database');
const { Library } = require('../src/main/storage/library');
const { STEPS } = require('../src/main/storage/schema');
const { toDecimalString } = require('../src/shared/money');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const refused = (fn, pattern) => assert.throws(fn, (error) => error instanceof CatalogError && pattern.test(error.message), String(pattern));

// A made-up book with a paperback, an ebook and an audiobook.
function shelf() {
  const library = new Library(temp()).open();
  const catalog = new Catalog(library);
  const book = catalog.saveBook({ title: 'Book One' });
  const paperback = catalog.saveEdition({ book_id: book.id, format: 'paperback' });
  const ebook = catalog.saveEdition({ book_id: book.id, format: 'ebook' });
  const audio = catalog.saveEdition({ book_id: book.id, format: 'audiobook' });
  return { library, catalog, book, paperback, ebook, audio };
}

test('a library from step 2 moves forward to step 3 and keeps its stores and books', () => {
  const file = path.join(temp(), 'old.db');
  const key = crypto.randomBytes(32);
  let db = openDatabase(file, key);
  migrate(db, file, { steps: STEPS.filter((s) => s.version <= 2) });
  db.prepare("INSERT INTO books (id, title, created_at, updated_at, device_id) VALUES ('b1', 'Made-up', '2026-01-01', '2026-01-01', 'd')").run();
  db.close();
  db = openDatabase(file, key);
  migrate(db, file, { steps: STEPS });
  assert.equal(db.prepare('SELECT count(*) AS n FROM stores').get().n, 9);
  assert.equal(db.prepare('SELECT title FROM books').get().title, 'Made-up');
  assert.equal(db.prepare('SELECT count(*) AS n FROM listings').get().n, 0);
  db.close();
});

test('a listing is one edition on one store, and the same pair can exist once per route', () => {
  const { library, catalog, paperback } = shelf();
  const direct = catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', store_item_id: 'B000TEST01', status: 'live' });
  assert.equal(direct.route, 'direct');
  refused(() => catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp' }), /already listed on Amazon KDP/);
  refused(() => catalog.saveListing({ edition_id: paperback.id }), /edition on a store/);
  refused(() => catalog.saveListing({ edition_id: 'nope', store_id: 'store-kdp' }), /That edition/);
  refused(() => catalog.saveListing({ edition_id: paperback.id, store_id: 'store-nope' }), /That store/);

  // The same paperback reaches Kobo through a distributor and also directly: both are real, so both are allowed.
  catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kobo', route: 'distributor', via_store_id: 'store-draft2digital' });
  catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kobo' });
  refused(
    () => catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kobo', route: 'distributor', via_store_id: 'store-ingramspark' }),
    /already listed on Kobo through a distributor/,
  );
  assert.equal(catalog.listingsOf(paperback.id).length, 3);
  library.close();
});

test('the route and the distributor have to agree', () => {
  const { library, catalog, paperback } = shelf();
  refused(() => catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kobo', route: 'distributor' }), /has to say which one/);
  refused(() => catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kobo', via_store_id: 'store-draft2digital' }), /no distributor/);
  refused(
    () => catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kobo', route: 'distributor', via_store_id: 'store-kobo' }),
    /own distributor/,
  );
  library.close();
});

test('a listing checks its link, its dates, and the ISBN and recording it points at', () => {
  const { library, catalog, book, paperback, ebook, audio } = shelf();
  refused(() => catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', url: 'javascript:alert(1)' }), /https:\/\//);
  refused(() => catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', url: 'http://example.com/x' }), /https:\/\//);
  refused(() => catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', release_date: '2027-02-31' }), /not a real date for the release date/);
  refused(
    () => catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', program_from: '2027-06-01', program_until: '2027-03-01' }),
    /ends before it starts/,
  );

  const isbn = catalog.addIsbn({ number: '9780306406157', editionId: paperback.id });
  const other = catalog.addIsbn({ number: '9780804429573', editionId: ebook.id });
  const spare = catalog.addIsbn({ number: '9781861972712' });
  refused(() => catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', isbn_id: other.id }), /on Book One: ebook, not on this one/);
  refused(() => catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', isbn_id: spare.id }), /not on any edition/);
  const ok = catalog.saveListing({
    edition_id: paperback.id, store_id: 'store-kdp', isbn_id: isbn.id, url: 'https://example.com/book-one', release_date: '2027-03-14',
  });
  assert.equal(ok.isbn_id, isbn.id);

  const recording = catalog.saveRecording({ edition_id: audio.id, read_by: 'A Made-up Narrator' });
  refused(() => catalog.saveListing({ edition_id: paperback.id, store_id: 'store-acx', recording_id: recording.id }), /different edition/);
  const acx = catalog.saveListing({ edition_id: audio.id, store_id: 'store-acx', recording_id: recording.id });
  assert.equal(acx.recording_id, recording.id);
  assert.ok(book);
  library.close();
});

test('a recording belongs to an audiobook, and an exclusive deal names its store', () => {
  const { library, catalog, paperback, audio } = shelf();
  refused(() => catalog.saveRecording({ edition_id: paperback.id }), /Only an audiobook/);
  refused(() => catalog.saveRecording({}), /belongs to an audiobook edition/);
  refused(() => catalog.saveRecording({ edition_id: audio.id, exclusive: true }), /which store/);
  refused(() => catalog.saveRecording({ edition_id: audio.id, exclusive: true, exclusive_store_id: 'store-nope' }), /That store/);
  refused(() => catalog.saveRecording({ edition_id: audio.id, exclusive_until: '2027-13-01' }), /not a real date/);
  refused(() => catalog.saveRecording({ edition_id: audio.id, length_minutes: 0 }), /whole number of minutes/);

  const deal = catalog.saveRecording({
    edition_id: audio.id, voice: 'human', read_by: 'A Made-up Narrator', exclusive: true, exclusive_store_id: 'store-acx',
    exclusive_until: '2033-06-30', royalty_share: true,
  });
  assert.deepEqual([deal.exclusive, deal.royalty_share, deal.replacing], [1, 1, 'keep']);
  // Taking the exclusivity off later is checked against what is already there.
  refused(() => catalog.saveRecording({ id: deal.id, exclusive_store_id: null }), /which store/);
  assert.equal(catalog.saveRecording({ id: deal.id, exclusive: false, exclusive_store_id: null }).exclusive, 0);
  library.close();
});

test('a synthesized recording can wait to be replaced, and only by a recording of the same audiobook', () => {
  const { library, catalog, ebook, audio } = shelf();
  const generic = catalog.saveRecording({ edition_id: audio.id, voice: 'synthesized', read_by: "A store's auto-narration", replacing: 'waiting' });
  const mine = catalog.saveRecording({ edition_id: audio.id, voice: 'synthesized', read_by: 'A studio voice', studio_project: 'made-up-project' });
  refused(() => catalog.saveRecording({ id: generic.id, replaced_by_id: 'nope' }), /replaces this one/);
  refused(() => catalog.saveRecording({ id: generic.id, replaced_by_id: generic.id }), /can't replace itself/);
  const swapped = catalog.saveRecording({ id: generic.id, replaced_by_id: mine.id, replaced_on: '2027-02-01', replacing: 'keep' });
  assert.equal(swapped.replaced_by_id, mine.id);
  // The old recording stays on record after the swap, so sales can be tied to the voice that made them.
  assert.equal(catalog.recordingsOf(audio.id).length, 2);
  assert.ok(ebook);
  library.close();
});

test('prices are exact, dated, and old ones are kept', () => {
  const { library, catalog, paperback } = shelf();
  const listing = catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp' });
  const set = (marketplace, currency, amount, fromDate) => catalog.setPrice({ listingId: listing.id, marketplace, currency, amount, fromDate });

  set('US', 'USD', '12.99', '2027-01-01');
  set('UK', 'GBP', '9.99', '2027-01-01');
  set('JP', 'JPY', '1500', '2027-01-01');
  set('US', 'USD', '14.99', '2027-06-01');

  const stored = library.db.prepare("SELECT amount FROM prices WHERE marketplace = 'US' ORDER BY from_date").all().map((r) => r.amount);
  assert.deepEqual(stored, ['1299', '1499'], 'kept as whole cents, as text');
  const jp = library.db.prepare("SELECT amount FROM prices WHERE marketplace = 'JP'").get();
  assert.equal(jp.amount, '1500', 'a currency with no smaller unit is not multiplied by 100');

  const spring = catalog.pricesOn(listing.id, '2027-03-01');
  assert.deepEqual(spring.map((p) => `${p.marketplace} ${toDecimalString(p.money)} ${p.currency}`), ['JP 1500 JPY', 'UK 9.99 GBP', 'US 12.99 USD']);
  const summer = catalog.pricesOn(listing.id, '2027-07-01');
  assert.equal(toDecimalString(summer.find((p) => p.marketplace === 'US').money), '14.99');
  assert.deepEqual(catalog.pricesOn(listing.id, '2026-12-31'), [], 'nothing was priced yet');
  assert.equal(catalog.priceHistory(listing.id, 'US').length, 2);
  library.close();
});

test('setting a price again for the same day corrects it instead of adding another', () => {
  const { library, catalog, paperback } = shelf();
  const listing = catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp' });
  const first = catalog.setPrice({ listingId: listing.id, marketplace: 'US', currency: 'USD', amount: '12.99', fromDate: '2027-01-01' });
  const fixed = catalog.setPrice({ listingId: listing.id, marketplace: 'US', currency: 'USD', amount: '13.99', fromDate: '2027-01-01' });
  assert.equal(fixed.id, first.id);
  assert.equal(catalog.priceHistory(listing.id, 'US').length, 1);
  assert.equal(fixed.amount, '1399');
  library.close();
});

test('a price that is not a price is refused, and a free price is allowed', () => {
  const { library, catalog, paperback } = shelf();
  const listing = catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp' });
  const base = { listingId: listing.id, marketplace: 'US', currency: 'USD', fromDate: '2027-01-01' };
  refused(() => catalog.setPrice({ ...base, amount: 'twelve' }), /"twelve" isn't a price\. Write it as.*12\.99/);
  refused(() => catalog.setPrice({ ...base, amount: '-1.00' }), /below zero/);
  refused(() => catalog.setPrice({ ...base, currency: 'XYZ', amount: '1' }), /XYZ isn't a currency.*three-letter code/);
  refused(() => catalog.setPrice({ ...base, currency: '', amount: '1' }), /No currency isn't a currency/);
  refused(() => catalog.setPrice({ ...base, amount: '1', marketplace: '  ' }), /Which marketplace/);
  refused(() => catalog.setPrice({ ...base, amount: '1', fromDate: undefined }), /needs the date/);
  refused(() => catalog.setPrice({ ...base, amount: '1', fromDate: '2027-02-30' }), /not a real date/);
  refused(() => catalog.setPrice({ ...base, listingId: 'nope', amount: '1' }), /That listing/);
  assert.equal(catalog.setPrice({ ...base, amount: '0' }).amount, '0');
  // Extra digits are rounded once, to the smallest unit, and never again.
  assert.equal(catalog.setPrice({ ...base, marketplace: 'UK', currency: 'GBP', amount: '9.995' }).amount, '1000');
  library.close();
});

test('removing a listing takes its prices with it', () => {
  const { library, catalog, paperback } = shelf();
  const listing = catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp' });
  catalog.setPrice({ listingId: listing.id, marketplace: 'US', currency: 'USD', amount: '12.99', fromDate: '2027-01-01' });
  catalog.removeListing(listing.id);
  assert.equal(library.list('prices').length, 0);
  assert.equal(library.list('listings').length, 0);
  assert.equal(library.removals().length, 2, 'both removals leave a marker');
  library.close();
});
