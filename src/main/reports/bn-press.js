'use strict';
// Barnes & Noble Press's sales report, the Excel file from Sales, a date range, Export Excel Sheet. Built from the list of its 17 columns in
// docs/design/store-report-layouts.md, taken from B&N Press's help page, not from a real file, so it is still to be confirmed on one. Columns are
// found by their headings, never by position, and a heading that is needed and missing stops the import and names it.
//
// What the file gets wrong if it is read naively:
//   - It has two currencies. Unit Royalty, and so Total Royalty, is in the Payment Currency. List Price is taken to be in the Selling Currency.
//     Nothing says which currency Print Cost is in, so it is only kept when the two currencies are the same.
//   - Net Units Sold times Unit Royalty should be Total Royalty. That is checked on every row. A row that disagrees is shown and the report
//     is only imported by someone who says they know, as with any report that doesn't add up. Nothing is changed to make it agree.
//   - There is one row for each book, day and list price. A later download of the same days can show more copies on a row, so a row is told
//     apart by its day, book, format, price and currencies, never by its counts, and a fuller copy updates the one here instead of counting twice.
const { LayoutError, fingerprinter } = require('./kdp');
const { amountOf, blank, cleaned, dateOrderOf, dayKey, findColumns, finerThan, quoted, readDate } = require('./common');
const { exponentOf, money, parseDecimal, roundTo, toDecimalString, totals } = require('../../shared/money');

class BnPressError extends LayoutError {
  constructor(sheet, message, missing = []) {
    super(sheet, missing, message);
    this.name = 'BnPressError';
  }
}

const REPORT = 'The Barnes & Noble Press sales report';

// What the reader needs. Every one of these has to be in the file.
const COLUMNS = {
  saleDate: 'Sale Date', title: 'Title', format: 'Format', item: 'BN ID / ISBN', sellingCurrency: 'Selling Currency', listPrice: 'List Price',
  payCurrency: 'Payment Currency', unitRoyalty: 'Unit Royalty', sold: 'Units Sold', returned: 'Units Returned', net: 'Net Units Sold', total: 'Total Royalty',
};
// Used when they are there. Publisher, the 17th column, is not used.
const OPTIONAL = { ebookIsbn: 'eBook ISBN', author: 'Author', printCost: 'Print Cost', royaltyRate: 'Royalty %' };
// Headings that point to this report. Three of them make it B&N's, so a file that has lost a column is still known, and refused by name.
const TELLTALE = ['BN ID / ISBN', 'eBook ISBN', 'Selling Currency', 'Unit Royalty', 'Payment Currency'];
const HEADINGS_WITHIN = 20; // a title or a date range may sit above the headings

// A heading as it is compared: capitals, extra spaces and spaces around a slash don't matter, nor does the list of formats the help page
// writes after "Format".
const headingKey = (text) => String(text ?? '').trim().replace(/\s+/g, ' ').replace(/ ?\/ ?/g, '/').replace(/ ?\(ebook, print hardcover, print paperback\)$/i, '').toLowerCase();

const looksLikeHeadings = (cells) => {
  const keys = new Set(cells.map(headingKey));
  return TELLTALE.filter((name) => keys.has(headingKey(name))).length >= 3;
};

function find(workbook) {
  const found = [];
  for (const sheet of workbook.sheets) {
    const index = sheet.rows.slice(0, HEADINGS_WITHIN).findIndex((row) => looksLikeHeadings(row.cells));
    if (index >= 0) found.push({ sheet, index });
  }
  return found;
}

// A long number such as an ISBN can be stored by a workbook as 9.780306406157E+12.
function itemText(text) {
  if (!/^\d(?:\.\d+)?[eE]\+?\d{1,2}$/.test(text)) return text;
  const exact = parseDecimal(text);
  return exact.scale ? text : exact.digits.toString();
}

// A later download of the same row has at least as many copies sold and returned, and more of one of them. Anything else that disagrees
// can't be told apart from an older or a wrong file, so the row already here is kept and both are shown.
function compare(here, sale) {
  const same = here.units_sold === sale.unitsSold && here.units_refunded === sale.unitsRefunded && here.net_units === sale.netUnits && here.royalty === sale.royalty.minor.toString();
  if (same) return 'same';
  const fuller = sale.unitsSold >= here.units_sold && sale.unitsRefunded >= here.units_refunded && (sale.unitsSold > here.units_sold || sale.unitsRefunded > here.units_refunded);
  return fuller ? 'update' : 'differs';
}

