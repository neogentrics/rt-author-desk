'use strict';
// Taking a store's report into the library, as in docs/design/report-imports.md. A file is read and shown first
// (preview), and nothing is saved until it's accepted. Accepting saves the whole batch in one step, or nothing at all.
// Every row ends up with one outcome, rows already imported are skipped, and a batch can be undone as a whole. The original
// file is kept inside the encrypted library, so it can be read again if a reader improves.
const crypto = require('node:crypto');
const { LayoutError } = require('./reports/kdp');
const { readReport, readerStatus } = require('./reports/index');
const { readWorkbook, WorkbookError } = require('./reports/xlsx');
const { FIELDS, MappingError, compareLayout, guessMapping, headingsOf, layoutOf, readMapped, readTable } = require('./reports/mapped');
const { parseIsbn } = require('../shared/isbn');
const { add, format, money, toDecimalString, zero } = require('../shared/money');

class ImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImportError';
  }
}

const MAX_FILE = 50 * 1024 * 1024; // A sales report is a few MB. Anything near this isn't one.
const MAX_WAITING = 5; // Files shown but not yet accepted, kept in memory only.
const KIND_LABELS = {
  'kdp-orders': 'Orders report (estimated royalties)',
  'kdp-payments': 'Payments report (what was paid)',
  mapped: 'Report read with the columns you matched',
};
const SALE_TABLES = ['sale_lines', 'pages_read', 'order_counts'];

// An ASIN is compared as typed, in capitals. An ISBN is compared as its 13 digits, so a 10-digit ISBN finds the same book.
function itemKey(text) {
  const t = String(text ?? '').trim();
  if (!t) return '';
  const isbn = parseIsbn(t);
  return isbn.ok ? isbn.isbn13 : t.toUpperCase();
}

const monthOf = (text, where) => {
  const found = /^(\d{4})-(\d{2})(?:-\d{2})?/.exec(String(text).trim());
  if (!found || Number(found[2]) < 1 || Number(found[2]) > 12) throw new ImportError(`There is a date I can't read in ${where}: "${text}". Nothing was imported.`);
  return `${found[1]}-${found[2]}`;
};

const dayOf = (text, where) => {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const found = /^(\d{4}-\d{2}-\d{2})/.exec(t);
  if (!found) throw new ImportError(`There is a date I can't read in ${where}: "${t}". Nothing was imported.`);
  return found[1];
};

const lastDay = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

const minor = (amount) => (amount ? amount.minor.toString() : null);

class Importer {
  constructor(library, { locale, now = () => new Date() } = {}) {
    this.library = library;
    this.locale = locale;
    this.now = now;
    this.waiting = new Map();
    this.tables = new Map(); // files opened for Match your columns and not yet read, in memory only
  }

  // ---- Reading a file, and showing what it holds ----------------------------------------------------------------------

  // Reads the file and says what accepting it would do. Nothing is saved.
  preview(buffer, fileName = '') {
    if (!Buffer.isBuffer(buffer)) throw new ImportError("That isn't a file the app can read.");
    if (buffer.length > MAX_FILE) throw new ImportError('That file is too big to be a sales report.');
    let report;
    try {
      report = readReport(readWorkbook(buffer));
    } catch (error) {
      if (error instanceof LayoutError || error instanceof WorkbookError) throw new ImportError(`${error.message} Nothing was imported.`);
      throw error;
    }
    if (!report) {
      const waiting = readerStatus().filter((r) => !r.ready).map((r) => r.name);
      throw new ImportError(`This isn't a report the app can read yet. It reads Amazon KDP's orders and payments reports. ${waiting.join(', ')} are waiting for a real report to build from. For any of them, Match your columns reads its report in the meantime.`);
    }
    return this.#show(report, buffer, fileName);
  }

  // ---- Match your columns: a report from a store with no reader, read with the columns the person points out ----------------

