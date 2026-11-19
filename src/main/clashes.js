'use strict';
// Clash checks: real problems in the catalog, each saying what's wrong and what to do. See docs/product-plan.md#clash-checks.
// `computeClashes` is a pure function of the catalog's rows, so every rule is tested on made-up data. A clash can be
// dismissed with a reason, and it stays dismissed until its facts change (its key names the records it's about).
//
// Not here yet, because the data they need isn't built: contributors credited differently, price lines and bands (rate
// cards come with the calculator), a price change in a locked period, a pre-order deadline, and release spacing.
// "An ISBN is on two editions" can't happen: the register holds each number once, and says where it is when you try.
const { daysBetween } = require('../shared/dates');
const { parseIsbn } = require('../shared/isbn');

const norm = (text) => String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const activeOn = (from, until, today) => (!from || from <= today) && (!until || until >= today);
const onSale = (listing) => listing.status === 'live' || listing.status === 'pre-order';
const SYNTHETIC_WORDS = /\b(auto[- ]?narrat\w*|synthes\w*|artificial|a\.?i\.?|text[- ]to[- ]speech|tts|virtual voice|digital voice|generated|computer[- ]voice)\b/i;

function computeClashes(data, today) {
  const by = (rows) => new Map(rows.map((row) => [row.id, row]));
  const books = by(data.books);
  const editions = by(data.editions);
  const stores = by(data.stores);
  const isbns = by(data.isbns);
  const publishers = by(data.publisher_names);
  const storeName = (id) => stores.get(id)?.name ?? 'a store';
  const editionName = (id) => {
    const edition = editions.get(id);
    if (!edition) return 'an edition that is no longer there';
    const title = books.get(edition.book_id)?.title || 'Untitled';
    return `${title}: ${edition.label ? `${edition.format}, ${edition.label}` : edition.format}`;
  };
  const found = [];
  const add = (clash) => found.push({ severity: 'problem', ...clash });

  for (const listing of data.listings) {
    const edition = editions.get(listing.edition_id);
    if (!edition) continue;

    // An ebook in an exclusive program can't be sold anywhere else while the program runs.
    if (listing.program_exclusive && onSale(listing) && activeOn(listing.program_from, listing.program_until, today)) {
      const elsewhere = data.listings.filter((other) => other.edition_id === listing.edition_id && other.store_id !== listing.store_id && onSale(other));
      if (elsewhere.length) {
        const names = [...new Set(elsewhere.map((other) => storeName(other.store_id)))];
        add({
          kind: 'exclusive-program-elsewhere',
          key: ['exclusive-program-elsewhere', listing.id, ...elsewhere.map((o) => o.id).sort()].join(':'),
          title: `${editionName(edition.id)} is in an exclusive program and also on sale elsewhere`,
          detail: `${listing.program || 'The program'} on ${storeName(listing.store_id)} is exclusive${listing.program_until ? ` until ${listing.program_until}` : ''}, and it's also on ${names.join(' and ')}.`,
          action: `Take it down from ${names.join(' and ')} before the program renews, or leave the program.`,
          subjects: [['listings', listing.id], ...elsewhere.map((o) => ['listings', o.id])],
          edition_id: edition.id,
        });
      }
    }

    // A free ISBN from one store can only be used with that store.
    const isbn = listing.isbn_id ? isbns.get(listing.isbn_id) : null;
    if (isbn?.issuer === 'store' && isbn.store_id && isbn.store_id !== listing.store_id) {
      add({
        kind: 'free-isbn-elsewhere',
        key: ['free-isbn-elsewhere', listing.id, isbn.id].join(':'),
        title: `${editionName(edition.id)} uses ${storeName(isbn.store_id)}'s free ISBN on ${storeName(listing.store_id)}`,
        detail: `${isbn.isbn} was given by ${storeName(isbn.store_id)} and can only be used there.`,
        action: `Use an ISBN you own on ${storeName(listing.store_id)}.`,
        subjects: [['listings', listing.id], ['isbns', isbn.id]],
        edition_id: edition.id,
      });
    } else if (!listing.isbn_id && edition.format !== 'ebook' && edition.format !== 'audiobook') {
      const held = data.isbns.filter((item) => item.edition_id === edition.id);
      const onlyOthers = held.length > 0 && held.every((item) => item.issuer === 'store' && item.store_id && item.store_id !== listing.store_id);
      if (onlyOthers) {
        const from = storeName(held[0].store_id);
        add({
          kind: 'free-isbn-elsewhere',
          key: ['free-isbn-elsewhere', listing.id, 'only-other'].join(':'),
          title: `${editionName(edition.id)} on ${storeName(listing.store_id)} has only ${from}'s free ISBN`,
          detail: `The only ISBN on this edition was given by ${from}, which can't be used on ${storeName(listing.store_id)}.`,
          action: `Add an ISBN you own to this edition, and pick it on the ${storeName(listing.store_id)} listing.`,
          subjects: [['listings', listing.id]],
          edition_id: edition.id,
        });
      }
    }
  }

  // An ISBN that fails its check digit.
  for (const isbn of data.isbns) {
    const parsed = parseIsbn(isbn.isbn);
    if (!parsed.ok) {
      add({
        kind: 'isbn-check-digit',
        key: ['isbn-check-digit', isbn.id, isbn.isbn].join(':'),
        title: `${isbn.isbn} isn't a good ISBN`,
        detail: parsed.reason,
        action: 'Check it against the number on the book or in your ISBN account, and correct it.',
        subjects: [['isbns', isbn.id]],
        edition_id: isbn.edition_id,
      });
    }
  }

  for (const recording of data.recordings) {
    const edition = editions.get(recording.edition_id);
    if (!edition) continue;
    const listed = data.listings.filter((listing) => listing.recording_id === recording.id);

    // A recording tied to an exclusive deal, on another store.
    if (recording.exclusive && recording.exclusive_store_id && activeOn(null, recording.exclusive_until, today)) {
      const elsewhere = listed.filter((listing) => listing.store_id !== recording.exclusive_store_id && listing.status !== 'pulled');
      if (elsewhere.length) {
        const names = [...new Set(elsewhere.map((l) => storeName(l.store_id)))];
        add({
          kind: 'exclusive-recording-elsewhere',
          key: ['exclusive-recording-elsewhere', recording.id, ...elsewhere.map((l) => l.id).sort()].join(':'),
          title: `The recording of ${editionName(edition.id)} is tied to ${storeName(recording.exclusive_store_id)} and listed on ${names.join(' and ')}`,
          detail: `${recording.read_by || 'This recording'} is exclusive to ${storeName(recording.exclusive_store_id)}${recording.exclusive_until ? ` until ${recording.exclusive_until}` : ''}.${recording.royalty_share ? ' It is a Royalty Share deal, which needs a close look at the contract.' : ''}`,
          action: `Read the contract before it goes on ${names.join(' or ')}. If it's allowed, dismiss this and say why.`,
          subjects: [['recordings', recording.id], ...elsewhere.map((l) => ['listings', l.id])],
          edition_id: edition.id,
        });
      }
    }

    // A cloned voice needs that person's permission on record, and counts as synthesized.
    if (recording.voice === 'cloned' && !String(recording.permission_note).trim()) {
      add({
        kind: 'cloned-voice-permission',
        key: ['cloned-voice-permission', recording.id].join(':'),
        title: `The cloned voice on ${editionName(edition.id)} has no permission on record`,
        detail: "A cloned voice needs the person's permission, and stores treat it as synthesized.",
        action: 'Write down whose voice it is and what permission you have, or take the recording down.',
        subjects: [['recordings', recording.id]],
        edition_id: edition.id,
      });
    }

    // Marked human, but it looks synthesized. Stores ask you to declare this, and AI-made audio has to say so.
    if (recording.voice === 'human' && listed.some(onSale) && (recording.studio_project.trim() || SYNTHETIC_WORDS.test(recording.read_by))) {
      add({
        kind: 'voice-label',
        severity: 'check',
        key: ['voice-label', recording.id].join(':'),
        title: `The recording of ${editionName(edition.id)} is marked as a human voice, but may be synthesized`,
        detail: recording.studio_project.trim()
          ? `It came from the studio project "${recording.studio_project}", and "read by" says "${recording.read_by}".`
          : `"Read by" says "${recording.read_by}".`,
        action: 'If it is synthesized, change its voice to synthesized, and declare that to each store.',
        subjects: [['recordings', recording.id]],
        edition_id: edition.id,
      });
    }
  }

  // The publisher name differs between stores, or from your records.
  for (const edition of data.editions) {
    const shown = data.listings.filter((l) => l.edition_id === edition.id && l.publisher_shown.trim() && l.status !== 'pulled');
    const recorded = edition.publisher_name_id ? publishers.get(edition.publisher_name_id) : null;
    const wrong = recorded ? shown.filter((l) => norm(l.publisher_shown) !== norm(recorded.name)) : [];
    const names = [...new Set(shown.map((l) => norm(l.publisher_shown)))];
    if (wrong.length) {
      add({
        kind: 'publisher-differs',
        severity: 'check',
        key: ['publisher-differs', edition.id, ...wrong.map((l) => l.id).sort()].join(':'),
        title: `${editionName(edition.id)} shows a different publisher than your records`,
        detail: wrong.map((l) => `${storeName(l.store_id)} shows "${l.publisher_shown}"`).join('; ') + `. Your records say "${recorded.name}".`,
        action: 'Change the name on the store, or the record here if the store is right.',
        subjects: wrong.map((l) => ['listings', l.id]),
        edition_id: edition.id,
      });
    } else if (!recorded && names.length > 1) {
      add({
        kind: 'publisher-differs',
        severity: 'check',
        key: ['publisher-differs', edition.id, ...shown.map((l) => l.id).sort()].join(':'),
        title: `${editionName(edition.id)} shows different publishers on different stores`,
        detail: shown.map((l) => `${storeName(l.store_id)}: "${l.publisher_shown}"`).join('; ') + '.',
        action: 'Pick one name and use it everywhere, then record it on the edition.',
        subjects: shown.map((l) => ['listings', l.id]),
        edition_id: edition.id,
      });
    }
  }

  // Two series records that differ only in spacing, capitals or punctuation: the stores won't group them.
  const groups = new Map();
  for (const series of data.series) {
    const key = norm(series.name);
    if (key) groups.set(key, [...(groups.get(key) ?? []), series]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    add({
      kind: 'series-near-duplicate',
      severity: 'check',
      key: ['series-near-duplicate', ...group.map((s) => s.id).sort()].join(':'),
      title: `Two series are spelled almost the same: ${group.map((s) => `"${s.name}"`).join(' and ')}`,
      detail: 'Stores group books by the exact series name, so these would be shown as two series.',
      action: 'Move the books into one series and remove the other.',
      subjects: group.map((s) => ['series', s.id]),
    });
  }

  // A release date is set, but the cover or the final files aren't done.
  for (const edition of data.editions) {
    const dates = [edition.release_date, ...data.listings.filter((l) => l.edition_id === edition.id && l.status !== 'pulled').map((l) => l.release_date)]
      .filter((date) => date && date >= today).sort();
    if (!dates.length || (edition.cover_status === 'final' && edition.files_status === 'final')) continue;
    const missing = [edition.cover_status !== 'final' && 'the final cover', edition.files_status !== 'final' && 'the final files'].filter(Boolean).join(' or ');
    const days = daysBetween(today, dates[0]);
    add({
      kind: 'release-without-final',
      severity: days <= 30 ? 'problem' : 'check',
      key: ['release-without-final', edition.id, dates[0]].join(':'),
      title: `${editionName(edition.id)} is set for ${dates[0]} without ${missing}`,
      detail: days === 0 ? 'That is today.' : `That is ${days} day${days === 1 ? '' : 's'} away. A missing cover is the usual reason a date slips.`,
      action: `Mark ${missing} as final when it is, or move the date.`,
      subjects: [['editions', edition.id]],
      edition_id: edition.id,
    });
  }

  for (const clash of found) {
    clash.subjects = clash.subjects.map(([table, id]) => ({ table, id }));
    clash.book_id = clash.edition_id ? editions.get(clash.edition_id)?.book_id ?? null : null;
  }
  const rank = { problem: 0, check: 1 };
  return found.sort((a, b) => rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
}

const TABLES = ['books', 'editions', 'stores', 'isbns', 'listings', 'recordings', 'publisher_names', 'series'];

// Reads the catalog and returns the clashes, each marked with its dismissal if it has one. Dismissed ones are left out
// unless asked for.
function findClashes(library, { today, includeDismissed = false }) {
  const data = Object.fromEntries(TABLES.map((table) => [table, library.list(table)]));
  const dismissed = new Map(library.list('dismissed_clashes').map((row) => [row.clash_key, row]));
  const all = computeClashes(data, today).map((clash) => {
    const row = dismissed.get(clash.key);
    return { ...clash, dismissed: row ? { id: row.id, reason: row.reason, at: row.created_at } : null };
  });
  return includeDismissed ? all : all.filter((clash) => !clash.dismissed);
}

class ClashError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClashError';
  }
}

// A dismissal needs a reason, so a month later you can see why you decided it was fine.
function dismissClash(library, key, reason) {
  if (!String(reason ?? '').trim()) throw new ClashError('Say why this is fine, so you can find the reason later.');
  if (!String(key ?? '').trim()) throw new ClashError('Which clash?');
  const same = library.db.prepare('SELECT id FROM dismissed_clashes WHERE clash_key = ?').get(key);
  return library.put('dismissed_clashes', { id: same?.id, clash_key: key, reason: String(reason).trim() });
}

function restoreClash(library, key) {
  const row = library.db.prepare('SELECT id FROM dismissed_clashes WHERE clash_key = ?').get(key);
  if (row) library.remove('dismissed_clashes', row.id);
  return Boolean(row);
}

module.exports = { ClashError, computeClashes, dismissClash, findClashes, restoreClash };
