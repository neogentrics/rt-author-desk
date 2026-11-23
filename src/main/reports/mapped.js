'use strict';
// "Match your columns": a report from a store the app has no reader for, read with the columns the person points out. A reader built from
// a real file is always better (it knows the store's own totals and quirks), so this is for the stores with no reader yet, and it never
// pretends to be one: every row still ends up with one outcome, a cell it can't read stops the import and says which, and nothing is guessed.
// The layout can be remembered by the headings it was made from, and a file whose headings no longer fit is refused in words.
const crypto = require('node:crypto');
const { CsvError, decodeText, parseCsv } = require('../../shared/csv');
const { readWorkbook } = require('./xlsx');
const { exponentOf, money, parseMoney, totals } = require('../../shared/money');
const { parseDateText } = require('../books-import');

class MappingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MappingError';
  }
}

// What a column can be. `names` are headings stores really use, written plainly.
const FIELDS = [
  { key: 'date', label: 'Date of the sale', required: true, names: ['date', 'sale date', 'sales date', 'royalty date', 'transaction date', 'order date', 'report date', 'period', 'month', 'statement date', 'sales month'] },
  { key: 'title', label: 'Title', names: ['title', 'book title', 'product title', 'name', 'book', 'product', 'product name', 'item name'] },
  { key: 'item', label: 'ISBN, ASIN or the store\'s own number for the book', names: ['isbn', 'asin', 'isbn 13', 'isbn13', 'ean', 'upc', 'sku', 'product id', 'book id', 'item id', 'store id', 'identifier', 'asin isbn', 'isbn asin', 'bn id', 'isbn or asin'] },
  { key: 'marketplace', label: 'Country or marketplace', names: ['marketplace', 'country', 'territory', 'region', 'store', 'sales channel', 'market', 'country of sale'] },
  { key: 'units', label: 'Copies sold (after refunds)', names: ['units', 'net units', 'net units sold', 'quantity', 'qty', 'copies', 'units sold', 'sales', 'downloads', 'net quantity'] },
  { key: 'royalty', label: 'What you earned', required: true, names: ['royalty', 'royalties', 'earnings', 'net earnings', 'net revenue', 'author earnings', 'amount', 'your earnings', 'payable', 'net', 'revenue share', 'publisher earnings', 'royalty earned', 'total royalty'] },
  { key: 'currency', label: 'Currency', names: ['currency', 'currency code', 'ccy', 'payment currency'] },
];

const normalize = (text) => String(text ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const blank = (cells) => cells.every((cell) => String(cell ?? '').trim() === '');
const MAX_FILE = 50 * 1024 * 1024;
const isWorkbook = (buffer) => buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b; // a zip, which is what an .xlsx is

// ---- Reading the file ------------------------------------------------------------------------------------------------------

// A file as sheets of rows. A CSV is one sheet. Row numbers are the ones a spreadsheet would show.
function readTable(buffer, fileName = '') {
  if (!Buffer.isBuffer(buffer)) throw new MappingError("That isn't a file the app can read.");
  if (buffer.length > MAX_FILE) throw new MappingError('That file is too big to be a sales report.');
  if (isWorkbook(buffer)) {
    const book = readWorkbook(buffer);
    return { format: 'xlsx', sheets: book.sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows })) };
  }
  let table;
  try {
    table = parseCsv(decodeText(buffer).text, { keepEmpty: true });
  } catch (error) {
    if (error instanceof CsvError) throw new MappingError(error.message);
    throw error;
  }
  return { format: 'csv', sheets: [{ name: String(fileName).replace(/\.[^.]*$/, '').slice(0, 60) || 'The file', rows: table.map((cells, i) => ({ number: i + 1, cells })) }] };
}

// Where the headings are: the row the person said, or the first row with anything in it.
function headingsOf(sheet, headerRow) {
  const at = headerRow ? sheet.rows.findIndex((row) => row.number === Number(headerRow)) : sheet.rows.findIndex((row) => !blank(row.cells));
  if (at < 0) return { index: -1, names: [], number: null };
  return { index: at, names: sheet.rows[at].cells.map((cell) => String(cell ?? '').trim()), number: sheet.rows[at].number };
}

