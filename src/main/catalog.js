'use strict';
// The catalog: books, editions and ISBNs, with the checks the database can't make by itself. Everything that reaches the
// library from a screen goes through here, so a mistake is refused in plain words instead of surfacing as a SQL error.
// Rules in this file are the ones in docs/design/data-model.md.
const { isRealDate } = require('../shared/dates');
const { parseIsbn } = require('../shared/isbn');

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

  // ---- internals ------------------------------------------------------------------------------------------------

  #mustExist(table, id, what) {
    if (id == null) return;
    if (!this.library.get(table, id)) throw new CatalogError(`${what} isn't in your library.`);
  }
}

module.exports = { Catalog, CatalogError, FORMATS, ISSUERS };
