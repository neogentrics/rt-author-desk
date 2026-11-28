'use strict';
// KDP's two report workbooks, as described in docs/design/report-imports.md. Each row of the file ends up with one
// outcome, and the outcomes must add up to the rows in the file, or the import fails. A missing or renamed column stops
// the import and says which: the layout is never guessed.
const crypto = require('node:crypto');
const { parseDecimal, parseMoney, toDecimalString, totals } = require('../../shared/money');

class LayoutError extends Error {
  // Another store's reader passes its own message; without one it is KDP's.
  constructor(sheet, missing, message = `KDP's "${sheet}" sheet has changed: no column called ${missing.map((name) => `"${name}"`).join(', ')}.`) {
    super(message);
    this.name = 'LayoutError';
    this.sheet = sheet;
    this.missing = missing;
  }
}

const ORDER_SHEETS = ['Report Definitions', 'Summary', 'Combined Sales', 'eBook Royalty', 'Paperback Royalty',
  'Hardcover Royalty', 'Orders Processed', 'eBook Orders Placed', 'KENP Read'];
const SALE_COLUMNS = ['Royalty Date', 'Title', 'Author Name', 'ASIN/ISBN', 'Marketplace', 'Royalty Type',
  'Transaction Type', 'Units Sold', 'Units Refunded', 'Net Units Sold', 'Avg. List Price without tax',
  'Avg. Offer Price without tax', 'Avg. Delivery/Manufacturing cost', 'Royalty', 'Currency'];
const FORMAT_SHEETS = ['eBook Royalty', 'Paperback Royalty', 'Hardcover Royalty'];
const FORMAT_COLUMNS = ['Royalty Date', 'Title', 'Marketplace', 'Transaction Type', 'Net Units Sold', 'Royalty', 'Currency'];
const ORDER_COLUMNS = ['Date', 'Title', 'Author Name', 'ASIN', 'Marketplace', 'Paid Units', 'Free Units'];
const KENP_COLUMNS = ['Date', 'Title', 'Author Name', 'ASIN', 'Marketplace', 'Kindle Edition Normalized Page (KENP) Read'];
const PAYMENT_COLUMNS = ['Sales Period - Start Date', 'Sales Period - End Date', 'Marketplace', 'Payment Number', 'Detail',
  'Date', 'Payment Method', 'Currency', 'Accrued Royalty', 'Tax Withholding', 'Adjustments', 'Net Earnings', 'Source',
  'FX Rate', 'Payout Amount', 'Payment Status'];

const blank = (cells) => cells.every((cell) => String(cell).trim() === '');

// KDP writes N/A where a figure doesn't apply, such as the cost of a free copy. That's no money, so it reads as zero.
const notApplicable = (text) => text === '' || /^n\/?a$/i.test(text);
const amountOf = (text, currency) => parseMoney(notApplicable(text) ? '0' : text, currency);

// Finds each named column. A name can appear twice (the payments sheet has two "Currency" columns), so every position is
// kept, in order.
function columns(sheet, header, wanted) {
  const at = new Map();
  header.forEach((name, index) => {
    const key = String(name).trim();
    at.set(key, [...(at.get(key) ?? []), index]);
  });
  const missing = wanted.filter((name) => !at.has(name));
  if (missing.length) throw new LayoutError(sheet, missing);
  return at;
}

function whole(text, what) {
  const { digits, scale } = parseDecimal(text === '' ? '0' : text);
  if (scale && digits % 10n ** BigInt(scale) !== 0n) throw new Error(`${what} should be a whole number: ${text}`);
  return Number(scale ? digits / 10n ** BigInt(scale) : digits);
}

// The same row read twice gives the same fingerprint, so importing a file again finds every row already there. Identical
// rows inside one file are told apart by how many came before, so they're never merged into one.
function fingerprinter(kind) {
  const seen = new Map();
  return (cells) => {
    const base = crypto.createHash('sha256').update(JSON.stringify([kind, cells.map((cell) => String(cell).trim())])).digest('hex');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? crypto.createHash('sha256').update(`${base}:${count}`).digest('hex') : base;
  };
}

function header(sheet) {
  const first = sheet.rows.findIndex((row) => !blank(row.cells));
  if (first < 0) return { names: [], body: [] };
  return { names: sheet.rows[first].cells, body: sheet.rows.slice(first + 1), headerRow: sheet.rows[first].number };
}

function detect(workbook) {
  const names = workbook.sheets.map((sheet) => sheet.name);
  if (['Report Definitions', 'Combined Sales', 'Summary'].every((name) => names.includes(name))) return 'kdp-orders';
  const payments = workbook.sheet('Payments');
  if (payments && header(payments).names.some((name) => String(name).trim() === 'Payment Number')) return 'kdp-payments';
  return null;
}

