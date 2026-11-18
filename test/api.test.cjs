'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApi } = require('../src/main/api');
const { Library } = require('../src/main/storage/library');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const NOW = new Date(2027, 0, 10, 12, 0, 0); // 10 January 2027, local time

function start() {
  const library = new Library(temp()).open();
  const { call, names } = createApi(library, { now: () => NOW, locale: 'en-US' });
  const ok = (name, args) => {
    const result = call(name, args);
    assert.equal(result.ok, true, `${name}: ${result.message}`);
    return result.value;
  };
  return { library, call, ok, names };
}

test('only the listed calls work, and nothing else can be reached by name', () => {
  const { library, call } = start();
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'library', '', null, 42, undefined, 'removeAll']) {
    const result = call(name);
    assert.equal(result.ok, false, String(name));
    assert.match(result.message, /does not do/);
  }
  library.close();
});

test('a mistake comes back in plain words, and an unexpected failure shows no internals', () => {
  const { library, call } = start();
  assert.deepEqual(call('saveBook', { title: ' ' }), { ok: false, message: 'A book needs a title.' });
  assert.match(call('setPrice', { listingId: 'x' }).message, /isn't in your library/);

  library.db.close();
  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    const result = call('books');
    assert.deepEqual(result, { ok: false, message: 'Something went wrong, and nothing was changed.' });
    assert.equal(logged.length, 1, 'the real cause goes to the log');
  } finally {
    console.error = original;
  }
  library.db = null;
});

test('a whole book can be built and read back through the API alone, as the screens will do it', () => {
  const { library, ok } = start();
  const series = ok('saveSeries', { name: 'The Made-up Saga' });
  const pen = ok('savePenName', { name: 'A. Writer' });
  const book = ok('saveBook', { title: 'Book One', series_id: series.id, series_number: '1', pen_name_id: pen.id });
  const ebook = ok('saveEdition', { book_id: book.id, format: 'ebook', release_date: '2027-02-01' });
  const paper = ok('saveEdition', { book_id: book.id, format: 'paperback', page_count: 300 });
  const isbn = ok('addIsbn', { number: '978-0-306-40615-7', editionId: paper.id });
  const listing = ok('saveListing', { edition_id: ebook.id, store_id: 'store-kdp', status: 'live', url: 'https://example.com/b' });
  ok('setPrice', { listingId: listing.id, marketplace: 'US', currency: 'USD', amount: '4.99', fromDate: '2027-01-01' });

  const page = ok('book', { id: book.id });
  assert.equal(page.series_name, 'The Made-up Saga');
  assert.equal(page.pen_name, 'A. Writer');
  assert.deepEqual(page.editions.map((e) => e.format), ['ebook', 'paperback']);
  assert.equal(page.editions[1].isbns[0].shown, '978-030640615-7');
  assert.equal(page.editions[0].listings[0].store_name, 'Amazon KDP');
  assert.deepEqual(page.editions[0].listings[0].prices.map((p) => [p.shown, p.amount]), [['$4.99', '4.99']]);
  assert.equal(page.grid.rows[0].cells['store-kdp'][0].prices[0].shown, '$4.99');

  const list = ok('books');
  assert.deepEqual(list.map((b) => [b.title, b.series_name, b.pen_name, b.formats]), [['Book One', 'The Made-up Saga', 'A. Writer', ['ebook', 'paperback']]]);
  assert.equal(ok('isbnRegister')[0].edition, 'Book One: paperback');
  assert.ok(isbn);
  library.close();
});

test('the Desk, the calendar and the clashes use the app clock, not the computer\'s at the moment of the call', () => {
  const { library, call, ok } = start();
  const book = ok('saveBook', { title: 'Book One' });
  ok('saveEdition', { book_id: book.id, format: 'paperback', release_date: '2027-01-20' });
  const home = ok('desk');
  assert.equal(home.today, '2027-01-10');
  assert.equal(home.nextRelease.days_away, 10);
  assert.equal(ok('calendar').length, 1);
  assert.equal(ok('clashes').length, 1);

  const [clash] = ok('clashes');
  assert.match(call('dismissClash', { key: clash.key, reason: '' }).message, /Say why/);
  assert.equal(ok('dismissClash', { key: clash.key, reason: 'Cover arrives Friday.' }), true);
  assert.equal(ok('clashes').length, 0);
  assert.equal(ok('clashes', { includeDismissed: true })[0].dismissed.reason, 'Cover arrives Friday.');
  assert.equal(ok('restoreClash', { key: clash.key }), true);
  assert.equal(ok('clashes').length, 1);
  library.close();
});

test('names and stores: your own store beside the built-in ones, and a used store can only be switched off', () => {
  const { library, call, ok } = start();
  assert.equal(ok('names').stores.length, 9);
  assert.match(call('saveStore', { name: '' }).message, /needs a name/);
  assert.match(call('saveStore', { name: 'Odd', kind: 'bazaar' }).message, /store, a distributor or an audio store/);
  const mine = ok('saveStore', { name: 'My Own Shop' });
  assert.equal(ok('names').stores.length, 10);
  const book = ok('saveBook', { title: 'Book One' });
  const edition = ok('saveEdition', { book_id: book.id, format: 'ebook' });
  ok('saveListing', { edition_id: edition.id, store_id: mine.id });
  assert.match(call('removeStore', { id: mine.id }).message, /Switch it off instead/);
  assert.equal(ok('saveStore', { id: mine.id, active: false }).active, 0);
  assert.match(call('removeStore', { id: 'store-kobo' }).message, /built-in store can't be removed/);
  assert.equal(ok('names').stores.find((s) => s.id === 'store-kobo').built_in, true);
  assert.equal(ok('names').stores.find((s) => s.id === mine.id).built_in, false);
  const lone = ok('saveStore', { name: 'Unused' });
  assert.equal(ok('removeStore', { id: lone.id }), true);

  assert.match(call('savePublisherName', { name: 'Made-up Press', from_date: '2027-05-01', to_date: '2027-01-01' }).message, /stops before it starts/);
  assert.match(call('savePenName', { name: '' }).message, /needs a name/);
  library.close();
});

test('money is sent as text, never as a number that could lose a cent', () => {
  const { library, ok } = start();
  const book = ok('saveBook', { title: 'Book One' });
  const edition = ok('saveEdition', { book_id: book.id, format: 'ebook' });
  const listing = ok('saveListing', { edition_id: edition.id, store_id: 'store-kdp' });
  ok('setPrice', { listingId: listing.id, marketplace: 'US', currency: 'USD', amount: '0.10', fromDate: '2027-01-01' });
  ok('setPrice', { listingId: listing.id, marketplace: 'JP', currency: 'JPY', amount: '1500', fromDate: '2027-01-01' });
  const prices = ok('book', { id: book.id }).editions[0].listings[0].prices;
  assert.deepEqual(prices.map((p) => [p.marketplace, p.amount, typeof p.amount]), [['JP', '1500', 'string'], ['US', '0.10', 'string']]);
  library.close();
});
