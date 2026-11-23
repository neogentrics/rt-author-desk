'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Catalog } = require('../src/main/catalog');
const { ClashError, dismissClash, findClashes, restoreClash } = require('../src/main/clashes');
const { migrate, openDatabase } = require('../src/main/storage/database');
const { Library } = require('../src/main/storage/library');
const { STEPS } = require('../src/main/storage/schema');

const TODAY = '2027-01-10';
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const ISBN_A = '9780306406157';
const ISBN_B = '9780804429573';

function shelf() {
  const library = new Library(temp()).open();
  const catalog = new Catalog(library);
  const book = catalog.saveBook({ title: 'Book One' });
  const edition = (format, fields = {}) => catalog.saveEdition({ book_id: book.id, format, ...fields });
  return { library, catalog, book, edition };
}
const kinds = (library, options = {}) => findClashes(library, { today: TODAY, ...options }).map((c) => c.kind);

test('a library from step 3 moves forward to step 4', () => {
  const file = path.join(temp(), 'old.db');
  const key = crypto.randomBytes(32);
  let db = openDatabase(file, key);
  migrate(db, file, { steps: STEPS.filter((s) => s.version <= 3) });
  db.close();
  db = openDatabase(file, key);
  migrate(db, file, { steps: STEPS });
  assert.equal(db.prepare('SELECT count(*) AS n FROM dismissed_clashes').get().n, 0);
  db.close();
});

test('a tidy catalog has no clashes', () => {
  const { library, catalog, edition } = shelf();
  const paperback = edition('paperback', { cover_status: 'final', files_status: 'final', release_date: '2027-06-01' });
  const isbn = catalog.addIsbn({ number: ISBN_A, editionId: paperback.id });
  catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', status: 'live', isbn_id: isbn.id, publisher_shown: 'Made-up Press' });
  catalog.saveListing({ edition_id: paperback.id, store_id: 'store-ingramspark', status: 'live', isbn_id: isbn.id, publisher_shown: 'made-up  press' });
  assert.deepEqual(kinds(library), []);
  library.close();
});

test('an ebook in an exclusive program that is also on sale elsewhere', () => {
  const { library, catalog, edition } = shelf();
  const ebook = edition('ebook');
  const kdp = catalog.saveListing({
    edition_id: ebook.id, store_id: 'store-kdp', status: 'live', program: 'Made-up Select', program_exclusive: true, program_until: '2027-04-01',
  });
  assert.deepEqual(kinds(library), [], 'alone on its own store is fine');
  const kobo = catalog.saveListing({ edition_id: ebook.id, store_id: 'store-kobo', status: 'live' });
  const [clash] = findClashes(library, { today: TODAY });
  assert.equal(clash.kind, 'exclusive-program-elsewhere');
  assert.equal(clash.severity, 'problem');
  assert.match(clash.detail, /exclusive until 2027-04-01.*also on Kobo/);
  assert.deepEqual(clash.subjects.map((s) => s.id).sort(), [kdp.id, kobo.id].sort());

  // After the program ends it is no longer a clash. A planned listing elsewhere isn't on sale, so it isn't one either.
  assert.deepEqual(findClashes(library, { today: '2027-04-02' }), []);
  catalog.saveListing({ id: kobo.id, status: 'planned' });
  assert.deepEqual(kinds(library), []);
  library.close();
});

