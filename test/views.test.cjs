'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Catalog } = require('../src/main/catalog');
const { Library } = require('../src/main/storage/library');
const { audiobookTracker, desk, releaseCalendar, storeGrid } = require('../src/main/views');

const TODAY = '2027-01-10';
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));

function made() {
  const library = new Library(temp()).open();
  const catalog = new Catalog(library);
  const book = catalog.saveBook({ title: 'Book One' });
  const ebook = catalog.saveEdition({ book_id: book.id, format: 'ebook', release_date: '2027-01-20', cover_status: 'final', files_status: 'final' });
  const paperback = catalog.saveEdition({ book_id: book.id, format: 'paperback', release_date: '2027-01-24', cover_status: 'draft' });
  const kdpEbook = catalog.saveListing({ edition_id: ebook.id, store_id: 'store-kdp', status: 'live', program: 'Made-up Select', program_exclusive: true });
  const kobo = catalog.saveListing({ edition_id: ebook.id, store_id: 'store-kobo', status: 'live' });
  catalog.setPrice({ listingId: kdpEbook.id, marketplace: 'US', currency: 'USD', amount: '4.99', fromDate: '2027-01-01' });
  catalog.setPrice({ listingId: kdpEbook.id, marketplace: 'UK', currency: 'GBP', amount: '3.99', fromDate: '2027-01-01' });
  return { library, catalog, book, ebook, paperback, kdpEbook, kobo };
}

test('the store grid has editions down the side, every active store across the top, and gaps left empty', () => {
  const { library, book, ebook, paperback, kdpEbook } = made();
  const grid = storeGrid(library, book.id, { today: TODAY, locale: 'en-US' });
  assert.equal(grid.book.title, 'Book One');
  assert.equal(grid.stores.length, 9);
  assert.deepEqual(grid.stores.slice(0, 3).map((s) => s.name), ['Amazon KDP', 'Barnes & Noble Press', 'ACX'], 'the natural order, not alphabetical by ID');
  assert.deepEqual(grid.rows.map((r) => r.edition.format), ['ebook', 'paperback']);

  const cell = grid.rows[0].cells['store-kdp'];
  assert.equal(cell.length, 1);
  assert.equal(cell[0].id, kdpEbook.id);
  assert.deepEqual(cell[0].prices.map((p) => `${p.marketplace} ${p.shown}`), ['UK £3.99', 'US $4.99']);
  assert.deepEqual(grid.rows[1].cells['store-kdp'], [], 'the paperback is not on KDP yet: a gap');
  assert.equal(grid.rows[0].cells['store-apple-books'].length, 0);
  assert.ok(ebook && paperback);
  library.close();
});

test('the grid shows a clash on the square and the row it belongs to', () => {
  const { library, book, kobo, kdpEbook } = made();
  const grid = storeGrid(library, book.id, { today: TODAY });
  const keys = new Set(grid.clashes.map((c) => c.key));
  const exclusive = grid.clashes.find((c) => c.kind === 'exclusive-program-elsewhere');
  assert.ok(exclusive);
  assert.ok(keys.has(exclusive.key));
  assert.deepEqual(grid.rows[0].cells['store-kobo'][0].clashes, [exclusive.key]);
  assert.deepEqual(grid.rows[0].cells['store-kdp'][0].clashes, [exclusive.key]);
  assert.ok(grid.rows[0].clashes.includes(exclusive.key));
  assert.ok(kobo && kdpEbook);
  library.close();
});

test('a store that is switched off still shows where the book has a listing on it', () => {
  const { library, book } = made();
  library.put('stores', { id: 'store-apple-books', active: 0 });
  library.put('stores', { id: 'store-kobo', active: 0 });
  const names = storeGrid(library, book.id, { today: TODAY }).stores.map((s) => s.name);
  assert.ok(!names.includes('Apple Books'), 'switched off and unused: hidden');
  assert.ok(names.includes('Kobo'), 'switched off but used: still shown, so nothing hides');
  assert.equal(storeGrid(library, 'nope', { today: TODAY }), null);
  library.close();
});

