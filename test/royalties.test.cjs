'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApi } = require('../src/main/api');
const { Catalog } = require('../src/main/catalog');
const { Importer } = require('../src/main/importer');
const { Library } = require('../src/main/storage/library');
const { NOT_MATCHED, RoyaltyError, royalties } = require('../src/main/royalties');
const { desk } = require('../src/main/views');
const { madeUpKdpOrders, madeUpKdpPayments } = require('./helpers/make-xlsx.cjs');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));

// One book with an ebook and a paperback, both known to the catalog, and a second book nobody has told the app about.
function start({ matchPaperback = true } = {}) {
  const library = new Library(temp()).open();
  const catalog = new Catalog(library);
  const book = catalog.saveBook({ title: 'The Lantern Road' });
  const ebook = catalog.saveEdition({ book_id: book.id, format: 'ebook' });
  const paperback = catalog.saveEdition({ book_id: book.id, format: 'paperback' });
  catalog.saveListing({ edition_id: ebook.id, store_id: 'store-kdp', status: 'live', store_item_id: 'B0TESTEBK1' });
  if (matchPaperback) catalog.addIsbn({ number: '9780000000002', editionId: paperback.id });
  const importer = new Importer(library, { locale: 'en-US' });
  const take = (buffer, name) => importer.accept({ previewId: importer.preview(buffer, name).previewId });
  // September, then September again with an October sale and an October refund added: 7.06 + 1.38 - 0.69 USD.
  take(madeUpKdpOrders(), 'sept.xlsx');
  take(madeUpKdpOrders({ extraSale: true, refund: true, summaryUsd: '7.75' }), 'oct.xlsx');
  return { library, catalog, importer, book, ebook, paperback, take };
}

const amounts = (rows) => Object.fromEntries(rows.map((r) => [`${Object.values(r.keys).map((k) => k.label).join(' / ')} ${r.currency}`, r.earned.amount]));

test('by month: each month and currency on its own', () => {
  const { library } = start();
  const { estimated } = royalties(library, { by: ['month'], locale: 'en-US' });
  assert.deepEqual(amounts(estimated.rows), { '2026-09 GBP': '2.74', '2026-09 USD': '7.06', '2026-10 USD': '0.69' });
  library.close();
});

test('money in two currencies is never added together', () => {
  const { library } = start();
  const all = royalties(library, { by: [] });
  assert.deepEqual(all.estimated.rows.map((r) => `${r.currency} ${r.earned.amount}`), ['GBP 2.74', 'USD 7.75']);
  assert.deepEqual(all.estimated.totals.map((t) => `${t.currency} ${t.earned.amount}`), ['GBP 2.74', 'USD 7.75']);
  assert.ok(all.estimated.rows.every((r) => r.earned.currency === r.currency));
  library.close();
});

test('by book and by edition, with a refund taking away what it refunds', () => {
  const { library } = start();
  const byBook = royalties(library, { by: ['book'] }).estimated.rows;
  assert.deepEqual(amounts(byBook), { 'The Lantern Road GBP': '2.74', 'The Lantern Road USD': '7.75' });
  const byEdition = royalties(library, { by: ['edition'] }).estimated.rows;
  assert.equal(byEdition.find((r) => r.keys.edition.label.includes('ebook') && r.currency === 'USD').earned.amount, '2.76', '2.07 + 1.38 - 0.69');
  assert.equal(byEdition.find((r) => r.keys.edition.label.includes('paperback')).earned.amount, '4.99');
  library.close();
});

test('by store and by marketplace', () => {
  const { library } = start();
  assert.deepEqual(amounts(royalties(library, { by: ['store'] }).estimated.rows), { 'Amazon KDP GBP': '2.74', 'Amazon KDP USD': '7.75' });
  assert.deepEqual(amounts(royalties(library, { by: ['marketplace'] }).estimated.rows), { 'Amazon.co.uk GBP': '2.74', 'Amazon.com USD': '7.75' });
  library.close();
});

test('the dimensions combine, in a fixed order whatever order they are asked for', () => {
  const { library } = start();
  const a = royalties(library, { by: ['book', 'month'] });
  const b = royalties(library, { by: ['month', 'book'] });
  assert.deepEqual(a.by, ['month', 'book']);
  assert.deepEqual(a.estimated.rows, b.estimated.rows);
  assert.equal(a.estimated.rows.length, 3);
  library.close();
});

