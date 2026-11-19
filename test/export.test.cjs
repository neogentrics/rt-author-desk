'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Catalog } = require('../src/main/catalog');
const { ExportError, exportAll } = require('../src/main/export');
const { Importer } = require('../src/main/importer');
const { Trash } = require('../src/main/trash');
const { Library } = require('../src/main/storage/library');
const { parseCsv } = require('../src/shared/csv');
const { madeUpKdpOrders, madeUpKdpPayments } = require('./helpers/make-xlsx.cjs');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const NOW = new Date(2026, 10, 18, 14, 30, 5);

// A library with a bit of everything, including a title a spreadsheet would try to run as a formula, a refund, and a thing in the Trash.
function start() {
  const library = new Library(temp()).open();
  const catalog = new Catalog(library);
  const pen = catalog.savePenName({ name: 'A. Writer' });
  const series = catalog.saveSeries({ name: 'The Tidewater Books', pen_name_id: pen.id });
  const book = catalog.saveBook({ title: 'Tidewater', series_id: series.id, series_number: '1', pen_name_id: pen.id, notes: 'First, "the one"' });
  catalog.saveBook({ title: '=SUM(A1:A9)' });
  const ebook = catalog.saveEdition({ book_id: book.id, format: 'ebook', release_date: '2026-12-01' });
  const audio = catalog.saveEdition({ book_id: book.id, format: 'audiobook', length_minutes: 500 });
  const kdp = catalog.saveListing({ edition_id: ebook.id, store_id: 'store-kdp', status: 'live', store_item_id: 'B0TESTEBK1' });
  catalog.setPrice({ listingId: kdp.id, marketplace: 'US', currency: 'USD', amount: '4.99', fromDate: '2026-01-01' });
  catalog.saveRecording({ edition_id: audio.id, voice: 'human', read_by: 'Sam Reader' });
  catalog.addIsbn({ number: '9780306406157' });
  const importer = new Importer(library, { locale: 'en-US' });
  const orders = madeUpKdpOrders({ refund: true, summaryUsd: '6.37' });
  importer.accept({ previewId: importer.preview(orders, 'orders 2026-09.xlsx').previewId });
  importer.accept({ previewId: importer.preview(madeUpKdpPayments(), 'payments.xlsx').previewId });
  const trash = new Trash(library);
  trash.removeBook(catalog.saveBook({ title: 'Waiting in the Trash' }).id);
  return { library, orders, book, ebook };
}

const read = (folder, file) => fs.readFileSync(path.join(folder, file));
const csv = (folder, table) => {
  const text = read(folder, `csv/${table}.csv`).toString('utf8');
  assert.equal(text.charCodeAt(0), 0xfeff, `${table}: a byte order mark, so Excel shows accents properly`);
  const [header, ...rows] = parseCsv(text.slice(1));
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
};

test('everything goes into one new folder: the library as JSON, a spreadsheet for each kind of thing, the reports, and a note', () => {
  const { library } = start();
  const parent = temp();
  const done = exportAll(library, path.join(parent, 'exports'), { now: () => NOW, version: '1.0.0-alpha.2' });
  assert.equal(path.basename(done.folder), 'RT Author Desk export 2026-11-18 14-30-05');
  assert.deepEqual(fs.readdirSync(done.folder).sort(), ['README.txt', 'csv', 'library.json', 'reports']);
  assert.ok(fs.readdirSync(path.join(done.folder, 'csv')).includes('books.csv'));
  assert.ok(fs.readdirSync(path.join(done.folder, 'csv')).includes('sale-lines.csv'));
  assert.equal(done.reports, 2);
  assert.match(read(done.folder, 'README.txt').toString(), /Made .* by version 1\.0\.0-alpha\.2/);
  assert.match(read(done.folder, 'README.txt').toString(), /Nothing secret is in here/);
  library.close();
});

test('the JSON holds every record, exactly, with the ids the app uses', () => {
  const { library } = start();
  const { folder } = exportAll(library, temp(), { now: () => NOW, version: '1.0.0' });
  const json = JSON.parse(read(folder, 'library.json'));
  assert.deepEqual([json.app, json.version, json.schemaStep >= 7], ['rt-author-desk', '1.0.0', true]);
  for (const table of ['books', 'editions', 'listings', 'prices', 'recordings', 'isbns', 'series', 'pen_names', 'sale_lines', 'payments', 'stores', 'trash_items']) {
    assert.equal(json.tables[table].length, json.counts[table], table);
    assert.equal(json.counts[table], library.list(table).length, `${table}: nothing left out`);
  }
  assert.equal(json.counts.stores, 9);
  const book = json.tables.books.find((b) => b.title === 'Tidewater');
  assert.deepEqual([book.id, book.notes, book.series_number], [library.list('books').find((b) => b.title === 'Tidewater').id, 'First, "the one"', '1']);
  assert.equal(json.tables.books.find((b) => b.title === '=SUM(A1:A9)').title, '=SUM(A1:A9)', 'JSON is exact: a formula-looking title is not changed');
  assert.equal(json.tables.prices[0].amount, '499', 'money is the smallest unit and its currency, as kept');
  assert.equal(json.tables.sale_lines.find((s) => s.transaction_type === 'Refund').royalty, '-69');
  assert.equal(typeof json.tables.trash_items[0].payload, 'object', 'what is in the Trash is readable, not a string inside a string');
  library.close();
});

