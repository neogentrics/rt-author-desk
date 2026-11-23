'use strict';
// What the screens show, worked out from the catalog and nothing else: the store grid, the release calendar and the
// Desk. Plain functions of the library and a date, so each is tested without a window.
const { Catalog } = require('./catalog');
const { findClashes } = require('./clashes');
const { earnedIn } = require('./royalties');
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
  const stores = catalog.stores().filter((store) => store.active || used.has(store.id));
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

// Every audiobook against every place an audiobook is sold: which recording is live there, whose voice it is, what rights
// it carries, and which are waiting to be replaced and by what. One row per audiobook edition. The columns are the audio
// stores, Google Play Books (it sells audiobooks too), and any other store where one of your audiobooks is listed.
function audiobookTracker(library, { today }) {
  const catalog = new Catalog(library);
  const clashes = findClashes(library, { today });
  const audioEditions = library.list('editions').filter((edition) => edition.format === 'audiobook');
  const listingsByEdition = new Map(audioEditions.map((edition) => [edition.id, catalog.listingsOf(edition.id)]));
  const used = new Set([...listingsByEdition.values()].flat().map((listing) => listing.store_id));
  const stores = catalog.stores().filter((store) => used.has(store.id) || (store.active && (store.kind === 'audio' || store.id === 'store-google-play-books')));

  const recordingFacts = (recording, byId) => {
    const replacement = recording.replaced_by_id ? byId.get(recording.replaced_by_id) : null;
    return {
      id: recording.id,
      voice: recording.voice,
      read_by: recording.read_by,
      exclusive: Boolean(recording.exclusive),
      exclusive_store: recording.exclusive ? library.get('stores', recording.exclusive_store_id)?.name ?? null : null,
      exclusive_until: recording.exclusive_until,
      royalty_share: Boolean(recording.royalty_share),
      waiting: recording.replacing === 'waiting',
      // What it is waiting for: a recording already made (and when), or nothing yet.
      replacement: replacement && { id: replacement.id, voice: replacement.voice, read_by: replacement.read_by, finished_on: replacement.finished_on },
      replaced_on: recording.replaced_on,
    };
  };

  const rows = audioEditions.map((edition) => {
    const book = library.get('books', edition.book_id);
    const recordings = catalog.recordingsOf(edition.id);
    const byId = new Map(recordings.map((recording) => [recording.id, recording]));
    const listings = listingsByEdition.get(edition.id);
    const cells = {};
    for (const store of stores) {
      cells[store.id] = listings.filter((listing) => listing.store_id === store.id).map((listing) => {
        const recording = listing.recording_id ? byId.get(listing.recording_id) : null;
        return {
          id: listing.id,
          status: listing.status,
          route: listing.route,
          recording: recording ? recordingFacts(recording, byId) : null,
          clashes: clashes.filter((clash) => clash.subjects.some((s) => (s.table === 'listings' && s.id === listing.id) || (recording && s.table === 'recordings' && s.id === recording.id))).map((c) => c.key),
        };
      });
    }
    return {
      book: { id: book?.id ?? edition.book_id, title: book?.title || 'Untitled' },
      edition: { id: edition.id, label: label(edition), release_date: edition.release_date },
      recordings: recordings.map((recording) => recordingFacts(recording, byId)),
      // On sale, with no recording named: the app can't say what is live there.
      unnamed: listings.filter((listing) => listing.status === 'live' && !listing.recording_id).length,
      cells,
    };
  }).sort((a, b) => a.book.title.localeCompare(b.book.title) || a.edition.label.localeCompare(b.edition.label));

  const everyRecording = rows.flatMap((row) => row.recordings);
  return {
    stores: stores.map((store) => ({ id: store.id, name: store.name })),
    rows,
    counts: {
      titles: rows.length,
      recordings: everyRecording.length,
      waiting: everyRecording.filter((r) => r.waiting).length,
      waitingWithReplacement: everyRecording.filter((r) => r.waiting && r.replacement).length,
      synthesized: everyRecording.filter((r) => r.voice !== 'human').length,
      unnamed: rows.reduce((sum, row) => sum + row.unnamed, 0),
    },
  };
}

// The month before today, and what the sales reports say it earned, or null when none has been imported for it.
function lastMonth(library, today, locale) {
  const [year, month] = today.split('-').map(Number);
  const before = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
  const earned = earnedIn(library, before, locale);
  return earned && { period: before, earned, estimate: true };
}

// Each store you have imported sales reports from, and whether its next report can be downloaded yet. A report covers a month and is there once
// that month is over, so after the last month you have, the next report is due from the first day of the month after it. A store whose last report ended more
// than a year ago is taken to be one you have stopped selling on, and is left alone.
const STOPPED_AFTER_DAYS = 400;
function reportSchedule(library, today) {
  const stores = new Map(library.list('stores').map((s) => [s.id, s.name]));
  const last = new Map();
  for (const row of library.db.prepare("SELECT store_id, period_end, file_name FROM report_files WHERE status = 'accepted' AND period_end IS NOT NULL AND kind != 'kdp-payments' ORDER BY period_end, rowid").all()) last.set(row.store_id, row);
  const after = (month, by) => { const [y, m] = month.split('-').map(Number); const at = y * 12 + (m - 1) + by; return `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, '0')}`; };
  return [...last.entries()].map(([storeId, row]) => {
    const lastMonth = row.period_end.slice(0, 7);
    const nextMonth = after(lastMonth, 1);
    const dueFrom = `${after(lastMonth, 2)}-01`;
    return { store_id: storeId, store: stores.get(storeId) ?? storeId, lastEnd: row.period_end, lastFile: row.file_name, nextMonth, dueFrom, due: today >= dueFrom, daysLate: daysBetween(dueFrom, today) };
  }).filter((r) => daysBetween(r.lastEnd, today) <= STOPPED_AFTER_DAYS).sort((a, b) => b.daysLate - a.daysLate || a.store.localeCompare(b.store));
}

// The home screen: what needs you today. Not totals. It answers "what's next, and what's in its way?"
function desk(library, { today, locale }) {
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
    // Reports to download: the stores whose next report is ready. Last month's earnings are the sales reports' estimates.
    reportsDue: reportSchedule(library, today).filter((r) => r.due),
    reportsComing: reportSchedule(library, today).filter((r) => !r.due),
    lastMonth: lastMonth(library, today, locale),
  };
}

module.exports = { audiobookTracker, desk, releaseCalendar, reportSchedule, storeGrid };