test("a store's free ISBN used on another store, or the only ISBN a print edition has", () => {
  const { library, catalog, edition } = shelf();
  const paperback = edition('paperback');
  const free = catalog.addIsbn({ number: ISBN_A, issuer: 'store', storeId: 'store-kdp', editionId: paperback.id });
  catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', status: 'live', isbn_id: free.id });
  assert.deepEqual(kinds(library), [], 'on the store that gave it is fine');

  const ingram = catalog.saveListing({ edition_id: paperback.id, store_id: 'store-ingramspark', status: 'live' });
  let [clash] = findClashes(library, { today: TODAY });
  assert.equal(clash.kind, 'free-isbn-elsewhere');
  assert.match(clash.title, /IngramSpark has only Amazon KDP's free ISBN/);

  catalog.saveListing({ id: ingram.id, isbn_id: free.id });
  [clash] = findClashes(library, { today: TODAY });
  assert.match(clash.title, /uses Amazon KDP's free ISBN on IngramSpark/);

  // The fix: an ISBN you own, picked on that listing.
  const own = catalog.addIsbn({ number: ISBN_B, editionId: paperback.id });
  catalog.saveListing({ id: ingram.id, isbn_id: own.id });
  assert.deepEqual(kinds(library), []);
  library.close();
});

test('an ebook with a store ISBN on another store is not a clash, because ebooks need no ISBN', () => {
  const { library, catalog, edition } = shelf();
  const ebook = edition('ebook');
  catalog.addIsbn({ number: ISBN_A, issuer: 'store', storeId: 'store-kdp', editionId: ebook.id });
  catalog.saveListing({ edition_id: ebook.id, store_id: 'store-kobo', status: 'live' });
  assert.deepEqual(kinds(library), []);
  library.close();
});

test('an ISBN that fails its check digit', () => {
  const { library, catalog, edition } = shelf();
  const paperback = edition('paperback');
  const bad = catalog.addIsbn({ number: '9780306406158', allowInvalid: true, editionId: paperback.id });
  const [clash] = findClashes(library, { today: TODAY });
  assert.equal(clash.kind, 'isbn-check-digit');
  assert.match(clash.detail, /should be 7/);
  assert.equal(clash.edition_id, paperback.id);
  assert.ok(clash.book_id);
  catalog.library.put('isbns', { id: bad.id, isbn: ISBN_A });
  assert.deepEqual(kinds(library), []);
  library.close();
});

test('a recording tied to an exclusive deal that is listed on another store', () => {
  const { library, catalog, edition } = shelf();
  const audio = edition('audiobook');
  const recording = catalog.saveRecording({
    edition_id: audio.id, read_by: 'A Made-up Narrator', exclusive: true, exclusive_store_id: 'store-acx', exclusive_until: '2027-12-31', royalty_share: true,
  });
  catalog.saveListing({ edition_id: audio.id, store_id: 'store-acx', status: 'live', recording_id: recording.id });
  assert.deepEqual(kinds(library), []);
  const google = catalog.saveListing({ edition_id: audio.id, store_id: 'store-google-play-books', status: 'live', recording_id: recording.id });
  const [clash] = findClashes(library, { today: TODAY });
  assert.equal(clash.kind, 'exclusive-recording-elsewhere');
  assert.match(clash.detail, /exclusive to ACX until 2027-12-31.*Royalty Share/);
  assert.match(clash.title, /listed on Google Play Books/);
  assert.deepEqual(findClashes(library, { today: '2028-01-01' }), [], 'the deal has ended');
  catalog.saveListing({ id: google.id, status: 'pulled' });
  assert.deepEqual(kinds(library), [], 'pulled from the other store');
  library.close();
});

test('a cloned voice without a permission on record', () => {
  const { library, catalog, edition } = shelf();
  const audio = edition('audiobook');
  const recording = catalog.saveRecording({ edition_id: audio.id, voice: 'cloned', read_by: 'A cloned voice' });
  assert.deepEqual(kinds(library), ['cloned-voice-permission'], 'a problem even before it is on sale');
  catalog.saveRecording({ id: recording.id, permission_note: '   ' });
  assert.deepEqual(kinds(library), ['cloned-voice-permission'], 'blank spaces are not a permission');
  catalog.saveRecording({ id: recording.id, permission_note: 'Written permission from the voice owner, filed 2026-12-01' });
  assert.deepEqual(kinds(library), []);
  library.close();
});

test('a recording marked human that looks synthesized, only once it is on sale', () => {
  const { library, catalog, edition } = shelf();
  const audio = edition('audiobook');
  const recording = catalog.saveRecording({ edition_id: audio.id, voice: 'human', read_by: 'Auto-narration by the store' });
  assert.deepEqual(kinds(library), [], 'not on sale yet');
  const listing = catalog.saveListing({ edition_id: audio.id, store_id: 'store-google-play-books', status: 'live', recording_id: recording.id });
  const [clash] = findClashes(library, { today: TODAY });
  assert.equal(clash.kind, 'voice-label');
  assert.equal(clash.severity, 'check');
  catalog.saveRecording({ id: recording.id, voice: 'synthesized' });
  assert.deepEqual(kinds(library), []);
  // A studio project means it was made, not read.
  catalog.saveRecording({ id: recording.id, voice: 'human', read_by: 'A Made-up Narrator', studio_project: 'made-up-project' });
  assert.deepEqual(kinds(library), ['voice-label']);
  catalog.saveRecording({ id: recording.id, studio_project: '' });
  assert.deepEqual(kinds(library), []);
  assert.ok(listing);
  library.close();
});

test('the publisher name differs between stores, or from your records', () => {
  const { library, catalog, edition } = shelf();
  const press = library.put('publisher_names', { name: 'Made-up Press' });
  const paperback = edition('paperback');
  const a = catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', status: 'live', publisher_shown: 'Made-up Press' });
  const b = catalog.saveListing({ edition_id: paperback.id, store_id: 'store-ingramspark', status: 'live', publisher_shown: 'Madeup Publishing' });
  let [clash] = findClashes(library, { today: TODAY });
  assert.equal(clash.kind, 'publisher-differs');
  assert.match(clash.title, /different publishers on different stores/);

  catalog.saveEdition({ id: paperback.id, publisher_name_id: press.id });
  [clash] = findClashes(library, { today: TODAY });
  assert.match(clash.title, /different publisher than your records/);
  assert.match(clash.detail, /IngramSpark shows "Madeup Publishing".*Made-up Press/);
  assert.deepEqual(clash.subjects.map((s) => s.id), [b.id]);

  catalog.saveListing({ id: b.id, publisher_shown: 'MADE-UP PRESS' });
  assert.deepEqual(kinds(library), []);
  assert.ok(a);
  library.close();
});

test('two series spelled almost the same', () => {
  const { library } = shelf();
  library.put('series', { name: 'The Made-up Saga' });
  assert.deepEqual(kinds(library), []);
  library.put('series', { name: 'the made up  saga' });
  library.put('series', { name: 'A Different Series' });
  assert.deepEqual(kinds(library), ['series-near-duplicate']);
  library.close();
});

test('a release date with no final cover or files, and how soon matters', () => {
  const { library, catalog, edition } = shelf();
  const paperback = edition('paperback', { release_date: '2027-01-25', cover_status: 'draft', files_status: 'final' });
  let [clash] = findClashes(library, { today: TODAY });
  assert.equal(clash.kind, 'release-without-final');
  assert.equal(clash.severity, 'problem', 'fifteen days away');
  assert.match(clash.title, /without the final cover$/);
  assert.match(clash.detail, /15 days away/);

  catalog.saveEdition({ id: paperback.id, release_date: '2027-06-01' });
  [clash] = findClashes(library, { today: TODAY });
  assert.equal(clash.severity, 'check', 'months away');

  // A date on a listing counts too, and a past date on a book that's long been out does not.
  catalog.saveEdition({ id: paperback.id, release_date: '2020-01-01', cover_status: 'final' });
  assert.deepEqual(kinds(library), [], 'files are final, and the date is long past');
  catalog.saveEdition({ id: paperback.id, files_status: 'draft' });
  catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', release_date: '2027-01-10' });
  [clash] = findClashes(library, { today: TODAY });
  assert.match(clash.detail, /That is today/);
  assert.match(clash.title, /without the final files/);

  catalog.saveEdition({ id: paperback.id, files_status: 'final' });
  assert.deepEqual(kinds(library), []);
  library.close();
});

test('problems come before things to check', () => {
  const { library, catalog, edition } = shelf();
  library.put('series', { name: 'Saga' });
  library.put('series', { name: 'saga' });
  const audio = edition('audiobook');
  catalog.saveRecording({ edition_id: audio.id, voice: 'cloned' });
  assert.deepEqual(kinds(library), ['cloned-voice-permission', 'series-near-duplicate']);
  library.close();
});

test('a clash can be dismissed with a reason, brought back, and stays dismissed until its facts change', () => {
  const { library, catalog, edition } = shelf();
  const audio = edition('audiobook');
  const recording = catalog.saveRecording({ edition_id: audio.id, voice: 'cloned' });
  const [clash] = findClashes(library, { today: TODAY });

  assert.throws(() => dismissClash(library, clash.key, '  '), ClashError);
  dismissClash(library, clash.key, 'Permission is on paper in the filing cabinet.');
  assert.deepEqual(findClashes(library, { today: TODAY }), []);
  const [kept] = findClashes(library, { today: TODAY, includeDismissed: true });
  assert.equal(kept.dismissed.reason, 'Permission is on paper in the filing cabinet.');

  dismissClash(library, clash.key, 'Changed my mind about the reason.');
  assert.equal(library.list('dismissed_clashes').length, 1, 'one dismissal per clash');
  assert.equal(restoreClash(library, clash.key), true);
  assert.equal(restoreClash(library, clash.key), false);
  assert.deepEqual(kinds(library), ['cloned-voice-permission']);

  // A different problem on another record has its own key and isn't hidden by the first dismissal.
  dismissClash(library, clash.key, 'Fine.');
  const second = catalog.saveRecording({ edition_id: audio.id, voice: 'cloned', read_by: 'Another' });
  assert.deepEqual(findClashes(library, { today: TODAY }).map((c) => c.subjects[0].id), [second.id]);
  library.close();
});

// ---- A price a little under a royalty line --------------------------------------------------------------------------------

const lineClashes = (library) => findClashes(library, { today: TODAY, locale: 'en-US' }).filter((c) => c.kind === 'price-under-line');

test('a paperback priced a cent under the line where KDP\'s rate goes from 50% to 60% is pointed out, with what stepping over earns', () => {
  const { library, catalog, edition } = shelf();
  const paperback = edition('paperback');
  const kdp = catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', status: 'live' });
  catalog.setPrice({ listingId: kdp.id, marketplace: 'Amazon.com', currency: 'USD', amount: '9.98', fromDate: '2027-01-01' });
  const [clash] = lineClashes(library);
  assert.equal(lineClashes(library).length, 1);
  assert.equal(clash.severity, 'check', 'worth a look, not a fault: the price may be on purpose');
  assert.equal(clash.title, 'Book One: paperback is priced just under a royalty line on Amazon.com');
  // 0.60 x 9.99 = 5.994 and 0.50 x 9.98 = 4.99: stepping over the line earns 1.004 more on each copy, which is about $1.00
  assert.match(clash.detail, /At \$9\.98, Amazon KDP pays 50% \(list price \$9\.98 or less\)\. From \$9\.99 it pays 60% \(list price \$9\.99 or more\), which earns about \$1\.00 more on each copy/);
  assert.match(clash.action, /raise it to \$9\.99/);
  assert.deepEqual(clash.subjects, [{ table: 'listings', id: kdp.id }]);
  assert.equal(clash.book_id, paperback.book_id, 'it shows on the book it is about');
  library.close();
});

test('a price on the right side of the line, or well under it, or for something with no rate card, says nothing', () => {
  const { library, catalog, edition } = shelf();
  const paperback = edition('paperback');
  const kdp = catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', status: 'live' });
  const price = (amount, marketplace = 'Amazon.com', currency = 'USD', fromDate = '2027-01-01') => catalog.setPrice({ listingId: kdp.id, marketplace, currency, amount, fromDate });
  price('9.99');
  assert.equal(lineClashes(library).length, 0, 'at the line is on the line');
  price('14.99', 'Amazon.com', 'USD', '2027-01-05');
  assert.equal(lineClashes(library).length, 0);
  price('8.98', 'Amazon.com', 'USD', '2027-01-06');
  assert.equal(lineClashes(library).length, 0, 'more than a dollar under the line is not "just under"');
  price('8.99', 'Amazon.com', 'USD', '2027-01-07');
  assert.equal(lineClashes(library).length, 1, 'a dollar under is');
  price('9.98', 'Amazon.co.uk', 'GBP', '2027-01-08');
  assert.equal(lineClashes(library).length, 1, 'a price in a currency the store has no card for says nothing');
  // a price that starts in the future is not the price today
  price('9.98', 'Amazon.com', 'USD', '2027-03-01');
  assert.equal(lineClashes(library).length, 1);
  library.close();
});

test('a pulled listing is left alone, an ebook\'s rates that depend on the file are not guessed, and a price that changes makes a new clash', () => {
  const { library, catalog, edition } = shelf();
  const paperback = edition('paperback');
  const kdp = catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', status: 'planned' });
  catalog.setPrice({ listingId: kdp.id, marketplace: 'Amazon.com', currency: 'USD', amount: '9.98', fromDate: '2027-01-01' });
  const before = lineClashes(library);
  assert.equal(before.length, 1, 'a planned listing is worth fixing before it goes live');
  catalog.setPrice({ listingId: kdp.id, marketplace: 'Amazon.com', currency: 'USD', amount: '9.50', fromDate: '2027-01-05' });
  const after = lineClashes(library);
  assert.equal(after.length, 1);
  assert.notEqual(after[0].key, before[0].key, 'the new price is a new question, so an old dismissal does not hide it');
  dismissClash(library, after[0].key, 'On purpose: the book is a promotion.');
  assert.equal(lineClashes(library).length, 0, 'and it can be dismissed with a reason, like the others');

  catalog.saveListing({ id: kdp.id, status: 'pulled' });
  catalog.setPrice({ listingId: kdp.id, marketplace: 'Amazon.com', currency: 'USD', amount: '9.40', fromDate: '2027-01-06' });
  restoreClash(library, after[0].key);
  assert.equal(lineClashes(library).length, 0, 'a pulled listing has no price to fix');

  const ebook = edition('ebook');
  const listing = catalog.saveListing({ edition_id: ebook.id, store_id: 'store-kdp', status: 'live' });
  catalog.setPrice({ listingId: listing.id, marketplace: 'Amazon.com', currency: 'USD', amount: '2.89', fromDate: '2027-01-01' });
  assert.equal(lineClashes(library).length, 0, 'the 70% and 35% options take off different things, and the 35% one depends on the file size');
  library.close();
});

test('a card of your own that has a line is used, so a contract rate is checked too', () => {
  const { library, catalog, edition } = shelf();
  const { Calculator } = require('../src/main/calculator');
  new Calculator(library, { now: () => new Date(`${TODAY}T12:00:00`) }).saveOwnCard({
    name: 'My print deal', store_id: 'store-kdp', format: 'paperback', channel: 'Amazon.com', currency: 'USD',
    options: [{ name: '55% under $15', rate: '0.55', price_min: '0.01', price_max: '14.99', deduct: ['printing'] }, { name: '65% from $15', rate: '0.65', price_min: '15.00', deduct: ['printing'] }],
  });
  const paperback = edition('paperback');
  const kdp = catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', status: 'live' });
  catalog.setPrice({ listingId: kdp.id, marketplace: 'Amazon.com', currency: 'USD', amount: '14.99', fromDate: '2027-01-01' });
  const [clash] = lineClashes(library);
  assert.match(clash.detail, /From \$15\.00 it pays 65% from \$15/);
  library.close();
});
