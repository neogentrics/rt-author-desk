'use strict';
// "Match your columns": a made-up report from a store the app has no reader for, read with the columns the person points out. Every row ends
// up with one outcome, a cell that can't be read stops the whole import and names the row, and nothing is guessed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { MappingError, compareLayout, guessMapping, headingsOf, layoutOf, readDate, readMapped, readNumber, readTable } = require('../src/main/reports/mapped');
const { makeXlsx } = require('./helpers/make-xlsx.cjs');

const csv = (...lines) => Buffer.from(`﻿${lines.join('\n')}\n`, 'utf8');
const sheetOf = (buffer) => readTable(buffer, 'made-up-store.csv').sheets[0];
const refused = (fn, pattern) => assert.throws(fn, (e) => e instanceof MappingError && pattern.test(e.message), String(pattern));
const KOBO = ['Sale Date,Book Title,ISBN,Country,Quantity,Royalty,Currency',
  '2026-09-03,Tidewater,9780000000002,US,2,5.98,USD',
  '2026-09-04,Tidewater,9780000000002,GB,1,2.10,GBP',
  '2026-09-05,Low Water,9780000000019,US,-1,-2.99,USD'];

test('the columns are guessed from the headings stores really use, and a column is used for one thing only', () => {
  const names = ['Sale Date', 'Book Title', 'ISBN', 'Country', 'Quantity', 'Royalty', 'Currency'];
  assert.deepEqual(guessMapping(names), { date: 0, title: 1, item: 2, marketplace: 3, units: 4, royalty: 5, currency: 6 });
  assert.deepEqual(guessMapping(['x', 'y']), { date: null, title: null, item: null, marketplace: null, units: null, royalty: null, currency: null });
  const twice = guessMapping(['Date', 'Statement Date', 'Title', 'Net Earnings']);
  assert.deepEqual([twice.date, twice.royalty], [0, 3]);
  assert.equal(new Set(Object.values(twice).filter((v) => v != null)).size, Object.values(twice).filter((v) => v != null).length);
});

test('a date is read as a day or as a month, in any of the ways a report writes it, and never guessed', () => {
  for (const [text, order, expected] of [
    ['2026-09-03', 'month-first', '2026-09-03'], ['2026/9/3', 'month-first', '2026-09-03'], ['2026-09', 'month-first', '2026-09'], ['09/2026', 'month-first', '2026-09'],
    ['September 2026', 'month-first', '2026-09'], ['Sep 2026', 'month-first', '2026-09'], ['3 September 2026', 'month-first', '2026-09-03'], ['September 3, 2026', 'month-first', '2026-09-03'],
    ['03/04/2026', 'month-first', '2026-03-04'], ['03/04/2026', 'day-first', '2026-04-03'], ['25/04/2026', 'month-first', '2026-04-25'],
    ['44927', 'month-first', '2023-01-01'], ['44927.5', 'month-first', '2023-01-01'], ['2026-09-03T10:00:00Z', 'month-first', '2026-09-03'],
  ]) assert.equal(readDate(text, order).date, expected, `${text} (${order})`);
  for (const bad of ['', 'soon', '2026-13', '13/2026', '2026-02-30', '99999999', 'Septembre', '1e5']) assert.ok(readDate(bad).problem, `${JSON.stringify(bad)} is a problem`);
});

test('a number is read as plain digits, in either style, with a symbol or code, and a bracket or trailing minus for a negative', () => {
  for (const [text, decimal, expected] of [
    ['12.50', '.', '12.50'], ['1,234.56', '.', '1234.56'], ['1.234,56', ',', '1234.56'], ['1 234,56', ',', '1234.56'], ["1'234.56", '.', '1234.56'],
    ['(12.50)', '.', '-12.50'], ['12.50-', '.', '-12.50'], ['-12.50', '.', '-12.50'], ['−12.50', '.', '-12.50'], ['+3', '.', '3'],
    ['$12.50', '.', '12.50'], ['USD 12.50', '.', '12.50'], ['12.50 USD', '.', '12.50'], ['€1.234,50', ',', '1234.50'], ['0', '.', '0'], ['1000', '.', '1000'],
  ]) assert.equal(readNumber(text, decimal).text, expected, `${text} (${decimal})`);
  assert.equal(readNumber('', '.').empty, true);
  for (const bad of ['abc', '12.5.5', '1e5', '12,50x', '--3', '$', '12 USD EUR', '1,2,3,x']) assert.ok(readNumber(bad, '.').problem, `${JSON.stringify(bad)} is a problem`);
});