  // Opens the file far enough to show its headings and a few rows, with a guess at the columns and any layout kept for it. Nothing is saved.
  openColumns(buffer, fileName = '') {
    let table;
    try {
      table = readTable(buffer, fileName);
    } catch (error) {
      if (error instanceof MappingError || error instanceof WorkbookError) throw new ImportError(`${error.message} Nothing was imported.`);
      throw error;
    }
    const id = crypto.randomUUID();
    this.tables.set(id, { buffer, fileName: String(fileName).slice(0, 200), table });
    while (this.tables.size > MAX_WAITING) this.tables.delete(this.tables.keys().next().value);
    const stores = new Map(this.library.list('stores').map((s) => [s.id, s.name]));
    return {
      id, fileName: String(fileName).slice(0, 200), format: table.format,
      fields: FIELDS.map(({ key, label, required }) => ({ key, label, required: Boolean(required) })),
      sheets: table.sheets.map((sheet) => this.#sheetView(sheet, null, stores)),
    };
  }

  // The same sheet seen with the headings on another row (a store that puts a title block above them).
  columnsFor({ id, sheet, headerRow } = {}) {
    const pending = this.tables.get(id);
    if (!pending) throw new ImportError('That file is no longer open here. Choose it again.');
    const found = pending.table.sheets.find((s) => s.name === sheet);
    if (!found) throw new ImportError('Choose which sheet of the file holds the sales.');
    const stores = new Map(this.library.list('stores').map((s) => [s.id, s.name]));
    return this.#sheetView(found, headerRow ? Number(headerRow) : null, stores);
  }

  #sheetView(sheet, headerRow, stores) {
    const head = headingsOf(sheet, headerRow);
    const body = sheet.rows.slice(head.index + 1).filter((row) => row.cells.some((c) => String(c ?? '').trim() !== ''));
    return {
      name: sheet.name, headerRow: head.number, headers: head.names, rowCount: sheet.rows.length,
      sample: body.slice(0, 5).map((row) => row.cells.map((c) => String(c ?? '').slice(0, 80))),
      guess: guessMapping(head.names), ...this.#layoutsFor(sheet, headerRow, stores),
    };
  }

  // What accepting would do with the columns chosen. Nothing is saved. A cell that can't be read is said in words, with its row.
  previewColumns({ id, sheet, storeId, mapping = {}, options = {}, remember = false, layoutName = '' } = {}) {
    const pending = this.tables.get(id);
    if (!pending) throw new ImportError('That file is no longer open here. Choose it again.');
    const found = pending.table.sheets.find((s) => s.name === sheet) ?? (pending.table.sheets.length === 1 ? pending.table.sheets[0] : null);
    if (!found) throw new ImportError('Choose which sheet of the file holds the sales.');
    const store = this.library.get('stores', storeId);
    if (!store) throw new ImportError('Choose which store this report is from.');
    const choice = {
      mapping: Object.fromEntries(Object.entries(mapping ?? {}).map(([k, v]) => [k, v === '' || v == null ? null : Number(v)])),
      options: { headerRow: options.headerRow ? Number(options.headerRow) : null, dateOrder: options.dateOrder, decimal: options.decimal, currency: options.currency },
    };
    let report;
    try {
      report = readMapped({ sheet: found, mapping: choice.mapping, options: choice.options, storeId, storeName: store.name });
    } catch (error) {
      if (error instanceof MappingError) throw new ImportError(error.message);
      throw error;
    }
    report.reader = { id: 'mapped', storeId, name: store.name };
    const names = headingsOf(found, choice.options.headerRow).names;
    const layout = remember ? { storeId, name: String(layoutName).trim().slice(0, 80) || `${store.name} report`, sheet: pending.table.format === 'xlsx' ? found.name : '', ...layoutOf({ names, mapping: choice.mapping, options: choice.options }) } : null;
    return this.#show(report, pending.buffer, pending.fileName, layout);
  }

  // The layouts kept for a store, and taking one away.
  layouts() {
    const stores = new Map(this.library.list('stores').map((s) => [s.id, s.name]));
    return this.library.list('report_layouts').map((row) => ({
      id: row.id, name: row.name, storeId: row.store_id, storeName: stores.get(row.store_id) ?? row.store_id, headers: JSON.parse(row.headers),
    })).sort((a, b) => a.storeName.localeCompare(b.storeName) || a.name.localeCompare(b.name));
  }