test('copies sold are counted apart from free copies, and a refund takes a copy off', () => {
  const { library } = start();
  const row = royalties(library, { by: ['month', 'marketplace'] }).estimated.rows.find((r) => r.keys.month.label === '2026-09' && r.currency === 'USD');
  assert.equal(row.units, 3 + 1, 'three ebooks and a paperback');
  assert.equal(row.free, 5);
  const october = royalties(library, { by: ['month'] }).estimated.rows.find((r) => r.keys.month.label === '2026-10');
  assert.equal(october.units, 2 - 1);
  library.close();
});

test('what no book owns yet is kept in its own bucket, last, and the total still agrees', () => {
  const { library } = start({ matchPaperback: false });
  const { estimated, notMatched } = royalties(library, { by: ['book'] });
  const rows = estimated.rows.filter((r) => r.currency === 'USD');
  assert.equal(rows.at(-1).keys.book.label, NOT_MATCHED);
  assert.equal(rows.at(-1).earned.amount, '4.99');
  assert.equal(estimated.totals.find((t) => t.currency === 'USD').earned.amount, '7.75');
  assert.equal(notMatched, 1);
  library.close();
});

test('a range of months narrows everything', () => {
  const { library } = start();
  assert.deepEqual(amounts(royalties(library, { by: ['month'], from: '2026-10' }).estimated.rows), { '2026-10 USD': '0.69' });
  assert.deepEqual(amounts(royalties(library, { by: ['month'], to: '2026-09' }).estimated.rows), { '2026-09 GBP': '2.74', '2026-09 USD': '7.06' });
  assert.deepEqual(royalties(library, { by: ['month'], from: '2027-01' }).estimated.rows, []);
  assert.deepEqual(royalties(library).months, ['2026-09', '2026-10']);
  library.close();
});

test('what was paid is kept apart from the estimates, and does not change them', () => {
  const { library, take } = start();
  const before = royalties(library, { by: ['month'] }).estimated;
  take(madeUpKdpPayments(), 'payments.xlsx');
  const after = royalties(library, { by: ['month'] });
  assert.deepEqual(after.estimated, before);
  assert.equal(after.paid.length, 1);
  assert.deepEqual([after.paid[0].month, after.paid[0].marketplace, after.paid[0].currency], ['2026-09', 'Amazon.co.uk', 'GBP']);
  assert.equal(after.paid[0].paid.amount, '2.74');
  assert.equal(after.paid[0].accrued.amount, '2.74');
  assert.deepEqual(after.paid[0].statuses, ['Paid']);
  assert.deepEqual(royalties(library, { from: '2026-10' }).paid, []);
  library.close();
});

test('the totals agree with the Money screen, whatever the grouping', () => {
  const { library, importer } = start();
  const money = Object.fromEntries(importer.earnedVsPaid().currencies.map((c) => [c.currency, c.totals.earned.amount]));
  for (const by of [[], ['month'], ['book', 'edition'], ['store', 'marketplace', 'month']]) {
    const totals = Object.fromEntries(royalties(library, { by }).estimated.totals.map((t) => [t.currency, t.earned.amount]));
    assert.deepEqual(totals, money, by.join());
  }
  library.close();
});

test('a nonsense request is answered in words', () => {
  const { library } = start();
  assert.throws(() => royalties(library, { by: ['colour'] }), (e) => e instanceof RoyaltyError && /Choose from month, book/.test(e.message));
  assert.throws(() => royalties(library, { from: 'last week' }), /2026-09/);
  assert.throws(() => royalties(library, { from: '2026-10', to: '2026-09' }), /before the start/);
  library.close();
});

test('the Desk shows last month\'s earnings, as an estimate, when a report covers it', () => {
  const { library } = start();
  const none = desk(library, { today: '2026-12-05', locale: 'en-US' });
  assert.equal(none.lastMonth, null, 'November has no report');
  const some = desk(library, { today: '2026-11-05', locale: 'en-US' });
  assert.equal(some.lastMonth.period, '2026-10');
  assert.equal(some.lastMonth.estimate, true);
  assert.deepEqual(some.lastMonth.earned.map((e) => e.shown), ['$0.69']);
  assert.equal(desk(library, { today: '2027-01-05' }).lastMonth, null);
  assert.equal(desk(library, { today: '2026-10-20', locale: 'en-US' }).lastMonth.period, '2026-09');
  library.close();
});

test('the window can ask for royalties, and a bad question comes back in words', () => {
  const { library } = start();
  const { call } = createApi(library, { now: () => new Date(2026, 10, 18), locale: 'en-US' });
  const good = call('royalties', { by: ['book'] });
  assert.equal(good.ok, true);
  assert.equal(good.value.estimated.rows[0].keys.book.label, 'The Lantern Road');
  const bad = call('royalties', { by: ['nope'] });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /Choose from/);
  library.close();
});
