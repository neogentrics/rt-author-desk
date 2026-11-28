'use strict';
// Lulu's sales report, on made-up files laid out from Lulu's description of its columns. None of this has been checked on a real report.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApi } = require('../src/main/api');
const { Catalog } = require('../src/main/catalog');
const { exportAll } = require('../src/main/export');
const { ImportError, Importer } = require('../src/main/importer');
const { COLUMNS, readLulu } = require('../src/main/reports/lulu');
const { readTable } = require('../src/main/reports/mapped');
const { Library } = require('../src/main/storage/library');
const { STEPS } = require('../src/main/storage/schema');
const { toDecimalString } = require('../src/shared/money');
const { parseCsv } = require('../src/shared/csv');
const { HEADINGS, ME, THEM, line, makeLulu } = require('./helpers/make-lulu.cjs');
const { makeXlsx, madeUpKdpOrders } = require('./helpers/make-xlsx.cjs');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const refused = (fn, pattern) => assert.throws(fn, (error) => error instanceof ImportError && pattern.test(error.message), String(pattern));
const read = (buffer, context) => {
  const { sheets } = readTable(buffer, 'lulu.csv');
  return readLulu({ sheets }, context);
};
function start() {
  const library = new Library(temp(), { now: () => new Date('2026-11-27T12:00:00Z') }).open();
  const importer = new Importer(library, { locale: 'en-US', now: () => new Date('2026-11-27T12:00:00Z') });
  return { library, importer };
}
const take = (importer, buffer, name = 'lulu.csv', choices) => importer.accept({ previewId: importer.preview(buffer, name, choices).previewId });
const lines = (library) => library.list('sale_lines');
const shown = (list) => list.map((t) => `${t.currency} ${t.amount}`);
// What the library says was earned and paid in one currency.
const money = (importer, currency = 'USD') => {
  const found = importer.earnedVsPaid().currencies.find((c) => c.currency === currency);
  return found && { earned: found.totals.earned.amount, paid: found.totals.paid.amount, owed: found.totals.owed.amount };
};

// ---- Reading ----------------------------------------------------------------------------------------------------------------

test('a sale is read with its own money: Payee Revenue for the whole line, and the prices for one copy, never multiplied', () => {
  const report = read(makeLulu([line({ Qty: '3', 'List Price Each': '15.00', 'Author Discounted Price Each': '12.50', 'Revenue After Fees': '12.34', 'Payee Revenue': '12.34', 'Net Revenue': '40.00', 'Lulu Share': '27.66' })]));
  assert.ok(report.complete, JSON.stringify(report.counts));
  const [sale] = report.sales;
  assert.equal(toDecimalString(sale.royalty), '12.34');
  assert.equal(toDecimalString(sale.listPrice), '15.00', 'for one copy, as written');
  assert.equal(toDecimalString(sale.offerPrice), '12.50');
  assert.equal(sale.netUnits, 3);
  assert.equal(sale.royaltyDate, '2026-09-14');
  assert.equal(sale.storeId, 'pid-aaaa11');
  assert.equal(sale.marketplace, 'US');
  assert.equal(toDecimalString(report.totals.get('USD')), '12.34');
  assert.match(report.notes.join(' '), /not yet been checked on a real file/);
});

test('columns are found by their headings, in any order, with or without the "(y/n)", whatever the capitals', () => {
  const usual = read(makeLulu()).sales[0];
  const backwards = read(makeLulu([line()], { headings: [...HEADINGS].reverse() })).sales[0];
  const rename = { 'Self-Purchase (y/n)': 'Self-Purchase', 'Royalties (y/n)': 'royalties', 'Paid (y/n)': 'PAID (Y/N)  ', 'Payee Revenue': ' payee  revenue ' };
  const plainer = read(makeLulu([line()], { rename })).sales[0];
  for (const other of [backwards, plainer]) {
    assert.deepEqual([other.fingerprint, other.royalty, other.paid, other.storeId], [usual.fingerprint, usual.royalty, usual.paid, usual.storeId]);
  }
});