  removeLayout({ id } = {}) {
    if (!this.library.get('report_layouts', id)) throw new ImportError("That layout isn't in your library.");
    this.library.remove('report_layouts', id);
    return true;
  }

  // Which kept layouts fit a file's headings, and which look like the same report whose columns have changed.
  #layoutsFor(sheet, headerRow, stores) {
    const recognized = [];
    const changed = [];
    for (const row of this.library.list('report_layouts')) {
      const saved = { headers: JSON.parse(row.headers), columns: JSON.parse(row.columns), options: JSON.parse(row.options) };
      // A layout made with the headings on a later row is looked for there.
      const names = headingsOf(sheet, headerRow ?? saved.options.headerRow ?? null).names;
      const result = compareLayout(saved, names);
      const base = { id: row.id, name: row.name, storeId: row.store_id, storeName: stores.get(row.store_id) ?? row.store_id };
      if (result.fits) recognized.push({ ...base, same: result.same, mapping: result.mapping, options: result.options });
      else if (result.overlap >= 0.5) changed.push({ ...base, gone: result.gone, added: result.added });
    }
    recognized.sort((a, b) => Number(b.same) - Number(a.same));
    return { recognized, changed };
  }

  // Shows what accepting a read report would do, and keeps it until it is accepted.
  #show(report, buffer, fileName, layout = null) {
    if (!report.complete) throw new ImportError("The rows in this file didn't add up, so nothing was imported.");

    const fingerprint = crypto.createHash('sha256').update(buffer).digest('hex');
    const plan = this.#plan(report);
    const earlier = this.#liveFile(fingerprint);
    const id = crypto.randomUUID();
    this.waiting.set(id, { buffer, fileName: String(fileName).slice(0, 200), fingerprint, report, layout });
    while (this.waiting.size > MAX_WAITING) this.waiting.delete(this.waiting.keys().next().value);

    return {
      previewId: id,
      store: report.reader.name,
      kind: report.kind,
      kindLabel: KIND_LABELS[report.kind] ?? report.kind,
      fileName: String(fileName).slice(0, 200),
      alreadyImported: earlier ? { on: earlier.created_at.slice(0, 10), fileName: earlier.file_name } : null,
      period: plan.period,
      rowsInFile: report.rowsInFile,
      counts: plan.counts,
      newRows: plan.newRows,
      totals: this.#shown([...report.totals?.values?.() ?? []]),
      problems: report.problems,
      notes: report.notes ?? [],
      layoutKept: Boolean(layout),
      needsMatching: plan.unmatched,
    };
  }

  // ---- Saving, undoing, matching --------------------------------------------------------------------------------------

  // Saves the file as one batch. A report whose own total disagrees with its rows is refused unless the person says they
  // know, and then it is saved with the problem written on it, where it stays.
  accept({ previewId, knowingMismatch = false } = {}) {
    const pending = this.waiting.get(previewId);
    if (!pending) throw new ImportError('That file is no longer open here. Choose it again.');
    const { report, buffer, fileName, fingerprint, layout } = pending;
    const earlier = this.#liveFile(fingerprint);
    if (earlier) throw new ImportError(`You already imported this exact file on ${earlier.created_at.slice(0, 10)}. Nothing was changed.`);
    if (report.problems.length && !knowingMismatch) {
      throw new ImportError(`This report doesn't add up. ${report.problems[0]} Nothing was imported. You can import it anyway if you tick that you know.`);
    }

    const db = this.library.db;
    const result = db.transaction(() => {
      const plan = this.#plan(report);
      const resolve = this.#resolver(report.reader.storeId);
      const file = this.library.put('report_files', {
        store_id: report.reader.storeId, kind: report.kind, file_name: fileName, fingerprint,
        period_start: plan.period?.start ?? null, period_end: plan.period?.end ?? null,
        rows_in_file: report.rowsInFile, counts: JSON.stringify(plan.counts), accounting: JSON.stringify(plan.accounting),
        problems: JSON.stringify(report.problems), mismatch_accepted: report.problems.length ? 1 : 0, original: buffer,
      });
      const base = { report_id: file.id, store_id: report.reader.storeId };
      for (const sale of plan.sales) {
        const found = resolve(sale.storeId);
        this.library.put('sale_lines', {
          ...base, fingerprint: sale.fingerprint, store_item: sale.storeId, title: sale.title, author: sale.author,
          marketplace: sale.marketplace, period: monthOf(sale.royaltyDate, `row ${sale.row} of ${sale.sheet}`), royalty_date: sale.royaltyDate,
          royalty_type: sale.royaltyType, transaction_type: sale.transactionType, units_sold: sale.unitsSold,
          units_refunded: sale.unitsRefunded, net_units: sale.netUnits, currency: sale.royalty.currency,
          list_price: minor(sale.listPrice), offer_price: minor(sale.offerPrice), delivery_cost: minor(sale.cost),
          royalty: minor(sale.royalty), estimate: sale.estimate ? 1 : 0, edition_id: found.edition_id, listing_id: found.listing_id,
        });
      }
      for (const row of plan.pages) {
        this.library.put('pages_read', {
          ...base, fingerprint: row.fingerprint, store_item: row.storeId, title: row.title, marketplace: row.marketplace,
          read_date: row.date, period: monthOf(row.date, `row ${row.row} of ${row.sheet}`), pages: row.pages, edition_id: resolve(row.storeId).edition_id,
        });
      }
      for (const row of plan.orders) {
        this.library.put('order_counts', {
          ...base, fingerprint: row.fingerprint, store_item: row.storeId, title: row.title, marketplace: row.marketplace,
          kind: row.kind, order_date: row.date, period: monthOf(row.date, `row ${row.row} of ${row.sheet}`),
          paid_units: row.paid, free_units: row.free, edition_id: resolve(row.storeId).edition_id,
        });
      }
      for (const row of plan.payments) {
        this.library.put('payments', {
          ...base, fingerprint: row.fingerprint, marketplace: row.marketplace,
          period_start: dayOf(row.periodStart, `row ${row.row} of Payments`), period_end: dayOf(row.periodEnd, `row ${row.row} of Payments`),
          payment_number: row.paymentNumber, detail: row.detail, paid_date: row.date, method: row.method,
          earned_currency: row.accrued?.currency ?? row.net?.currency ?? null, accrued: minor(row.accrued),
          tax_withheld: minor(row.taxWithheld), adjustments: minor(row.adjustments), net: minor(row.net), source: row.source,
          fx_rate: row.rate, payout_currency: row.payout?.currency ?? null, payout: minor(row.payout), status: row.status,
        });
      }
      if (layout) {
        // The layout is kept with the batch, so a file with the same headings next time needs no matching. The same store and headings update the one kept.
        const kept = this.library.list('report_layouts').find((row) => row.store_id === layout.storeId && row.headers === JSON.stringify(layout.headers));
        this.library.put('report_layouts', {
          ...(kept ? { id: kept.id } : {}), name: layout.name, store_id: layout.storeId, sheet: layout.sheet,
          headers: JSON.stringify(layout.headers), columns: JSON.stringify(layout.columns), options: JSON.stringify(layout.options),
        });
      }
      return { reportId: file.id, counts: plan.counts, newRows: plan.newRows, needsMatching: plan.unmatched, layoutKept: Boolean(layout) };
    })();
    this.waiting.delete(previewId);
    return result;
  }

  // Takes back a whole batch: every row it saved goes, and the stored original with it. The batch stays in the list as
  // "undone", so what happened is still on record, and the same file can be imported again.
  undo({ id } = {}) {
    const file = this.library.get('report_files', id);
    if (!file) throw new ImportError("That import isn't in your library.");
    if (file.status === 'undone') throw new ImportError('That import was already undone.');
    return this.library.db.transaction(() => {
      let removed = 0;
      for (const table of [...SALE_TABLES, 'payments']) {
        for (const { id: rowId } of this.library.db.prepare(`SELECT id FROM ${table} WHERE report_id = ?`).all(id)) {
          this.library.remove(table, rowId);
          removed += 1;
        }
      }
      this.library.put('report_files', { id, status: 'undone', original: null });
      return { removed };
    })();
  }

  // The person's one answer for an item: this ASIN or ISBN is that edition. It's remembered, and every row already saved
  // for the item is pointed at it.
  matchItem({ storeId = 'store-kdp', storeItem, editionId } = {}) {
    const key = itemKey(storeItem);
    if (!key) throw new ImportError('Say which ASIN or ISBN you mean.');
    if (!this.library.get('stores', storeId)) throw new ImportError("That store isn't in your library.");
    if (!this.library.get('editions', editionId)) throw new ImportError("That edition isn't in your library.");
    return this.library.db.transaction(() => {
      const known = this.library.db.prepare('SELECT id FROM item_matches WHERE store_id = ? AND store_item = ?').get(storeId, key);
      if (known) this.library.put('item_matches', { id: known.id, edition_id: editionId });
      else this.library.put('item_matches', { store_id: storeId, store_item: key, edition_id: editionId });
      const resolve = this.#resolver(storeId);
      let rows = 0;
      for (const table of SALE_TABLES) {
        for (const row of this.library.db.prepare(`SELECT id, store_item, edition_id FROM ${table} WHERE store_id = ?`).all(storeId)) {
          if (itemKey(row.store_item) !== key || row.edition_id === editionId) continue;
          const change = { id: row.id, edition_id: editionId };
          if (table === 'sale_lines') change.listing_id = resolve(row.store_item).listing_id;
          this.library.put(table, change);
          rows += 1;
        }
      }
      return { rows };
    })();
  }

  // Rows that no edition owns yet, grouped by item, so each question is asked once. First it tries again with what the
  // catalog knows now, in case an ISBN or store ID has been added since.
  needsMatching() {
    this.rematch();
    const found = new Map();
    for (const table of SALE_TABLES) {
      const units = { sale_lines: 'net_units', pages_read: 'pages', order_counts: 'paid_units' }[table];
      for (const row of this.library.db.prepare(`SELECT store_id, store_item, title, ${units} AS units FROM ${table} WHERE edition_id IS NULL`).all()) {
        const key = `${row.store_id}\u0000${itemKey(row.store_item)}`;
        const item = found.get(key) ?? { storeId: row.store_id, storeItem: row.store_item, title: row.title, rows: 0 };
        item.rows += 1;
        found.set(key, item);
      }
    }
    const stores = new Map(this.library.list('stores').map((s) => [s.id, s.name]));
    return [...found.values()].map((item) => ({ ...item, storeName: stores.get(item.storeId) ?? item.storeId }))
      .sort((a, b) => a.title.localeCompare(b.title) || a.storeItem.localeCompare(b.storeItem));
  }

  rematch() {
    const stores = new Set();
    for (const table of SALE_TABLES) {
      for (const { store_id: id } of this.library.db.prepare(`SELECT DISTINCT store_id FROM ${table} WHERE edition_id IS NULL`).all()) stores.add(id);
    }
    for (const storeId of stores) {
      const resolve = this.#resolver(storeId);
      for (const table of SALE_TABLES) {
        for (const row of this.library.db.prepare(`SELECT id, store_item FROM ${table} WHERE store_id = ? AND edition_id IS NULL`).all(storeId)) {
          const found = resolve(row.store_item);
          if (!found.edition_id) continue;
          this.library.put(table, { id: row.id, edition_id: found.edition_id, ...(table === 'sale_lines' ? { listing_id: found.listing_id } : {}) });
        }
      }
    }
  }

  // ---- What's been imported, and what it adds up to --------------------------------------------------------------------

  reports() {
    const stores = new Map(this.library.list('stores').map((s) => [s.id, s.name]));
    return this.library.db.prepare(`SELECT id, store_id, kind, file_name, period_start, period_end, status, rows_in_file, counts, problems,
      mismatch_accepted, original IS NOT NULL AS has_original, created_at FROM report_files ORDER BY created_at DESC, rowid DESC`).all()
      .map((row) => ({
        id: row.id, store: stores.get(row.store_id) ?? row.store_id, kind: row.kind, kindLabel: KIND_LABELS[row.kind] ?? row.kind,
        fileName: row.file_name, periodStart: row.period_start, periodEnd: row.period_end, status: row.status, rowsInFile: row.rows_in_file,
        counts: JSON.parse(row.counts), problems: JSON.parse(row.problems), mismatchAccepted: Boolean(row.mismatch_accepted),
        hasOriginal: Boolean(row.has_original), importedOn: row.created_at.slice(0, 10),
      }));
  }

  // The file exactly as it was imported.
  original(id) {
    const row = this.library.db.prepare('SELECT original FROM report_files WHERE id = ?').get(id);
    return row?.original ?? null;
  }

  // What the reports say you earned, what the payments say you were paid, and the gap, by currency and month. Money in
  // different currencies is never added together. A payment counts as paid only when its status says Paid.
  earnedVsPaid() {
    const db = this.library.db;
    const byCurrency = new Map();
    const slot = (currency, period) => {
      const cur = byCurrency.get(currency) ?? new Map();
      byCurrency.set(currency, cur);
      const row = cur.get(period) ?? { earned: zero(currency), accrued: zero(currency), paid: zero(currency), waiting: zero(currency), statuses: new Set(), payments: 0 };
      cur.set(period, row);
      return row;
    };
    for (const { currency, period, royalty } of db.prepare('SELECT currency, period, royalty FROM sale_lines').all()) {
      const row = slot(currency, period);
      row.earned = add(row.earned, money(BigInt(royalty), currency));
    }
    for (const p of db.prepare('SELECT earned_currency, period_start, accrued, net, status FROM payments WHERE earned_currency IS NOT NULL AND period_start IS NOT NULL').all()) {
      const row = slot(p.earned_currency, p.period_start.slice(0, 7));
      row.payments += 1;
      if (p.accrued != null) row.accrued = add(row.accrued, money(BigInt(p.accrued), p.earned_currency));
      if (p.net != null) {
        const net = money(BigInt(p.net), p.earned_currency);
        if (/^paid$/i.test(p.status.trim())) row.paid = add(row.paid, net);
        else row.waiting = add(row.waiting, net);
      }
      if (p.status.trim()) row.statuses.add(p.status.trim());
    }
    const currencies = [...byCurrency.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, months]) => {
      const rows = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, r]) => ({
        period,
        earned: this.#one(r.earned),
        accrued: this.#one(r.accrued),
        paid: this.#one(r.paid),
        waiting: this.#one(r.waiting),
        owed: this.#one(money(r.earned.minor - r.paid.minor, currency)),
        paymentSeen: r.payments > 0,
        statuses: [...r.statuses],
      }));
      const sum = (key) => rows.reduce((acc, r) => acc + BigInt(r[key].minor), 0n);
      return {
        currency,
        months: rows,
        totals: { earned: this.#one(money(sum('earned'), currency)), paid: this.#one(money(sum('paid'), currency)), owed: this.#one(money(sum('earned') - sum('paid'), currency)) },
      };
    });
    // A batch the person chose to keep although its own total disagreed stays flagged, for as long as it's in the library.
    const warnings = this.reports().filter((r) => r.status === 'accepted' && r.problems.length)
      .map((r) => ({ reportId: r.id, fileName: r.fileName, problems: r.problems }));
    return { currencies, warnings };
  }

  readers() {
    return readerStatus();
  }

  // ---- Inside ---------------------------------------------------------------------------------------------------------

  #liveFile(fingerprint) {
    return this.library.db.prepare("SELECT created_at, file_name FROM report_files WHERE fingerprint = ? AND status = 'accepted'").get(fingerprint) ?? null;
  }

  #one(amount) {
    return { currency: amount.currency, minor: amount.minor.toString(), amount: toDecimalString(amount), shown: format(amount, this.locale) };
  }

  #shown(list) {
    return list.map((amount) => this.#one(amount));
  }

  // Works out each store item's edition: an answer the person gave, then a store ID on a listing, then the ISBN register.
  #resolver(storeId) {
    const lib = this.library;
    const editions = new Set(lib.list('editions').map((e) => e.id));
    const answers = new Map(lib.db.prepare('SELECT store_item, edition_id FROM item_matches WHERE store_id = ?').all(storeId).map((r) => [r.store_item, r.edition_id]));
    const listings = lib.db.prepare("SELECT id, edition_id, store_item_id, route FROM listings WHERE store_id = ? AND route = 'direct' ORDER BY created_at, rowid").all(storeId);
    const byStoreId = new Map();
    for (const l of listings) if (l.store_item_id.trim() && !byStoreId.has(itemKey(l.store_item_id))) byStoreId.set(itemKey(l.store_item_id), l);
    const byEdition = new Map();
    for (const l of listings) if (!byEdition.has(l.edition_id)) byEdition.set(l.edition_id, l.id);
    const byIsbn = new Map(lib.db.prepare('SELECT isbn, edition_id FROM isbns WHERE edition_id IS NOT NULL').all().map((r) => [itemKey(r.isbn), r.edition_id]));
    return (item) => {
      const key = itemKey(item);
      const none = { edition_id: null, listing_id: null };
      if (!key) return none;
      const answered = answers.get(key);
      if (answered && editions.has(answered)) return { edition_id: answered, listing_id: byEdition.get(answered) ?? null };
      const listing = byStoreId.get(key);
      if (listing && editions.has(listing.edition_id)) return { edition_id: listing.edition_id, listing_id: listing.id };
      const edition = byIsbn.get(key);
      if (edition && editions.has(edition)) return { edition_id: edition, listing_id: byEdition.get(edition) ?? null };
      return none;
    };
  }

  // What accepting this report would do right now, row by row. A row already in the library, from this or another file,
  // is a duplicate. The outcomes must add up to the rows in the file, or nothing is saved.
  #plan(report) {
    const db = this.library.db;
    const exists = (table, fingerprint) => Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE fingerprint = ?`).get(fingerprint));
    const duplicated = new Set();
    const fresh = (table, list) => list.filter((row) => {
      if (!exists(table, row.fingerprint)) return true;
      duplicated.add(`${row.sheet}:${row.row}`);
      return false;
    });
    const sales = fresh('sale_lines', report.sales ?? []);
    const orders = fresh('order_counts', report.orders ?? []);
    const pages = fresh('pages_read', report.pagesRead ?? []);
    const payments = fresh('payments', report.payments ?? []);

    const accounting = report.accounting.map((item) => (duplicated.has(`${item.sheet}:${item.row}`)
      ? { sheet: item.sheet, row: item.row, outcome: 'duplicate', reason: 'already imported' } : item));
    const counts = {};
    for (const item of accounting) counts[item.outcome] = (counts[item.outcome] ?? 0) + 1;
    if (accounting.length !== report.rowsInFile || Object.values(counts).reduce((a, b) => a + b, 0) !== report.rowsInFile) {
      throw new ImportError("The rows in this file didn't add up, so nothing was imported.");
    }

    const resolve = this.#resolver(report.reader.storeId);
    const unmatched = new Map();
    for (const row of [...sales, ...orders, ...pages]) {
      if (resolve(row.storeId).edition_id) continue;
      const key = itemKey(row.storeId);
      const item = unmatched.get(key) ?? { storeItem: row.storeId, title: row.title, rows: 0 };
      item.rows += 1;
      unmatched.set(key, item);
    }

    const months = [...sales.map((s) => monthOf(s.royaltyDate, `row ${s.row} of ${s.sheet}`)), ...orders.map((r) => monthOf(r.date, `row ${r.row} of ${r.sheet}`)),
      ...pages.map((r) => monthOf(r.date, `row ${r.row} of ${r.sheet}`))].sort();
    const starts = payments.map((p) => dayOf(p.periodStart, `row ${p.row} of Payments`)).filter(Boolean).sort();
    const ends = payments.map((p) => dayOf(p.periodEnd, `row ${p.row} of Payments`)).filter(Boolean).sort();
    let period = null;
    if (months.length) period = { start: `${months[0]}-01`, end: lastDay(months.at(-1)) };
    else if (starts.length) period = { start: starts[0], end: (ends.length ? ends.at(-1) : starts.at(-1)) };

    return {
      sales, orders, pages, payments, accounting, counts, period,
      newRows: sales.length + orders.length + pages.length + payments.length,
      unmatched: [...unmatched.values()],
    };
  }
}

module.exports = { ImportError, Importer, itemKey };
