'use strict';
// Match your columns, through the importer: a store's report is opened, the columns are chosen, it is previewed and accepted as one batch, a
// layout is kept by its headings, and a later file is recognized, or told that its columns have changed. Made-up reports only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApi } = require('../src/main/api');
const { Catalog } = require('../src/main/catalog');
const { exportAll } = require('../src/main/export');
const { ImportError, Importer } = require('../src/main/importer');
const { Library } = require('../src/main/storage/library');
const { makeXlsx } = require('./helpers/make-xlsx.cjs');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const csv = (...lines) => Buffer.from(`\uFEFF${lines.join('\n')}\n`, 'utf8');
const refused = (fn, pattern) => assert.throws(fn, (e) => e instanceof ImportError && pattern.test(e.message), String(pattern));
const count = (library, table) => library.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
const HEAD = 'Sale Date,Book Title,ISBN,Country,Quantity,Royalty,Currency';
const SEPTEMBER = [HEAD, '2026-09-03,Tidewater,9780000000002,US,2,5.98,USD', '2026-09-04,Tidewater,9780000000002,GB,1,2.10,GBP', '2026-09-05,Low Water,9780000000019,US,-1,-2.99,USD'];

function start() {
  const library = new Library(temp()).open();
  return { library, importer: new Importer(library, { locale: 'en-US' }) };
}
// Opens a file and chooses what it guessed, for a store.
function choose(importer, buffer, extra = {}) {
  const opened = importer.openColumns(buffer, 'kobo-september.csv');
  const sheet = opened.sheets[0];
  return { opened, args: { id: opened.id, sheet: sheet.name, storeId: 'store-kobo', mapping: sheet.guess, options: {}, ...extra } };
}