test('every heading the reader needs stops the import when it is missing or renamed, and is named', () => {
  const { library, importer } = start();
  for (const name of Object.values(COLUMNS)) {
    const gone = makeLulu([line()], { rename: { [name]: `${name} changed` } });
    refused(() => importer.preview(gone, 'lulu.csv'), new RegExp(`no column called "${name.replace(/[()#/]/g, '\\$&')}".*Nothing was imported`));
  }
  assert.equal(lines(library).length, 0);
  library.close();
});

test('the columns the reader does not use may be missing', () => {
  const used = new Set(Object.values(COLUMNS));
  const report = read(makeLulu([line()], { headings: HEADINGS.filter((name) => used.has(name)) }));
  assert.equal(toDecimalString(report.sales[0].royalty), '6.00');
});

test('two columns with the same needed heading are refused, not chosen between', () => {
  const text = makeLulu().toString().split('\r\n');
  const twice = Buffer.from([`${text[0]},Payee Revenue`, `${text[1]},99.00`].join('\n'));
  const { library, importer } = start();
  refused(() => importer.preview(twice, 'lulu.csv'), /two columns called "Payee Revenue"/);
  library.close();
});

test('a cell that cannot be read stops everything and says which row and which column', () => {
  const { library, importer } = start();
  const bad = [
    [{ Type: 'Chargeback' }, /row 3: "Type" should be Sale or Refund/],
    [{ 'Paid (y/n)': '' }, /row 3: "Paid \(y\/n\)" should be y or n/],
    [{ 'Royalties (y/n)': 'maybe' }, /row 3: "Royalties \(y\/n\)" should be y or n/],
    [{ Qty: '1.5' }, /row 3: "Qty" isn't a whole number/],
    [{ 'Payee Revenue': '' }, /row 3: "Payee Revenue" is empty/],
    [{ 'Payee Revenue': '3,50' }, /row 3: "Payee Revenue" isn't an amount the app can read: "3,50"/],
    [{ 'Converted Revenue': 'about six' }, /row 3: "Converted Revenue" isn't an amount/],
    [{ 'Sales Currency': 'Dollars' }, /row 3: "Sales Currency" isn't a currency/],
    [{ 'Payee Revenue Currency': '' }, /row 3: "Payee Revenue Currency" isn't a currency/],
    [{ 'Sale Date': 'last week' }, /row 3: the sale date/],
  ];
  for (const [changes, pattern] of bad) refused(() => importer.preview(makeLulu([line(), line({ 'Reference Number': 'R-2', ...changes })]), 'lulu.csv'), pattern);
  refused(() => importer.preview(makeLulu([line({ Payee: '' })]), 'lulu.csv'), /Row 2 .* no payee/);
  refused(() => importer.preview(makeLulu([]), 'lulu.csv'), /no sales under the headings/);
  assert.equal(lines(library).length, 0);
  library.close();
});

test('an amount with commas between thousands is read, and more places than the currency has are rounded once and said', () => {
  const report = read(makeLulu([line({ 'Payee Revenue': '1,234.5678' })]));
  assert.equal(toDecimalString(report.sales[0].royalty), '1234.57');
  assert.match(report.notes.join(' '), /rounded once/);
  assert.doesNotMatch(read(makeLulu([line({ 'Payee Revenue': '6.0000' })])).notes.join(' '), /rounded once/, 'zeros after the cents change nothing');
});

test('two sale currencies are kept apart, and each line keeps its own', () => {
  const { library, importer } = start();
  const file = makeLulu([line(), line({ 'Reference Number': 'R-2', Region: 'GB', 'Sales Currency': 'GBP', 'Payee Revenue': '4.10', 'Converted Revenue': '5.43' })]);
  assert.deepEqual(shown(importer.preview(file, 'lulu.csv').totals).sort(), ['GBP 4.10', 'USD 6.00']);
  take(importer, file);
  assert.equal(money(importer, 'GBP').earned, '4.10');
  assert.equal(money(importer, 'USD').earned, '6.00');
  library.close();
});

// ---- More than one payee ----------------------------------------------------------------------------------------------------

const shared = () => makeLulu([
  line({ 'Payee Percent': '75', 'Payee Revenue': '4.50', 'Converted Revenue': '4.50' }),
  line({ Payee: THEM, 'Payee Percent': '25', 'Payee Revenue': '1.50', 'Converted Revenue': '1.50' }),
  line({ 'Reference Number': 'R-2', 'Payee Percent': '75', 'Payee Revenue': '3.00', 'Converted Revenue': '3.00' }),
  line({ 'Reference Number': 'R-2', Payee: THEM, 'Payee Percent': '25', 'Payee Revenue': '1.00', 'Converted Revenue': '1.00' }),
]);

test('a report with two payees asks which is you, and reads nothing until it is told', () => {
  const { library, importer } = start();
  const preview = importer.preview(shared(), 'lulu.csv');
  assert.deepEqual(preview.needs, ['payee']);
  assert.deepEqual(preview.ask.payees, [{ name: ME, rows: 2, chosen: false }, { name: THEM, rows: 2, chosen: false }]);
  assert.deepEqual(preview.totals, [], 'no total is shown: adding every line would count the sales twice');
  refused(() => importer.accept({ previewId: preview.previewId }), /Answer the question about the payee first/);
  assert.equal(lines(library).length, 0);
  library.close();
});

test('only your own lines are saved and totalled, the other payee\'s are set aside and named, and it is not asked again', () => {
  const { library, importer } = start();
  const first = importer.preview(shared(), 'lulu.csv');
  const answered = importer.review({ previewId: first.previewId, payees: [ME] });
  assert.equal(answered.needs, null);
  assert.deepEqual(shown(answered.totals), ['USD 7.50']);
  assert.deepEqual(answered.counts, { 'not a sale': 1, imported: 2, 'set aside': 2 });
  assert.match(answered.notes.join(' '), /another payee's share: Made-up Illustrator \(2 lines\)/);
  assert.deepEqual(answered.ask.payees.map((p) => p.chosen), [true, false], 'the choice can still be changed');
  importer.accept({ previewId: answered.previewId });
  assert.deepEqual(lines(library).map((l) => [l.payee, l.royalty]), [[ME, '450'], [ME, '300']]);

  const later = makeLulu([line({ 'Reference Number': 'R-3', 'Payee Revenue': '2.00' }), line({ 'Reference Number': 'R-3', Payee: THEM, 'Payee Revenue': '9.00' })]);
  const next = importer.preview(later, 'lulu-2.csv');
  assert.equal(next.needs, null, 'the payee already in the library is taken to be you');
  assert.deepEqual(shown(next.totals), ['USD 2.00']);
  library.close();
});

test('ticking both names keeps both, for someone paid under two names', () => {
  const { library, importer } = start();
  const first = importer.preview(shared(), 'lulu.csv');
  const both = importer.review({ previewId: first.previewId, payees: [ME, THEM] });
  assert.deepEqual(shown(both.totals), ['USD 10.00']);
  library.close();
});

test('a report with only someone else\'s lines is asked about, once your own name is known', () => {
  const { library, importer } = start();
  take(importer, makeLulu());
  const theirs = importer.preview(makeLulu([line({ 'Reference Number': 'R-9', Payee: THEM })]), 'theirs.csv');
  assert.deepEqual(theirs.needs, ['payee']);
  assert.equal(lines(library).length, 1);
  library.close();
});

test('an answer that names nobody in the file, or a file that is no longer open, changes nothing', () => {
  const { library, importer } = start();
  const first = importer.preview(shared(), 'lulu.csv');
  assert.deepEqual(importer.review({ previewId: first.previewId, payees: ['Nobody'] }).needs, ['payee']);
  refused(() => importer.review({ previewId: first.previewId, payees: [ME] }), /no longer open/);
  const kdp = importer.preview(madeUpKdpOrders(), 'orders.xlsx');
  refused(() => importer.review({ previewId: kdp.previewId, payees: [ME] }), /no longer open/);
  library.close();
});

// ---- Paid and estimated -----------------------------------------------------------------------------------------------------

test('what is paid and what is still an estimate are kept apart, in the sale\'s currency and in the one you are paid in', () => {
  const { library, importer } = start();
  const file = makeLulu([
    line({ 'Paid (y/n)': 'y', 'Sales Currency': 'GBP', 'Payee Revenue': '4.00', 'Converted Revenue': '5.30' }),
    line({ 'Reference Number': 'R-2', 'Sales Currency': 'GBP', 'Payee Revenue': '2.00', 'Converted Revenue': '2.61' }),
  ]);
  const preview = importer.preview(file, 'lulu.csv');
  assert.match(preview.notes.join(' '), /marks as paid come to 5\.30 USD/);
  assert.match(preview.notes.join(' '), /not yet paid come to about 2\.61 USD.*estimate/);
  assert.doesNotMatch(preview.notes.join(' '), /7\.91/, 'the two are never added');
  importer.accept({ previewId: preview.previewId });
  assert.deepEqual(lines(library).map((l) => [l.paid, l.estimate, l.converted, l.converted_currency]), [[1, 0, '530', 'USD'], [0, 1, '261', 'USD']]);
  assert.deepEqual(money(importer, 'GBP'), { earned: '6.00', paid: '4.00', owed: '2.00' });
  assert.deepEqual(importer.earnedVsPaid().currencies[0].months[0].statuses, ['Part paid, says the sales report'], 'not called paid while some of the month is not');
  const [converted] = importer.earnedVsPaid().converted;
  assert.deepEqual([converted.currency, converted.paid.amount, converted.estimate.amount], ['USD', '5.30', '2.61']);
  assert.equal(money(importer, 'USD'), undefined, 'converted money is never counted as a second lot of earnings');
  library.close();
});

test('a converted amount can be empty', () => {
  const { library, importer } = start();
  take(importer, makeLulu([line({ 'Converted Revenue': '', 'Payee Revenue Currency': '' })]));
  assert.deepEqual([lines(library)[0].converted, lines(library)[0].converted_currency], [null, null]);
  assert.deepEqual(importer.earnedVsPaid().converted, []);
  library.close();
});

// ---- Refunds, your own copies, and other revenue ------------------------------------------------------------------------------

test('a refund is taken off whether Lulu writes it with a minus or without one', () => {
  for (const [qty, revenue] of [['-1', '-3.00'], ['1', '3.00']]) {
    const { library, importer } = start();
    take(importer, makeLulu([line(), line({ 'Reference Number': 'R-2', Type: 'Refund', Qty: qty, 'Payee Revenue': revenue, 'Converted Revenue': revenue })]));
    assert.equal(money(importer).earned, '3.00', `${qty} ${revenue}`);
    const refund = lines(library).find((l) => l.transaction_type === 'Refund');
    assert.deepEqual([refund.royalty, refund.converted, refund.net_units, refund.units_refunded], ['-300', '-300', -1, 1]);
    library.close();
  }
});

test('your own purchases are kept and marked, and other revenue is told apart from royalties', () => {
  const { library, importer } = start();
  const preview = importer.preview(makeLulu([
    line({ 'Self-Purchase (y/n)': 'y', 'Payee Revenue': '0.00' }),
    line({ 'Reference Number': 'R-2', 'Royalties (y/n)': 'n' }),
  ]), 'lulu.csv');
  assert.match(preview.notes.join(' '), /One line is your own purchase/);
  assert.match(preview.notes.join(' '), /other revenue rather than a royalty/);
  importer.accept({ previewId: preview.previewId });
  assert.deepEqual(lines(library).map((l) => [l.self_purchase, l.royalty_type]), [[1, 'Royalty'], [0, 'Other revenue']]);
  library.close();
});

test('a total or a note under the sales is left out and named, and every row of the file has one outcome', () => {
  const report = read(makeLulu([line(), { 'Payee Revenue': '6.00' }, {}]));
  assert.ok(report.complete);
  assert.deepEqual(report.counts, { 'not a sale': 3, imported: 1 });
  assert.equal(report.rowsInFile, 4);
  assert.match(report.notes.join(' '), /total or a note, with no sale on it: row 3/);
});

// ---- The same sale in a later download --------------------------------------------------------------------------------------

const september = () => makeLulu([
  line({ 'Payee Revenue': '6.00', 'Converted Revenue': '6.10' }),
  line({ 'Reference Number': 'R-2', 'Payee Revenue': '2.00', 'Converted Revenue': '2.00' }),
]);
// The next download: the first sale is paid now, with the amount really paid, and there is one new sale.
const october = () => makeLulu([
  line({ 'Reported Date': '10/2026', 'Payee Revenue': '6.00', 'Converted Revenue': '5.97', 'Paid (y/n)': 'y' }),
  line({ 'Reference Number': 'R-2', 'Payee Revenue': '2.00', 'Converted Revenue': '2.05' }),
  line({ 'Reference Number': 'R-3', 'Sale Date': '2026-10-02', 'Payee Revenue': '1.00', 'Converted Revenue': '1.00' }),
]);

test('a later download updates a sale that has been paid, and counts nothing twice', () => {
  const { library, importer } = start();
  take(importer, september(), 'september.csv');
  const preview = importer.preview(october(), 'october.csv');
  assert.deepEqual(preview.counts, { 'not a sale': 1, replaced: 1, duplicate: 1, imported: 1 });
  assert.deepEqual([preview.newRows, preview.updatedRows], [1, 1]);
  assert.match(preview.notes.join(' '), /now marked paid, and will be updated, not added again/);
  assert.deepEqual(preview.period, { start: '2026-09-01', end: '2026-10-31' }, 'the months of what changes');
  const done = importer.accept({ previewId: preview.previewId });
  assert.equal(done.updatedRows, 1);
  assert.equal(lines(library).length, 3);
  assert.deepEqual(money(importer), { earned: '9.00', paid: '6.00', owed: '3.00' });
  const [first] = lines(library);
  assert.deepEqual([first.paid, first.estimate, first.converted], [1, 0, '597']);
  library.close();
});

test('undoing the later download puts back what each sale said before, and an earlier one can\'t be undone first', () => {
  const { library, importer } = start();
  const a = take(importer, september(), 'september.csv');
  const b = take(importer, october(), 'october.csv');
  refused(() => importer.undo({ id: a.reportId }), /later import \("october\.csv"\) updated rows from this one\. Undo that one first/);
  assert.equal(lines(library).length, 3, 'nothing was changed by being refused');
  assert.deepEqual(importer.undo({ id: b.reportId }), { removed: 1, restored: 1 });
  const [first] = lines(library);
  assert.deepEqual([first.paid, first.estimate, first.converted, first.royalty], [0, 1, '610', '600']);
  assert.deepEqual(money(importer), { earned: '8.00', paid: '0.00', owed: '8.00' });
  assert.deepEqual(importer.undo({ id: a.reportId }), { removed: 2 });
  assert.equal(lines(library).length, 0);
  library.close();
});

test('an older download imported after a newer one never makes a paid sale unpaid', () => {
  const { library, importer } = start();
  take(importer, october(), 'october.csv');
  const preview = importer.preview(september(), 'september.csv');
  assert.deepEqual([preview.newRows, preview.updatedRows, preview.counts.duplicate], [0, 0, 2]);
  importer.accept({ previewId: preview.previewId });
  assert.deepEqual(money(importer), { earned: '9.00', paid: '6.00', owed: '3.00' });
  library.close();
});

test('the same sale with another amount is set aside and named with both figures, and what is in the library is kept', () => {
  const { library, importer } = start();
  take(importer, september(), 'september.csv');
  const preview = importer.preview(makeLulu([line({ 'Payee Revenue': '5.50', 'Converted Revenue': '5.50' })]), 'again.csv');
  assert.deepEqual(preview.counts, { 'not a sale': 1, 'set aside': 1 });
  assert.match(preview.notes.join(' '), /row 2: the file says \$5\.50 and your library has \$6\.00/);
  importer.accept({ previewId: preview.previewId });
  assert.equal(money(importer).earned, '8.00');
  library.close();
});

test('a sale that is paid and has another amount is updated, and the change is said', () => {
  const { library, importer } = start();
  take(importer, september(), 'september.csv');
  const preview = importer.preview(makeLulu([line({ 'Payee Revenue': '5.80', 'Paid (y/n)': 'y' })]), 'paid.csv');
  assert.match(preview.notes.join(' '), /What you earned changed on one of them: row 2: \$6\.00 is now \$5\.80/);
  importer.accept({ previewId: preview.previewId });
  assert.deepEqual(money(importer), { earned: '7.80', paid: '5.80', owed: '2.00' });
  library.close();
});

test('two lines that are alike in one file are two sales, and the file read again finds both', () => {
  const { library, importer } = start();
  take(importer, makeLulu([line(), line()]), 'two.csv');
  assert.equal(money(importer).earned, '12.00');
  const again = importer.preview(makeLulu([line(), line(), line({ 'Reference Number': 'R-2' })]), 'more.csv');
  assert.deepEqual([again.newRows, again.counts.duplicate], [1, 2]);
  library.close();
});

test('the same file twice is refused, and an undone one can be imported again', () => {
  const { library, importer } = start();
  const done = take(importer, september());
  const again = importer.preview(september(), 'copy.csv');
  assert.ok(again.alreadyImported);
  refused(() => importer.accept({ previewId: again.previewId }), /already imported this exact file/);
  importer.undo({ id: done.reportId });
  assert.equal(take(importer, september()).newRows, 2);
  library.close();
});

test('a number written another way in a later download is still the same sale', () => {
  const { library, importer } = start();
  take(importer, makeLulu());
  const again = importer.preview(makeLulu([line({ 'List Price Each': '15', 'Author Discounted Price Each': '15.0000', Qty: '2.0', Type: 'sale', 'Sale Date': '2026-09-14 08:30:00' })]), 'resaved.csv');
  assert.deepEqual([again.newRows, again.counts.duplicate], [0, 1]);
  library.close();
});

// ---- Dates -------------------------------------------------------------------------------------------------------------------

test('a date order the file shows is used, one it does not is asked for, and one written both ways is refused', () => {
  assert.equal(read(makeLulu([line({ 'Sale Date': '09/14/2026' }), line({ 'Sale Date': '09/03/2026' })])).sales[1].royaltyDate, '2026-09-03');
  assert.equal(read(makeLulu([line({ 'Sale Date': '14/09/2026' }), line({ 'Sale Date': '03/09/2026' })])).sales[1].royaltyDate, '2026-09-03');
  const unsure = read(makeLulu([line({ 'Sale Date': '03/09/2026' })]));
  assert.deepEqual([unsure.needs, unsure.ask.dateOrder.example], [['date order'], '03/09/2026']);
  assert.equal(read(makeLulu([line({ 'Sale Date': '03/03/2026' })])).sales[0].royaltyDate, '2026-03-03', 'a date that reads the same either way asks nothing');
  const { library, importer } = start();
  refused(() => importer.preview(makeLulu([line({ 'Sale Date': '14/09/2026' }), line({ 'Sale Date': '09/14/2026' })]), 'lulu.csv'), /some sale dates with the month first and some with the day first/);
  library.close();
});

test('the date order is asked for, and answering it differently another time never counts a sale twice', () => {
  const { library, importer } = start();
  const first = importer.preview(makeLulu([line({ 'Sale Date': '03/09/2026' })]), 'a.csv');
  const answered = importer.review({ previewId: first.previewId, dateOrder: 'day-first' });
  importer.accept({ previewId: answered.previewId });
  assert.equal(lines(library)[0].period, '2026-09');
  const other = importer.preview(makeLulu([line({ 'Sale Date': '03/09/2026', 'Reported Date': '10/2026' })]), 'b.csv', { dateOrder: 'month-first' });
  assert.deepEqual([other.newRows, other.counts.duplicate], [0, 1]);
  library.close();
});

// ---- Beside the rest of the app ------------------------------------------------------------------------------------------------

test('a book is found by Lulu\'s Product ID on a listing, and one that is not is asked about once', () => {
  const { library, importer } = start();
  const catalog = new Catalog(library);
  const book = catalog.saveBook({ title: 'The Lantern Road' });
  const edition = catalog.saveEdition({ book_id: book.id, format: 'paperback' });
  catalog.saveListing({ edition_id: edition.id, store_id: 'store-lulu', status: 'live', store_item_id: 'pid-aaaa11' });
  take(importer, makeLulu([line(), line({ 'Reference Number': 'R-2', 'Product ID': 'pid-bbbb22', Title: 'Low Water' })]));
  assert.equal(lines(library)[0].edition_id, edition.id);
  assert.deepEqual(importer.needsMatching().map((i) => [i.storeItem, i.storeName]), [['pid-bbbb22', 'Lulu']]);
  library.close();
});

// The same sales read with Match your columns, which 1.2.0 offered for Lulu.
const matched = (importer, buffer) => {
  const file = importer.openColumns(buffer, 'lulu-matched.csv');
  const at = (name) => file.sheets[0].headers.indexOf(name);
  return importer.previewColumns({ id: file.id, sheet: file.sheets[0].name, storeId: 'store-lulu',
    mapping: { date: at('Sale Date'), title: at('Title'), royalty: at('Payee Revenue'), units: at('Qty'), currency: at('Sales Currency') } });
};

test('months already read with Match your columns are not counted again by the Lulu reader, and the other way round', () => {
  const one = start();
  one.importer.accept({ previewId: matched(one.importer, september()).previewId });
  refused(() => one.importer.preview(october(), 'october.csv'), /already has Lulu sales for 2026-09 from "lulu-matched\.csv", read with Match your columns.*undo that import/);
  const november = makeLulu([line({ 'Reference Number': 'R-8', 'Sale Date': '2026-11-03' })]);
  assert.equal(one.importer.preview(november, 'november.csv').newRows, 1, 'other months are welcome');
  one.library.close();

  const two = start();
  take(two.importer, september(), 'september.csv');
  refused(() => matched(two.importer, october()), /already has Lulu sales for 2026-09 from "september\.csv", read by the app's own reader/);
  two.library.close();
});

test('a CSV or a workbook is read, and one that is nobody\'s report says so', () => {
  const rows = parseCsv(makeLulu().toString());
  assert.equal(read(makeLulu()).sales.length, 1);
  const { library, importer } = start();
  assert.equal(importer.preview(makeXlsx([{ name: 'Sales', rows }]), 'lulu.xlsx').store, 'Lulu');
  refused(() => importer.preview(Buffer.from('Date,Title,Units\n2026-09-01,A Book,3\n'), 'other.csv'), /isn't a report the app can read yet.*Match your columns.*Nothing was imported/);
  refused(() => importer.preview(Buffer.from('a,b\n"never closed'), 'broken.csv'), /never closed.*Nothing was imported/);
  library.close();
});

test('the window can ask for a Lulu report to be read again with an answer, and gets plain data or plain words', () => {
  const library = new Library(temp()).open();
  const { call, importer } = createApi(library, { locale: 'en-US' });
  const first = importer.preview(shared(), 'lulu.csv');
  const next = call('reviewReport', { previewId: first.previewId, payees: [ME] });
  assert.equal(next.ok, true, next.message);
  assert.equal(next.value.newRows, 2);
  assert.equal(call('acceptReport', { previewId: next.value.previewId }).ok, true);
  assert.equal(call('earnings').value.currencies.length, 1);
  assert.match(call('reviewReport', { previewId: 'nope' }).message, /no longer open/);
  library.close();
});

test('the export holds the payee, what was paid and the converted amount as a decimal', () => {
  const { library, importer } = start();
  take(importer, makeLulu([line({ 'Paid (y/n)': 'y', 'Converted Revenue': '5.97' })]));
  const { folder } = exportAll(library, temp());
  const [head, row] = parseCsv(fs.readFileSync(path.join(folder, 'csv', 'sale-lines.csv'), 'utf8').replace(/^./, ''));
  const cell = (name) => row[head.indexOf(name)];
  assert.deepEqual([cell('payee'), cell('paid'), cell('self_purchase'), cell('converted_decimal'), cell('converted_currency')], [ME, '1', '0', '5.97', 'USD']);
  library.close();
});

test('a library from before this step is brought forward with its sales unchanged, and keeps a copy from before', () => {
  const dir = temp();
  const newer = STEPS.splice(10); // as the app was at step 10
  let id;
  try {
    const old = new Library(dir).open();
    assert.equal(old.info().step, 10);
    old.db.prepare(`INSERT INTO sale_lines (id, report_id, fingerprint, store_id, period, currency, royalty, created_at, updated_at, device_id)
      VALUES ('s1', 'r1', 'f1', 'store-kdp', '2026-09', 'USD', '207', 'x', 'x', 'x')`).run();
    old.db.prepare(`INSERT INTO report_files (id, store_id, kind, fingerprint, rows_in_file, created_at, updated_at, device_id)
      VALUES ('r1', 'store-kdp', 'kdp-orders', 'file', 1, 'x', 'x', 'x')`).run();
    id = old.info().id;
    old.close();
  } finally {
    STEPS.push(...newer);
  }
  const library = new Library(dir).open();
  assert.equal(library.info().step, STEPS.at(-1).version);
  assert.equal(library.info().id, id);
  assert.deepEqual([library.get('sale_lines', 's1').royalty, library.get('sale_lines', 's1').payee, library.get('sale_lines', 's1').paid, library.get('sale_lines', 's1').converted], ['207', '', 0, null]);
  assert.equal(library.get('report_files', 'r1').replaced, '[]');
  assert.ok(library.migration.backup && fs.existsSync(library.migration.backup));
  assert.deepEqual(new Importer(library).undo({ id: 'r1' }), { removed: 1 });
  library.close();
});

// A real report is private and never committed. When any are in test/private/lulu/, each is read here, with every payee taken as yours.
const privateDir = path.join(__dirname, 'private', 'lulu');
const real = fs.existsSync(privateDir) ? fs.readdirSync(privateDir).filter((name) => /\.(csv|xlsx)$/i.test(name)) : [];
test('real Lulu reports: recognized, and every row accounted for', { skip: real.length ? false : 'no real reports in test/private/lulu' }, () => {
  for (const name of real) {
    const buffer = fs.readFileSync(path.join(privateDir, name));
    const { sheets } = readTable(buffer, name);
    const first = readLulu({ sheets }, { choices: { dateOrder: 'month-first' } });
    assert.ok(first, 'recognized as Lulu\'s');
    const report = first.needs ? readLulu({ sheets }, { choices: { dateOrder: 'month-first', payees: first.ask.payees.map((p) => p.name) } }) : first;
    assert.ok(report.complete, JSON.stringify(report.counts));
  }
});
