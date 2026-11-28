'use strict';
// Getting everything out. One folder, made fresh each time, holding the whole library as JSON (exact, one file), as CSV (one file
// for each kind of thing, with the names filled in beside the ids so it reads in a spreadsheet), and each original sales report
// as it was imported. Nothing here is a secret: the library's key and its lock are never written, and neither is the log of changes.
const fs = require('node:fs');
const path = require('node:path');
const { stringifyCsv } = require('../shared/csv');
const { MoneyError, money, toDecimalString } = require('../shared/money');
const { TABLES } = require('./storage/schema');

class ExportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExportError';
  }
}

// In the order a person thinks of them. A table that isn't listed isn't exported.
const ORDER = ['publisher_names', 'pen_names', 'series', 'books', 'editions', 'people', 'credits', 'isbns', 'stores', 'recordings', 'listings', 'listing_credits', 'prices',
  'own_rate_cards', 'report_layouts', 'dismissed_clashes', 'report_files', 'sale_lines', 'pages_read', 'order_counts', 'payments', 'item_matches', 'catalog_imports', 'trash_items'];
const HIDDEN = { report_files: ['original'] };
const ID_COLUMNS = ['id', 'created_at', 'updated_at'];

// A whole number of the smallest unit, as text, and its currency, as the decimal a person reads.
function decimal(minor, currency) {
  if (minor == null || minor === '' || !currency) return '';
  try {
    return toDecimalString(money(BigInt(minor), currency));
  } catch (error) {
    if (error instanceof MoneyError || error instanceof SyntaxError) return '';
    throw error;
  }
}

const safeName = (text, fallback) => String(text || fallback).replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || fallback;
const pad = (n) => String(n).padStart(2, '0');
const stampOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

// What's added beside the ids so a table reads on its own: the title of the book, the name of the store, the price as a decimal.
function readableColumns(library) {
  const by = (table) => new Map(library.list(table).map((r) => [r.id, r]));
  const books = by('books');
  const editions = by('editions');
  const stores = by('stores');
  const series = by('series');
  const pens = by('pen_names');
  const publishers = by('publisher_names');
  const listings = by('listings');
  const people = by('people');
  const credits = by('credits');
  const edition = (id) => {
    const e = editions.get(id);
    if (!e) return '';
    return `${books.get(e.book_id)?.title || 'Untitled'}: ${e.label ? `${e.format}, ${e.label}` : e.format}`;
  };
  const store = (id) => stores.get(id)?.name ?? '';
  const money3 = (row, fields, currencyOf) => Object.fromEntries(fields.map((f) => [`${f}_decimal`, decimal(row[f], currencyOf(f))]));
  return {
    books: (r) => ({ series_name: series.get(r.series_id)?.name ?? '', pen_name: pens.get(r.pen_name_id)?.name ?? '' }),
    editions: (r) => ({ book_title: books.get(r.book_id)?.title ?? '', publisher_name: publishers.get(r.publisher_name_id)?.name ?? '' }),
    credits: (r) => ({ edition: edition(r.edition_id), person_name: people.get(r.person_id)?.name ?? '' }),
    listing_credits: (r) => ({
      edition: edition(listings.get(r.listing_id)?.edition_id), store_name: store(listings.get(r.listing_id)?.store_id),
      person_name: people.get(credits.get(r.credit_id)?.person_id)?.name ?? '', role: credits.get(r.credit_id)?.role ?? '',
    }),
    own_rate_cards: (r) => ({ store_name: store(r.store_id) }),
    report_layouts: (r) => ({ store_name: store(r.store_id) }),
    isbns: (r) => ({ edition: edition(r.edition_id), store_name: store(r.store_id) }),
    recordings: (r) => ({ edition: edition(r.edition_id), exclusive_store_name: store(r.exclusive_store_id) }),
    listings: (r) => ({ edition: edition(r.edition_id), store_name: store(r.store_id), via_store_name: store(r.via_store_id) }),
    prices: (r) => ({ edition: edition(listings.get(r.listing_id)?.edition_id), store_name: store(listings.get(r.listing_id)?.store_id), ...money3(r, ['amount'], () => r.currency) }),
    sale_lines: (r) => ({ edition: edition(r.edition_id), store_name: store(r.store_id), ...money3(r, ['list_price', 'offer_price', 'delivery_cost', 'royalty'], () => r.currency), ...money3(r, ['converted'], () => r.converted_currency) }),
    pages_read: (r) => ({ edition: edition(r.edition_id), store_name: store(r.store_id) }),
    order_counts: (r) => ({ edition: edition(r.edition_id), store_name: store(r.store_id) }),
    payments: (r) => ({ store_name: store(r.store_id), ...money3(r, ['accrued', 'tax_withheld', 'adjustments', 'net'], () => r.earned_currency), ...money3(r, ['payout'], () => r.payout_currency) }),
    report_files: (r) => ({ store_name: store(r.store_id), has_original: r.original ? 'yes' : 'no' }),
    item_matches: (r) => ({ store_name: store(r.store_id), edition: edition(r.edition_id) }),
    dismissed_clashes: () => ({}),
  };
}