test('a report is read with the columns chosen: every row has one outcome, refunds are negative copies, and the total is the sum of what was earned', () => {
  const sheet = sheetOf(csv(...KOBO, '', 'Total,,,,2,5.09,'));
  const mapping = guessMapping(headingsOf(sheet).names);
  const report = readMapped({ sheet, mapping, storeId: 'store-kobo', storeName: 'Kobo' });
  assert.equal(report.kind, 'mapped');
  assert.equal(report.rowsInFile, 6);
  assert.equal(report.complete, true);
  assert.deepEqual(report.counts, { 'not a sale': 3, imported: 3 }, 'the headings, the blank line and the total line are set aside, and said to be');
  assert.deepEqual(report.accounting.filter((a) => a.outcome === 'not a sale').map((a) => a.reason), ['headings', 'empty', 'no title: a total or a note']);
  assert.deepEqual(report.sales.map((s) => [s.royaltyDate, s.title, s.storeId, s.marketplace, s.netUnits, s.unitsSold, s.unitsRefunded, s.royalty.minor, s.royalty.currency]), [
    ['2026-09-03', 'Tidewater', '9780000000002', 'US', 2, 2, 0, 598n, 'USD'],
    ['2026-09-04', 'Tidewater', '9780000000002', 'GB', 1, 1, 0, 210n, 'GBP'],
    ['2026-09-05', 'Low Water', '9780000000019', 'US', -1, 0, 1, -299n, 'USD'],
  ]);
  assert.deepEqual([...report.totals].map(([c, m]) => [c, m.minor]), [['USD', 299n], ['GBP', 210n]], 'each currency on its own, never added together');
  assert.equal(report.sales.every((s) => s.estimate), true, 'a sales report is an estimate until a payment says otherwise');
  assert.match(report.notes[0], /no total of its own/);
  assert.match(report.notes[1], /taken for a total or a note and left out: row 6\./, 'and the rows left out are named, so a total is never lost without a word');
});

test('headings below a title block, a fixed currency, day-first dates and a comma for the decimal point are all handled as asked', () => {
  const sheet = sheetOf(csv('Statement for Made-up Press', 'Period: 2026', '', 'Datum;Titel;Betrag', '03.09.2026;Tidewater;1.234,50', '04.09.2026;Low Water;(2,00)'));
  assert.equal(headingsOf(sheet).names[0], 'Statement for Made-up Press', 'the first line with anything in it is taken for the headings, unless said');
  const report = readMapped({ sheet, mapping: { date: 0, title: 1, royalty: 2 }, options: { headerRow: 4, dateOrder: 'day-first', decimal: ',', currency: 'eur' }, storeId: 'store-x', storeName: 'X' });
  assert.deepEqual(report.sales.map((s) => [s.royaltyDate, s.royalty.minor, s.royalty.currency]), [['2026-09-03', 123450n, 'EUR'], ['2026-09-04', -200n, 'EUR']]);
  assert.deepEqual(report.accounting.slice(0, 5).map((a) => a.reason ?? a.outcome), ['before the headings', 'before the headings', 'before the headings', 'headings', 'imported']);
  assert.ok(report.notes.some((n) => /no column of copies sold/.test(n)), 'copies that are not in the file are said to show as 0');
  assert.equal(report.sales[0].netUnits, 0);
});

test('the same file read twice gives the same fingerprints, identical rows in one file are kept apart, and another store\'s rows never collide', () => {
  const twin = csv('Date,Title,Royalty,Currency', '2026-09-03,Tidewater,1.00,USD', '2026-09-03,Tidewater,1.00,USD');
  const read = (store) => readMapped({ sheet: sheetOf(twin), mapping: { date: 0, title: 1, royalty: 2, currency: 3 }, storeId: store, storeName: store }).sales.map((s) => s.fingerprint);
  const [a, b] = read('store-kobo');
  assert.notEqual(a, b, 'two identical lines are two sales');
  assert.deepEqual(read('store-kobo'), [a, b], 'and the same file gives the same ones again');
  assert.equal(new Set([...read('store-kobo'), ...read('store-lulu')]).size, 4);
});

