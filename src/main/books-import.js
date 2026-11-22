'use strict';
// Bringing books in from a spreadsheet saved as CSV, such as a Notion export. The person shows the app which column is which
// (it guesses first), the app says exactly what it would make, and nothing changes until they accept. Every row ends up as one
// thing: a new book, a book already in the library, a repeat inside the file, or a row that can't be used, with the reason.
// An import is one step in the library, and can be undone as a whole.
const crypto = require('node:crypto');
const { Catalog, CatalogError } = require('./catalog');
const { CsvError, decodeText, parseCsv } = require('../shared/csv');
const { isRealDate } = require('../shared/dates');

class BookImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BookImportError';
  }
}

const MAX_FILE = 20 * 1024 * 1024;
const MAX_WAITING = 4;
const SAMPLE_ROWS = 5;
const PREVIEW_ROWS = 40;
const STATUSES = ['planned', 'in progress', 'live', 'pulled', 'being reworked'];

// What each column of the spreadsheet can be. `names` are headings people really use, written plainly.
const FIELDS = [
  { key: 'title', label: 'Title', required: true, names: ['title', 'book title', 'name', 'book name', 'book'] },
  { key: 'subtitle', label: 'Subtitle', names: ['subtitle', 'sub title', 'tagline'] },
  { key: 'series', label: 'Series', names: ['series', 'series name', 'saga', 'universe'] },
  { key: 'seriesNumber', label: 'Number in the series', names: ['series number', 'book number', 'number', 'book in series', 'series order', 'order', 'volume', 'vol', 'series index'] },
  { key: 'penName', label: 'Pen name', names: ['pen name', 'pseudonym', 'written as', 'author', 'author name', 'writer'] },
  { key: 'status', label: 'Where it is (status)', names: ['status', 'stage', 'state', 'progress', 'publication status'] },
  { key: 'formats', label: 'Formats', names: ['formats', 'format', 'editions', 'edition', 'type', 'versions'] },
  { key: 'releaseDate', label: 'Release date', names: ['publish date', 'publication date', 'release date', 'published', 'pub date', 'date', 'launch date', 'published on'] },
  { key: 'link', label: 'Amazon or store link', names: ['amazon link', 'amazon', 'amazon url', 'link', 'url', 'store link', 'buy link', 'kindle link'] },
  { key: 'notes', label: 'Notes', names: ['notes', 'note', 'description', 'comments', 'summary', 'blurb'] },
];

const normalize = (text) => String(text ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// ---- What the values mean ---------------------------------------------------------------------------------------------

const STATUS_WORDS = {
  planned: ['idea', 'planned', 'planning', 'not started', 'backlog', 'to do', 'todo', 'upcoming', 'queued', 'outlined', 'concept', 'coming soon', 'future'],
  'in progress': ['in progress', 'writing', 'drafting', 'draft', 'first draft', 'editing', 'revising', 'wip', 'working', 'in production', 'proofing', 'formatting', 'pre order', 'preorder', 'in development'],
  live: ['live', 'published', 'released', 'done', 'complete', 'completed', 'available', 'on sale', 'out now', 'finished', 'active', 'for sale'],
  pulled: ['pulled', 'unpublished', 'withdrawn', 'retired', 'discontinued', 'out of print', 'taken down', 'removed'],
  'being reworked': ['being reworked', 'reworking', 'rework', 'rewrite', 'rewriting', 'second edition', 'revision', 'relaunch', 're edit', 'redo', 'republishing'],
};
const STATUS_LOOKUP = new Map(Object.entries(STATUS_WORDS).flatMap(([status, words]) => words.map((w) => [normalize(w), status])));

const FORMAT_WORDS = {
  ebook: ['ebook', 'e book', 'kindle', 'epub', 'digital', 'kindle edition', 'ebook kindle', 'electronic'],
  paperback: ['paperback', 'print', 'pb', 'softcover', 'trade paperback', 'tpb', 'paper', 'soft cover', 'trade paper'],
  hardcover: ['hardcover', 'hardback', 'hb', 'casebound', 'hard cover', 'cloth'],
  'large print': ['large print', 'lp', 'large type'],
  audiobook: ['audiobook', 'audio', 'audible', 'audio book', 'acx', 'narrated'],
};
const FORMAT_LOOKUP = new Map(Object.entries(FORMAT_WORDS).flatMap(([format, words]) => words.map((w) => [normalize(w), format])));
const FORMAT_PHRASES = [...FORMAT_LOOKUP.keys()].sort((a, b) => b.length - a.length);

// A value from a Notion relation looks like "The Tidewater Books (https://www.notion.so/The-Tidewater-Books-ab12...)". The page
// address is dropped. Two related pages in one cell leave only the first, and the row says so.
// A name, a series or a date is short, and a spreadsheet cell can hold 32,767 characters at most, so what is matched is cut to a few thousand:
// a hostile file with a cell of tens of thousands of spaces or brackets cannot make the matching crawl.
const MATCHED = 4000;
function cleanRelation(text) {
  const raw = String(text ?? '').slice(0, MATCHED);
  const links = raw.match(/\(https?:\/\/[^)]*\)/g) ?? [];
  const name = raw.replace(/\(https?:\/\/[^)]*\)/g, '|').split('|')[0].trim().replace(/\s+/g, ' ');
  return { name, several: links.length > 1 };
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthOf = (word) => {
  const w = word.toLowerCase().replace(/\.$/, '');
  const at = MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w)));
  return at < 0 ? null : at + 1;
};
const pad = (n) => String(n).padStart(2, '0');

