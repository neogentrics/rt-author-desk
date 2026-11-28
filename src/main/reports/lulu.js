'use strict';
// Lulu's sales report, the CSV from My Projects, Sales & Payments. Built from Lulu's own description of its 30 columns (its Creator Revenue
// Guide, read on 27 November 2026), not from a real file, so it is still to be confirmed on one. Columns are found by their headings, never by
// position, and a heading that is needed and missing stops the import and names it.
//
// What the file gets wrong if it is read naively:
//   - A sale with more than one payee is written once for each of them, so adding every row counts it several times. Only the rows of the
//     person's own payee are saved; the others are set aside and named. When the app cannot tell which payee that is, it asks.
//   - List Price Each and Author Discounted Price Each are for one copy. The money earned is Payee Revenue, for the whole line, in the sale's
//     currency (after Lulu's share and any tax withheld). Nothing is multiplied.
//   - Converted Revenue is Payee Revenue in the currency Lulu pays in. It is Lulu's estimate until Paid is y, and the amount paid after that.
//   - The same sale comes again in a later download, marked paid, with another converted amount. So a row is told apart by what the sale is,
//     never by what has been paid, and the later copy updates the one already here instead of counting twice.
// Lulu's page doesn't say how a refund's figures are signed or how the sale date is written, so a refund is taken off however it is signed, and
// a date order the file does not settle is asked for.
const { LayoutError, fingerprinter } = require('./kdp');
const { readDate, readNumber } = require('./mapped');
const { exponentOf, money, parseDecimal, parseMoney, toDecimalString, totals } = require('../../shared/money');

class LuluError extends LayoutError {
  constructor(sheet, message, missing = []) {
    super(sheet, missing, message);
    this.name = 'LuluError';
  }
}

// What the reader uses. Every one of these has to be in the file. Lulu's other columns (Reported Date, Retail Share, Base Price, Net Revenue,
// Lulu Share, Revenue After Fees, the withholding and payee percentage columns and Promotional Price) are not needed and may be missing.
const COLUMNS = {
  saleDate: 'Sale Date', type: 'Type', reference: 'Reference Number', selfPurchase: 'Self-Purchase (y/n)', productId: 'Product ID', version: 'Version #',
  title: 'Title', author: 'Author', format: 'Format', channel: 'Distribution Channel', region: 'Region', currency: 'Sales Currency', qty: 'Qty',
  listPrice: 'List Price Each', discountedPrice: 'Author Discounted Price Each', payee: 'Payee', revenue: 'Payee Revenue', royalties: 'Royalties (y/n)',
  paid: 'Paid (y/n)', payCurrency: 'Payee Revenue Currency', converted: 'Converted Revenue',
};
// Headings only Lulu's report has. Three of them make a file Lulu's, so one that has lost a column is still known, and refused by name.
const TELLTALE = ['Payee Revenue', 'Payee Revenue Currency', 'Converted Revenue', 'Lulu Share', 'Author Discounted Price Each'];

// A heading as it is compared: capitals and extra spaces don't matter, and neither does the "(y/n)" Lulu writes after the yes-or-no ones.
const headingKey = (text) => String(text ?? '').trim().replace(/\s+/g, ' ').replace(/\s*\((?:y\/n|month\/year|sale or refund)\)$/i, '').toLowerCase();

const blank = (cells) => cells.every((cell) => String(cell ?? '').trim() === '');

// The sheet that is Lulu's report, with the row its headings are on, or null.
function find(workbook) {
  for (const sheet of workbook.sheets) {
    const index = sheet.rows.findIndex((row) => !blank(row.cells));
    if (index < 0) continue;
    const keys = new Set(sheet.rows[index].cells.map(headingKey));
    if (TELLTALE.filter((name) => keys.has(headingKey(name))).length >= 3) return { sheet, index };
  }
  return null;
}

function columnsIn(sheet, header) {
  const keys = header.map(headingKey);
  const at = {};
  const missing = [];
  const twice = [];
  for (const [field, name] of Object.entries(COLUMNS)) {
    const key = headingKey(name);
    const first = keys.indexOf(key);
    if (first < 0) missing.push(name);
    else if (keys.indexOf(key, first + 1) >= 0) twice.push(name);
    at[field] = first;
  }
  const list = (names) => names.map((name) => `"${name}"`).join(', ');
  if (missing.length) throw new LuluError(sheet, `Lulu's sales report has no column called ${list(missing)}. Lulu may have changed the report. Until the app catches up, Match your columns can read it.`, missing);
  if (twice.length) throw new LuluError(sheet, `Lulu's sales report has two columns called ${list(twice)}, so the app can't tell which to read.`);
  return at;
}

