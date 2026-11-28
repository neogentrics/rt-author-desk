'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApi } = require('../src/main/api');
const { Catalog } = require('../src/main/catalog');
const { ImportError, Importer } = require('../src/main/importer');
const { Library } = require('../src/main/storage/library');
const { madeUpKdpOrders, madeUpKdpPayments, makeXlsx } = require('./helpers/make-xlsx.cjs');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const count = (library, table) => library.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
const refused = (fn, pattern) => assert.throws(fn, (error) => error instanceof ImportError && pattern.test(error.message), String(pattern));

// A library with one book that has an ebook (listed on KDP with its ASIN) and a paperback (with its ISBN in the register).
function start({ matched = true } = {}) {
  const dir = temp();
  const library = new Library(dir, { now: () => new Date('2026-11-18T12:00:00Z') }).open();
  const catalog = new Catalog(library);
  const book = catalog.saveBook({ title: 'The Lantern Road' });
  const ebook = catalog.saveEdition({ book_id: book.id, format: 'ebook' });
  const paperback = catalog.saveEdition({ book_id: book.id, format: 'paperback' });
  if (matched) {
    catalog.saveListing({ edition_id: ebook.id, store_id: 'store-kdp', status: 'live', store_item_id: 'B0TESTEBK1' });
    catalog.addIsbn({ number: '9780306406157', editionId: paperback.id });
  }
  const importer = new Importer(library, { locale: 'en-US', now: () => new Date('2026-11-18T12:00:00Z') });
  return { dir, library, catalog, importer, book, ebook, paperback };
}

const take = (importer, buffer, name = 'orders.xlsx', options) => importer.accept({ previewId: importer.preview(buffer, name).previewId, ...options });

test('showing a file saves nothing, and says what is in it', () => {
  const { library, importer } = start();
  const preview = importer.preview(madeUpKdpOrders(), 'orders.xlsx');
  assert.equal(preview.store, 'Amazon KDP');
  assert.equal(preview.kind, 'kdp-orders');
  assert.deepEqual(preview.period, { start: '2026-09-01', end: '2026-09-30' });
  assert.equal(preview.newRows, 4 + 1 + 1, 'four sales, one order line, one pages-read line');
  assert.deepEqual(preview.totals.map((t) => `${t.currency} ${t.amount}`).sort(), ['GBP 2.74', 'USD 7.06']);
  assert.deepEqual(preview.problems, []);
  assert.equal(preview.alreadyImported, null);
  assert.equal(count(library, 'report_files'), 0);
  assert.equal(count(library, 'sale_lines'), 0);
  library.close();
});

test('accepting saves the whole file as one batch, and every row has an outcome that adds up', () => {
  const { library, importer } = start();
  const result = take(importer, madeUpKdpOrders());
  const [batch] = importer.reports();
  assert.equal(batch.status, 'accepted');
  assert.equal(count(library, 'sale_lines'), 4);
  assert.equal(count(library, 'pages_read'), 1);
  assert.equal(count(library, 'order_counts'), 1);
  assert.equal(Object.values(batch.counts).reduce((a, b) => a + b, 0), batch.rowsInFile, 'the outcomes add up to the rows in the file');
  assert.equal(batch.counts.imported, 6);
  assert.ok(batch.counts.duplicate >= 4, 'the format sheets repeat Combined Sales');
  assert.equal(result.newRows, 6);
  const sale = library.list('sale_lines').find((s) => s.units_sold === 3);
  assert.equal(sale.royalty, '207', 'a whole number of cents, as text');
  assert.equal(sale.estimate, 1);
  assert.equal(sale.period, '2026-09');
  library.close();
});

test('the original file is kept inside the encrypted library, and is not readable in the file on disk', () => {
  const { library, importer, dir } = start();
  const file = madeUpKdpOrders();
  take(importer, file);
  const [batch] = importer.reports();
  assert.equal(batch.hasOriginal, true);
  assert.ok(importer.original(batch.id).equals(file), 'the same bytes come back');
  library.db.pragma('wal_checkpoint(TRUNCATE)');
  const onDisk = fs.readFileSync(path.join(dir, 'library.db'));
  assert.ok(!onDisk.includes(Buffer.from('The Lantern Road')), 'the title is not in the clear');
  assert.ok(!onDisk.includes(Buffer.from('PK\u0003\u0004')), 'no zip header, so the workbook is not in the clear either');
  library.close();
});

test('rows are matched to editions by the store ID on a listing, and by ISBN, in either form', () => {
  const { library, importer, ebook, paperback } = start();
  take(importer, madeUpKdpOrders({ printIsbn: '0306406152' })); // the ten-digit form of the paperback's ISBN
  const lines = library.list('sale_lines');
  assert.ok(lines.filter((l) => l.store_item === 'B0TESTEBK1').every((l) => l.edition_id === ebook.id));
  assert.equal(lines.find((l) => l.store_item === '0306406152').edition_id, paperback.id);
  assert.ok(lines.find((l) => l.store_item === 'B0TESTEBK1').listing_id, 'tied to the listing when the store ID is on one');
  assert.deepEqual(importer.needsMatching(), []);
  library.close();
});