const README = (now, version, counts) => `RT Author Desk: everything you have entered, taken out
Made ${now.toLocaleString()} by version ${version || 'unknown'}.

library.json   The whole library in one file, exactly as it is kept. Every record has the id it has in the app. Amounts are whole numbers of the
               smallest unit with their currency beside them (1299 USD is $12.99), and dates are year-month-day.
csv/           One spreadsheet for each kind of thing, with the names filled in beside the ids (the title of the book, the name of the store)
               and amounts also written as decimals, in columns ending _decimal. Open them in Excel, Numbers or any spreadsheet. A cell that
               starts with = + @ or - has a ' put in front of it, so a spreadsheet can't run it as a formula.
reports/       Each original sales report, exactly as you imported it.

Nothing secret is in here: not your library's key, and not its lock. Keep the folder somewhere private all the same, because it holds
your catalog and your sales in the open.

What is in it: ${Object.entries(counts).filter(([, n]) => n).map(([t, n]) => `${n} ${t.replace(/_/g, ' ')}`).join(', ') || 'nothing yet'}.
`;

// Writes the export into a new folder inside `parent`, and says what's in it.
function exportAll(library, parent, { now = () => new Date(), version = '' } = {}) {
  if (!parent || typeof parent !== 'string') throw new ExportError('Choose a folder to put the export in.');
  const date = now();
  let folder = path.join(parent, `RT Author Desk export ${stampOf(date)}`);
  try {
    fs.mkdirSync(parent, { recursive: true });
    for (let n = 2; fs.existsSync(folder); n += 1) folder = path.join(parent, `RT Author Desk export ${stampOf(date)} (${n})`);
    fs.mkdirSync(path.join(folder, 'csv'), { recursive: true });
  } catch (error) {
    throw new ExportError(`The export couldn't be made in that folder: ${error.code === 'ENOSPC' ? 'there is no room left' : "this app isn't allowed to write there, or it isn't there"}.`);
  }

  try {
    const extra = readableColumns(library);
    const tables = {};
    const counts = {};
    for (const table of ORDER) {
      if (!TABLES[table]) continue;
      const hidden = HIDDEN[table] ?? [];
      const columns = [...ID_COLUMNS, ...TABLES[table].filter((c) => !hidden.includes(c))];
      const rows = library.list(table);
      counts[table] = rows.length;
      tables[table] = rows.map((row) => {
        const out = Object.fromEntries(columns.map((c) => [c, row[c] ?? null]));
        if (table === 'trash_items') out.payload = JSON.parse(row.payload);
        return out;
      });
      const added = rows.length ? Object.keys(extra[table]?.(rows[0]) ?? {}) : Object.keys(extra[table]?.({}) ?? {});
      const header = [...columns, ...added];
      const lines = [header, ...rows.map((row) => {
        const more = extra[table]?.(row) ?? {};
        return [...columns.map((c) => (table === 'trash_items' && c === 'payload' ? row.payload : row[c])), ...added.map((c) => more[c])];
      })];
      fs.writeFileSync(path.join(folder, 'csv', `${table.replace(/_/g, '-')}.csv`), `\uFEFF${stringifyCsv(lines)}`);
    }
    const info = library.info();
    fs.writeFileSync(path.join(folder, 'library.json'), `${JSON.stringify({
      app: 'rt-author-desk', version: String(version), exportedAt: date.toISOString(), schemaStep: info.step, libraryId: info.id, counts, tables,
    }, null, 2)}\n`);

    // The reports as they came in.
    let reports = 0;
    const originals = library.db.prepare("SELECT id, file_name, original FROM report_files WHERE original IS NOT NULL AND status = 'accepted' ORDER BY created_at, rowid").all();
    if (originals.length) fs.mkdirSync(path.join(folder, 'reports'), { recursive: true });
    for (const row of originals) {
      fs.writeFileSync(path.join(folder, 'reports', `${row.id.slice(0, 8)} ${safeName(row.file_name, 'report.xlsx')}`), row.original);
      reports += 1;
    }
    fs.writeFileSync(path.join(folder, 'README.txt'), README(date, version, counts));
    return { folder, counts, reports, files: 2 + Object.keys(tables).length + reports };
  } catch (error) {
    fs.rmSync(folder, { recursive: true, force: true }); // a half-made export is worse than none
    if (error instanceof ExportError) throw error;
    if (['EACCES', 'EPERM', 'ENOSPC', 'EROFS'].includes(error.code)) throw new ExportError(`The export couldn't be finished: ${error.code === 'ENOSPC' ? 'there is no room left' : "this app isn't allowed to write there"}.`);
    throw error;
  }
}

module.exports = { ExportError, ORDER, exportAll };