test('each spreadsheet has the names filled in beside the ids, and amounts as decimals', () => {
  const { library, ebook } = start();
  const { folder } = exportAll(library, temp(), { now: () => NOW });
  const books = csv(folder, 'books');
  assert.deepEqual(books.find((b) => b.title === 'Tidewater'), {
    id: library.list('books').find((b) => b.title === 'Tidewater').id, created_at: books[0].created_at, updated_at: books[0].updated_at,
    title: 'Tidewater', subtitle: '', series_id: books[0].series_id, series_number: '1', pen_name_id: books[0].pen_name_id, business_status: 'planned',
    story_link: '', notes: 'First, "the one"', series_name: 'The Tidewater Books', pen_name: 'A. Writer',
  });
  const listing = csv(folder, 'listings')[0];
  assert.deepEqual([listing.edition, listing.store_name, listing.store_item_id], ['Tidewater: ebook', 'Amazon KDP', 'B0TESTEBK1']);
  const price = csv(folder, 'prices')[0];
  assert.deepEqual([price.edition, price.store_name, price.currency, price.amount, price.amount_decimal], ['Tidewater: ebook', 'Amazon KDP', 'USD', '499', '4.99']);
  const lines = csv(folder, 'sale-lines');
  assert.equal(lines.find((s) => s.transaction_type === 'Refund').royalty_decimal, '-0.69');
  assert.equal(lines.find((s) => s.units_sold === '3').royalty_decimal, '2.07');
  assert.equal(lines.find((s) => s.currency === 'GBP').royalty_decimal, '2.74');
  const pay = csv(folder, 'payments')[0];
  assert.deepEqual([pay.net_decimal, pay.payout_decimal, pay.status], ['2.74', '3.46', 'Paid']);
  assert.deepEqual(csv(folder, 'recordings')[0].edition, 'Tidewater: audiobook');
  assert.equal(csv(folder, 'report-files').length, 2);
  assert.equal(csv(folder, 'report-files')[0].has_original, 'yes');
  assert.ok(ebook);
  library.close();
});

test('a spreadsheet cannot run a cell as a formula, and an empty kind of thing still has its headings', () => {
  const { library } = start();
  const { folder } = exportAll(library, temp(), { now: () => NOW });
  assert.ok(csv(folder, 'books').some((b) => b.title === "'=SUM(A1:A9)"), 'a quote mark goes in front');
  const empty = csv(folder, 'item-matches');
  assert.deepEqual(empty, []);
  const header = parseCsv(read(folder, 'csv/item-matches.csv').toString('utf8').slice(1))[0];
  assert.ok(header.includes('store_item') && header.includes('store_name') && header.includes('edition'));
  library.close();
});

test('each original report comes out exactly as it went in', () => {
  const { library, orders } = start();
  const { folder } = exportAll(library, temp(), { now: () => NOW });
  const files = fs.readdirSync(path.join(folder, 'reports'));
  const file = files.find((f) => f.endsWith('orders 2026-09.xlsx'));
  assert.ok(file);
  assert.ok(read(folder, `reports/${file}`).equals(orders));
  assert.equal(files.length, 2);
  library.close();
});

test('the library\'s key and its lock are never written, nor the log of changes', () => {
  const { library } = start();
  const { folder } = exportAll(library, temp(), { now: () => NOW });
  const all = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : all.push(path.join(dir, e.name))));
  walk(folder);
  assert.ok(!all.some((f) => /keys\.json|library\.db/.test(f)));
  const keys = fs.readFileSync(path.join(library.dir, 'keys.json'), 'utf8');
  const wrapped = JSON.parse(keys).slots[0].wrapped;
  for (const f of all.filter((x) => !x.includes(`${path.sep}reports${path.sep}`))) {
    const text = fs.readFileSync(f, 'utf8');
    assert.ok(!text.includes(wrapped), `${path.basename(f)} holds no part of the lock`);
  }
  const json = JSON.parse(read(folder, 'library.json'));
  assert.deepEqual(Object.keys(json.tables).filter((t) => ['changes', 'removals', 'meta'].includes(t)), []);
  assert.ok(!('original' in json.tables.report_files[0]), 'the report files are in reports/, not inside the JSON');
  library.close();
});

test('exporting twice makes two folders and never writes over the first', () => {
  const { library } = start();
  const parent = temp();
  const a = exportAll(library, parent, { now: () => NOW });
  const b = exportAll(library, parent, { now: () => NOW });
  assert.notEqual(a.folder, b.folder);
  assert.match(path.basename(b.folder), /\(2\)$/);
  assert.equal(fs.readdirSync(parent).length, 2);
  library.close();
});

test('an empty library exports too, and a folder that cannot be written to is said in words and leaves nothing behind', () => {
  const library = new Library(temp()).open();
  const { folder, counts } = exportAll(library, temp(), { now: () => NOW });
  assert.equal(counts.books, 0);
  assert.equal(JSON.parse(read(folder, 'library.json')).tables.books.length, 0);
  assert.ok(!fs.existsSync(path.join(folder, 'reports')), 'no empty reports folder');
  const blocked = path.join(temp(), 'a file');
  fs.writeFileSync(blocked, 'x');
  assert.throws(() => exportAll(library, path.join(blocked, 'inside')), (e) => e instanceof ExportError && /couldn't be made in that folder/.test(e.message));
  assert.throws(() => exportAll(library, ''), /Choose a folder/);
  library.close();
});

test('a failure part way through removes the half-made export', () => {
  const { library } = start();
  const parent = temp();
  const write = fs.writeFileSync;
  fs.writeFileSync = (file, ...rest) => {
    if (String(file).endsWith('library.json')) throw Object.assign(new Error('full'), { code: 'ENOSPC' });
    return write(file, ...rest);
  };
  try {
    assert.throws(() => exportAll(library, parent, { now: () => NOW }), /there is no room left/);
  } finally {
    fs.writeFileSync = write;
  }
  assert.deepEqual(fs.readdirSync(parent), [], 'nothing is left over');
  library.close();
});
