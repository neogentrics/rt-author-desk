'use strict';
// The Trash. A book, an edition or a listing that's removed isn't gone: a whole copy of it, and of everything that went with it,
// waits here for 30 days, and putting it back is exact (the same records, the same ids, the same dates). After 30 days it is
// removed for good. An edition takes its listings, prices and recordings with it, and the ISBNs it held go back to the register.
const { Catalog, CatalogError } = require('./catalog');

const KEEP_DAYS = 30;
const DAY = 86_400_000;

class TrashError extends CatalogError {
  constructor(message) {
    super(message);
    this.name = 'TrashError';
  }
}

class Trash {
  constructor(library, { now = () => new Date() } = {}) {
    this.library = library;
    this.catalog = new Catalog(library);
    this.now = now;
  }

  // ---- Removing: each of these keeps a copy first, and does the removal in the same step ----

  removeBook(id) {
    const book = this.#need('books', id, "That book isn't in your library.");
    return this.library.db.transaction(() => {
      this.catalog.removeBook(id); // refuses while the book still has editions, as before
      return this.#keep('book', book.title || 'Untitled', { rows: { books: [book] } });
    })();
  }

  removeEdition(id) {
    const edition = this.#need('editions', id, "That edition isn't in your library.");
    const db = this.library.db;
    return db.transaction(() => {
      const listings = this.catalog.listingsOf(id);
      const prices = listings.flatMap((l) => db.prepare('SELECT * FROM prices WHERE listing_id = ?').all(l.id));
      const recordings = this.catalog.recordingsOf(id);
      const credits = this.catalog.creditsOf(id);
      const listingCredits = listings.flatMap((l) => db.prepare('SELECT * FROM listing_credits WHERE listing_id = ?').all(l.id));
      const isbns = this.catalog.isbnsOf(id).map((i) => i.id);
      const label = this.catalog.describeEdition(id);
      const item = this.#keep('edition', label, { rows: { editions: [edition], credits, listings, listing_credits: listingCredits, prices, recordings }, isbns });
      for (const listing of listings) this.catalog.removeListing(listing.id);
      for (const recording of recordings) this.library.remove('recordings', recording.id);
      this.catalog.removeEdition(id);
      return item;
    })();
  }

  removeListing(id) {
    const listing = this.#need('listings', id, "That listing isn't in your library.");
    const prices = this.library.db.prepare('SELECT * FROM prices WHERE listing_id = ?').all(id);
    const listingCredits = this.library.db.prepare('SELECT * FROM listing_credits WHERE listing_id = ?').all(id);
    const store = this.library.get('stores', listing.store_id)?.name ?? 'a store';
    return this.library.db.transaction(() => {
      const item = this.#keep('listing', `${this.catalog.describeEdition(listing.edition_id)} on ${store}`, { rows: { listings: [listing], listing_credits: listingCredits, prices } });
      this.catalog.removeListing(id);
      return item;
    })();
  }

  // ---- What's in it ----

  list() {
    const today = this.now().getTime();
    return this.library.db.prepare('SELECT * FROM trash_items ORDER BY created_at DESC, rowid DESC').all().map((row) => {
      const days = Math.max(0, Math.ceil((new Date(row.created_at).getTime() + KEEP_DAYS * DAY - today) / DAY));
      const block = this.#blocker(row);
      return { id: row.id, kind: row.kind, label: row.label, removedOn: row.created_at.slice(0, 10), daysLeft: days, restorable: !block, why: block };
    });
  }

  // ---- Putting back, and clearing out ----

