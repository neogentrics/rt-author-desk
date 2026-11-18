'use strict';
// The catalog: books, editions and ISBNs, with the checks the database can't make by itself. Everything that reaches the
// library from a screen goes through here, so a mistake is refused in plain words instead of surfacing as a SQL error.
// Rules in this file are the ones in docs/design/data-model.md.
const { isRealDate } = require('../shared/dates');
const { parseIsbn } = require('../shared/isbn');
const { money, parseMoney } = require('../shared/money');

const FORMATS = ['ebook', 'paperback', 'hardcover', 'large print', 'audiobook'];
const ISSUERS = ['bought', 'store', 'given'];

class CatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CatalogError';
  }
}

class Catalog {
  constructor(library) {
    this.library = library;
  }

  // ---- Books ----------------------------------------------------------------------------------------------------

  saveBook(fields) {
    if (fields.id === undefined && !String(fields.title ?? '').trim()) throw new CatalogError('A book needs a title.');
    if ('title' in fields && !String(fields.title).trim()) throw new CatalogError('A book needs a title.');
    this.#mustExist('series', fields.series_id, 'That series');
    this.#mustExist('pen_names', fields.pen_name_id, 'That pen name');
    return this.library.put('books', fields);
  }

  // A book that still has editions can't be removed, because that would quietly drop its prices, listings and sales.
  removeBook(id) {
    const editions = this.editionsOf(id);
    if (editions.length) {
      throw new CatalogError(`This book still has ${editions.length} edition${editions.length === 1 ? '' : 's'}. Remove ${editions.length === 1 ? 'it' : 'them'} first.`);
    }
    this.library.remove('books', id);
  }

  // ---- Editions -------------------------------------------------------------------------------------------------

  saveEdition(fields) {
    const existing = fields.id === undefined ? null : this.library.get('editions', fields.id);
    if (!existing) {
      if (!fields.book_id) throw new CatalogError('An edition belongs to a book.');
      if (!fields.format) throw new CatalogError('Choose a format: ebook, paperback, hardcover, large print or audiobook.');
    }
    if ('book_id' in fields) this.#mustExist('books', fields.book_id, 'That book');
    if ('format' in fields && !FORMATS.includes(fields.format)) {
      throw new CatalogError(`"${fields.format}" is not a format. Use ${FORMATS.join(', ')}.`);
    }
    if (fields.release_date != null && !isRealDate(fields.release_date)) {
      throw new CatalogError(`"${fields.release_date}" is not a real date. Write it as year-month-day, such as 2027-03-14.`);
    }
    this.#mustExist('publisher_names', fields.publisher_name_id, 'That publisher name');
    for (const key of ['page_count', 'length_minutes']) {
      if (fields[key] != null && !(Number.isInteger(fields[key]) && fields[key] > 0)) {
        throw new CatalogError(`${key === 'page_count' ? 'Page count' : 'Length'} must be a whole number above zero.`);
      }
    }
    if ('format' in fields || 'page_count' in fields || 'length_minutes' in fields) {
      const format = fields.format ?? existing?.format;
      const pages = 'page_count' in fields ? fields.page_count : existing?.page_count;
      const minutes = 'length_minutes' in fields ? fields.length_minutes : existing?.length_minutes;
      if (format === 'audiobook' && pages != null) throw new CatalogError('An audiobook has a length, not a page count.');
      if (format && format !== 'audiobook' && minutes != null) throw new CatalogError('Only an audiobook has a length in minutes.');
    }
    return this.library.put('editions', fields);
  }

  editionsOf(bookId) {
    return this.library.db.prepare(
      `SELECT * FROM editions WHERE book_id = ?
       ORDER BY CASE format WHEN 'ebook' THEN 1 WHEN 'paperback' THEN 2 WHEN 'hardcover' THEN 3 WHEN 'large print' THEN 4 ELSE 5 END,
                created_at, id`,
    ).all(bookId);
  }

  // The ISBNs stay in your register when an edition goes: they're numbers you own, and a store may still have one.
  removeEdition(id) {
    this.library.db.transaction(() => {
      for (const isbn of this.isbnsOf(id)) this.library.put('isbns', { id: isbn.id, edition_id: null });
      this.library.remove('editions', id);
    })();
  }

  // "Book title: paperback", for messages and lists.
  describeEdition(id) {
    const edition = this.library.get('editions', id);
    if (!edition) return 'an edition that is no longer there';
    const book = this.library.get('books', edition.book_id);
    return `${book?.title || 'Untitled'}: ${edition.label ? `${edition.format}, ${edition.label}` : edition.format}`;
  }

  // ---- ISBNs ----------------------------------------------------------------------------------------------------