// The orders workbook: KDP calls these figures estimated royalties. The payments workbook is the final word.
function readOrders(workbook) {
  const accounting = [];
  const account = (sheet, row, outcome, reason) => accounting.push({ sheet, row, outcome, ...(reason ? { reason } : {}) });
  const missingSheets = ORDER_SHEETS.filter((name) => !workbook.sheet(name));
  if (missingSheets.length) throw new LayoutError('workbook', missingSheets.map((name) => `${name} (sheet)`));

  // Report Definitions: how the file is recognized. Nothing in it is a sale.
  for (const row of workbook.sheet('Report Definitions').rows) account('Report Definitions', row.number, 'not a sale', 'definition');

  const sales = [];
  const combined = workbook.sheet('Combined Sales');
  const c = header(combined);
  const at = columns('Combined Sales', c.names, SALE_COLUMNS);
  const col = (cells, name) => String(cells[at.get(name)[0]] ?? '').trim();
  const print = fingerprinter('kdp-sale');
  if (c.headerRow) account('Combined Sales', c.headerRow, 'not a sale', 'header');
  for (const row of c.body) {
    if (blank(row.cells)) {
      account('Combined Sales', row.number, 'not a sale', 'empty');
      continue;
    }
    const currency = col(row.cells, 'Currency');
    sales.push({
      sheet: 'Combined Sales',
      row: row.number,
      fingerprint: print(row.cells),
      royaltyDate: col(row.cells, 'Royalty Date'),
      title: col(row.cells, 'Title'),
      author: col(row.cells, 'Author Name'),
      storeId: col(row.cells, 'ASIN/ISBN'),
      marketplace: col(row.cells, 'Marketplace'),
      royaltyType: col(row.cells, 'Royalty Type'),
      transactionType: col(row.cells, 'Transaction Type'),
      unitsSold: whole(col(row.cells, 'Units Sold'), 'Units Sold'),
      unitsRefunded: whole(col(row.cells, 'Units Refunded'), 'Units Refunded'),
      netUnits: whole(col(row.cells, 'Net Units Sold'), 'Net Units Sold'),
      listPrice: amountOf(col(row.cells, 'Avg. List Price without tax'), currency),
      offerPrice: amountOf(col(row.cells, 'Avg. Offer Price without tax'), currency),
      cost: amountOf(col(row.cells, 'Avg. Delivery/Manufacturing cost'), currency),
      royalty: amountOf(col(row.cells, 'Royalty'), currency),
      estimate: true,
    });
    account('Combined Sales', row.number, 'imported');
  }

  // The format sheets repeat Combined Sales, split by format. Their rows must match it one for one.
  let formatRows = 0;
  for (const name of FORMAT_SHEETS) {
    const s = header(workbook.sheet(name));
    if (s.headerRow) {
      columns(name, s.names, FORMAT_COLUMNS);
      account(name, s.headerRow, 'not a sale', 'header');
    }
    for (const row of s.body) {
      if (blank(row.cells)) account(name, row.number, 'not a sale', 'empty');
      else {
        formatRows += 1;
        account(name, row.number, 'duplicate', 'also in Combined Sales');
      }
    }
  }

  // Order counts, including free copies, and pages read. These carry no money.
  const orders = [];
  const pagesRead = [];
  for (const [name, wanted, list, kind] of [
    ['Orders Processed', ORDER_COLUMNS, orders, 'processed'],
    ['eBook Orders Placed', ORDER_COLUMNS, orders, 'placed'],
    ['KENP Read', KENP_COLUMNS, pagesRead, 'kenp'],
  ]) {
    const s = header(workbook.sheet(name));
    if (!s.headerRow) continue;
    const a = columns(name, s.names, wanted);
    const get = (cells, column) => String(cells[a.get(column)[0]] ?? '').trim();
    const p = fingerprinter(`kdp-${kind}`);
    account(name, s.headerRow, 'not a sale', 'header');
    for (const row of s.body) {
      if (blank(row.cells)) {
        account(name, row.number, 'not a sale', 'empty');
        continue;
      }
      const base = { sheet: name, row: row.number, fingerprint: p(row.cells), date: get(row.cells, 'Date'), title: get(row.cells, 'Title'),
        storeId: get(row.cells, 'ASIN'), marketplace: get(row.cells, 'Marketplace') };
      if (kind === 'kenp') list.push({ ...base, pages: whole(get(row.cells, 'Kindle Edition Normalized Page (KENP) Read'), 'KENP') });
      else list.push({ ...base, kind, paid: whole(get(row.cells, 'Paid Units'), 'Paid Units'), free: whole(get(row.cells, 'Free Units'), 'Free Units') });
      account(name, row.number, 'imported');
    }
  }

  // Summary: the store's own totals, one column per currency. The rows above must add up to them exactly.
  const summary = header(workbook.sheet('Summary'));
  const reported = new Map();
  const royaltyColumns = summary.names
    .map((name, index) => ({ currency: /^Royalty \(([A-Z]{3})\)$/.exec(String(name).trim())?.[1], index }))
    .filter((item) => item.currency);
  if (summary.headerRow) {
    if (!royaltyColumns.length) throw new LayoutError('Summary', ['Royalty (USD)']);
    account('Summary', summary.headerRow, 'not a sale', 'header');
  }
  for (const row of summary.body) {
    account('Summary', row.number, 'not a sale', blank(row.cells) ? 'empty' : 'total');
    for (const { currency, index } of royaltyColumns) {
      const value = String(row.cells[index] ?? '').trim();
      if (!value) continue;
      const amount = parseMoney(value, currency);
      reported.set(currency, reported.has(currency) ? { ...amount, minor: reported.get(currency).minor + amount.minor } : amount);
    }
  }

  const ours = totals(sales.map((sale) => sale.royalty));
  const mismatches = [];
  for (const currency of new Set([...ours.keys(), ...reported.keys()])) {
    const a = ours.get(currency)?.minor ?? 0n;
    const b = reported.get(currency)?.minor ?? 0n;
    if (a !== b) mismatches.push({ currency, rows: a.toString(), summary: b.toString() });
  }
  const problems = [];
  if (formatRows !== sales.length) {
    problems.push(`Combined Sales has ${sales.length} rows but the format sheets have ${formatRows}.`);
  }
  for (const m of mismatches) {
    problems.push(`The ${m.currency} rows add up to ${toDecimalString({ minor: BigInt(m.rows), currency: m.currency })}, but the Summary says ${toDecimalString({ minor: BigInt(m.summary), currency: m.currency })}.`);
  }

  return { kind: 'kdp-orders', sales, orders, pagesRead, totals: ours, accounting, problems, ...check(workbook, accounting) };
}

