'use strict';
// Barnes & Noble Press's sales report, on made-up files laid out from the columns its help page lists. None of this has been checked on a
// real report.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Catalog } = require('../src/main/catalog');
const { exportAll } = require('../src/main/export');
const { ImportError, Importer } = require('../src/main/importer');
const { COLUMNS, OPTIONAL, readBnPress } = require('../src/main/reports/bn-press');
const { readTable } = require('../src/main/reports/mapped');
const { readWorkbook } = require('../src/main/reports/xlsx');
const { Library } = require('../src/main/storage/library');
const { toDecimalString } = require('../src/shared/money');
const { parseCsv, stringifyCsv } = require('../src/shared/csv');
const { HEADINGS, makeBn, row, table } = require('./helpers/make-bn.cjs');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const refused = (fn, pattern) => assert.throws(fn, (error) => error instanceof ImportError && pattern.test(error.message), String(pattern));
const read = (buffer, context) => readBnPress(readWorkbook(buffer), context);
function start() {
  const library = new Library(temp(), { now: () => new Date('2026-11-27T12:00:00Z') }).open();
  const importer = new Importer(library, { locale: 'en-US', now: () => new Date('2026-11-27T12:00:00Z') });
  return { library, importer };
}
const take = (importer, buffer, name = 'bn.xlsx', options) => importer.accept({ previewId: importer.preview(buffer, name).previewId, ...options });
const lines = (library) => library.list('sale_lines');
const earned = (importer) => Object.fromEntries(importer.earnedVsPaid().currencies.map((c) => [c.currency, c.totals.earned.amount]));

test('the made-up report has the 17 columns the help page lists, and a row is read with its own figures', () => {
  assert.equal(HEADINGS.length, 17);
  const report = read(makeBn());
  assert.ok(report.complete, JSON.stringify(report.counts));
  const [sale] = report.sales;
  assert.deepEqual([sale.royaltyDate, sale.title, sale.storeId, sale.royaltyType], ['2026-09-14', 'The Lantern Road', '2940000000001', '65%']);
  assert.deepEqual([sale.unitsSold, sale.unitsRefunded, sale.netUnits], [3, 0, 3]);
  assert.equal(toDecimalString(sale.royalty), '9.75', 'Total Royalty, not the unit royalty');
  assert.equal(toDecimalString(sale.listPrice), '4.99');
  assert.equal(sale.priceCurrency, null);
  assert.equal(sale.estimate, true);
  assert.deepEqual(report.problems, []);
  assert.match(report.notes.join(' '), /not yet been checked on a real file/);
});

test('columns are found by their headings, in any order, whatever the capitals or the spaces by the slash', () => {
  const usual = read(makeBn()).sales[0];
  const backwards = read(makeBn([row()], { headings: [...HEADINGS].reverse() })).sales[0];
  const plainer = read(makeBn([row()], { rename: { 'BN ID / ISBN': 'BN ID/ISBN', Format: 'Format (eBook, Print Hardcover, Print Paperback)', 'Unit Royalty': ' UNIT  royalty ' } })).sales[0];
  for (const other of [backwards, plainer]) assert.deepEqual([other.fingerprint, other.royalty, other.netUnits], [usual.fingerprint, usual.royalty, usual.netUnits]);
});

test('a title and a date range above the headings, and a total under the rows, are left out and accounted for', () => {
  const report = read(makeBn([row(), { 'Sale Date': 'Total', 'Net Units Sold': 3, 'Total Royalty': 9.75 }], { above: [['Sales report'], ['September 2026'], []] }));
  assert.ok(report.complete, JSON.stringify(report.counts));
  assert.deepEqual(report.counts, { 'not a sale': 5, imported: 1 });
  assert.equal(toDecimalString(report.totals.get('USD')), '9.75', 'the total line is not added again');
  assert.match(report.notes.join(' '), /total or a note, with no sale on it: row 6/);
});

test('every needed heading stops the import when it is missing or renamed, and is named', () => {
  const { library, importer } = start();
  assert.equal(Object.keys(COLUMNS).length, 12);
  for (const name of Object.values(COLUMNS)) {
    const gone = makeBn([row()], { rename: { [name]: `${name} changed` } });
    refused(() => importer.preview(gone, 'bn.xlsx'), new RegExp(`no column called "${name.replace(/[/]/g, '\\$&')}".*Nothing was imported`));
  }
  assert.equal(lines(library).length, 0);
  library.close();
});