  // `number` may be written any way people write it. A good ISBN-10 is stored as its ISBN-13. A number that fails its
  // check digit is refused, unless `allowInvalid` is set (the move from Notion keeps what it finds, and clash checks flag it).
  addIsbn({ number, issuer = 'bought', storeId = null, editionId = null, notes = '', allowInvalid = false }) {
    if (!ISSUERS.includes(issuer)) throw new CatalogError(`Who issued it? Use ${ISSUERS.join(', ')}.`);
    const parsed = parseIsbn(number);
    let stored;
    if (parsed.ok) stored = parsed.isbn13;
    else if (allowInvalid && String(number ?? '').trim()) stored = String(number).replace(/[\s-]/g, '').toUpperCase();
    else throw new CatalogError(`${String(number ?? '').trim() || 'That'} isn't a good ISBN. ${parsed.reason}`);

    if (issuer === 'store' && !storeId) throw new CatalogError("A store's free ISBN has to say which store gave it.");
    this.#mustExist('stores', storeId, 'That store');
    this.#mustExist('editions', editionId, 'That edition');

    const taken = this.library.db.prepare('SELECT * FROM isbns WHERE isbn = ?').get(stored);
    if (taken) {
      throw new CatalogError(taken.edition_id
        ? `${stored} is already in your register, on ${this.describeEdition(taken.edition_id)}.`
        : `${stored} is already in your register, not yet on an edition.`);
    }
    return this.library.put('isbns', { isbn: stored, issuer, store_id: storeId, edition_id: editionId, notes });
  }

  // Puts a number you already hold on an edition, or takes it off (editionId null).
  assignIsbn(isbnId, editionId) {
    if (!this.library.get('isbns', isbnId)) throw new CatalogError('That ISBN is not in your register.');
    this.#mustExist('editions', editionId, 'That edition');
    return this.library.put('isbns', { id: isbnId, edition_id: editionId });
  }

  isbnsOf(editionId) {
    return this.library.db.prepare('SELECT * FROM isbns WHERE edition_id = ? ORDER BY created_at, id').all(editionId);
  }

  // Numbers you own that no edition uses yet.
  spareIsbns() {
    return this.library.db.prepare('SELECT * FROM isbns WHERE edition_id IS NULL ORDER BY created_at, id').all();
  }

  // ---- Recordings -----------------------------------------------------------------------------------------------

  // One audio version of an audiobook. A synthesized or cloned voice is stored as it is: the clash checks, not this
  // form, say when a cloned voice has no permission on record, so a note from Notion can be kept as found.
  saveRecording(fields) {
    const existing = fields.id === undefined ? null : this.library.get('recordings', fields.id);
    if (!existing && !fields.edition_id) throw new CatalogError('A recording belongs to an audiobook edition.');
    const editionId = fields.edition_id ?? existing.edition_id;
    const edition = this.library.get('editions', editionId);
    if (!edition) throw new CatalogError("That edition isn't in your library.");
    if (edition.format !== 'audiobook') throw new CatalogError('Only an audiobook edition has recordings.');
    const merged = { ...existing, ...fields };
    if (merged.exclusive && !merged.exclusive_store_id) {
      throw new CatalogError('An exclusive deal has to say which store the recording is tied to.');
    }
    this.#mustExist('stores', fields.exclusive_store_id, 'That store');
    for (const key of ['exclusive_until', 'replaced_on', 'finished_on']) this.#mustBeDate(fields[key], key.replace(/_/g, ' '));
    if (fields.replaced_by_id != null) {
      const other = this.library.get('recordings', fields.replaced_by_id);
      if (!other) throw new CatalogError("The recording that replaces this one isn't in your library.");
      if (other.edition_id !== editionId) throw new CatalogError('A replacement has to be a recording of the same edition.');
      if (fields.replaced_by_id === fields.id) throw new CatalogError("A recording can't replace itself.");
    }
    if (fields.length_minutes != null && !(Number.isInteger(fields.length_minutes) && fields.length_minutes > 0)) {
      throw new CatalogError('Length must be a whole number of minutes above zero.');
    }
    return this.library.put('recordings', fields);
  }

  recordingsOf(editionId) {
    return this.library.db.prepare('SELECT * FROM recordings WHERE edition_id = ? ORDER BY created_at, id').all(editionId);
  }

  // ---- Listings -------------------------------------------------------------------------------------------------