test('rows that match nothing are kept, asked about once per item, and one answer fixes them all and is remembered', () => {
  const { library, importer, ebook } = start({ matched: false });
  const first = take(importer, madeUpKdpOrders());
  assert.equal(count(library, 'sale_lines'), 4, 'nothing is thrown away');
  assert.equal(first.needsMatching.length, 2, 'two items, however many rows each has');
  const asked = importer.needsMatching();
  assert.deepEqual(asked.map((i) => i.storeItem).sort(), ['9780000000002', 'B0TESTEBK1']);
  assert.equal(asked.find((i) => i.storeItem === 'B0TESTEBK1').rows, 3 + 1 + 1, 'three sales lines, an order line and a pages line');

  const answered = importer.matchItem({ storeItem: 'b0testebk1', editionId: ebook.id });
  assert.equal(answered.rows, 5);
  assert.deepEqual(importer.needsMatching().map((i) => i.storeItem), ['9780000000002']);

  // A later file for the same item needs no question.
  const next = take(importer, madeUpKdpOrders({ extraSale: true, summaryUsd: '8.44' }));
  assert.ok(!next.needsMatching.some((i) => i.storeItem === 'B0TESTEBK1'));
  assert.ok(library.list('sale_lines').filter((l) => l.store_item === 'B0TESTEBK1').every((l) => l.edition_id === ebook.id));
  library.close();
});

test('an ID added to the catalog later is picked up the next time matching is checked', () => {
  const { library, importer, catalog, ebook } = start({ matched: false });
  take(importer, madeUpKdpOrders());
  assert.equal(importer.needsMatching().length, 2);
  catalog.saveListing({ edition_id: ebook.id, store_id: 'store-kdp', status: 'live', store_item_id: 'B0TESTEBK1' });
  assert.deepEqual(importer.needsMatching().map((i) => i.storeItem), ['9780000000002']);
  library.close();
});

test('importing the same file twice changes nothing', () => {
  const { library, importer } = start();
  const file = madeUpKdpOrders();
  take(importer, file);
  const before = ['report_files', 'sale_lines', 'pages_read', 'order_counts'].map((t) => count(library, t));
  const again = importer.preview(file, 'orders-again.xlsx');
  assert.ok(again.alreadyImported);
  refused(() => importer.accept({ previewId: again.previewId }), /already imported this exact file/);
  assert.deepEqual(['report_files', 'sale_lines', 'pages_read', 'order_counts'].map((t) => count(library, t)), before);
  library.close();
});

test('a different file that overlaps skips the rows already here, and says so', () => {
  const { library, importer } = start();
  take(importer, madeUpKdpOrders());
  const preview = importer.preview(madeUpKdpOrders({ extraSale: true, summaryUsd: '8.44' }), 'orders-later.xlsx');
  assert.equal(preview.newRows, 1, 'only the October sale is new');
  assert.equal(preview.counts.duplicate >= 4 + 4 + 1 + 1 - 0, true);
  assert.equal(Object.values(preview.counts).reduce((a, b) => a + b, 0), preview.rowsInFile);
  importer.accept({ previewId: preview.previewId });
  assert.equal(count(library, 'sale_lines'), 5);
  assert.equal(count(library, 'pages_read'), 1);
  assert.equal(count(library, 'order_counts'), 1);
  library.close();
});

test('a refund is a negative amount, and it is kept', () => {
  const { library, importer } = start();
  take(importer, madeUpKdpOrders({ refund: true, summaryUsd: '6.37' }));
  const refund = library.list('sale_lines').find((l) => l.transaction_type === 'Refund');
  assert.equal(refund.royalty, '-69');
  assert.equal(refund.net_units, -1);
  library.close();
});

test('undoing a batch takes back every row and the stored file, and the file can be imported again', () => {
  const { library, importer } = start();
  take(importer, madeUpKdpOrders());
  const keep = take(importer, madeUpKdpOrders({ extraSale: true, summaryUsd: '8.44' }));
  assert.equal(count(library, 'sale_lines'), 5);

  const undone = importer.undo({ id: keep.reportId });
  assert.equal(undone.removed, 1);
  assert.equal(count(library, 'sale_lines'), 4, 'only the second batch went');
  const [latest] = importer.reports();
  assert.equal(latest.status, 'undone');
  assert.equal(latest.hasOriginal, false);
  assert.ok(library.removals().length >= 1, 'removals leave markers, as everything else does');
  refused(() => importer.undo({ id: keep.reportId }), /already undone/);

  const again = take(importer, madeUpKdpOrders({ extraSale: true, summaryUsd: '8.44' }));
  assert.equal(again.newRows, 1);
  assert.equal(count(library, 'sale_lines'), 5);
  library.close();
});

test('nothing is half saved: if a row cannot be saved, the whole batch is left out', () => {
  const { library, importer } = start();
  const preview = importer.preview(madeUpKdpOrders(), 'orders.xlsx');
  const put = library.put.bind(library);
  let saved = 0;
  library.put = (table, record) => {
    if (table === 'sale_lines' && (saved += 1) === 3) throw new Error('the disk is full');
    return put(table, record);
  };
  assert.throws(() => importer.accept({ previewId: preview.previewId }), /disk is full/);
  library.put = put;
  assert.equal(count(library, 'report_files'), 0);
  assert.equal(count(library, 'sale_lines'), 0);
  library.close();
});