// The same heading can appear twice (two "Currency" columns), so a column is named by its heading and which one of that name it is.
const columnName = (names, index) => ({ name: names[index], nth: names.slice(0, index).filter((n) => n === names[index]).length });
const columnIndex = (names, ref) => {
  if (!ref) return null;
  let seen = -1;
  for (let i = 0; i < names.length; i += 1) if (names[i] === ref.name && (seen += 1) === ref.nth) return i;
  return null;
};

function guessMapping(names) {
  const norm = names.map(normalize);
  const used = new Set();
  const mapping = {};
  for (const field of FIELDS) {
    let at = norm.findIndex((h, i) => !used.has(i) && field.names.includes(h));
    if (at < 0) at = norm.findIndex((h, i) => !used.has(i) && field.names.some((n) => n.length >= 5 && (h.startsWith(`${n} `) || h.endsWith(` ${n}`))));
    mapping[field.key] = at < 0 ? null : at;
    if (at >= 0) used.add(at);
  }
  return mapping;
}

// ---- Reading a cell --------------------------------------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthNumber = (word) => {
  const w = word.toLowerCase().replace(/\.$/, '');
  const at = MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w)));
  return at < 0 ? 0 : at + 1;
};

// A day as YYYY-MM-DD, or a month as YYYY-MM when that is all the report says (royalty statements often do). An Excel date, which a workbook
// stores as a number of days, is read too. Anything else is a problem in words, never a guess.
function readDate(text, order = 'month-first') {
  const t = String(text ?? '').trim().slice(0, 100);
  if (!t) return { problem: 'is empty' };
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})$/.exec(t))) return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? { date: `${m[1]}-${pad(Number(m[2]))}` } : { problem: `has a month that isn't one: "${t}"` };
  if ((m = /^(\d{1,2})[-/.](\d{4})$/.exec(t))) return Number(m[1]) >= 1 && Number(m[1]) <= 12 ? { date: `${m[2]}-${pad(Number(m[1]))}` } : { problem: `has a month that isn't one: "${t}"` };
  if ((m = /^([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(t)) && monthNumber(m[1])) return { date: `${m[2]}-${pad(monthNumber(m[1]))}` };
  if ((m = /^(\d{5})(?:\.\d+)?$/.exec(t)) && Number(m[1]) >= 20000 && Number(m[1]) <= 80000) {
    const day = new Date(Date.UTC(1899, 11, 30) + Number(m[1]) * 86400000);
    return { date: `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}` };
  }
  const parsed = parseDateText(t, order);
  return parsed.iso ? { date: parsed.iso } : { problem: `isn't a date the app can read: "${t}"` };
}

const SYMBOLS = '$€£¥₹₩₽₺₪฿₫';
// A number as plain digits with a point, whatever the file wrote: 1,234.56 or 1.234,56 (the person says which), a currency symbol or
// code in front or behind, (12.50) or 12.50- for a negative. null when it is not a number.
function readNumber(text, decimal = '.') {
  let t = String(text ?? '').trim().replace(/\u2212/g, '-');
  if (!t) return { empty: true };
  let negative = false;
  if (/^\(.*\)$/.test(t)) { negative = true; t = t.slice(1, -1).trim(); }
  t = t.replace(new RegExp(`^(?:[A-Z]{3}|[${SYMBOLS}]+)\\s*`), '').replace(new RegExp(`\\s*(?:[A-Z]{3}|[${SYMBOLS}]+)$`), '').replace(/[\s\u00a0']/g, '');
  if (/-$/.test(t)) { negative = !negative; t = t.slice(0, -1); }
  t = decimal === ',' ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return { problem: true };
  if (t.startsWith('-')) { negative = !negative; t = t.slice(1); } else if (t.startsWith('+')) t = t.slice(1);
  return { text: `${negative ? '-' : ''}${t}` };
}

// The same row read twice gives the same fingerprint, so importing a file again finds every row already there. Identical rows inside one
// file are told apart by how many came before, so they are never merged into one.
function fingerprinter(kind) {
  const seen = new Map();
  return (cells) => {
    const base = crypto.createHash('sha256').update(JSON.stringify([kind, cells.map((cell) => String(cell ?? '').trim())])).digest('hex');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? crypto.createHash('sha256').update(`${base}:${count}`).digest('hex') : base;
  };
}

// ---- Reading the rows with a layout ----------------------------------------------------------------------------------------

/**
 * `mapping` says which column is which, by position. `options`: headerRow (the row the headings are on, if not the first with anything in it),
 * dateOrder ('month-first' or 'day-first', for 03/04/2026), decimal ('.' or ','), and currency (a fixed one such as USD, for a file with no
 * currency column). Every row of the sheet ends up as one outcome, or the whole thing is refused with the first rows that could not be read.
 */
function readMapped({ sheet, mapping, options = {}, storeId, storeName }) {
  const head = headingsOf(sheet, options.headerRow);
  if (head.index < 0) throw new MappingError('There is nothing in that sheet.');
  const pick = (key) => (Number.isInteger(mapping[key]) && mapping[key] >= 0 && mapping[key] < head.names.length ? mapping[key] : null);
  const at = Object.fromEntries(FIELDS.map((f) => [f.key, pick(f.key)]));
  const missing = [];
  if (at.date == null) missing.push('the date of the sale');
  if (at.royalty == null) missing.push('what you earned');
  if (at.title == null && at.item == null) missing.push('the title or the ISBN, ASIN or store number');
  if (at.currency == null && !options.currency) missing.push('the currency (a column, or say which currency the whole file is in)');
  if (missing.length) throw new MappingError(`Say which column holds ${missing.join(', and ')}.`);
  const fixed = String(options.currency ?? '').trim().toUpperCase();
  if (at.currency == null) {
    try { exponentOf(fixed); } catch { throw new MappingError(`"${options.currency}" isn't a currency this app knows. Use its three-letter code, such as USD, GBP or EUR.`); }
  }
  const decimal = options.decimal === ',' ? ',' : '.';
  const order = options.dateOrder === 'day-first' ? 'day-first' : 'month-first';

  const accounting = [];
  const account = (row, outcome, reason) => accounting.push({ sheet: sheet.name, row, outcome, ...(reason ? { reason } : {}) });
  const sales = [];
  const problems = [];
  const setAside = [];
  const print = fingerprinter(`mapped:${storeId}`);
  const cell = (cells, key) => (at[key] == null ? '' : String(cells[at[key]] ?? '').trim());
  const problem = (row, what) => { if (problems.length < 200) problems.push({ row, what }); };

  sheet.rows.forEach((row, index) => {
    if (index < head.index) { account(row.number, 'not a sale', 'before the headings'); return; }
    if (index === head.index) { account(row.number, 'not a sale', 'headings'); return; }
    if (blank(row.cells)) { account(row.number, 'not a sale', 'empty'); return; }
    const dateText = cell(row.cells, 'date');
    const title = cell(row.cells, 'title');
    const item = cell(row.cells, 'item');
    // A total or a note at the bottom has no title or number for a book: it is not a sale. It is said to be set aside, with its row, so it is never lost silently.
    if (!title && !item) { account(row.number, 'not a sale', 'no title: a total or a note'); setAside.push(row.number); return; }

    const when = readDate(dateText, order);
    if (when.problem) { problem(row.number, `the date ${when.problem}`); return; }
    const currency = at.currency == null ? fixed : cell(row.cells, 'currency').toUpperCase();
    let royalty;
    try {
      const earned = readNumber(cell(row.cells, 'royalty'), decimal);
      if (earned.empty) { problem(row.number, 'what you earned is empty'); return; }
      if (earned.problem) { problem(row.number, `what you earned isn't a number: "${cell(row.cells, 'royalty')}"`); return; }
      royalty = parseMoney(earned.text, currency);
    } catch (error) {
      problem(row.number, error.name === 'MoneyError' ? `the currency "${currency}" isn't one this app knows` : error.message);
      return;
    }
    let units = 0;
    if (at.units != null) {
      const n = readNumber(cell(row.cells, 'units'), decimal);
      if (n.problem || (n.text && !/^-?\d+$/.test(n.text.replace(/\.0+$/, '')))) { problem(row.number, `the copies sold isn't a whole number: "${cell(row.cells, 'units')}"`); return; }
      units = n.empty ? 0 : Number(n.text.replace(/\.0+$/, ''));
    }
    sales.push({
      sheet: sheet.name, row: row.number, fingerprint: print(row.cells), royaltyDate: when.date, title: title || item, author: '', storeId: item,
      marketplace: cell(row.cells, 'marketplace'), royaltyType: '', transactionType: '', unitsSold: Math.max(units, 0), unitsRefunded: Math.max(-units, 0), netUnits: units,
      listPrice: null, offerPrice: null, cost: null, royalty, estimate: true,
    });
    account(row.number, 'imported');
  });

  if (problems.length) {
    const first = problems.slice(0, 5).map((p) => `row ${p.row}: ${p.what}`).join('; ');
    throw new MappingError(`${problems.length > 5 ? `${problems.length} rows could not be read. The first: ` : 'A row could not be read: '}${first}. Nothing was imported. Check the columns, the date order and the number style.`);
  }
  const counts = {};
  for (const item of accounting) counts[item.outcome] = (counts[item.outcome] ?? 0) + 1;
  const notes = [
    'This report was read with the columns you chose, and the file has no total of its own to check the rows against. Compare the total shown with the store\'s own figure.',
  ];
  if (setAside.length) notes.push(`${setAside.length === 1 ? 'This row has' : 'These rows have'} no title, so ${setAside.length === 1 ? 'it was' : 'they were'} taken for a total or a note and left out: row${setAside.length === 1 ? '' : 's'} ${setAside.slice(0, 10).join(', ')}${setAside.length > 10 ? ' and more' : ''}.`);
  if (at.units == null) notes.push('There is no column of copies sold, so copies show as 0.');
  return {
    kind: 'mapped', sales, orders: [], pagesRead: [], payments: [], accounting, problems: [], notes,
    rowsInFile: sheet.rows.length, accounted: accounting.length, complete: accounting.length === sheet.rows.length, counts,
    totals: totals(sales.map((s) => s.royalty)), store: { id: storeId, name: storeName },
  };
}

// ---- A remembered layout ---------------------------------------------------------------------------------------------------

// What to keep: the columns by their headings (so a file with the columns in another order still fits), and the choices.
function layoutOf({ names, mapping, options }) {
  const columns = {};
  for (const field of FIELDS) {
    const i = mapping[field.key];
    columns[field.key] = Number.isInteger(i) && names[i] !== undefined ? columnName(names, i) : null;
  }
  return { headers: names, columns, options: { dateOrder: options.dateOrder === 'day-first' ? 'day-first' : 'month-first', decimal: options.decimal === ',' ? ',' : '.', currency: String(options.currency ?? '').toUpperCase() } };
}

// Does a file's headings still fit a remembered layout? `fits` when every column it uses is still there. When it doesn't, it says which are gone and
// which headings are new, so a store that renamed a column is told which, and the layout is never applied by guessing.
function compareLayout(saved, names) {
  const gone = [];
  const mapping = {};
  for (const field of FIELDS) {
    const ref = saved.columns[field.key];
    if (!ref) { mapping[field.key] = null; continue; }
    const i = columnIndex(names, ref);
    if (i == null) gone.push(ref.name); else mapping[field.key] = i;
  }
  const known = new Set(saved.headers);
  const shared = names.filter((n) => known.has(n)).length;
  return {
    fits: gone.length === 0,
    gone,
    added: names.filter((n) => n && !known.has(n)),
    same: gone.length === 0 && names.length === saved.headers.length && names.every((n, i) => n === saved.headers[i]),
    overlap: saved.headers.length ? shared / saved.headers.length : 0,
    mapping,
    options: saved.options,
  };
}

module.exports = { FIELDS, MappingError, columnName, compareLayout, guessMapping, headingsOf, layoutOf, readDate, readMapped, readNumber, readTable };