  // One edition on one store. The route says whether it's yours directly or reaches the store through a distributor,
  // and the same edition can be at one store both ways.
  saveListing(fields) {
    const existing = fields.id === undefined ? null : this.library.get('listings', fields.id);
    if (!existing && (!fields.edition_id || !fields.store_id)) throw new CatalogError('A listing is an edition on a store.');
    const merged = { ...existing, ...fields };
    const edition = this.library.get('editions', merged.edition_id);
    if (!edition) throw new CatalogError("That edition isn't in your library.");
    this.#mustExist('stores', merged.store_id, 'That store');
    this.#mustExist('stores', fields.via_store_id, 'The distributor');

    const route = merged.route ?? 'direct';
    if (route === 'distributor') {
      if (!merged.via_store_id) throw new CatalogError('A listing that goes through a distributor has to say which one.');
      if (merged.via_store_id === merged.store_id) throw new CatalogError("A store can't be its own distributor.");
    } else if (merged.via_store_id) {
      throw new CatalogError('A listing you hold directly has no distributor. Change the route, or clear the distributor.');
    }
    if (merged.url && !/^https:\/\/\S+$/.test(merged.url)) throw new CatalogError('A link has to start with https://.');
    for (const key of ['program_from', 'program_until', 'release_date']) this.#mustBeDate(fields[key], key.replace(/_/g, ' '));
    if (merged.program_from && merged.program_until && merged.program_until < merged.program_from) {
      throw new CatalogError('The program ends before it starts.');
    }
    if (fields.isbn_id != null) {
      const isbn = this.library.get('isbns', fields.isbn_id);
      if (!isbn) throw new CatalogError("That ISBN isn't in your register.");
      if (isbn.edition_id !== merged.edition_id) {
        throw new CatalogError(`${isbn.isbn} is ${isbn.edition_id ? `on ${this.describeEdition(isbn.edition_id)}` : 'not on any edition'}, not on this one.`);
      }
    }
    if (fields.recording_id != null) {
      const recording = this.library.get('recordings', fields.recording_id);
      if (!recording) throw new CatalogError("That recording isn't in your library.");
      if (recording.edition_id !== merged.edition_id) throw new CatalogError('That recording belongs to a different edition.');
    }
    const twin = this.library.db.prepare(
      'SELECT id FROM listings WHERE edition_id = ? AND store_id = ? AND route = ? AND id IS NOT ?',
    ).get(merged.edition_id, merged.store_id, route, existing?.id ?? null);
    if (twin) {
      throw new CatalogError(`${this.describeEdition(merged.edition_id)} is already listed on ${this.library.get('stores', merged.store_id).name}${route === 'distributor' ? ' through a distributor' : ''}.`);
    }
    return this.library.put('listings', fields);
  }

  listingsOf(editionId) {
    return this.library.db.prepare('SELECT * FROM listings WHERE edition_id = ? ORDER BY created_at, id').all(editionId);
  }

  // A listing's prices go with it, because a price means nothing without the listing it belongs to.
  removeListing(id) {
    this.library.db.transaction(() => {
      for (const price of this.library.db.prepare('SELECT id FROM prices WHERE listing_id = ?').all(id)) this.library.remove('prices', price.id);
      this.library.remove('listings', id);
    })();
  }

  // ---- Prices ---------------------------------------------------------------------------------------------------

  // A price in one marketplace from a date. `amount` is written as people write it ("12.99"), and kept as whole units
  // of the currency's smallest coin. Setting a price again for the same day corrects that day's entry; a new day adds
  // to the history, so a sale can be compared with the price at the time.
  setPrice({ listingId, marketplace, currency, amount, fromDate, notes = '' }) {
    if (!this.library.get('listings', listingId)) throw new CatalogError("That listing isn't in your library.");
    const place = String(marketplace ?? '').trim();
    if (!place) throw new CatalogError('Which marketplace is this price for?');
    this.#mustBeDate(fromDate, 'price date');
    if (!fromDate) throw new CatalogError('A price needs the date it starts.');
    let price;
    try {
      price = parseMoney(amount, currency);
    } catch (error) {
      throw new CatalogError(`${String(amount)} ${currency ?? ''} isn't a price. ${error.message}`.trim());
    }
    if (price.minor < 0n) throw new CatalogError("A price can't be below zero. Use 0 for free.");
    const same = this.library.db.prepare('SELECT id FROM prices WHERE listing_id = ? AND marketplace = ? AND from_date = ?').get(listingId, place, fromDate);
    return this.library.put('prices', {
      id: same?.id, listing_id: listingId, marketplace: place, currency, amount: price.minor.toString(), from_date: fromDate, notes,
    });
  }

  // What the price was on a day, per marketplace: the latest one that had started by then.
  pricesOn(listingId, date) {
    const rows = this.library.db.prepare(
      `SELECT * FROM prices WHERE listing_id = ? AND from_date <= ? ORDER BY marketplace, from_date DESC, id`,
    ).all(listingId, date);
    const seen = new Set();
    const current = [];
    for (const row of rows) {
      if (seen.has(row.marketplace)) continue;
      seen.add(row.marketplace);
      current.push({ ...row, money: money(BigInt(row.amount), row.currency) });
    }
    return current;
  }

  priceHistory(listingId, marketplace) {
    return this.library.db.prepare('SELECT * FROM prices WHERE listing_id = ? AND marketplace = ? ORDER BY from_date, id')
      .all(listingId, marketplace).map((row) => ({ ...row, money: money(BigInt(row.amount), row.currency) }));
  }

  // ---- internals ------------------------------------------------------------------------------------------------

  #mustBeDate(value, what) {
    if (value != null && !isRealDate(value)) {
      throw new CatalogError(`"${value}" is not a real date for the ${what}. Write it as year-month-day, such as 2027-03-14.`);
    }
  }

  #mustExist(table, id, what) {
    if (id == null) return;
    if (!this.library.get(table, id)) throw new CatalogError(`${what} isn't in your library.`);
  }
}

module.exports = { Catalog, CatalogError, FORMATS, ISSUERS };
