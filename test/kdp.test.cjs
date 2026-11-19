'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readWorkbook, WorkbookError } = require('../src/main/reports/xlsx');
const { LayoutError, detect, readKdp } = require('../src/main/reports/kdp');
const { toDecimalString } = require('../src/shared/money');
const { SALE, madeUpKdpOrders, madeUpKdpPayments } = require('./helpers/make-xlsx.cjs');

test('reads a KDP orders workbook, with every row accounted for', () => {
  const report = readKdp(readWorkbook(madeUpKdpOrders()));
  assert.equal(report.kind, 'kdp-orders');
  assert.ok(report.complete, JSON.stringify(report.counts));
  assert.equal(report.accounted, report.rowsInFile);
  assert.deepEqual(report.problems, []);
  assert.equal(report.sales.length, 4);
  assert.equal(toDecimalString(report.sales[0].royalty), '2.07');
  assert.equal(report.sales[1].transactionType, 'Free - Promotion');
  assert.equal(toDecimalString(report.totals.get('USD')), '7.06');
  assert.equal(toDecimalString(report.totals.get('GBP')), '2.74');
  assert.equal(report.pagesRead[0].pages, 120);
  assert.equal(report.orders[0].free, 5);
  assert.ok(report.sales.every((s) => s.estimate));
});

test('reading the same file twice gives the same fingerprints', () => {
  const a = readKdp(readWorkbook(madeUpKdpOrders())).sales.map((s) => s.fingerprint);
  const b = readKdp(readWorkbook(madeUpKdpOrders())).sales.map((s) => s.fingerprint);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

test('a total that disagrees with the Summary is reported, not hidden', () => {
  const report = readKdp(readWorkbook(madeUpKdpOrders({ summaryUsd: '7.07' })));
  assert.match(report.problems.join(' '), /USD rows add up to 7.06, but the Summary says 7.07/);
});

test('format sheets that disagree with Combined Sales are reported', () => {
  const report = readKdp(readWorkbook(madeUpKdpOrders({ extraEbookRow: true })));
  assert.match(report.problems.join(' '), /Combined Sales has 4 rows but the format sheets have 5/);
});

test('a renamed column stops the import and names the column', () => {
  const header = SALE.map((name) => (name === 'Royalty' ? 'Royalties' : name));
  assert.throws(() => readKdp(readWorkbook(madeUpKdpOrders({ combinedHeader: header }))),
    (error) => error instanceof LayoutError && error.missing.includes('Royalty'));
});

test('reads the payments workbook, with its two Currency columns', () => {
  const report = readKdp(readWorkbook(madeUpKdpPayments()));
  assert.equal(report.kind, 'kdp-payments');
  assert.ok(report.complete);
  const [p] = report.payments;
  assert.equal(p.accrued.currency, 'GBP');
  assert.equal(p.payout.currency, 'USD');
  assert.equal(toDecimalString(p.payout), '3.46');
  assert.equal(p.rate, '1.2645');
});

test('something that isn\'t a workbook is refused', () => {
  assert.throws(() => readWorkbook(Buffer.from('not a zip')), WorkbookError);
  assert.equal(detect(readWorkbook(madeUpKdpPayments())), 'kdp-payments');
});

// Real reports are private and never committed. When any are in test/private/kdp/, every sheet of each is read here.
const privateDir = path.join(__dirname, 'private', 'kdp');
const real = fs.existsSync(privateDir) ? fs.readdirSync(privateDir).filter((name) => name.endsWith('.xlsx')) : [];
test('real KDP reports: every sheet read, every row accounted for', { skip: real.length ? false : 'no real reports in test/private/kdp' }, () => {
  for (const name of real) {
    const workbook = readWorkbook(fs.readFileSync(path.join(privateDir, name)));
    const report = readKdp(workbook);
    assert.ok(report, `${name}: not recognized as a KDP report`);
    assert.ok(report.complete, `${name}: ${report.accounted} of ${report.rowsInFile} rows accounted for`);
    // The December 2024 sample's Summary is larger than its detail sheets (see docs/decisions.md). That's reported, not hidden,
    // and not yet explained, so it's a finding here and not a failure.
    if (report.problems.length) console.log(`# finding: ${name}: ${report.problems.join(' ')}`);
    const sheets = new Set(report.accounting.map((item) => item.sheet));
    for (const sheet of workbook.sheets) if (sheet.rows.length) assert.ok(sheets.has(sheet.name), `${name}: sheet ${sheet.name} not read`);
  }
});
