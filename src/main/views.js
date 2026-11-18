'use strict';
// What the screens show, worked out from the catalog and nothing else: the store grid, the release calendar and the
// Desk. Plain functions of the library and a date, so each is tested without a window.
const { Catalog } = require('./catalog');
const { findClashes } = require('./clashes');
const { daysBetween } = require('../shared/dates');
const { format: formatMoney } = require('../shared/money');

const SOON_DAYS = 30;

function label(edition) {
  return edition.label ? `${edition.format}, ${edition.label}` : edition.format;
}

// One page per book: editions down the side, stores across the top. A square with nothing in it is a gap, and gaps are
// the point, so every active store gets a column even where this book isn't sold. A store you've switched off still
// shows if this book has a listing on it, so nothing is hidden.
function storeGrid(library, bookId, { today, locale } = {}) {
  const catalog = new Catalog(library);
  const book = library.get('books', bookId);
  if (!book) return null;
  const editions = catalog.editionsOf(bookId);
  const listings = editions.flatMap((edition) => catalog.listingsOf(edition.id));
  const used = new Set(listings.map((listing) => listing.store_id));
  const stores = library.list('stores').filter((store) => store.active || used.has(store.id));
  const clashes = findClashes(library, { today }).filter((clash) => clash.book_id === bookId);

  const rows = editions.map((edition) => {
    const cells = {};
    for (const store of stores) {
      const here = listings.filter((listing) => listing.edition_id === edition.id && listing.store_id === store.id);
      cells[store.id] = here.map((listing) => ({
        id: listing.id,
        status: listing.status,
        route: listing.route,
        via: listing.via_store_id ? library.get('stores', listing.via_store_id)?.name ?? null : null,
        program: listing.program,
        prices: catalog.pricesOn(listing.id, today).map((price) => ({
          marketplace: price.marketplace,
          currency: price.currency,
          shown: formatMoney(price.money, locale),
        })),
        clashes: clashes.filter((clash) => clash.subjects.some((s) => s.table === 'listings' && s.id === listing.id)).map((c) => c.key),
      }));
    }
    return {
      edition: { id: edition.id, format: edition.format, label: label(edition), release_date: edition.release_date },
      cells,
      clashes: clashes.filter((clash) => clash.edition_id === edition.id).map((c) => c.key),
    };
  });
  return {
    book: { id: book.id, title: book.title, business_status: book.business_status },
    stores: stores.map((store) => ({ id: store.id, name: store.name, kind: store.kind, active: Boolean(store.active) })),
    rows,
    clashes,
  };
}

// Every dated release, soonest first, with how far away it is. An edition's own date and a store's date are both shown:
// a book can reach a store later than its release.
function releaseCalendar(library, { today, includePast = false }) {
  const catalog = new Catalog(library);
  const events = [];
  for (const edition of library.list('editions')) {
    const book = library.get('books', edition.book_id);
    const base = { book_id: edition.book_id, edition_id: edition.id, title: book?.title || 'Untitled', format: label(edition) };
    if (edition.release_date) events.push({ ...base, date: edition.release_date, store: null });
    for (const listing of catalog.listingsOf(edition.id)) {
      if (listing.release_date && listing.status !== 'pulled') {
        events.push({ ...base, date: listing.release_date, store: library.get('stores', listing.store_id)?.name ?? null, listing_id: listing.id });
      }
    }
  }
  return events
    .map((event) => ({ ...event, days_away: daysBetween(today, event.date) }))
    .filter((event) => includePast || event.days_away >= 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title) || (a.store ?? '').localeCompare(b.store ?? ''));
}

// The home screen: what needs you today. Not totals. It answers "what's next, and what's in its way?"
function desk(library, { today }) {
  const clashes = findClashes(library, { today });
  const releases = releaseCalendar(library, { today });
  const next = releases[0] ?? null;
  const blockers = next ? clashes.filter((c) => c.kind === 'release-without-final' && c.edition_id === next.edition_id) : [];
  const books = library.list('books');
  const editions = library.list('editions');
  return {
    today,
    isEmpty: books.length === 0,
    counts: { books: books.length, editions: editions.length, listings: library.list('listings').length, isbnsSpare: new Catalog(library).spareIsbns().length },
    nextRelease: next && { ...next, blockers: blockers.map((c) => ({ key: c.key, title: c.title, action: c.action })) },
    comingSoon: releases.filter((r) => r.days_away <= SOON_DAYS).slice(0, 8),
    problems: clashes.filter((c) => c.severity === 'problem'),
    toCheck: clashes.filter((c) => c.severity === 'check'),
    // These arrive with the money (reports due, last month's earnings). They're named here so the screen has a place for them.
    reportsDue: [],
    lastMonth: null,
  };
}

module.exports = { desk, releaseCalendar, storeGrid };