test('a total that disagrees with the report is shown, refused unless you say you know, and then flagged for good', () => {
  const { library, importer } = start();
  const file = madeUpKdpOrders({ summaryUsd: '7.07' });
  const preview = importer.preview(file, 'orders.xlsx');
  assert.match(preview.problems.join(' '), /USD rows add up to 7.06, but the Summary says 7.07/);
  refused(() => importer.accept({ previewId: preview.previewId }), /doesn't add up/);
  assert.equal(count(library, 'report_files'), 0);

  importer.accept({ previewId: preview.previewId, knowingMismatch: true });
  const [batch] = importer.reports();
  assert.equal(batch.mismatchAccepted, true);
  assert.match(batch.problems.join(' '), /Summary says 7.07/);
  const { warnings } = importer.earnedVsPaid();
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].problems.join(' '), /7.07/);

  importer.undo({ id: batch.id });
  assert.deepEqual(importer.earnedVsPaid().warnings, [], 'the flag goes when the batch does');
  library.close();
});

test('a changed layout is refused in plain words, and nothing is saved', () => {
  const { library, importer } = start();
  const renamed = madeUpKdpOrders({ combinedHeader: ['Royalty Date', 'Book Title', ...Array(13).fill('x')] });
  refused(() => importer.preview(renamed, 'orders.xlsx'), /KDP's "Combined Sales" sheet has changed.*Nothing was imported/);
  assert.equal(count(library, 'report_files'), 0);
  library.close();
});

test('a file the app cannot read says so, and names the stores still waiting for a reader', () => {
  const { library, importer } = start();
  refused(() => importer.preview(Buffer.from('not a spreadsheet'), 'x.xlsx'), /Nothing was imported/);
  const other = makeXlsx([{ name: 'Sheet1', rows: [['Date', 'Title', 'Units'], ['2026-09-01', 'A Book', 3]] }]);
  refused(() => importer.preview(other, 'sales.xlsx'), /ACX, Google Play Books, IngramSpark, Draft2Digital, Kobo, Apple Books are waiting for a real report.*Match your columns/);
  library.close();
});

test('the other stores are empty slots that say they are waiting, and read nothing', () => {
  const { library, importer } = start();
  const slots = importer.readers();
  assert.deepEqual(slots.filter((r) => r.ready).map((r) => r.name), ['Amazon KDP', 'Barnes & Noble Press', 'Lulu']);
  assert.deepEqual(slots.filter((r) => !r.ready).map((r) => r.name), ['ACX', 'Google Play Books', 'IngramSpark', 'Draft2Digital', 'Kobo', 'Apple Books']);
  assert.ok(slots.filter((r) => !r.ready).every((r) => /[Ww]aiting for/.test(r.waiting)));
  library.close();
});

test('earned and paid are shown side by side, by currency and month, and never added across currencies', () => {
  const { library, importer } = start();
  take(importer, madeUpKdpOrders());
  take(importer, madeUpKdpPayments(), 'payments.xlsx');
  const { currencies } = importer.earnedVsPaid();
  assert.deepEqual(currencies.map((c) => c.currency), ['GBP', 'USD']);
  const gbp = currencies[0].months[0];
  assert.equal(gbp.period, '2026-09');
  assert.equal(gbp.earned.amount, '2.74');
  assert.equal(gbp.paid.amount, '2.74');
  assert.equal(gbp.owed.amount, '0.00');
  assert.equal(gbp.paymentSeen, true);
  assert.deepEqual(gbp.statuses, ['Paid']);
  const usd = currencies[1].months[0];
  assert.equal(usd.earned.amount, '7.06');
  assert.equal(usd.paid.amount, '0.00');
  assert.equal(usd.owed.amount, '7.06', 'earned but not yet paid');
  assert.equal(usd.paymentSeen, false);
  assert.equal(currencies[1].totals.owed.shown, '$7.06');
  library.close();
});

test('the window can ask for all of this, and gets plain data or plain words', () => {
  const library = new Library(temp()).open();
  const { call, importer } = createApi(library, { now: () => new Date(2026, 10, 18), locale: 'en-US' });
  const ok = (name, args) => {
    const result = call(name, args);
    assert.equal(result.ok, true, `${name}: ${result.message}`);
    return result.value;
  };
  const preview = importer.preview(madeUpKdpOrders(), 'orders.xlsx');
  const saved = ok('acceptReport', { previewId: preview.previewId });
  assert.equal(ok('imports').length, 1);
  assert.equal(ok('needsMatching').length, 2);
  assert.equal(ok('earnings').currencies.length, 2);
  assert.equal(ok('readers').length, 9);
  const bad = call('acceptReport', { previewId: preview.previewId });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /no longer open|already imported/);
  ok('undoReport', { id: saved.reportId });
  assert.equal(call('matchItem', { storeItem: 'X', editionId: 'nope' }).ok, false);
  library.close();
});