function readPayments(workbook) {
  const accounting = [];
  const sheet = workbook.sheet('Payments');
  const s = header(sheet);
  const at = columns('Payments', s.names, PAYMENT_COLUMNS);
  if (at.get('Currency').length !== 2) throw new LayoutError('Payments', ['Currency (twice: earned, then paid)']);
  const [earnedAt, paidAt] = at.get('Currency');
  const get = (cells, name) => String(cells[at.get(name)[0]] ?? '').trim();
  const print = fingerprinter('kdp-payment');
  const payments = [];
  for (const row of sheet.rows) {
    if (row.number < (s.headerRow ?? 0)) accounting.push({ sheet: 'Payments', row: row.number, outcome: 'not a sale', reason: 'title' });
  }
  if (s.headerRow) accounting.push({ sheet: 'Payments', row: s.headerRow, outcome: 'not a sale', reason: 'header' });
  for (const row of s.body) {
    if (blank(row.cells)) {
      accounting.push({ sheet: 'Payments', row: row.number, outcome: 'not a sale', reason: 'empty' });
      continue;
    }
    const earned = String(row.cells[earnedAt] ?? '').trim();
    const paid = String(row.cells[paidAt] ?? '').trim();
    const amount = (name, currency) => (!notApplicable(get(row.cells, name)) && currency ? parseMoney(get(row.cells, name), currency) : null);
    payments.push({
      sheet: 'Payments',
      row: row.number,
      fingerprint: print(row.cells),
      periodStart: get(row.cells, 'Sales Period - Start Date'),
      periodEnd: get(row.cells, 'Sales Period - End Date'),
      marketplace: get(row.cells, 'Marketplace'),
      paymentNumber: get(row.cells, 'Payment Number'),
      detail: get(row.cells, 'Detail'),
      date: get(row.cells, 'Date'),
      method: get(row.cells, 'Payment Method'),
      accrued: amount('Accrued Royalty', earned),
      taxWithheld: amount('Tax Withholding', earned),
      adjustments: amount('Adjustments', earned),
      net: amount('Net Earnings', earned),
      source: get(row.cells, 'Source'),
      rate: get(row.cells, 'FX Rate'),
      payout: amount('Payout Amount', paid),
      status: get(row.cells, 'Payment Status'),
    });
    accounting.push({ sheet: 'Payments', row: row.number, outcome: 'imported' });
  }
  return { kind: 'kdp-payments', payments, accounting, problems: [], ...check(workbook, accounting) };
}

// Every row of every sheet has exactly one outcome.
function check(workbook, accounting) {
  const rows = workbook.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  const keys = new Set(accounting.map((item) => `${item.sheet}:${item.row}`));
  const counts = {};
  for (const item of accounting) counts[item.outcome] = (counts[item.outcome] ?? 0) + 1;
  return { rowsInFile: rows, accounted: keys.size, complete: keys.size === rows && accounting.length === rows, counts };
}

function readKdp(workbook) {
  const kind = detect(workbook);
  if (kind === 'kdp-orders') return readOrders(workbook);
  if (kind === 'kdp-payments') return readPayments(workbook);
  return null;
}

module.exports = { LayoutError, detect, fingerprinter, readKdp, readOrders, readPayments };