test('the columns the reader can do without may be missing', () => {
  const report = read(makeBn([row()], { headings: HEADINGS.filter((name) => !Object.values(OPTIONAL).includes(name) && name !== 'Publisher') }));
  assert.equal(toDecimalString(report.sales[0].royalty), '9.75');
  assert.deepEqual([report.sales[0].author, report.sales[0].royaltyType, report.sales[0].cost], ['', '', null]);
});

test('a needed heading there twice, or two sheets with the headings, are refused and not chosen between', () => {
  const { library, importer } = start();
  const rows = table([row()]);
  const twice = makeBn([row()], { headings: [...HEADINGS, 'Total Royalty'] });
  refused(() => importer.preview(twice, 'bn.xlsx'), /two columns called "Total Royalty"/);
  refused(() => importer.preview(makeBn([row()], { sheets: [{ name: 'Again', rows }] }), 'bn.xlsx'), /more than one sheet \("Sales", "Again"\).*reads none of them/);
  library.close();
});

test('another sheet without the headings is not read, and is named', () => {
  const report = read(makeBn([row()], { sheets: [{ name: 'About', rows: [['Made-up notes']] }] }));
  assert.ok(report.complete);
  assert.match(report.notes.join(' '), /Not read, because only one sheet has the sales headings: "About"/);
});

// ---- Two currencies -----------------------------------------------------------------------------------------------------------

const abroad = (changes = {}) => row({ 'Sale Date': '2026-09-15', 'Selling Currency': 'GBP', 'List Price': 3.99, 'Unit Royalty': 3.1, 'Units Sold': 2, 'Net Units Sold': 2, 'Total Royalty': 6.2, ...changes });

test('the royalty is in the payment currency, and the list price stays in the currency it was sold in', () => {
  const { library, importer } = start();
  const file = makeBn([row(), abroad()]);
  const preview = importer.preview(file, 'bn.xlsx');
  assert.deepEqual(preview.totals.map((t) => `${t.currency} ${t.amount}`), ['USD 15.95'], 'both royalties are in dollars, whatever the copies were sold in');
  assert.match(preview.notes.join(' '), /another currency \(GBP\)/);
  importer.accept({ previewId: preview.previewId });
  assert.deepEqual(lines(library).map((l) => [l.currency, l.royalty, l.list_price, l.price_currency]), [['USD', '975', '499', null], ['USD', '620', '399', 'GBP']]);
  assert.deepEqual(earned(importer), { USD: '15.95' }, 'nothing is counted in pounds');

  const { folder } = exportAll(library, temp());
  const [head, , second] = parseCsv(fs.readFileSync(path.join(folder, 'csv', 'sale-lines.csv'), 'utf8').replace(/^./, ''));
  assert.deepEqual(['currency', 'price_currency', 'list_price_decimal', 'royalty_decimal'].map((n) => second[head.indexOf(n)]), ['USD', 'GBP', '3.99', '6.20']);
  library.close();
});

test('a currency without cents keeps its own places in the export', () => {
  const { library, importer } = start();
  take(importer, makeBn([abroad({ 'Selling Currency': 'JPY', 'List Price': 700 })]));
  const { folder } = exportAll(library, temp());
  const [head, first] = parseCsv(fs.readFileSync(path.join(folder, 'csv', 'sale-lines.csv'), 'utf8').replace(/^./, ''));
  assert.deepEqual([first[head.indexOf('list_price')], first[head.indexOf('list_price_decimal')]], ['700', '700']);
  library.close();
});

test('print cost is kept only when the two currencies are the same, because the report does not say which it is in', () => {
  const print = { Format: 'Print Paperback', 'BN ID / ISBN': '9780306406157', 'List Price': 14.99, 'Print Cost': 4.2 };
  const report = read(makeBn([row(print), abroad({ ...print, 'Sale Date': '2026-09-16' })]));
  assert.deepEqual(report.sales.map((s) => s.cost && toDecimalString(s.cost)), ['4.20', null]);
  assert.match(report.notes.join(' '), /print cost of one row is not kept/);
  assert.equal(read(makeBn([row({ 'Print Cost': 'N/A' })])).sales[0].cost, null);
});

// ---- The report's own arithmetic ------------------------------------------------------------------------------------------------