test('a book sold both directly and through a distributor shows both in one square', () => {
  const { library, catalog, book, ebook } = made();
  catalog.saveListing({ edition_id: ebook.id, store_id: 'store-apple-books', route: 'distributor', via_store_id: 'store-draft2digital', status: 'live' });
  catalog.saveListing({ edition_id: ebook.id, store_id: 'store-apple-books', status: 'planned' });
  const cell = storeGrid(library, book.id, { today: TODAY }).rows[0].cells['store-apple-books'];
  assert.deepEqual(cell.map((c) => [c.route, c.via, c.status]).sort(), [['direct', null, 'planned'], ['distributor', 'Draft2Digital', 'live']]);
  library.close();
});

test('the release calendar lists dates soonest first, from the edition and from each store', () => {
  const { library, catalog, paperback } = made();
  catalog.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', release_date: '2027-01-26' });
  catalog.saveEdition({ book_id: paperback.book_id, format: 'hardcover', release_date: '2026-12-01' });
  const upcoming = releaseCalendar(library, { today: TODAY });
  assert.deepEqual(upcoming.map((e) => [e.date, e.format, e.store, e.days_away]), [
    ['2027-01-20', 'ebook', null, 10],
    ['2027-01-24', 'paperback', null, 14],
    ['2027-01-26', 'paperback', 'Amazon KDP', 16],
  ]);
  const all = releaseCalendar(library, { today: TODAY, includePast: true });
  assert.equal(all[0].date, '2026-12-01');
  assert.equal(all[0].days_away, -40);
  library.close();
});

test('the Desk leads with the next release and what is in its way', () => {
  const { library, paperback } = made();
  let home = desk(library, { today: '2027-01-22' });
  assert.equal(home.isEmpty, false);
  assert.equal(home.nextRelease.format, 'paperback', 'the ebook date has passed');
  assert.equal(home.nextRelease.days_away, 2);
  assert.equal(home.nextRelease.blockers.length, 1);
  assert.match(home.nextRelease.blockers[0].title, /without the final cover/);
  assert.equal(home.comingSoon.length, 1);
  assert.ok(home.problems.some((c) => c.kind === 'release-without-final'));
  assert.ok(home.problems.some((c) => c.kind === 'exclusive-program-elsewhere'));
  assert.deepEqual(home.reportsDue, []);

  library.put('editions', { id: paperback.id, cover_status: 'final', files_status: 'final' });
  home = desk(library, { today: '2027-01-22' });
  assert.deepEqual(home.nextRelease.blockers, []);
  library.close();
});

test('the Desk of an empty library says so, instead of showing zeros', () => {
  const library = new Library(temp()).open();
  const home = desk(library, { today: TODAY });
  assert.equal(home.isEmpty, true);
  assert.equal(home.nextRelease, null);
  assert.deepEqual([home.problems, home.toCheck, home.comingSoon], [[], [], []]);
  library.close();
});

function audio() {
  const library = new Library(temp()).open();
  const catalog = new Catalog(library);
  const one = catalog.saveBook({ title: 'Book One' });
  const two = catalog.saveBook({ title: 'Another Book' });
  const oneAudio = catalog.saveEdition({ book_id: one.id, format: 'audiobook' });
  const twoAudio = catalog.saveEdition({ book_id: two.id, format: 'audiobook' });
  catalog.saveEdition({ book_id: one.id, format: 'ebook' });
  return { library, catalog, one, two, oneAudio, twoAudio };
}

test('the audiobook tracker has one row per audiobook, and the audio stores across the top', () => {
  const { library } = audio();
  const tracker = audiobookTracker(library, { today: TODAY });
  assert.deepEqual(tracker.rows.map((r) => r.book.title), ['Another Book', 'Book One'], 'ebooks are not in it');
  assert.deepEqual(tracker.stores.map((s) => s.name), ['ACX', 'Google Play Books']);
  assert.equal(tracker.counts.titles, 2);
  assert.equal(tracker.counts.recordings, 0);
  library.close();
});