// A date as people write it. A range such as "November 18, 2026 → November 25, 2026" is its first day. Slashes are the one
// thing that can't be told by looking, so the person says which comes first, and the preview shows what was understood.
function parseDateText(text, order = 'month-first') {
  const first = String(text ?? '').slice(0, 200).split(/(?:→|->|–|—| to )/)[0].trim();
  if (!first) return { iso: null, empty: true };
  let year; let month; let day;
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(first))) [year, month, day] = [m[1], m[2], m[3]];
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(first))) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const dayFirst = order === 'day-first' || (a > 12 && b <= 12);
    [day, month] = dayFirst ? [a, b] : [b, a];
    year = m[3];
  } else if ((m = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(first)) && monthOf(m[1])) [year, month, day] = [m[3], monthOf(m[1]), m[2]];
  else if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s+(\d{4})$/.exec(first)) && monthOf(m[2])) [year, month, day] = [m[3], monthOf(m[2]), m[1]];
  else if (/^([A-Za-z]+)\.?\s+(\d{4})$/.test(first) || /^\d{4}$/.test(first)) return { iso: null, reason: `"${first}" has no day in it, so no release date was set` };
  else return { iso: null, reason: `"${first}" isn't a date the app can read` };
  const iso = `${String(year).padStart(4, '0')}-${pad(Number(month))}-${pad(Number(day))}`;
  return isRealDate(iso) ? { iso } : { iso: null, reason: `"${first}" isn't a real day` };
}