/** `choices.dateOrder` is the person's answer. When it is still needed, nothing is read: the report comes back with `needs` and the question. */
function readBnPress(workbook, { choices = {} } = {}) {
  const found = find(workbook);
  if (!found.length) return null;
  if (found.length > 1) throw new BnPressError('workbook', `${REPORT} has the sales headings on more than one sheet (${quoted(found.map((f) => f.sheet.name))}). The app can't tell whether they repeat each other, so it reads none of them.`);
  const [{ sheet, index }] = found;
  const refuse = (message, missing) => new BnPressError(sheet.name, message, missing);
  const header = sheet.rows[index].cells;
  const needed = findColumns(header, COLUMNS, headingKey);
  const extra = findColumns(header, OPTIONAL, headingKey);
  if (needed.missing.length) throw refuse(`${REPORT} has no column called ${quoted(needed.missing)}. Barnes & Noble may have changed the report. Until the app catches up, Match your columns can read it.`, needed.missing);
  const twice = [...needed.twice, ...extra.twice];
  if (twice.length) throw refuse(`${REPORT} has two columns called ${quoted(twice)}, so the app can't tell which to read.`);
  const at = { ...needed.at, ...extra.at };
  const cell = (cells, field) => (at[field] < 0 ? '' : String(cells[at[field]] ?? '').trim());
  // A line that names no book is a total or a note, not a sale.
  const isNote = (cells) => !cell(cells, 'title') && !cell(cells, 'item');
  const data = sheet.rows.slice(index + 1).filter((row) => !blank(row.cells) && !isNote(row.cells));
  if (!data.length) throw refuse('There are no sales under the headings of this Barnes & Noble Press report, so there is nothing to import.');

  const dates = dateOrderOf(data.map((row) => cell(row.cells, 'saleDate')), choices.dateOrder, { report: REPORT, refuse });
  const ask = dates.ask ? { payees: null, dateOrder: dates.ask } : null;
  const rowsInFile = workbook.sheets.reduce((sum, s) => sum + s.rows.length, 0);
  if (!dates.order) return { kind: 'bn-press-sales', needs: ['date order'], ask, rowsInFile };

  const accounting = [];
  const account = (sheetName, row, outcome, reason) => accounting.push({ sheet: sheetName, row, outcome, ...(reason ? { reason } : {}) });
  const otherSheets = [];
  for (const other of workbook.sheets) {
    if (other === sheet) continue;
    for (const row of other.rows) account(other.name, row.number, 'not a sale', 'another sheet');
    if (other.rows.some((row) => !blank(row.cells))) otherSheets.push(other.name);
  }

  const sales = [];
  const problems = [];
  const mismatches = [];
  const notesLeftOut = [];
  let rounded = false;
  let costsLeftOut = 0;
  const print = fingerprinter('bn-press-sale');

  sheet.rows.forEach((row, i) => {
    if (i < index) { account(sheet.name, row.number, 'not a sale', 'before the headings'); return; }
    if (i === index) { account(sheet.name, row.number, 'not a sale', 'headings'); return; }
    if (blank(row.cells)) { account(sheet.name, row.number, 'not a sale', 'empty'); return; }
    if (isNote(row.cells)) { account(sheet.name, row.number, 'not a sale', 'no title: a total or a note'); notesLeftOut.push(row.number); return; }

    const bad = (what) => problems.push({ row: row.number, what });
    const date = readDate(cell(row.cells, 'saleDate'), dates.order);
    if (date.problem) return bad(`the sale date ${date.problem}`);

    const currencyIn = (field) => {
      const code = cell(row.cells, field).toUpperCase();
      try { exponentOf(code); } catch { throw new Error(`"${COLUMNS[field]}" isn't a currency this app knows: "${cell(row.cells, field)}"`); }
      return code;
    };
    // The figure as written, or null when the cell is empty and is allowed to be.
    const figure = (field, places, required) => {
      const read = amountOf(cell(row.cells, field));
      const name = COLUMNS[field] ?? OPTIONAL[field];
      if (read.empty && !required) return null;
      if (read.empty) throw new Error(`"${name}" is empty`);
      if (read.problem) throw new Error(`"${name}" isn't an amount the app can read: "${cell(row.cells, field)}"`);
      const exact = cleaned(read.text, places);
      if (finerThan(exact, places)) rounded = true;
      return exact;
    };
    const amount = (field, currency, required) => {
      const exact = figure(field, exponentOf(currency), required);
      return exact && money(roundTo(exact, exponentOf(currency)), currency);
    };
    const count = (field) => {
      const read = amountOf(cell(row.cells, field));
      if (read.empty || read.problem || !/^-?\d{1,9}(\.0+)?$/.test(read.text)) throw new Error(`"${COLUMNS[field]}" isn't a whole number: "${cell(row.cells, field)}"`);
      return Number(read.text);
    };

    let paying; let selling; let royalty; let listPrice; let cost = null; let unit; let sold; let returned; let net;
    try {
      paying = currencyIn('payCurrency');
      selling = currencyIn('sellingCurrency');
      sold = count('sold');
      returned = count('returned');
      net = count('net');
      const places = exponentOf(paying);
      unit = figure('unitRoyalty', places, true);
      royalty = amount('total', paying, true);
      listPrice = amount('listPrice', selling, false);
      if (cell(row.cells, 'printCost') && !/^n\/?a$/i.test(cell(row.cells, 'printCost'))) {
        if (selling === paying) cost = amount('printCost', paying, false);
        else costsLeftOut += 1;
      }
    } catch (error) {
      return bad(error.message);
    }

    // The report's own arithmetic, in the payment currency.
    const places = exponentOf(paying);
    const expected = money(roundTo({ digits: unit.digits * BigInt(net), scale: unit.scale }, places), paying);
    if (expected.minor !== royalty.minor) {
      mismatches.push(`row ${row.number}: ${net} net units times the Unit Royalty comes to ${toDecimalString(expected)} ${paying}, but Total Royalty says ${toDecimalString(royalty)}`);
    }

    const item = itemText(cell(row.cells, 'item'));
    const format = cell(row.cells, 'format');
    // An ebook can also be found by its own ISBN. On a printed book's row that column would name another edition, so it isn't used.
    const otherId = /^e-?book$/i.test(format) ? itemText(cell(row.cells, 'ebookIsbn')) : '';
    const sale = {
      sheet: sheet.name, row: row.number,
      // Which row of the report this is: the book, the day and the price. Its counts and money can grow, so they are left out.
      fingerprint: print([dayKey(date.date), (item || otherId || cell(row.cells, 'title')).toUpperCase(), format.toLowerCase(), selling, paying, String(listPrice?.minor ?? '')]),
      royaltyDate: date.date, title: cell(row.cells, 'title') || item, author: cell(row.cells, 'author'), storeId: item || otherId, otherId: item ? otherId : '',
      marketplace: '', royaltyType: cell(row.cells, 'royaltyRate'), transactionType: '',
      unitsSold: Math.abs(sold), unitsRefunded: Math.abs(returned), netUnits: net,
      listPrice, priceCurrency: listPrice && selling !== paying ? selling : null, offerPrice: null, cost, royalty, estimate: true,
    };
    sale.revise = (here) => {
      const verdict = compare(here, sale);
      if (verdict !== 'update') return { verdict };
      return {
        verdict,
        after: { royalty: sale.royalty.minor.toString(), royalty_type: sale.royaltyType, units_sold: sale.unitsSold, units_refunded: sale.unitsRefunded, net_units: sale.netUnits, delivery_cost: sale.cost ? sale.cost.minor.toString() : null },
      };
    };
    sales.push(sale);
    account(sheet.name, row.number, 'imported');
    return undefined;
  });

  if (problems.length) {
    const first = problems.slice(0, 5).map((p) => `row ${p.row}: ${p.what}`).join('; ');
    throw refuse(`${problems.length > 5 ? `${problems.length} rows of the Barnes & Noble Press report could not be read. The first: ` : 'The Barnes & Noble Press report has a row that could not be read: '}${first}.`);
  }

  const counts = {};
  for (const item of accounting) counts[item.outcome] = (counts[item.outcome] ?? 0) + 1;
  const keys = new Set(accounting.map((item) => `${item.sheet}:${item.row}`));
  return {
    kind: 'bn-press-sales', sales, orders: [], pagesRead: [], payments: [], accounting, ask,
    problems: mismatches.length
      ? [`${mismatches.length === 1 ? 'One row does not' : `${mismatches.length} rows do not`} add up: ${mismatches.slice(0, 5).join('; ')}${mismatches.length > 5 ? '; and more' : ''}.`]
      : [],
    notes: notesFor({ sales, notesLeftOut, otherSheets, rounded, costsLeftOut }),
    totals: totals(sales.map((sale) => sale.royalty)),
    rowsInFile, accounted: keys.size, complete: keys.size === rowsInFile && accounting.length === rowsInFile, counts,
  };
}