test('it shows which recording is live where, with its voice and rights', () => {
  const { library, catalog, oneAudio } = audio();
  const human = catalog.saveRecording({ edition_id: oneAudio.id, voice: 'human', read_by: 'Made-up Narrator', exclusive: true, exclusive_store_id: 'store-acx', exclusive_until: '2030-01-01', royalty_share: true });
  const google = catalog.saveRecording({ edition_id: oneAudio.id, voice: 'synthesized', read_by: 'Auto-narrated' });
  catalog.saveListing({ edition_id: oneAudio.id, store_id: 'store-acx', status: 'live', recording_id: human.id });
  catalog.saveListing({ edition_id: oneAudio.id, store_id: 'store-google-play-books', status: 'live', recording_id: google.id });
  const row = audiobookTracker(library, { today: TODAY }).rows.find((r) => r.book.title === 'Book One');
  const acx = row.cells['store-acx'][0].recording;
  assert.equal(acx.voice, 'human');
  assert.equal(acx.exclusive_store, 'ACX');
  assert.equal(acx.exclusive_until, '2030-01-01');
  assert.equal(acx.royalty_share, true);
  assert.equal(row.cells['store-google-play-books'][0].recording.voice, 'synthesized');
  assert.equal(row.unnamed, 0);
  library.close();
});

test('a recording waiting to be replaced says by what, or that nothing has been made yet', () => {
  const { library, catalog, oneAudio, twoAudio } = audio();
  const auto = catalog.saveRecording({ edition_id: oneAudio.id, voice: 'synthesized', read_by: 'Auto-narrated', replacing: 'waiting' });
  const studio = catalog.saveRecording({ edition_id: oneAudio.id, voice: 'human', read_by: 'Made-up Narrator', finished_on: '2027-01-05' });
  catalog.saveRecording({ id: auto.id, replaced_by_id: studio.id });
  catalog.saveRecording({ edition_id: twoAudio.id, voice: 'synthesized', read_by: 'Auto-narrated', replacing: 'waiting' });
  const tracker = audiobookTracker(library, { today: TODAY });
  const first = tracker.rows.find((r) => r.book.title === 'Book One').recordings.find((r) => r.waiting);
  assert.equal(first.replacement.read_by, 'Made-up Narrator');
  assert.equal(first.replacement.finished_on, '2027-01-05');
  const second = tracker.rows.find((r) => r.book.title === 'Another Book').recordings[0];
  assert.equal(second.waiting, true);
  assert.equal(second.replacement, null);
  assert.equal(tracker.counts.waiting, 2);
  assert.equal(tracker.counts.waitingWithReplacement, 1);
  assert.equal(tracker.counts.synthesized, 2);
  library.close();
});

test('a store with an audiobook listing appears as a column, and a live listing with no recording named is counted', () => {
  const { library, catalog, oneAudio } = audio();
  catalog.saveListing({ edition_id: oneAudio.id, store_id: 'store-kobo', status: 'live' });
  const tracker = audiobookTracker(library, { today: TODAY });
  assert.ok(tracker.stores.some((s) => s.id === 'store-kobo'));
  assert.equal(tracker.counts.unnamed, 1);
  assert.equal(tracker.rows.find((r) => r.book.title === 'Book One').cells['store-kobo'][0].recording, null);
  library.close();
});

test('a clash on a recording shows on the square where it is listed', () => {
  const { library, catalog, oneAudio } = audio();
  const exclusive = catalog.saveRecording({ edition_id: oneAudio.id, voice: 'human', read_by: 'Made-up Narrator', exclusive: true, exclusive_store_id: 'store-acx' });
  catalog.saveListing({ edition_id: oneAudio.id, store_id: 'store-google-play-books', status: 'live', recording_id: exclusive.id });
  const row = audiobookTracker(library, { today: TODAY }).rows.find((r) => r.book.title === 'Book One');
  assert.equal(row.cells['store-google-play-books'][0].clashes.length, 1);
  library.close();
});