// The ten-character code in an Amazon address, from /dp/B0..., /gp/product/B0... and the like.
function amazonAsin(url) {
  return /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN|product)\/([A-Z0-9]{10})(?:[/?#]|$)/i.exec(String(url ?? ''))?.[1].toUpperCase() ?? null;
}

function formatsOf(text, overrides = {}) {
  const found = [];
  const unknown = [];
  const tokens = String(text ?? '').split(/[,;\n/|+&]|\band\b/i).map((t) => normalize(t)).filter(Boolean);
  for (const token of tokens) {
    if (Object.hasOwn(overrides, token)) {
      if (overrides[token]) found.push(overrides[token]);
      continue;
    }
    if (FORMAT_LOOKUP.has(token)) { found.push(FORMAT_LOOKUP.get(token)); continue; }
    // "Ebook (Kindle)" or "Paperback ebook": find the known words inside it, longest first, each only once.
    let rest = ` ${token} `;
    const inside = [];
    for (const phrase of FORMAT_PHRASES) {
      if (rest.includes(` ${phrase} `)) { inside.push(FORMAT_LOOKUP.get(phrase)); rest = rest.replace(` ${phrase} `, '  '); }
    }
    if (inside.length) found.push(...inside);
    else unknown.push(token);
  }
  return { formats: [...new Set(found)], unknown };
}

const statusOf = (text, overrides = {}) => {
  const token = normalize(text);
  if (!token) return { status: null };
  if (Object.hasOwn(overrides, token) && STATUSES.includes(overrides[token])) return { status: overrides[token], token };
  return STATUS_LOOKUP.has(token) ? { status: STATUS_LOOKUP.get(token), token } : { status: null, unknown: token };
};

// ---- Guessing the columns ---------------------------------------------------------------------------------------------

function guessMapping(headers) {
  const norm = headers.map(normalize);
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

// ---- The importer -----------------------------------------------------------------------------------------------------

class BookImporter {
  constructor(library) {
    this.library = library;
    this.waiting = new Map();
  }

  // Reads the file and says what's in it, with a guess at the columns. Nothing is saved.
  open(buffer, fileName = '') {
    if (!Buffer.isBuffer(buffer)) throw new BookImportError("That isn't a file the app can read.");
    if (buffer.length > MAX_FILE) throw new BookImportError('That file is too big to be a list of books.');
    let table;
    let info;
    try {
      info = decodeText(buffer);
      table = parseCsv(info.text);
    } catch (error) {
      if (error instanceof CsvError) throw new BookImportError(error.message);
      throw error;
    }
    if (table.length < 2) throw new BookImportError('That file has no rows of books in it. The first row should be the column headings, with a book on each row after it.');
    const seen = new Map();
    const headers = table[0].map((h, i) => {
      const name = h.trim() || `Column ${i + 1}`;
      const count = seen.get(name) ?? 0;
      seen.set(name, count + 1);
      return count ? `${name} (${count + 1})` : name;
    });
    const id = crypto.randomUUID();
    const rows = table.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? '').trim()));
    this.waiting.set(id, { fileName: String(fileName).slice(0, 200), headers, rows });
    while (this.waiting.size > MAX_WAITING) this.waiting.delete(this.waiting.keys().next().value);
    return {
      id, fileName: String(fileName).slice(0, 200), encoding: info.encoding, headers, rowCount: rows.length,
      sample: rows.slice(0, SAMPLE_ROWS).map((r) => r.map((c) => c.slice(0, 120))),
      guess: guessMapping(headers),
      fields: FIELDS.map(({ key, label, required }) => ({ key, label, required: Boolean(required) })),
    };
  }

  // What accepting would do, row by row, with the columns and the value choices the person has made so far.
  plan(args) {
    const { _rows, ...shown } = this.#compute(args);
    return shown;
  }

  #compute({ id, mapping, options = {}, maps = {} } = {}) {
    const file = this.#file(id);
    const columns = this.#columns(file, mapping);
    const order = options.dateOrder === 'day-first' ? 'day-first' : 'month-first';
    const linkAs = options.link === 'notes' ? 'notes' : 'listing';
    const statusMap = maps.status ?? {};
    const formatMap = maps.formats ?? {};
    const books = new Set(this.library.list('books').map((b) => normalize(b.title)));
    const titles = new Set();
    const cell = (row, key) => (columns[key] == null ? '' : row[columns[key]] ?? '');

    const rows = [];
    const unknown = { statuses: new Map(), formats: new Map() };
    const seenStatuses = new Map();
    const seenFormats = new Map();
    const counts = { new: 0, exists: 0, repeat: 0, problem: 0 };
    file.rows.forEach((row, at) => {
      const out = { row: at + 2, title: cell(row, 'title'), warnings: [] };
      const title = out.title.replace(/\s+/g, ' ').trim();
      if (!title) { rows.push({ ...out, outcome: 'problem', reason: 'No title in this row' }); counts.problem += 1; return; }
      const key = normalize(title);
      if (books.has(key)) { rows.push({ ...out, title, outcome: 'exists', reason: 'Already in your library' }); counts.exists += 1; return; }
      if (titles.has(key)) { rows.push({ ...out, title, outcome: 'repeat', reason: 'The same title is higher up in this file' }); counts.repeat += 1; return; }
      titles.add(key);

      const series = cleanRelation(cell(row, 'series'));
      if (series.several) out.warnings.push('Several series were listed, so only the first was kept');
      const pen = cleanRelation(cell(row, 'penName'));
      const statusText = cell(row, 'status');
      const { status, unknown: unknownStatus } = statusOf(statusText, statusMap);
      const heard = normalize(statusText);
      if (heard) seenStatuses.set(heard, (seenStatuses.get(heard) ?? 0) + 1);
      if (unknownStatus) {
        unknown.statuses.set(unknownStatus, (unknown.statuses.get(unknownStatus) ?? 0) + 1);
        out.warnings.push(`"${statusText}" isn't a status the app knows, so this is Planned until you say`);
      }
      const { formats, unknown: unknownFormats } = formatsOf(cell(row, 'formats'), formatMap);
      for (const f of String(cell(row, 'formats')).split(/[,;\n/|+&]|\band\b/i).map(normalize).filter(Boolean)) seenFormats.set(f, (seenFormats.get(f) ?? 0) + 1);
      for (const f of unknownFormats) {
        unknown.formats.set(f, (unknown.formats.get(f) ?? 0) + 1);
        out.warnings.push(`"${f}" isn't a format the app knows, so it was left out`);
      }
      let date = { iso: null };
      if (columns.releaseDate != null) {
        date = parseDateText(cell(row, 'releaseDate'), order);
        if (date.reason) out.warnings.push(date.reason);
      }
      const linkText = cell(row, 'link');
      const asin = amazonAsin(linkText);
      let link = null;
      if (linkText) {
        if (asin && linkAs === 'listing' && formats.includes('ebook') && /^https:\/\//i.test(linkText)) link = { url: linkText, asin };
        else out.warnings.push(linkAs === 'listing' && !formats.includes('ebook') ? 'The link is kept in the notes, because there is no ebook for it to belong to' : 'The link is kept in the notes');
      }
      const number = cell(row, 'seriesNumber').trim();
      rows.push({
        ...out, title, outcome: 'new', reason: '',
        subtitle: cell(row, 'subtitle').trim(), series: series.name, seriesNumber: number, penName: pen.name,
        status: status ?? 'planned', formats, releaseDate: date.iso, link, notes: cell(row, 'notes').trim(),
        linkInNotes: linkText && !link ? linkText : '',
      });
      counts.new += 1;
    });

    const label = (list, lookup) => [...list.entries()].map(([value, count]) => ({ value, rows: count, mapped: lookup(value) }))
      .sort((a, b) => b.rows - a.rows || a.value.localeCompare(b.value));
    return {
      id, fileName: file.fileName, counts, rowCount: file.rows.length,
      rows: rows.slice(0, PREVIEW_ROWS).map(({ row, title, outcome, reason, series, status, formats, releaseDate, warnings }) => ({ row, title, outcome, reason, series: series ?? '', status: status ?? null, formats: formats ?? [], releaseDate: releaseDate ?? null, warnings })),
      more: Math.max(0, rows.length - PREVIEW_ROWS),
      problems: rows.filter((r) => r.outcome === 'problem').slice(0, 20).map(({ row, reason }) => ({ row, reason })),
      statuses: label(seenStatuses, (v) => statusOf(v, statusMap).status),
      formats: label(seenFormats, (v) => formatsOf(v, formatMap).formats[0] ?? null),
      unknown: { statuses: [...unknown.statuses.keys()], formats: [...unknown.formats.keys()] },
      _rows: rows,
    };
  }

  // Makes it all, in one step. Anything that goes wrong leaves the library as it was.
  accept(args) {
    const planned = this.#compute(args);
    const fresh = planned._rows.filter((r) => r.outcome === 'new');
    if (!fresh.length) {
      throw new BookImportError(planned.counts.exists ? 'Every book in this file is already in your library, so there is nothing to bring in.' : 'There are no books in this file that can be brought in.');
    }
    const catalog = new Catalog(this.library);
    const created = { pen_names: [], series: [], books: [], editions: [], listings: [] };
    const penByName = new Map(this.library.list('pen_names').map((p) => [normalize(p.name), p.id]));
    const seriesByName = new Map(this.library.list('series').map((s) => [normalize(s.name), s.id]));
    const file = this.#file(args.id);

    // One row of the file becomes a book, its editions, and a listing when there is a link for one.
    const makeBook = (row) => {
      let penId = null;
      if (row.penName) {
        penId = penByName.get(normalize(row.penName)) ?? null;
        if (!penId) {
          penId = catalog.savePenName({ name: row.penName }).id;
          penByName.set(normalize(row.penName), penId);
          created.pen_names.push(penId);
        }
      }
      let seriesId = null;
      if (row.series) {
        seriesId = seriesByName.get(normalize(row.series)) ?? null;
        if (!seriesId) {
          seriesId = catalog.saveSeries({ name: row.series, ...(penId ? { pen_name_id: penId } : {}) }).id;
          seriesByName.set(normalize(row.series), seriesId);
          created.series.push(seriesId);
        }
      }
      const notes = [row.notes, row.linkInNotes ? `Link: ${row.linkInNotes}` : ''].filter(Boolean).join('\n\n');
      const book = catalog.saveBook({
        title: row.title, business_status: row.status,
        ...(row.subtitle ? { subtitle: row.subtitle } : {}), ...(seriesId ? { series_id: seriesId } : {}),
        ...(row.seriesNumber ? { series_number: row.seriesNumber } : {}), ...(penId ? { pen_name_id: penId } : {}), ...(notes ? { notes } : {}),
      });
      created.books.push(book.id);
      const made = {};
      for (const format of row.formats) {
        const edition = catalog.saveEdition({ book_id: book.id, format, ...(row.releaseDate ? { release_date: row.releaseDate } : {}) });
        created.editions.push(edition.id);
        made[format] = edition.id;
      }
      if (row.link) {
        const listing = catalog.saveListing({
          edition_id: made.ebook, store_id: 'store-kdp', store_item_id: row.link.asin, url: row.link.url,
          status: row.status === 'live' ? 'live' : 'planned',
        });
        created.listings.push(listing.id);
      }
    };

    const result = this.library.db.transaction(() => {
      for (const row of fresh) {
        try {
          makeBook(row);
        } catch (error) {
          if (error instanceof CatalogError) throw new BookImportError(`Row ${row.row}, "${row.title}": ${error.message} Nothing was brought in.`);
          throw error;
        }
      }
      const counts = { ...planned.counts, books: created.books.length, editions: created.editions.length, listings: created.listings.length, series: created.series.length, penNames: created.pen_names.length };
      const log = this.library.put('catalog_imports', { kind: 'books-csv', file_name: file.fileName, counts: JSON.stringify(counts), created: JSON.stringify(created) });
      return { importId: log.id, counts };
    })();
    this.waiting.delete(args.id);
    return result;
  }

  // Takes the whole import back: what it made goes. A book you've added editions or listings to since is left alone, and said so.
  undo({ id } = {}) {
    const log = this.library.get('catalog_imports', id);
    if (!log) throw new BookImportError("That import isn't in your library.");
    if (log.status === 'undone') throw new BookImportError('That import was already undone.');
    const created = JSON.parse(log.created);
    const catalog = new Catalog(this.library);
    const db = this.library.db;
    return db.transaction(() => {
      const madeEditions = new Set(created.editions);
      const madeListings = new Set(created.listings);
      let removed = 0;
      const kept = [];
      for (const bookId of created.books) {
        const book = this.library.get('books', bookId);
        if (!book) continue;
        const editions = catalog.editionsOf(bookId);
        const untouched = editions.every((e) => madeEditions.has(e.id)
          && catalog.listingsOf(e.id).every((l) => madeListings.has(l.id))
          && catalog.recordingsOf(e.id).length === 0 && catalog.isbnsOf(e.id).length === 0);
        if (!untouched) { kept.push(book.title); continue; }
        for (const e of editions) {
          for (const l of catalog.listingsOf(e.id)) catalog.removeListing(l.id);
          catalog.removeEdition(e.id);
        }
        this.library.remove('books', bookId);
        removed += 1;
      }
      // A series or pen name the import made goes only if nothing now uses it.
      const used = (table, column, value) => db.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ?`).get(value);
      for (const seriesId of created.series) if (this.library.get('series', seriesId) && !used('books', 'series_id', seriesId)) this.library.remove('series', seriesId);
      for (const penId of created.pen_names) {
        if (this.library.get('pen_names', penId) && !used('books', 'pen_name_id', penId) && !used('series', 'pen_name_id', penId)) this.library.remove('pen_names', penId);
      }
      this.library.put('catalog_imports', { id, status: 'undone' });
      return { removed, kept };
    })();
  }

  history() {
    return this.library.list('catalog_imports').reverse().map((row) => ({
      id: row.id, fileName: row.file_name, status: row.status, counts: JSON.parse(row.counts), on: row.created_at.slice(0, 10),
    }));
  }

  #file(id) {
    const file = this.waiting.get(id);
    if (!file) throw new BookImportError('That file is no longer open here. Choose it again.');
    return file;
  }

  #columns(file, mapping) {
    const columns = {};
    const taken = new Set();
    for (const { key, label } of FIELDS) {
      const at = mapping?.[key];
      if (at == null || at === '') { columns[key] = null; continue; }
      if (!Number.isInteger(at) || at < 0 || at >= file.headers.length) throw new BookImportError(`${label} is set to a column that isn't in the file.`);
      if (taken.has(at)) throw new BookImportError(`Two things are set to the column "${file.headers[at]}". Each column can be used once.`);
      taken.add(at);
      columns[key] = at;
    }
    if (columns.title == null) throw new BookImportError('Choose which column holds the title.');
    return columns;
  }
}

module.exports = { BookImportError, BookImporter, FIELDS, amazonAsin, cleanRelation, formatsOf, guessMapping, parseDateText, statusOf };