test('every row is checked: Net Units Sold times Unit Royalty is Total Royalty, in the payment currency', () => {
  const fine = read(makeBn([
    row(),
    row({ 'Sale Date': '2026-09-02', 'Unit Royalty': 2.0699999999999998, 'Units Sold': 1, 'Net Units Sold': 1, 'Total Royalty': 2.07 }),
    row({ 'Sale Date': '2026-09-03', 'Unit Royalty': 4.875, 'Units Sold': 2, 'Net Units Sold': 2, 'Total Royalty': 9.75 }),
    row({ 'Sale Date': '2026-09-04', 'Units Sold': 0, 'Units Returned': 1, 'Net Units Sold': -1, 'Total Royalty': -3.25 }),
    row({ 'Sale Date': '2026-09-05', 'Units Sold': 1, 'Units Returned': 1, 'Net Units Sold': 0, 'Total Royalty': -2.7755575615628914e-17 }),
  ]));
  assert.deepEqual(fine.problems, [], 'the crumbs a spreadsheet leaves, finer unit royalties, returns and zeros all agree');
  assert.deepEqual(fine.sales.map((s) => toDecimalString(s.royalty)), ['9.75', '2.07', '9.75', '-3.25', '0.00']);
});

test('a row that does not add up is named with both figures, refused unless you say you know, flagged for good, and never changed', () => {
  const { library, importer } = start();
  const file = makeBn([row(), row({ 'Sale Date': '2026-09-02', 'Total Royalty': 9.76 })]);
  const preview = importer.preview(file, 'bn.xlsx');
  assert.match(preview.problems[0], /^One row does not add up: row 3: 3 net units times the Unit Royalty comes to 9\.75 USD, but Total Royalty says 9\.76\.$/);
  refused(() => importer.accept({ previewId: preview.previewId }), /doesn't add up.*row 3/);
  assert.equal(lines(library).length, 0);
  importer.accept({ previewId: preview.previewId, knowingMismatch: true });
  assert.deepEqual(lines(library).map((l) => l.royalty), ['975', '976'], 'the report\'s own figure is kept as it is');
  assert.equal(importer.reports()[0].mismatchAccepted, true);
  assert.equal(importer.earnedVsPaid().warnings.length, 1);
  library.close();
});

test('many rows that do not add up are counted, with the first few named', () => {
  const report = read(makeBn(Array.from({ length: 8 }, (_, i) => row({ 'Sale Date': `2026-09-0${i + 1}`, 'Total Royalty': 1 }))));
  assert.match(report.problems[0], /^8 rows do not add up: row 2: .*row 6: .*; and more\.$/);
});

test('a cell that cannot be read stops everything and says which row and which column', () => {
  const { library, importer } = start();
  const bad = [
    [{ 'Units Sold': 1.5 }, /row 3: "Units Sold" isn't a whole number/],
    [{ 'Net Units Sold': '' }, /row 3: "Net Units Sold" isn't a whole number/],
    [{ 'Unit Royalty': '' }, /row 3: "Unit Royalty" is empty/],
    [{ 'Total Royalty': '9,75' }, /row 3: "Total Royalty" isn't an amount the app can read: "9,75"/],
    [{ 'List Price': 'free' }, /row 3: "List Price" isn't an amount/],
    [{ 'Payment Currency': '' }, /row 3: "Payment Currency" isn't a currency/],
    [{ 'Selling Currency': 'Pounds' }, /row 3: "Selling Currency" isn't a currency/],
    [{ 'Sale Date': 'soon' }, /row 3: the sale date/],
  ];
  for (const [changes, pattern] of bad) refused(() => importer.preview(makeBn([row(), row(changes)]), 'bn.xlsx'), pattern);
  refused(() => importer.preview(makeBn([]), 'bn.xlsx'), /no sales under the headings/);
  assert.equal(lines(library).length, 0);
  library.close();
});

test('numbers and dates as a workbook stores them are read: a date as a count of days, and a long number with an exponent', () => {
  const report = read(makeBn([row({ 'Sale Date': 46279, 'BN ID / ISBN': '9.780306406157E+12' })]));
  assert.equal(report.sales[0].royaltyDate, '2026-09-14');
  assert.equal(report.sales[0].storeId, '9780306406157');
});

test('a date order the file does not settle is asked for, and answering it differently another time counts nothing twice', () => {
  const { library, importer } = start();
  const unsure = importer.preview(makeBn([row({ 'Sale Date': '03/09/2026' })]), 'bn.xlsx');
  assert.deepEqual([unsure.needs, unsure.ask.dateOrder.example, unsure.ask.payees], [['date order'], '03/09/2026', null]);
  refused(() => importer.accept({ previewId: unsure.previewId }), /Answer the question about the date order first/);
  importer.accept({ previewId: importer.review({ previewId: unsure.previewId, dateOrder: 'day-first' }).previewId });
  const other = importer.preview(makeBn([row({ 'Sale Date': '03/09/2026' })], { name: 'Other' }), 'b.xlsx', { dateOrder: 'month-first' });
  assert.deepEqual([other.newRows, other.counts.duplicate], [0, 1]);
  library.close();
});

// ---- The same day downloaded again ----------------------------------------------------------------------------------------------

const morning = () => makeBn([row({ 'Units Sold': 1, 'Net Units Sold': 1, 'Total Royalty': 3.25 })], { name: 'Morning' });
const later = () => makeBn([row(), row({ 'List Price': 2.99, 'Unit Royalty': 1.94, 'Units Sold': 1, 'Net Units Sold': 1, 'Total Royalty': 1.94 })], { name: 'Later' });

test('one row for each price: a price change gives two rows for one book and day, and both count', () => {
  const { library, importer } = start();
  take(importer, later());
  assert.equal(lines(library).length, 2);
  assert.deepEqual(earned(importer), { USD: '11.69' });
  library.close();
});

test('a later download with more copies on a row updates it, and counts nothing twice', () => {
  const { library, importer } = start();
  take(importer, morning(), 'morning.xlsx');
  const preview = importer.preview(later(), 'later.xlsx');
  assert.deepEqual(preview.counts, { 'not a sale': 1, replaced: 1, imported: 1 });
  assert.match(preview.notes.join(' '), /One row already here has more copies in this later file/);
  assert.match(preview.notes.join(' '), /row 2: 1 net copy, \$3\.25 is now 3 net copies, \$9\.75/);
  const done = importer.accept({ previewId: preview.previewId });
  assert.deepEqual([done.newRows, done.updatedRows], [1, 1]);
  assert.equal(lines(library).length, 2);
  assert.deepEqual(earned(importer), { USD: '11.69' });
  library.close();
});

test('a return that appears later updates the row, and undo puts the earlier figures back, latest first', () => {
  const { library, importer } = start();
  const a = take(importer, makeBn(), 'first.xlsx');
  const b = take(importer, makeBn([row({ 'Units Returned': 1, 'Net Units Sold': 2, 'Total Royalty': 6.5 })]), 'second.xlsx');
  assert.deepEqual(earned(importer), { USD: '6.50' });
  refused(() => importer.undo({ id: a.reportId }), /later import \("second\.xlsx"\) updated rows from this one/);
  assert.deepEqual(importer.undo({ id: b.reportId }), { removed: 0, restored: 1 });
  const [line] = lines(library);
  assert.deepEqual([line.units_sold, line.units_refunded, line.net_units, line.royalty], [3, 0, 3, '975']);
  assert.deepEqual(importer.undo({ id: a.reportId }), { removed: 1 });
  library.close();
});

test('an older download, or other figures for the same row, are set aside and shown, and what is here is kept', () => {
  const { library, importer } = start();
  take(importer, later(), 'later.xlsx');
  const older = importer.preview(morning(), 'morning.xlsx');
  assert.deepEqual([older.newRows, older.updatedRows, older.counts['set aside']], [0, 0, 1]);
  assert.match(older.notes.join(' '), /Set aside, because your library has other figures.*row 2: the file says 1 net copy, \$3\.25 and your library has 3 net copies, \$9\.75/);
  importer.accept({ previewId: older.previewId });
  const money = importer.preview(makeBn([row({ 'Unit Royalty': 3, 'Total Royalty': 9 })]), 'other.xlsx');
  assert.match(money.notes.join(' '), /the file says \$9\.00 and your library has \$9\.75/);
  assert.deepEqual(earned(importer), { USD: '11.69' });
  library.close();
});

test('the same row in an overlapping download is a repeat, and the same file twice is refused', () => {
  const { library, importer } = start();
  const file = makeBn(); // built once: a workbook holds the time it was made, so one built again is not always the same file
  take(importer, file);
  refused(() => take(importer, file, 'copy.xlsx'), /already imported this exact file/);
  const overlap = importer.preview(makeBn([row(), row({ 'Sale Date': '2026-09-20' })]), 'overlap.xlsx');
  assert.deepEqual([overlap.newRows, overlap.counts.duplicate], [1, 1]);
  library.close();
});

// ---- Beside the rest of the app ---------------------------------------------------------------------------------------------

test('a book is found by its BN ID, by its ISBN, or for an ebook by its ebook ISBN, and never a printed book by the ebook\'s', () => {
  const { library, importer } = start();
  const catalog = new Catalog(library);
  const book = catalog.saveBook({ title: 'The Lantern Road' });
  const ebook = catalog.saveEdition({ book_id: book.id, format: 'ebook' });
  const paperback = catalog.saveEdition({ book_id: book.id, format: 'paperback' });
  catalog.addIsbn({ number: '9780306406157', editionId: paperback.id });
  catalog.addIsbn({ number: '9781861972712', editionId: ebook.id });
  take(importer, makeBn([
    row({ 'eBook ISBN': '9781861972712' }),
    row({ 'Sale Date': '2026-09-02', Format: 'Print Paperback', 'BN ID / ISBN': '9780306406157' }),
    row({ 'Sale Date': '2026-09-03', Format: 'Print Hardcover', 'BN ID / ISBN': '2940000000009', 'eBook ISBN': '9781861972712' }),
  ]));
  assert.deepEqual(lines(library).map((l) => l.edition_id), [ebook.id, paperback.id, null]);
  assert.deepEqual(importer.needsMatching().map((i) => [i.storeItem, i.storeName]), [['2940000000009', 'Barnes & Noble Press']]);
  library.close();
});

test('months already read with Match your columns are not counted again, and the other way round', () => {
  const { library, importer } = start();
  take(importer, makeBn(), 'september.xlsx');
  const file = importer.openColumns(Buffer.from(stringifyCsv([['Date', 'Title', 'Royalty', 'Currency'], ['2026-09-30', 'A Book', '1.00', 'USD']])), 'matched.csv');
  refused(() => importer.previewColumns({ id: file.id, sheet: file.sheets[0].name, storeId: 'store-bn-press', mapping: { date: 0, title: 1, royalty: 2, currency: 3 } }),
    /already has Barnes & Noble Press sales for 2026-09 from "september\.xlsx", read by the app's own reader/);
  library.close();
});

test('the same report saved as a CSV is read too, and the other readers still know their own', () => {
  const csv = Buffer.from(stringifyCsv(table([row()]), { safe: false }));
  assert.equal(readBnPress({ sheets: readTable(csv, 'bn.csv').sheets }).sales.length, 1);
  const { library, importer } = start();
  assert.equal(importer.preview(csv, 'bn.csv').store, 'Barnes & Noble Press');
  assert.equal(importer.preview(makeBn(), 'bn.xlsx').kindLabel, 'Sales report');
  const { makeLulu } = require('./helpers/make-lulu.cjs');
  assert.equal(importer.preview(makeLulu(), 'lulu.csv').store, 'Lulu');
  const { madeUpKdpOrders } = require('./helpers/make-xlsx.cjs');
  assert.equal(importer.preview(madeUpKdpOrders(), 'orders.xlsx').store, 'Amazon KDP');
  library.close();
});

// A real report is private and never committed. When any are in test/private/bn-press/, each is read here.
const privateDir = path.join(__dirname, 'private', 'bn-press');
const real = fs.existsSync(privateDir) ? fs.readdirSync(privateDir).filter((name) => /\.(csv|xlsx)$/i.test(name)) : [];
test('real Barnes & Noble Press reports: recognized, and every row accounted for', { skip: real.length ? false : 'no real reports in test/private/bn-press' }, () => {
  for (const name of real) {
    const buffer = fs.readFileSync(path.join(privateDir, name));
    const workbook = /\.csv$/i.test(name) ? { sheets: readTable(buffer, name).sheets } : readWorkbook(buffer);
    const report = readBnPress(workbook, { choices: { dateOrder: 'month-first' } });
    assert.ok(report, 'recognized as B&N Press\'s');
    assert.ok(report.complete, JSON.stringify(report.counts));
  }
});