// Which comes first in a date such as 03/04/2026. The file settles it when any date in it can only be read one way.
function dateOrderOf(sheet, texts, asked) {
  let monthFirst = false;
  let dayFirst = false;
  let unsure = null;
  for (const text of texts) {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}/.exec(text);
    if (!m) continue;
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a > 12) dayFirst = true;
    else if (b > 12) monthFirst = true;
    else if (a !== b) unsure ??= text;
  }
  if (monthFirst && dayFirst) throw new LuluError(sheet, 'Lulu\'s sales report writes some sale dates with the month first and some with the day first, so the app can\'t read them.');
  if (monthFirst) return { order: 'month-first' };
  if (dayFirst) return { order: 'day-first' };
  if (!unsure) return { order: 'month-first' }; // every date reads the same either way, or is written year first or in words
  if (asked === 'month-first' || asked === 'day-first') return { order: asked, ask: { example: unsure, chosen: asked } };
  return { order: null, ask: { example: unsure, chosen: null } };
}

// The same day written another way, or read with the month and day the other way round, gives the same key, so choosing a date order
// differently one time can't make a sale count twice.
const dayKey = (iso) => {
  const [year, ...rest] = iso.split('-');
  return [year, ...rest.sort()].join('-');
};

// Which payees are the person's own. `known` are the payees whose sales are already in the library. A file with one payee is theirs unless
// the library says they are someone else; a file with several is asked about unless it holds a payee already known to be theirs.
function payeesOf(rows, known, asked) {
  const names = [...rows.keys()];
  const here = (list) => names.filter((name) => list.includes(name));
  let chosen;
  if (asked) chosen = here(asked);
  else if (known.length) chosen = here(known);
  else chosen = names.length === 1 ? names : [];
  // Asked about whenever there is something to choose: several payees, or none that can be taken to be the person's.
  const ask = names.length > 1 || !chosen.length || asked ? names.map((name) => ({ name, rows: rows.get(name), chosen: chosen.includes(name) })) : null;
  return { chosen, ask };
}

// Money as Lulu writes it, with a point for the cents. A comma is only taken between thousands, so a number written with a comma for the
// point is refused rather than read a hundred times too big.
function amountOf(text) {
  const read = readNumber(text, '.');
  if (read.empty) return { empty: true };
  if (read.problem || (text.includes(',') && !/^\D*\d{1,3}(?:,\d{3})+(?:\.\d+)?\D*$/.test(text))) return { problem: true };
  return read;
}

const yesNo = (text) => (/^(y|yes)$/i.test(text) ? true : /^(n|no)$/i.test(text) ? false : null);
const absolute = (amount) => (amount && amount.minor < 0n ? money(-amount.minor, amount.currency) : amount);
const takenOff = (amount) => (amount ? money(-absolute(amount).minor, amount.currency) : null);

/**
 * `choices` are the person's answers: `payees` (the names that are theirs) and `dateOrder`. `knownPayees` are the payees already in the
 * library. When an answer is still needed, nothing is read: the report comes back with `needs` and the question in `ask`.
 */