test('a file is opened with its headings, a few rows and a guess, and nothing is saved by looking', () => {
  const { library, importer } = start();
  const { opened } = choose(importer, csv(...SEPTEMBER));
  assert.equal(opened.format, 'csv');
  assert.deepEqual(opened.sheets[0].headers, HEAD.split(','));
  assert.deepEqual(opened.sheets[0].guess, { date: 0, title: 1, item: 2, marketplace: 3, units: 4, royalty: 5, kind: null, currency: 6 });
  assert.equal(opened.sheets[0].sample.length, 3);
  assert.deepEqual([opened.sheets[0].recognized, opened.sheets[0].changed], [[], []]);
  assert.equal(count(library, 'sale_lines') + count(library, 'report_files'), 0);
  refused(() => importer.openColumns(Buffer.from('PK\u0003\u0004 not really a workbook'), 'x.xlsx'), /isn't an Excel workbook.*Nothing was imported/);
  refused(() => importer.openColumns(Buffer.from(`Title\n${'x'.repeat(40_000)}`), 'x.csv'), /far too long.*Nothing was imported/);
  library.close();
});

test('the report is shown, accepted as one batch, and its rows are in the library under the store, as estimates, in their own currencies', () => {
  const { library, importer } = start();
  const { args } = choose(importer, csv(...SEPTEMBER));
  const shown = importer.previewColumns(args);
  assert.equal(shown.store, 'Kobo');
  assert.equal(shown.kindLabel, 'Report read with the columns you matched');
  assert.deepEqual(shown.counts, { 'not a sale': 1, imported: 3 });
  assert.equal(shown.newRows, 3);
  assert.deepEqual(shown.totals.map((t) => [t.currency, t.amount]).sort(), [['GBP', '2.10'], ['USD', '2.99']]);
  assert.deepEqual(shown.period, { start: '2026-09-01', end: '2026-09-30' });
  assert.match(shown.notes[0], /no total of its own/);
  assert.deepEqual(shown.needsMatching.map((n) => n.storeItem).sort(), ['9780000000002', '9780000000019']);
  assert.equal(count(library, 'sale_lines'), 0, 'looking saves nothing');

  const done = importer.accept({ previewId: shown.previewId });
  assert.equal(done.newRows, 3);
  const rows = library.db.prepare('SELECT * FROM sale_lines ORDER BY royalty_date').all();
  assert.deepEqual(rows.map((r) => [r.store_id, r.period, r.title, r.net_units, r.royalty, r.currency, r.estimate]), [
    ['store-kobo', '2026-09', 'Tidewater', 2, '598', 'USD', 1], ['store-kobo', '2026-09', 'Tidewater', 1, '210', 'GBP', 1], ['store-kobo', '2026-09', 'Low Water', -1, '-299', 'USD', 1],
  ]);
  assert.equal(importer.reports()[0].kind, 'mapped');
  library.close();
});

test('a book is found by its ISBN, the same file twice does no harm, an overlapping file counts the repeats, and the whole batch can be undone', () => {
  const { library, importer } = start();
  const catalog = new Catalog(library);
  const book = catalog.saveBook({ title: 'Tidewater' });
  const edition = catalog.saveEdition({ book_id: book.id, format: 'ebook' });
  catalog.addIsbn({ number: '9780000000002', editionId: edition.id });
  const first = choose(importer, csv(...SEPTEMBER));
  const done = importer.accept({ previewId: importer.previewColumns(first.args).previewId });
  assert.deepEqual(done.needsMatching.map((n) => n.storeItem), ['9780000000019'], 'the ISBN of a book in the catalog needs no question');
  assert.equal(library.db.prepare("SELECT count(*) AS n FROM sale_lines WHERE edition_id = ?").get(edition.id).n, 2);

  const again = choose(importer, csv(...SEPTEMBER));
  const sameAgain = importer.previewColumns(again.args);
  assert.ok(sameAgain.alreadyImported);
  refused(() => importer.accept({ previewId: sameAgain.previewId }), /already imported this exact file/);

  const overlap = choose(importer, csv(...SEPTEMBER, '2026-09-06,Low Water,9780000000019,US,1,2.99,USD'));
  const shown = importer.previewColumns(overlap.args);
  assert.deepEqual(shown.counts, { 'not a sale': 1, duplicate: 3, imported: 1 }, 'rows already in the library are not counted twice');
  importer.accept({ previewId: shown.previewId });
  assert.equal(count(library, 'sale_lines'), 4);

  const batch = importer.reports().find((r) => r.fileName === 'kobo-september.csv' && r.counts.imported === 1);
  assert.deepEqual(importer.undo({ id: batch.id }), { removed: 1 });
  assert.equal(count(library, 'sale_lines'), 3);
  library.close();
});

test('a cell that cannot be read, a store that is not chosen, and a column that is missing are all said in words, and nothing is saved', () => {
  const { library, importer } = start();
  const bad = choose(importer, csv(HEAD, '2026-09-03,A,9780000000002,US,1,5.98,USD', 'soon,B,9780000000019,US,1,1.00,USD'));
  refused(() => importer.previewColumns(bad.args), /row 3: the date isn't a date the app can read: "soon".*Nothing was imported/);
  refused(() => importer.previewColumns({ ...bad.args, storeId: 'store-nope' }), /Choose which store/);
  refused(() => importer.previewColumns({ ...bad.args, mapping: { ...bad.args.mapping, royalty: null } }), /Say which column holds what you earned/);
  refused(() => importer.previewColumns({ ...bad.args, id: 'gone' }), /no longer open here/);
  const two = importer.openColumns(Buffer.from(makeXlsx([{ name: 'Cover', rows: [['Statement']] }, { name: 'Sales', rows: [['Date', 'Title', 'Royalty'], ['2026-09-03', 'A', '1.00']] }])), 's.xlsx');
  assert.deepEqual(two.sheets.map((s) => s.name), ['Cover', 'Sales']);
  refused(() => importer.previewColumns({ id: two.id, sheet: 'Nope', storeId: 'store-kobo', mapping: {}, options: { currency: 'USD' } }), /Choose which sheet/);
  assert.equal(count(library, 'sale_lines') + count(library, 'report_files'), 0);
  library.close();
});

test('a layout that is kept is recognized in the next file from that store, whatever order the columns come in, and a renamed column is named', () => {
  const { library, importer } = start();
  const first = choose(importer, csv(...SEPTEMBER), { options: { dateOrder: 'day-first', decimal: '.' } });
  const shown = importer.previewColumns({ ...first.args, remember: true, layoutName: 'Kobo monthly' });
  assert.equal(shown.layoutKept, true);
  assert.equal(count(library, 'report_layouts'), 0, 'nothing is kept until the batch is accepted');
  assert.equal(importer.accept({ previewId: shown.previewId }).layoutKept, true);
  assert.deepEqual(importer.layouts().map((l) => [l.name, l.storeName]), [['Kobo monthly', 'Kobo']]);

  // October: the same headings, and the same file with the columns in another order
  const october = importer.openColumns(csv(HEAD, '2026-10-03,Tidewater,9780000000002,US,1,2.99,USD'), 'kobo-october.csv').sheets[0];
  assert.equal(october.recognized.length, 1);
  assert.deepEqual([october.recognized[0].name, october.recognized[0].storeId, october.recognized[0].same, october.recognized[0].options.dateOrder], ['Kobo monthly', 'store-kobo', true, 'day-first']);
  assert.deepEqual(october.recognized[0].mapping, october.guess);
  const moved = importer.openColumns(csv('Currency,Royalty,Quantity,Country,ISBN,Book Title,Sale Date', 'USD,2.99,1,US,9780000000002,Tidewater,2026-10-03'), 'moved.csv').sheets[0];
  assert.deepEqual([moved.recognized.length, moved.recognized[0].same, moved.recognized[0].mapping.royalty], [1, false, 1]);

  // November: the store renamed a column
  const november = importer.openColumns(csv('Sale Date,Book Title,ISBN,Country,Quantity,Net Royalty,Currency', '2026-11-03,Tidewater,9780000000002,US,1,2.99,USD'), 'kobo-november.csv').sheets[0];
  assert.equal(november.recognized.length, 0, 'a layout is never applied by guessing past a column that has gone');
  assert.deepEqual(november.changed.map((c) => [c.name, c.storeName, c.gone, c.added]), [['Kobo monthly', 'Kobo', ['Royalty'], ['Net Royalty']]]);

  // a kept layout can be taken away, and keeping it again for the same headings updates the one kept
  const second = choose(importer, csv(HEAD, '2026-10-03,Tidewater,9780000000002,US,1,2.99,USD'));
  importer.accept({ previewId: importer.previewColumns({ ...second.args, remember: true, layoutName: 'Kobo monthly (new name)' }).previewId });
  assert.deepEqual(importer.layouts().map((l) => l.name), ['Kobo monthly (new name)'], 'the same store and headings are one layout');
  importer.removeLayout({ id: importer.layouts()[0].id });
  assert.equal(importer.layouts().length, 0);
  refused(() => importer.removeLayout({ id: 'nope' }), /isn't in your library/);
  library.close();
});

test('the window can preview, list and remove layouts but never hands the app a file; money from a matched report shows in the royalties', () => {
  const library = new Library(temp()).open();
  const api = createApi(library, { locale: 'en-US' });
  assert.ok(!api.names.includes('openColumns'), 'a file is chosen and read in the main process, never by the window');
  const opened = api.importer.openColumns(csv(...SEPTEMBER), 'k.csv');
  const sheet = opened.sheets[0];
  const shown = api.call('previewColumns', { id: opened.id, sheet: sheet.name, storeId: 'store-kobo', mapping: sheet.guess, remember: true });
  assert.equal(shown.ok, true);
  assert.equal(api.call('acceptReport', { previewId: shown.value.previewId }).ok, true);
  assert.equal(api.call('layouts').value.length, 1);
  const royalties = api.call('royalties', { by: ['store'] }).value;
  assert.deepEqual(royalties.estimated.rows.map((r) => [r.currency, r.earned.amount]).sort(), [['GBP', '2.10'], ['USD', '2.99']]);
  const bad = api.call('previewColumns', { id: opened.id, sheet: sheet.name, storeId: '', mapping: sheet.guess });
  assert.deepEqual([bad.ok, /Choose which store/.test(bad.message)], [false, true]);
  assert.equal(api.call('removeLayout', { id: api.call('layouts').value[0].id }).ok, true);
  library.close();
});

test('a kept layout is in the export, with the store\'s name beside it', () => {
  const { library, importer } = start();
  const { args } = choose(importer, csv(...SEPTEMBER));
  importer.accept({ previewId: importer.previewColumns({ ...args, remember: true, layoutName: 'Kobo monthly' }).previewId });
  const made = exportAll(library, temp(), { now: () => new Date('2026-11-22T12:00:00'), version: '1.2.0' });
  assert.equal(made.counts.report_layouts, 1);
  assert.match(fs.readFileSync(path.join(made.folder, 'csv', 'report-layouts.csv'), 'utf8'), /Kobo monthly.*Kobo|Kobo.*Kobo monthly/s);
  library.close();
});

test('a Google Play Books Sales Summary report is recognized by its headings, and the month and currency it lacks are asked for, never assumed', () => {
  const { library, importer } = start();
  const head = ['Title', 'Author', 'Primary ISBN', 'Country of Sale', 'Units Purchased', 'Units Refunded', 'Net Units Sold', 'Total Publisher Earnings', 'Line of Business'];
  const row = ['A Made-up Book', 'A. Writer', 'GGKEY:MADEUP0001', 'AU', '2', '1', '1', '0.73', 'Audiobook'];
  const text = [head, row].map((cells) => cells.map((c) => `"${c}"`).join('\t')).join('\n');
  const opened = importer.openColumns(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]), 'GoogleSalesSummaryReport.csv');
  const [known] = opened.sheets[0].recognized;
  assert.deepEqual([known.name, known.storeId, known.builtIn, known.mapping.royalty, known.mapping.units, known.mapping.date], ['Google Play Books: Sales Summary report', 'store-google-play-books', true, 7, 6, null]);
  assert.match(known.ask, /no date and no currency/);
  const args = { id: opened.id, sheet: opened.sheets[0].name, storeId: known.storeId, mapping: known.mapping };
  refused(() => importer.previewColumns(args), /Say which column holds the date of the sale \(or, if the report has none, the month it covers\)/);
  refused(() => importer.previewColumns({ ...args, options: { period: '2026-09' } }), /the currency/);
  const shown = importer.previewColumns({ ...args, options: { period: '2026-09', currency: 'USD' } });
  assert.deepEqual(shown.totals.map((t) => [t.currency, t.amount]), [['USD', '0.73']]);
  assert.ok(shown.notes.some((n) => /every row is put in 2026-09/.test(n)));
  importer.accept({ previewId: shown.previewId });
  assert.deepEqual(library.db.prepare('SELECT period, store_item, marketplace, royalty_type, net_units FROM sale_lines').all(), [{ period: '2026-09', store_item: 'GGKEY:MADEUP0001', marketplace: 'AU', royalty_type: 'Audiobook', net_units: 1 }]);
  library.close();
});