test('a cell that cannot be read stops everything and names the row, so nothing is half imported', () => {
  const at = (...rows) => readMapped({ sheet: sheetOf(csv('Date,Title,Royalty,Currency', ...rows)), mapping: { date: 0, title: 1, royalty: 2, currency: 3 }, storeId: 's', storeName: 'S' });
  refused(() => at('2026-09-03,A,1.00,USD', 'soon,B,2.00,USD'), /row 3: the date isn't a date the app can read: "soon".*Nothing was imported/);
  refused(() => at('2026-09-03,A,abc,USD'), /row 2: what you earned isn't a number: "abc"/);
  refused(() => at('2026-09-03,A,,USD'), /row 2: what you earned is empty/);
  refused(() => at('2026-09-03,A,1.00,ZZZ'), /row 2: the currency "ZZZ" isn't one this app knows/);
  refused(() => at(',A,1.00,USD'), /row 2: the date is empty/, 'a row with a title and no date is a problem, not a total');
  refused(() => at('2026-09-03,A,1.00,USD', '2026-09-04,B,x,USD', '2026-09-05,C,y,USD', '2026-09-06,D,z,USD', '2026-09-07,E,q,USD', '2026-09-08,F,r,USD', '2026-09-09,G,s,USD'), /6 rows could not be read\. The first: row 3.*row 7/);
});

test('what must be said is said in words before any row is read', () => {
  const sheet = sheetOf(csv('Date,Title,Royalty', '2026-09-03,A,1.00'));
  refused(() => readMapped({ sheet, mapping: { title: 1, royalty: 2 }, options: { currency: 'USD' }, storeId: 's', storeName: 'S' }), /Say which column holds the date of the sale/);
  refused(() => readMapped({ sheet, mapping: { date: 0, title: 1 }, options: { currency: 'USD' }, storeId: 's', storeName: 'S' }), /what you earned/);
  refused(() => readMapped({ sheet, mapping: { date: 0, royalty: 2 }, options: { currency: 'USD' }, storeId: 's', storeName: 'S' }), /the title or the ISBN/);
  refused(() => readMapped({ sheet, mapping: { date: 0, title: 1, royalty: 2 }, storeId: 's', storeName: 'S' }), /the currency/);
  refused(() => readMapped({ sheet, mapping: { date: 0, title: 1, royalty: 2 }, options: { currency: 'dollars' }, storeId: 's', storeName: 'S' }), /isn't a currency this app knows/);
  refused(() => readMapped({ sheet, mapping: { date: 9, title: 1, royalty: 2 }, options: { currency: 'USD' }, storeId: 's', storeName: 'S' }), /date of the sale/, 'a column that is not in the file is not a column');
  refused(() => readMapped({ sheet: { name: 'Empty', rows: [] }, mapping: {}, options: {}, storeId: 's', storeName: 'S' }), /nothing in that sheet/);
});

test('a workbook is read the same way, from the sheet chosen, with dates stored as numbers', () => {
  const book = makeXlsx([{ name: 'Cover', rows: [['Made-up store statement']] }, { name: 'Sales', rows: [['Date', 'Title', 'Net Earnings', 'Currency'], [44927, 'Tidewater', 4.5, 'USD'], [44958, 'Low Water', '1.25', 'USD']] }]);
  const table = readTable(Buffer.from(book), 'statement.xlsx');
  assert.equal(table.format, 'xlsx');
  assert.deepEqual(table.sheets.map((s) => s.name), ['Cover', 'Sales']);
  const sheet = table.sheets[1];
  const report = readMapped({ sheet, mapping: guessMapping(headingsOf(sheet).names), storeId: 's', storeName: 'S' });
  assert.deepEqual(report.sales.map((s) => [s.royaltyDate, s.royalty.minor]), [['2023-01-01', 450n], ['2023-02-01', 125n]]);
});

test('a layout is remembered by its headings, fits a file with the columns in another order, and a renamed column is named, not guessed past', () => {
  const sheet = sheetOf(csv(...KOBO));
  const names = headingsOf(sheet).names;
  const saved = layoutOf({ names, mapping: guessMapping(names), options: { dateOrder: 'day-first', decimal: ',', currency: 'usd' } });
  assert.deepEqual(saved.options, { dateOrder: 'day-first', decimal: ',', currency: 'USD' });
  const same = compareLayout(saved, names);
  assert.deepEqual([same.fits, same.same, same.gone, same.added], [true, true, [], []]);

  const moved = ['Currency', 'Royalty', 'Quantity', 'Country', 'ISBN', 'Book Title', 'Sale Date'];
  const reordered = compareLayout(saved, moved);
  assert.equal(reordered.fits, true, 'the columns are found by what they are called');
  assert.equal(reordered.same, false);
  assert.deepEqual(reordered.mapping, { date: 6, title: 5, item: 4, marketplace: 3, units: 2, royalty: 1, currency: 0 });

  const renamed = compareLayout(saved, ['Sale Date', 'Book Title', 'ISBN', 'Country', 'Quantity', 'Net Royalty', 'Currency']);
  assert.deepEqual([renamed.fits, renamed.gone, renamed.added], [false, ['Royalty'], ['Net Royalty']]);
  assert.ok(renamed.overlap > 0.8);
  assert.ok(compareLayout(saved, ['Something', 'Else']).overlap < 0.1);

  // two columns with the same heading are told apart by which one of that name they are
  const twins = ['Date', 'Title', 'Currency', 'Royalty', 'Currency'];
  const kept = layoutOf({ names: twins, mapping: { date: 0, title: 1, royalty: 3, currency: 4 }, options: {} });
  assert.deepEqual(compareLayout(kept, twins).mapping.currency, 4);
  assert.equal(compareLayout(kept, ['Date', 'Title', 'Currency', 'Royalty']).fits, false, 'the second Currency is gone');
});

test('a file that is not a report is refused in words, and a hostile cell is only text', () => {
  refused(() => readTable('not a buffer'), /isn't a file the app can read/);
  refused(() => readTable(Buffer.from(`Title\n${'x'.repeat(40_000)}`)), /far too long/);
  const sheet = sheetOf(csv('Date,Title,Royalty,Currency', '2026-09-03,"=HYPERLINK(""http://x.test"")",1.00,USD'));
  const report = readMapped({ sheet, mapping: { date: 0, title: 1, royalty: 2, currency: 3 }, storeId: 's', storeName: 'S' });
  assert.equal(report.sales[0].title, '=HYPERLINK("http://x.test")', 'kept as text, as typed, and never run');
  assert.throws(() => readTable(Buffer.from('PK\u0003\u0004 not really a zip')), (e) => e.name === 'WorkbookError');
});