function readLulu(workbook, { choices = {}, knownPayees = [] } = {}) {
  const found = find(workbook);
  if (!found) return null;
  const { sheet, index } = found;
  const at = columnsIn(sheet.name, sheet.rows[index].cells);
  const cell = (cells, field) => String(cells[at[field]] ?? '').trim();
  // A line that names no sale at all is a total or a note, not a sale.
  const isNote = (cells) => !cell(cells, 'title') && !cell(cells, 'productId') && !cell(cells, 'type');
  const body = sheet.rows.slice(index + 1);
  const data = body.filter((row) => !blank(row.cells) && !isNote(row.cells));
  if (!data.length) throw new LuluError(sheet.name, 'There are no sales under the headings of this Lulu report, so there is nothing to import.');

  const payeeRows = new Map();
  for (const row of data) {
    const name = cell(row.cells, 'payee');
    if (!name) throw new LuluError(sheet.name, `Row ${row.number} of Lulu's sales report has no payee, so the app can't tell whose money it is.`);
    payeeRows.set(name, (payeeRows.get(name) ?? 0) + 1);
  }
  const asked = Array.isArray(choices.payees) ? choices.payees.filter((name) => typeof name === 'string') : null;
  const payees = payeesOf(payeeRows, knownPayees, asked);
  const dates = dateOrderOf(sheet.name, data.map((row) => cell(row.cells, 'saleDate')), choices.dateOrder);
  const ask = payees.ask || dates.ask ? { payees: payees.ask, dateOrder: dates.ask ?? null } : null;
  const rowsInFile = workbook.sheets.reduce((sum, s) => sum + s.rows.length, 0);
  const needs = [...(payees.chosen.length ? [] : ['payee']), ...(dates.order ? [] : ['date order'])];
  if (needs.length) return { kind: 'lulu-sales', needs, ask, rowsInFile };

  const accounting = [];
  const account = (sheetName, row, outcome, reason) => accounting.push({ sheet: sheetName, row, outcome, ...(reason ? { reason } : {}) });
  // A second sheet (a workbook someone saved the CSV into) is not part of the report.
  for (const other of workbook.sheets) if (other !== sheet) for (const row of other.rows) account(other.name, row.number, 'not a sale', 'another sheet');

  const sales = [];
  const problems = [];
  const notesLeftOut = [];
  const othersRows = new Map();
  let rounded = false;
  const print = fingerprinter('lulu-sale');

  sheet.rows.forEach((row, i) => {
    if (i < index) { account(sheet.name, row.number, 'not a sale', 'before the headings'); return; }
    if (i === index) { account(sheet.name, row.number, 'not a sale', 'headings'); return; }
    if (blank(row.cells)) { account(sheet.name, row.number, 'not a sale', 'empty'); return; }
    if (isNote(row.cells)) { account(sheet.name, row.number, 'not a sale', 'no title: a total or a note'); notesLeftOut.push(row.number); return; }
    const payee = cell(row.cells, 'payee');
    if (!payees.chosen.includes(payee)) {
      account(sheet.name, row.number, 'set aside', `another payee's share: ${payee}`);
      othersRows.set(payee, (othersRows.get(payee) ?? 0) + 1);
      return;
    }

    const bad = (what) => problems.push({ row: row.number, what });
    const date = readDate(cell(row.cells, 'saleDate'), dates.order);
    if (date.problem) return bad(`the sale date ${date.problem}`);
    const type = /^sale$/i.test(cell(row.cells, 'type')) ? 'Sale' : /^refund$/i.test(cell(row.cells, 'type')) ? 'Refund' : null;
    if (!type) return bad(`"Type" should be Sale or Refund, not "${cell(row.cells, 'type')}"`);
    const flags = {};
    for (const field of ['selfPurchase', 'royalties', 'paid']) {
      flags[field] = yesNo(cell(row.cells, field));
      if (flags[field] === null) return bad(`"${COLUMNS[field]}" should be y or n, not "${cell(row.cells, field)}"`);
    }
    const quantity = amountOf(cell(row.cells, 'qty'));
    if (quantity.empty || quantity.problem || !/^-?\d{1,9}(\.0+)?$/.test(quantity.text)) return bad(`"Qty" isn't a whole number: "${cell(row.cells, 'qty')}"`);
    const qty = Number(quantity.text);

    // An amount in a currency, or null when the cell is empty and is allowed to be.
    const amount = (field, currency, needed) => {
      const read = amountOf(cell(row.cells, field));
      if (read.empty && !needed) return null;
      if (read.empty) throw new Error(`"${COLUMNS[field]}" is empty`);
      if (read.problem) throw new Error(`"${COLUMNS[field]}" isn't an amount the app can read: "${cell(row.cells, field)}"`);
      const exact = parseDecimal(read.text);
      const places = exponentOf(currency);
      if (exact.scale > places && exact.digits % 10n ** BigInt(exact.scale - places) !== 0n) rounded = true;
      return parseMoney(read.text, currency);
    };
    const currencyIn = (field) => {
      const code = cell(row.cells, field).toUpperCase();
      try { exponentOf(code); } catch { throw new Error(`"${COLUMNS[field]}" isn't a currency this app knows: "${cell(row.cells, field)}"`); }
      return code;
    };
    let currency; let revenue; let listPrice; let offerPrice; let converted = null;
    try {
      currency = currencyIn('currency');
      revenue = amount('revenue', currency, true);
      listPrice = amount('listPrice', currency, false);
      offerPrice = amount('discountedPrice', currency, false);
      if (cell(row.cells, 'converted')) converted = amount('converted', currencyIn('payCurrency'), true);
    } catch (error) {
      return bad(error.message);
    }

    const refund = type === 'Refund';
    const units = Math.abs(qty);
    const net = refund ? -units : qty;
    sales.push({
      sheet: sheet.name, row: row.number,
      // What the sale is. Whether it has been paid, and every amount that can still change, is left out.
      fingerprint: print([cell(row.cells, 'reference'), cell(row.cells, 'productId'), cell(row.cells, 'version'), type, dayKey(date.date), payee,
        cell(row.cells, 'channel'), cell(row.cells, 'region'), currency, String(units), String(listPrice?.minor ?? ''), String(offerPrice?.minor ?? '')]),
      revisable: true,
      royaltyDate: date.date, title: cell(row.cells, 'title') || cell(row.cells, 'productId'), author: cell(row.cells, 'author'), storeId: cell(row.cells, 'productId'),
      marketplace: cell(row.cells, 'region'), royaltyType: flags.royalties ? 'Royalty' : 'Other revenue', transactionType: type,
      unitsSold: Math.max(net, 0), unitsRefunded: Math.max(-net, 0), netUnits: net,
      listPrice, offerPrice, cost: null,
      royalty: refund ? takenOff(revenue) : revenue,
      converted: refund ? takenOff(converted) : converted,
      payee, paid: flags.paid, estimate: !flags.paid, selfPurchase: flags.selfPurchase,
    });
    account(sheet.name, row.number, 'imported');
    return undefined;
  });

  if (problems.length) {
    const first = problems.slice(0, 5).map((p) => `row ${p.row}: ${p.what}`).join('; ');
    throw new LuluError(sheet.name, `${problems.length > 5 ? `${problems.length} rows of Lulu's sales report could not be read. The first: ` : 'Lulu\'s sales report has a row that could not be read: '}${first}.`);
  }

  const counts = {};
  for (const item of accounting) counts[item.outcome] = (counts[item.outcome] ?? 0) + 1;
  const keys = new Set(accounting.map((item) => `${item.sheet}:${item.row}`));
  return {
    kind: 'lulu-sales', sales, orders: [], pagesRead: [], payments: [], accounting, problems: [], ask,
    notes: notesFor({ sales, othersRows, notesLeftOut, rounded }),
    totals: totals(sales.map((sale) => sale.royalty)),
    rowsInFile, accounted: keys.size, complete: keys.size === rowsInFile && accounting.length === rowsInFile, counts,
  };
}

// What the person should know before saying yes, in plain words. Paid amounts and estimates are never added together.
function notesFor({ sales, othersRows, notesLeftOut, rounded }) {
  const notes = ['This reader was built from Lulu\'s description of its report and has not yet been checked on a real file. Compare the total shown with Lulu\'s own figure.'];
  const converted = (paid) => [...totals(sales.filter((s) => s.paid === paid && s.converted).map((s) => s.converted)).values()]
    .map((a) => `${toDecimalString(a)} ${a.currency}`).join(' and ');
  const actual = converted(true);
  const guess = converted(false);
  if (actual) notes.push(`In the currency Lulu pays you in, the lines it marks as paid come to ${actual}. That is what it says it paid.`);
  if (guess) notes.push(`The lines not yet paid come to about ${guess} in that currency. That is Lulu's estimate and can change before it pays.`);
  const bare = sales.filter((s) => s.paid && !s.converted).length;
  if (bare) notes.push(`${bare === 1 ? 'One line is' : `${bare} lines are`} marked paid with no converted amount.`);
  const own = sales.filter((s) => s.selfPurchase).length;
  if (own) notes.push(`${own === 1 ? 'One line is' : `${own} lines are`} your own purchase. ${own === 1 ? 'It is' : 'They are'} kept, marked as yours, and counted with the rest.`);
  const refunds = sales.filter((s) => s.transactionType === 'Refund').length;
  if (refunds) notes.push(`${refunds === 1 ? 'One refund is' : `${refunds} refunds are`} taken off the total.`);
  const other = sales.filter((s) => s.royaltyType === 'Other revenue').length;
  if (other) notes.push(`${other === 1 ? 'One line is' : `${other} lines are`} what Lulu calls other revenue rather than a royalty, and ${other === 1 ? 'is' : 'are'} marked so.`);
  if (othersRows.size) notes.push(`Left out as another payee's share: ${[...othersRows].map(([name, n]) => `${name} (${n} ${n === 1 ? 'line' : 'lines'})`).join(', ')}.`);
  if (notesLeftOut.length) notes.push(`Left out as a total or a note, with no sale on it: row ${notesLeftOut.slice(0, 10).join(', ')}${notesLeftOut.length > 10 ? ' and more' : ''}.`);
  if (rounded) notes.push('Some amounts have more decimal places than the currency does. Each line is rounded once, so a total can differ from Lulu\'s by a few cents.');
  notes.push('A book you also publish straight to a shop that Lulu sells through can appear in that shop\'s report too. Check that a sale is not counted from both.');
  return notes;
}

module.exports = { COLUMNS, LuluError, headingKey, readLulu };