  restore(id) {
    const item = this.#need('trash_items', id, "That isn't in the Trash any more.");
    const block = this.#blocker(item);
    if (block) throw new TrashError(block);
    const { rows, isbns = [] } = JSON.parse(item.payload);
    const L = this.library;
    L.db.transaction(() => {
      for (const table of ['books', 'editions', 'credits', 'recordings', 'listings', 'listing_credits', 'prices']) {
        for (const row of rows[table] ?? []) {
          const fixed = { ...row };
          // A series or pen name that has gone since leaves the book without one, rather than pointing at nothing.
          if (table === 'books') {
            if (fixed.series_id && !L.get('series', fixed.series_id)) { fixed.series_id = null; fixed.series_number = null; }
            if (fixed.pen_name_id && !L.get('pen_names', fixed.pen_name_id)) fixed.pen_name_id = null;
          }
          if (table === 'editions' && fixed.publisher_name_id && !L.get('publisher_names', fixed.publisher_name_id)) fixed.publisher_name_id = null;
          // A person who has gone since can't be credited, and a store can't show a credit that isn't there.
          if (table === 'credits' && !L.get('people', fixed.person_id)) continue;
          if (table === 'listing_credits' && !L.get('credits', fixed.credit_id)) continue;
          if (table === 'listings') {
            if (fixed.isbn_id && !L.get('isbns', fixed.isbn_id)) fixed.isbn_id = null;
            if (fixed.recording_id && !L.get('recordings', fixed.recording_id)) fixed.recording_id = null;
          }
          L.restoreRow(table, fixed);
        }
      }
      // The numbers the edition held go back on it, unless they have been given to something else meanwhile.
      for (const isbnId of isbns) {
        const isbn = L.get('isbns', isbnId);
        if (isbn && !isbn.edition_id) L.put('isbns', { id: isbnId, edition_id: rows.editions[0].id });
      }
      L.remove('trash_items', id);
    })();
    return { kind: item.kind, label: item.label };
  }

  deleteForever(id) {
    this.#need('trash_items', id, "That isn't in the Trash any more.");
    this.library.remove('trash_items', id);
  }

  empty() {
    const items = this.library.db.prepare('SELECT id FROM trash_items').all();
    this.library.db.transaction(() => { for (const { id } of items) this.library.remove('trash_items', id); })();
    return items.length;
  }

  // Removes for good whatever has waited 30 days.
  purge() {
    const cutoff = new Date(this.now().getTime() - KEEP_DAYS * DAY).toISOString();
    const old = this.library.db.prepare('SELECT id FROM trash_items WHERE created_at < ?').all(cutoff);
    this.library.db.transaction(() => { for (const { id } of old) this.library.remove('trash_items', id); })();
    return old.length;
  }

  // ---- Inside ----

  #need(table, id, message) {
    const row = this.library.get(table, id);
    if (!row) throw new TrashError(message);
    return row;
  }

  #keep(kind, label, payload) {
    return this.library.put('trash_items', { kind, label, payload: JSON.stringify(payload) });
  }

  // Why something can't be put back yet, in words, or null when it can.
  #blocker(item) {
    const { rows } = JSON.parse(item.payload);
    const L = this.library;
    if (item.kind === 'book') {
      return L.get('books', rows.books[0].id) ? 'A book with this record is already back.' : null;
    }
    if (item.kind === 'edition') {
      const edition = rows.editions[0];
      if (L.get('editions', edition.id)) return 'This edition is already back.';
      if (!L.get('books', edition.book_id)) return inTrash(L, 'book', edition.book_id) ? 'Its book is in the Trash too. Bring the book back first.' : 'Its book is gone, so it has nowhere to go.';
      return null;
    }
    const listing = rows.listings[0];
    if (L.get('listings', listing.id)) return 'This listing is already back.';
    if (!L.get('editions', listing.edition_id)) return inTrash(L, 'edition', listing.edition_id) ? 'Its edition is in the Trash too. Bring the edition back first.' : 'Its edition is gone, so it has nowhere to go.';
    const twin = L.db.prepare('SELECT 1 FROM listings WHERE edition_id = ? AND store_id = ? AND route = ?').get(listing.edition_id, listing.store_id, listing.route);
    if (twin) return `This edition has been listed on ${L.get('stores', listing.store_id)?.name ?? 'that store'} again since. Remove the new listing first, or delete this one.`;
    return null;
  }
}

// Is there something in the Trash that is this kind of thing, with this id?
function inTrash(library, kind, id) {
  const table = { book: 'books', edition: 'editions' }[kind];
  return library.db.prepare('SELECT payload FROM trash_items WHERE kind = ?').all(kind).some((row) => JSON.parse(row.payload).rows[table]?.[0]?.id === id);
}

module.exports = { KEEP_DAYS, Trash, TrashError };
