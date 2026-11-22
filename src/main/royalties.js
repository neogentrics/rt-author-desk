'use strict';
// Royalties added up by month, book, edition, store and marketplace, in any mix, and always by currency: money in two
// currencies is never added together. What the sales reports say you earned (estimates) is kept apart from what the
// payment reports say was paid, because they arrive at different times and are not the same number until a payment covers
// the month.
const { Catalog } = require('./catalog');
const { add, format, money, toDecimalString, zero } = require('../shared/money');

class RoyaltyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RoyaltyError';
  }
}

const DIMENSIONS = ['month', 'book', 'edition', 'store', 'marketplace'];
const NOT_MATCHED = 'Not matched yet';
const isMonth = (text) => /^\d{4}-(0[1-9]|1[0-2])$/.test(text);

function royalties(library, { by = ['month'], from = null, to = null, locale } = {}) {
  if (!Array.isArray(by) || by.some((dimension) => !DIMENSIONS.includes(dimension))) {
    throw new RoyaltyError(`Choose from ${DIMENSIONS.join(', ')}.`);
  }
  const dimensions = DIMENSIONS.filter((dimension) => by.includes(dimension)); // always in the same order
  for (const [name, value] of [['from', from], ['to', to]]) {
    if (value != null && !isMonth(value)) throw new RoyaltyError(`The "${name}" month has to look like 2026-09.`);
  }
  if (from && to && to < from) throw new RoyaltyError('The end month is before the start month.');

  const catalog = new Catalog(library);
  const books = new Map(library.list('books').map((b) => [b.id, b.title || 'Untitled']));
  const editionBook = new Map(library.list('editions').map((e) => [e.id, e.book_id]));
  const stores = new Map(library.list('stores').map((s) => [s.id, s.name]));
  const editionLabels = new Map();
  const editionLabel = (id) => {
    if (!editionLabels.has(id)) editionLabels.set(id, catalog.describeEdition(id));
    return editionLabels.get(id);
  };
  const one = (amount) => ({ currency: amount.currency, minor: amount.minor.toString(), amount: toDecimalString(amount), shown: format(amount, locale) });

  const where = '(? IS NULL OR period >= ?) AND (? IS NULL OR period <= ?)';
  const lines = library.db.prepare(`SELECT period, store_id, marketplace, currency, royalty, net_units, transaction_type, edition_id
    FROM sale_lines WHERE ${where}`).all(from, from, to, to);

  const part = {
    month: (row) => ({ id: row.period, label: row.period }),
    book: (row) => {
      const id = editionBook.get(row.edition_id) ?? null;
      return { id, label: id ? books.get(id) ?? 'Untitled' : NOT_MATCHED };
    },
    edition: (row) => ({ id: row.edition_id ?? null, label: row.edition_id && editionBook.has(row.edition_id) ? editionLabel(row.edition_id) : NOT_MATCHED }),
    store: (row) => ({ id: row.store_id, label: stores.get(row.store_id) ?? row.store_id }),
    marketplace: (row) => ({ id: row.marketplace, label: row.marketplace || '(none)' }),
  };

  const groups = new Map();
  for (const row of lines) {
    const keys = Object.fromEntries(dimensions.map((d) => [d, part[d](row)]));
    const id = [...dimensions.map((d) => keys[d].id ?? ''), row.currency].join('\u0000');
    const group = groups.get(id) ?? { keys, currency: row.currency, earned: zero(row.currency), units: 0, free: 0, lines: 0 };
    group.earned = add(group.earned, money(BigInt(row.royalty), row.currency));
    // A free copy earns nothing and is counted on its own, so "copies sold" means copies that were sold.
    if (/^free/i.test(row.transaction_type)) group.free += row.net_units;
    else group.units += row.net_units;
    group.lines += 1;
    groups.set(id, group);
  }

  const order = (a, b) => {
    for (const d of dimensions) {
      const x = a.keys[d].label;
      const y = b.keys[d].label;
      if (x === y) continue;
      if (x === NOT_MATCHED) return 1; // unmatched goes last
      if (y === NOT_MATCHED) return -1;
      return x.localeCompare(y);
    }
    return a.currency.localeCompare(b.currency);
  };
  const rows = [...groups.values()].sort(order).map((g) => ({ keys: g.keys, currency: g.currency, earned: one(g.earned), units: g.units, free: g.free, lines: g.lines }));

  const sums = new Map();
  for (const g of groups.values()) {
    const t = sums.get(g.currency) ?? { earned: zero(g.currency), units: 0, free: 0 };
    t.earned = add(t.earned, g.earned);
    t.units += g.units;
    t.free += g.free;
    sums.set(g.currency, t);
  }
  const totals = [...sums.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, t]) => ({ currency, earned: one(t.earned), units: t.units, free: t.free }));

  // What was paid, kept apart. Payments know their month, marketplace and currency, and nothing about which book.
  const payments = library.db.prepare(`SELECT period_start, marketplace, earned_currency, accrued, net, status FROM payments
    WHERE earned_currency IS NOT NULL AND period_start IS NOT NULL
      AND (? IS NULL OR substr(period_start, 1, 7) >= ?) AND (? IS NULL OR substr(period_start, 1, 7) <= ?)`).all(from, from, to, to);
  const paidGroups = new Map();
  for (const p of payments) {
    const month = p.period_start.slice(0, 7);
    const id = `${month}\u0000${p.marketplace}\u0000${p.earned_currency}`;
    const g = paidGroups.get(id) ?? { month, marketplace: p.marketplace, currency: p.earned_currency, accrued: zero(p.earned_currency), paid: zero(p.earned_currency), waiting: zero(p.earned_currency), statuses: new Set() };
    if (p.accrued != null) g.accrued = add(g.accrued, money(BigInt(p.accrued), p.earned_currency));
    if (p.net != null) {
      const net = money(BigInt(p.net), p.earned_currency);
      if (/^paid$/i.test(p.status.trim())) g.paid = add(g.paid, net);
      else g.waiting = add(g.waiting, net);
    }
    if (p.status.trim()) g.statuses.add(p.status.trim());
    paidGroups.set(id, g);
  }
  const paid = [...paidGroups.values()]
    .sort((a, b) => a.month.localeCompare(b.month) || a.marketplace.localeCompare(b.marketplace) || a.currency.localeCompare(b.currency))
    .map((g) => ({ month: g.month, marketplace: g.marketplace, currency: g.currency, accrued: one(g.accrued), paid: one(g.paid), waiting: one(g.waiting), statuses: [...g.statuses] }));

  const months = [...new Set(library.db.prepare('SELECT DISTINCT period FROM sale_lines').all().map((r) => r.period))].sort();
  return {
    by: dimensions, from, to, months,
    estimated: { rows, totals },
    paid,
    notMatched: lines.filter((row) => !row.edition_id).length,
  };
}

// What was earned in the one month, for the Desk: estimates only, and labelled as such by whoever shows them.
function earnedIn(library, month, locale) {
  const rows = library.db.prepare('SELECT currency, royalty FROM sale_lines WHERE period = ?').all(month);
  if (!rows.length) return null;
  const sums = new Map();
  for (const { currency, royalty } of rows) sums.set(currency, add(sums.get(currency) ?? zero(currency), money(BigInt(royalty), currency)));
  return [...sums.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amount: toDecimalString(amount), shown: format(amount, locale) }));
}

module.exports = { DIMENSIONS, NOT_MATCHED, RoyaltyError, earnedIn, royalties };
