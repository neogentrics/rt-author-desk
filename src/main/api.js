'use strict';
// Everything the window may ask the app to do. The window never sees the database: it names one of these calls, and gets
// back plain data or a plain-words problem. Kept apart from Electron so it's tested like any other module.
const { Catalog, CatalogError } = require('./catalog');
const { ROLES, roleLabel } = require('../shared/credits');
const { ClashError, dismissClash, findClashes, restoreClash } = require('./clashes');
const { BookImportError, BookImporter } = require('./books-import');
const { Calculator, CalculatorError } = require('./calculator');
const { ImportError, Importer } = require('./importer');
const { RoyaltyError, royalties } = require('./royalties');
const { Trash } = require('./trash');
const { BUILT_IN_STORES } = require('./storage/schema');
const { audiobookTracker, desk, releaseCalendar, storeGrid } = require('./views');
const { today: todayOf } = require('../shared/dates');
const { displayIsbn } = require('../shared/isbn');
const { MoneyError, format, toDecimalString } = require('../shared/money');

const FRIENDLY = [BookImportError, CalculatorError, CatalogError, ClashError, ImportError, MoneyError, RoyaltyError];

function createApi(library, { now = () => new Date(), locale } = {}) {
  const catalog = new Catalog(library);
  const importer = new Importer(library, { locale, now });
  const booksImporter = new BookImporter(library);
  const calculator = new Calculator(library, { locale, now });
  const trash = new Trash(library, { now });
  const today = () => todayOf(now());
  const options = () => ({ today: today(), locale });
  const named = (table) => (id) => (id ? library.get(table, id)?.name ?? null : null);
  const storeName = named('stores');

  const priceRows = (listingId) => catalog.pricesOn(listingId, today()).map((price) => ({
    id: price.id,
    marketplace: price.marketplace,
    currency: price.currency,
    amount: toDecimalString(price.money),
    shown: format(price.money, locale),
    from_date: price.from_date,
  }));

  const calls = {
    // ---- The Desk and the lists around it ----
    desk: () => desk(library, options()),
    calendar: ({ includePast = false } = {}) => releaseCalendar(library, { today: today(), includePast }),
    audiobooks: () => audiobookTracker(library, { today: today() }),
    clashes: ({ includeDismissed = false } = {}) => findClashes(library, { today: today(), includeDismissed, locale }),
    dismissClash: ({ key, reason }) => (dismissClash(library, key, reason), true),
    restoreClash: ({ key }) => restoreClash(library, key),

    // ---- Books ----
    books: () => {
      const series = new Map(library.list('series').map((s) => [s.id, s]));
      const pens = new Map(library.list('pen_names').map((p) => [p.id, p]));
      const clashes = findClashes(library, { today: today() });
      return library.list('books').map((book) => {
        const editions = catalog.editionsOf(book.id);
        return {
          ...book,
          series_name: series.get(book.series_id)?.name ?? null,
          pen_name: pens.get(book.pen_name_id)?.name ?? null,
          formats: editions.map((e) => e.format),
          clash_count: clashes.filter((c) => c.book_id === book.id).length,
        };
      }).sort((a, b) => (a.series_name ?? '￿').localeCompare(b.series_name ?? '￿')
        || Number(a.series_number ?? Infinity) - Number(b.series_number ?? Infinity) || a.title.localeCompare(b.title));
    },
    saveBook: (fields) => catalog.saveBook(fields),
    removeBook: ({ id }) => (trash.removeBook(id), true),
    book: ({ id }) => {
      const book = library.get('books', id);
      if (!book) throw new CatalogError("That book isn't in your library.");
      const editions = catalog.editionsOf(id).map((edition) => ({
        ...edition,
        isbns: catalog.isbnsOf(edition.id).map((isbn) => ({ ...isbn, shown: displayIsbn(isbn.isbn), store_name: storeName(isbn.store_id) })),
        recordings: catalog.recordingsOf(edition.id).map((r) => ({ ...r, exclusive_store_name: storeName(r.exclusive_store_id) })),
        credits: catalog.creditsOf(edition.id).map((credit) => ({ ...credit, person_name: named('people')(credit.person_id) ?? 'Someone', role_label: roleLabel(credit.role) })),
        listings: catalog.listingsOf(edition.id).map((listing) => ({
          ...listing,
          credit_ids: catalog.creditsShownOn(listing.id),
          store_name: storeName(listing.store_id),
          via_name: storeName(listing.via_store_id),
          prices: priceRows(listing.id),
        })),
      }));
      return {
        book,
        series_name: named('series')(book.series_id),
        pen_name: named('pen_names')(book.pen_name_id),
        editions,
        grid: storeGrid(library, id, options()),
      };
    },

    // ---- Editions, ISBNs, recordings, listings and prices ----
    saveEdition: (fields) => catalog.saveEdition(fields),
    removeEdition: ({ id }) => (trash.removeEdition(id), true),
    addIsbn: (fields) => catalog.addIsbn(fields),
    assignIsbn: ({ isbnId, editionId }) => catalog.assignIsbn(isbnId, editionId),
    editionChoices: () => library.list('editions').map((edition) => ({ id: edition.id, label: catalog.describeEdition(edition.id) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    isbnRegister: () => library.list('isbns').map((isbn) => ({
      ...isbn, shown: displayIsbn(isbn.isbn), store_name: storeName(isbn.store_id),
      edition: isbn.edition_id ? catalog.describeEdition(isbn.edition_id) : null,
    })),
    saveRecording: (fields) => catalog.saveRecording(fields),
    saveListing: (fields) => catalog.saveListing(fields),
    removeListing: ({ id }) => (trash.removeListing(id), true),
    setPrice: (fields) => {
      const row = catalog.setPrice(fields);
      return { id: row.id };
    },

    // ---- Credits: the people on an edition, and which credits each store shows ----
    saveCredit: (fields) => catalog.saveCredit(fields),
    removeCredit: ({ id }) => (catalog.removeCredit(id), true),
    setListingCredits: ({ listingId, creditIds }) => (catalog.setListingCredits(listingId, creditIds), true),

    // ---- The Trash: what was removed waits 30 days ----
    trash: () => trash.list(),
    restoreTrash: ({ id }) => trash.restore(id),
    deleteTrash: ({ id }) => (trash.deleteForever(id), true),
    emptyTrash: () => trash.empty(),

    // ---- Sales reports. Reading a file happens in the main process (importer.preview), so the window never holds one. ----
    acceptReport: ({ previewId, knowingMismatch }) => importer.accept({ previewId, knowingMismatch }),
    reviewReport: ({ previewId, payees, dateOrder }) => importer.review({ previewId, payees, dateOrder }),
    undoReport: ({ id }) => importer.undo({ id }),
    columnsFor: (args) => importer.columnsFor(args),
    previewColumns: (args) => importer.previewColumns(args),
    layouts: () => importer.layouts(),
    removeLayout: ({ id }) => importer.removeLayout({ id }),
    imports: () => importer.reports(),
    readers: () => importer.readers(),
    needsMatching: () => importer.needsMatching(),
    matchItem: ({ storeId, storeItem, editionId }) => importer.matchItem({ storeId, storeItem, editionId }),
    earnings: () => importer.earnedVsPaid(),
    royalties: ({ by, from, to } = {}) => royalties(library, { by, from, to, locale }),

    // ---- The royalty and pricing calculator. The cards that ship are data in the app; the cards of your own live in the library. ----
    rateCards: ({ date } = {}) => calculator.cards({ date }),
    earn: (args) => calculator.earn(args),
    priceFor: (args) => calculator.target(args),
    saveRateCard: (fields) => calculator.saveOwnCard(fields),
    removeRateCard: ({ id }) => (calculator.removeOwnCard(id), true),

    // ---- Bringing books in from a spreadsheet. The file is chosen and read in the main process (booksImporter.open). ----
    planBooksImport: (args) => booksImporter.plan(args),
    acceptBooksImport: (args) => booksImporter.accept(args),
    undoBooksImport: ({ id }) => booksImporter.undo({ id }),
    booksImports: () => booksImporter.history(),

    // ---- Names and stores ----
    names: () => ({
      series: library.list('series'),
      penNames: library.list('pen_names'),
      publishers: library.list('publisher_names'),
      people: library.list('people').map((person) => ({
        ...person,
        credits: library.db.prepare('SELECT edition_id, role FROM credits WHERE person_id = ? ORDER BY created_at, rowid').all(person.id)
          .map((c) => ({ edition: catalog.describeEdition(c.edition_id), role: roleLabel(c.role) })),
      })).sort((a, b) => a.name.localeCompare(b.name)),
      roles: ROLES.map(([value, label]) => ({ value, label })),
      stores: catalog.stores().map((store) => ({ ...store, built_in: BUILT_IN_STORES.some(([id]) => id === store.id) })),
    }),
    saveSeries: (fields) => catalog.saveSeries(fields),
    savePenName: (fields) => catalog.savePenName(fields),
    savePublisherName: (fields) => catalog.savePublisherName(fields),
    savePerson: (fields) => catalog.savePerson(fields),
    removePerson: ({ id }) => (catalog.removePerson(id), true),
    saveStore: (fields) => catalog.saveStore(fields),
    removeStore: ({ id }) => catalog.removeStore(id) ?? true,
  };

  const allowed = new Set(Object.keys(calls));

  // The one entry point. A problem the person can fix comes back in plain words; anything else is logged and answered
  // in general terms, so the window never shows a database error or a path.
  function call(name, args = {}) {
    if (typeof name !== 'string' || !allowed.has(name)) return { ok: false, message: 'The app was asked to do something it does not do.' };
    try {
      return { ok: true, value: JSON.parse(JSON.stringify(calls[name](args ?? {}), (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) };
    } catch (error) {
      if (FRIENDLY.some((type) => error instanceof type)) return { ok: false, message: error.message };
      console.error(`[${name}]`, error);
      return { ok: false, message: 'Something went wrong, and nothing was changed.' };
    }
  }

  return { call, names: [...allowed], importer, booksImporter, trash };
}

module.exports = { createApi };