function notesFor({ sales, notesLeftOut, otherSheets, rounded, costsLeftOut }) {
  const notes = ['This reader was built from Barnes & Noble Press\'s description of its report and has not yet been checked on a real file. Compare the total shown with B&N\'s own figure.'];
  const foreign = [...new Set(sales.filter((s) => s.priceCurrency).map((s) => s.priceCurrency))].sort();
  if (foreign.length) notes.push(`Some sales were made in another currency (${foreign.join(', ')}). The royalty is in the currency B&N pays you in, and each list price is kept in the currency it was sold in.`);
  if (costsLeftOut) notes.push(`The print cost of ${costsLeftOut === 1 ? 'one row' : `${costsLeftOut} rows`} is not kept, because the report doesn't say which of the two currencies it is in. It stays in the original file.`);
  const returns = sales.reduce((sum, s) => sum + s.unitsRefunded, 0);
  if (returns) notes.push(`${returns === 1 ? 'One copy was' : `${returns} copies were`} returned. The report's own net units and total royalty are used.`);
  if (notesLeftOut.length) notes.push(`Left out as a total or a note, with no sale on it: row ${notesLeftOut.slice(0, 10).join(', ')}${notesLeftOut.length > 10 ? ' and more' : ''}.`);
  if (otherSheets.length) notes.push(`Not read, because only one sheet has the sales headings: ${quoted(otherSheets)}.`);
  if (rounded) notes.push('Some amounts have more decimal places than the currency does. Each line is rounded once, so a total can differ from B&N\'s by a few cents.');
  return notes;
}

module.exports = { BnPressError, COLUMNS, OPTIONAL, headingKey, readBnPress };
