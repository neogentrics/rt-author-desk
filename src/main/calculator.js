'use strict';
// The royalty and pricing calculator, as in docs/design/royalties-and-prices.md. A rate card says what a store pays for one
// format in one currency from a date. Cards that ship with the app are data in rates/cards.json, with the page they came
// from and the day somebody read it. Cards you make yourself live in your library and win over the shipped one for the same
// store, format, channel and currency, and an update to the app never touches them.
//
// Everything is worked out exactly and rounded once, at the end, the way a store's own calculator does it.
const shipped = require('./rates/cards.json');
const { exponentOf, format, money, parseDecimal, roundTo, toDecimalString } = require('../shared/money');
const { isRealDate } = require('../shared/dates');

class CalculatorError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CalculatorError';
  }
}

const DEDUCTIONS = { delivery: 'Delivery cost', printing: 'Printing cost' };
const NEAR = 1; // A rate line closer than this (in whole currency units) is worth pointing out.

// ---- Exact decimals ---------------------------------------------------------------------------------------------------
const dec = (text, what) => {
  try {
    return parseDecimal(text);
  } catch {
    throw new CalculatorError(`${what} isn't a number: "${text}".`);
  }
};
const lift = (a, scale) => a.digits * 10n ** BigInt(scale - a.scale);
const plus = (a, b) => {
  const s = Math.max(a.scale, b.scale);
  return { digits: lift(a, s) + lift(b, s), scale: s };
};
const times = (a, b) => ({ digits: a.digits * b.digits, scale: a.scale + b.scale });
const compare = (a, b) => {
  const s = Math.max(a.scale, b.scale);
  const x = lift(a, s);
  const y = lift(b, s);
  return x === y ? 0 : x < y ? -1 : 1;
};
const negative = (a) => ({ digits: -a.digits, scale: a.scale });

class Calculator {
  constructor(library, { locale, now = () => new Date() } = {}) {
    this.library = library;
    this.locale = locale;
    this.now = now;
  }

  // ---- Cards ----------------------------------------------------------------------------------------------------------

  shippedCards() {
    return shipped.cards.map((card) => ({ ...card, own: false, name: `${card.channel}`, notes: '' }));
  }

  ownCards() {
    const stores = new Map(this.library.list('stores').map((s) => [s.id, s.name]));
    const current = new Map(shipped.cards.map((c) => [c.id, c.version]));
    return this.library.list('own_rate_cards').map((row) => ({
      id: row.id, own: true, name: row.name, based_on: row.based_on, based_on_version: row.based_on_version,
      shippedChanged: Boolean(row.based_on && current.has(row.based_on) && current.get(row.based_on) > (row.based_on_version ?? 0)),
      store_id: row.store_id, store: stores.get(row.store_id) ?? row.store_id, format: row.format, channel: row.channel, currency: row.currency,
      applies_from: row.applies_from, applies_until: row.applies_until, options: JSON.parse(row.options),
      delivery: row.delivery ? JSON.parse(row.delivery) : null, notes: row.notes,
    }));
  }

  // The card in force on a date for each store, format, channel and currency. Your own card, where you have one, is the
  // one used, and the shipped card it replaces is shown beside it.
  cards({ date = this.#today() } = {}) {
    this.#mustBeDate(date, 'The date');
    const stores = new Map(this.library.list('stores').map((s) => [s.id, s.name]));
    const all = [...this.shippedCards(), ...this.ownCards()].map((card) => ({ ...card, store: stores.get(card.store_id) ?? card.store_id }));
    const keys = new Map();
    for (const card of all) {
      if (!this.#inForce(card, date)) continue;
      const key = [card.store_id, card.format, card.channel, card.currency].join('|');
      const slot = keys.get(key) ?? { own: null, app: null };
      const side = card.own ? 'own' : 'app';
      const best = slot[side];
      if (!best || (card.applies_from ?? '') > (best.applies_from ?? '')) slot[side] = card;
      keys.set(key, slot);
    }
    return [...keys.values()].map(({ own, app }) => ({ ...(own ?? app), replaces: own && app ? this.#summary(app) : null }))
      .sort((a, b) => a.store.localeCompare(b.store) || a.format.localeCompare(b.format) || a.channel.localeCompare(b.channel));
  }

  // A card of your own: a copy of a shipped one with different numbers, or a new one, such as the rate in a contract.
  saveOwnCard(fields) {
    const existing = fields.id ? this.library.get('own_rate_cards', fields.id) : null;
    if (fields.id && !existing) throw new CalculatorError("That card isn't in your library.");
    const current = existing ? this.ownCards().find((c) => c.id === existing.id) : {};
    const merged = { ...current, ...fields };
    if (!merged.store_id || !this.library.get('stores', merged.store_id)) throw new CalculatorError("Choose one of your stores for this card.");
    if (!String(merged.format ?? '').trim()) throw new CalculatorError('Say which format this card is for.');
    try {
      money(0n, merged.currency);
    } catch {
      throw new CalculatorError('Choose a currency, such as USD.');
    }
    for (const key of ['applies_from', 'applies_until']) if (merged[key] != null) this.#mustBeDate(merged[key], key === 'applies_from' ? 'The start date' : 'The end date');
    if (merged.applies_from && merged.applies_until && merged.applies_until < merged.applies_from) throw new CalculatorError('The card ends before it starts.');
    const options = this.#checkedOptions(merged.options, merged.delivery);
    let basedOn = merged.based_on ?? null;
    let basedVersion = merged.based_on_version ?? null;
    if (fields.based_on) {
      const origin = shipped.cards.find((c) => c.id === fields.based_on);
      if (!origin) throw new CalculatorError("The card this one is based on isn't one the app ships.");
      basedOn = origin.id;
      basedVersion = origin.version;
    }
    const row = this.library.put('own_rate_cards', {
      ...(existing ? { id: existing.id } : {}),
      name: String(merged.name ?? '').trim(), based_on: basedOn, based_on_version: basedVersion, store_id: merged.store_id,
      format: String(merged.format).trim(), channel: String(merged.channel ?? '').trim(), currency: merged.currency,
      applies_from: merged.applies_from ?? null, applies_until: merged.applies_until ?? null, options: JSON.stringify(options),
      delivery: merged.delivery ? JSON.stringify(merged.delivery) : null, notes: String(merged.notes ?? '').trim(),
    });
    return this.ownCards().find((c) => c.id === row.id);
  }

  removeOwnCard(id) {
    if (!this.library.get('own_rate_cards', id)) throw new CalculatorError("That card isn't in your library.");
    this.library.remove('own_rate_cards', id);
  }

  // ---- What a price earns ---------------------------------------------------------------------------------------------

  // The royalty on one copy at a price, under each option the card offers. Options the price doesn't qualify for are
  // listed too, with the reason, because a price just under a line is exactly what you want to see.
  earn({ storeId, format: kind, channel, currency, price, date = this.#today(), printingCost, fileMb } = {}) {
    const card = this.#cardFor({ storeId, format: kind, channel, currency, date });
    const listed = this.#price(price, currency);
    const inputs = this.#inputs(card, { printingCost, fileMb, currency });
    const options = card.options.map((option) => this.#appraise(card, option, listed, inputs));
    const eligible = options.filter((o) => o.eligible);
    const best = eligible.reduce((top, o) => (!top || BigInt(o.royalty.minor) > BigInt(top.royalty.minor) ? o : top), null);
    return {
      card: this.#summary(card), date, price: this.#one(listed), options,
      best: best ? best.name : null,
      lines: this.#lines(card, options, listed, inputs),
      says: 'An estimate for planning. The store\'s own report is what counts.',
    };
  }

  // The price to charge to earn a given amount on each copy, under each option, rounded up to the next cent.
  target({ storeId, format: kind, channel, currency, want, date = this.#today(), printingCost, fileMb } = {}) {
    const card = this.#cardFor({ storeId, format: kind, channel, currency, date });
    const wanted = this.#price(want, currency, 'The amount you want to earn');
    const inputs = this.#inputs(card, { printingCost, fileMb, currency });
    const places = exponentOf(currency);
    const options = card.options.map((option) => {
      const rate = dec(option.rate, 'A rate');
      const fixed = this.#fixedDeductions(card, option, inputs);
      const need = plus({ digits: wanted.minor, scale: places }, fixed.total);
      // price (in the smallest unit) = need / rate, rounded up
      const numerator = need.digits * 10n ** BigInt(rate.scale + places);
      const denominator = rate.digits * 10n ** BigInt(need.scale);
      let minor = (numerator + denominator - 1n) / denominator;
      const { min, max } = this.#limits(option, inputs, currency);
      const out = { name: option.name, rate: option.rate, possible: true, note: null, price: null, royalty: null };
      if (min && minor < min.minor) {
        minor = min.minor;
        out.note = `The lowest price this option allows is ${format(min, this.locale)}, and that already earns more than you asked.`;
      }
      if (max && minor > max.minor) {
        return { ...out, possible: false, note: `You'd need ${format(money(minor, currency), this.locale)}, which is above the ${format(max, this.locale)} this option allows.` };
      }
      // Rounding can leave a copy a cent short, so check the royalty at the price and go up until it isn't.
      for (let i = 0; i < 5; i += 1) {
        const got = this.#royalty(option, money(minor, currency), fixed);
        if (got >= wanted.minor || (max && minor >= max.minor)) break;
        minor += 1n;
      }
      const at = money(minor, currency);
      return { ...out, price: this.#one(at), royalty: this.#one(money(this.#royalty(option, at, fixed), currency)) };
    });
    const possible = options.filter((o) => o.possible);
    const cheapest = possible.reduce((low, o) => (!low || BigInt(o.price.minor) < BigInt(low.price.minor) ? o : low), null);
    return { card: this.#summary(card), date, wanted: this.#one(wanted), options, cheapest: cheapest ? cheapest.name : null };
  }

  // ---- Inside ---------------------------------------------------------------------------------------------------------

  #today() {
    const d = this.now();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  #mustBeDate(value, what) {
    if (typeof value !== 'string' || !isRealDate(value)) throw new CalculatorError(`${what} has to be a real date, such as 2026-09-30.`);
  }

  #inForce(card, date) {
    return (!card.applies_from || card.applies_from <= date) && (!card.applies_until || card.applies_until >= date);
  }

  #summary(card) {
    return {
      id: card.id, own: card.own, name: card.name, store_id: card.store_id, store: card.store ?? this.library.get('stores', card.store_id)?.name ?? card.store_id,
      format: card.format, channel: card.channel, currency: card.currency, applies_from: card.applies_from, applies_until: card.applies_until,
      source: card.source ?? null, notes: card.notes ?? '', based_on: card.based_on ?? null, shippedChanged: Boolean(card.shippedChanged),
    };
  }

  #one(amount) {
    return { currency: amount.currency, minor: amount.minor.toString(), amount: toDecimalString(amount), shown: format(amount, this.locale) };
  }

  #cardFor({ storeId, format: kind, channel, currency, date }) {
    this.#mustBeDate(date, 'The date');
    const store = this.library.get('stores', storeId);
    if (!store) throw new CalculatorError('Choose a store.');
    if (!kind) throw new CalculatorError('Choose a format.');
    try {
      money(0n, currency);
    } catch {
      throw new CalculatorError('Choose a currency, such as USD.');
    }
    const matches = this.cards({ date }).filter((c) => c.store_id === storeId && c.format === kind && c.currency === currency);
    if (!matches.length) {
      throw new CalculatorError(`There's no rate card for ${store.name} ${kind} in ${currency} on ${date}. The app ships a few, and you can add your own.`);
    }
    if (channel) {
      const card = matches.find((c) => c.channel === channel);
      if (!card) throw new CalculatorError(`${store.name} ${kind} has no "${channel}" card on ${date}. The choices are ${matches.map((c) => `"${c.channel}"`).join(', ')}.`);
      return card;
    }
    if (matches.length > 1) throw new CalculatorError(`${store.name} ${kind} has more than one card: choose ${matches.map((c) => `"${c.channel}"`).join(' or ')}.`);
    return matches[0];
  }

  #price(value, currency, what = 'The price') {
    let amount;
    try {
      amount = money(roundTo(dec(value, what), exponentOf(currency)), currency);
    } catch (error) {
      if (error instanceof CalculatorError) throw error;
      throw new CalculatorError(`${what} isn't an amount: "${value}".`);
    }
    if (amount.minor <= 0n) throw new CalculatorError(`${what} has to be more than zero.`);
    return amount;
  }

  // What a card needs from the person: the printing cost for print, the file size for an ebook.
  #inputs(card, { printingCost, fileMb, currency }) {
    const uses = (kind) => card.options.some((o) => (o.deduct ?? []).includes(kind));
    const out = {};
    if (uses('printing')) {
      if (printingCost == null || String(printingCost).trim() === '') throw new CalculatorError("Enter the printing cost per copy. KDP's own printing cost calculator gives it for your page count and ink.");
      const cost = dec(printingCost, 'The printing cost');
      if (cost.digits < 0n) throw new CalculatorError("The printing cost can't be negative.");
      out.printing = cost;
    }
    const sized = uses('delivery') || card.options.some((o) => o.price_min_by_file_mb);
    if (sized) {
      if (fileMb == null || String(fileMb).trim() === '') throw new CalculatorError("Enter the ebook file's size in MB. It sets the delivery cost and the lowest price.");
      const mb = dec(fileMb, 'The file size');
      if (mb.digits <= 0n) throw new CalculatorError('The file size has to be more than zero.');
      out.fileMb = mb;
    }
    out.currency = currency;
    return out;
  }

  // The deductions that don't depend on the price, exact.
  #fixedDeductions(card, option, inputs) {
    const parts = [];
    let total = { digits: 0n, scale: 0 };
    for (const kind of option.deduct ?? []) {
      let amount;
      if (kind === 'printing') amount = inputs.printing;
      else if (kind === 'delivery') {
        const per = times(dec(card.delivery.per_mb, 'The delivery rate'), inputs.fileMb);
        const floor = dec(card.delivery.minimum, 'The delivery minimum');
        amount = compare(per, floor) < 0 ? floor : per;
      }
      parts.push({ kind, label: DEDUCTIONS[kind] ?? kind, exact: amount });
      total = plus(total, amount);
    }
    return { parts, total };
  }

  // The lowest and highest list price an option accepts, or null for no limit.
  #limits(option, inputs, currency) {
    let min = null;
    if (option.price_min != null) min = option.price_min;
    if (option.price_min_by_file_mb) {
      for (const [from, price] of option.price_min_by_file_mb) if (compare(inputs.fileMb, dec(from, 'A size')) >= 0) min = price;
    }
    const asMoney = (text) => (text == null ? null : money(roundTo(dec(text, 'A limit'), exponentOf(currency)), currency));
    return { min: asMoney(min), max: asMoney(option.price_max) };
  }

  // The royalty in the smallest unit: rate x price, less what's deducted, rounded once.
  #royalty(option, price, fixed) {
    const gross = times(dec(option.rate, 'A rate'), { digits: price.minor, scale: exponentOf(price.currency) });
    return roundTo(plus(gross, negative(fixed.total)), exponentOf(price.currency));
  }

  #appraise(card, option, price, inputs) {
    const currency = price.currency;
    const { min, max } = this.#limits(option, inputs, currency);
    const fixed = this.#fixedDeductions(card, option, inputs);
    let why = null;
    if (min && price.minor < min.minor) why = `The price has to be at least ${format(min, this.locale)} for this option.`;
    else if (max && price.minor > max.minor) why = `The price can be at most ${format(max, this.locale)} for this option.`;
    const places = exponentOf(currency);
    const gross = roundTo(times(dec(option.rate, 'A rate'), { digits: price.minor, scale: places }), places);
    return {
      name: option.name, rate: option.rate, eligible: why == null, why,
      gross: this.#one(money(gross, currency)),
      deductions: fixed.parts.map((p) => ({ kind: p.kind, label: p.label, amount: this.#one(money(roundTo(p.exact, places), currency)) })),
      royalty: this.#one(money(this.#royalty(option, price, fixed), currency)),
      // The lowest price this option would accept, where the card says the store won't take less than cost divided by rate.
      lowestPrice: fixed.total.digits > 0n && (option.deduct ?? []).includes('printing')
        ? this.#one(money(this.#ceil(fixed.total, dec(option.rate, 'A rate'), places), currency)) : null,
    };
  }

  // fixed / rate, rounded up to the smallest unit: the lowest list price a store will accept for a printed book.
  #ceil(fixed, rate, places) {
    const numerator = fixed.digits * 10n ** BigInt(rate.scale + places);
    const denominator = rate.digits * 10n ** BigInt(fixed.scale);
    return (numerator + denominator - 1n) / denominator;
  }

  // A line is a price where the rate changes. If the price is just under one, say what stepping over it would earn.
  #lines(card, options, price, inputs) {
    const out = [];
    const currency = price.currency;
    const places = exponentOf(currency);
    const best = options.filter((o) => o.eligible).reduce((top, o) => (!top || BigInt(o.royalty.minor) > top ? BigInt(o.royalty.minor) : top), null);
    for (const option of card.options) {
      const { min } = this.#limits(option, inputs, currency);
      if (!min || price.minor >= min.minor) continue;
      const gap = min.minor - price.minor;
      if (gap > BigInt(NEAR) * 10n ** BigInt(places)) continue;
      const fixed = this.#fixedDeductions(card, option, inputs);
      const there = this.#royalty(option, min, fixed);
      out.push({
        price: this.#one(min), option: option.name, royalty: this.#one(money(there, currency)),
        better: best == null || there > best,
        says: `At ${format(min, this.locale)} the "${option.name}" option applies and earns ${format(money(there, currency), this.locale)} a copy${best == null ? '' : `, against ${format(money(best, currency), this.locale)} now`}.`,
      });
    }
    return out;
  }

  #checkedOptions(options, delivery) {
    if (!Array.isArray(options) || !options.length) throw new CalculatorError('A card needs at least one rate.');
    const seen = new Set();
    return options.map((o, i) => {
      const where = `Rate ${i + 1}`;
      const name = String(o?.name ?? '').trim();
      if (!name) throw new CalculatorError(`${where} needs a name, such as "70% option".`);
      if (seen.has(name)) throw new CalculatorError(`Two rates are called "${name}". Give each its own name.`);
      seen.add(name);
      const rate = dec(o.rate, `${where}'s rate`);
      if (rate.digits <= 0n || compare(rate, { digits: 1n, scale: 0 }) > 0) throw new CalculatorError(`${where}'s rate has to be more than 0% and at most 100%.`);
      const clean = { name, rate: toRate(rate), deduct: [] };
      for (const key of ['price_min', 'price_max']) {
        if (o[key] == null || o[key] === '') continue;
        if (dec(o[key], `${where}'s ${key === 'price_min' ? 'lowest' : 'highest'} price`).digits < 0n) throw new CalculatorError(`${where}'s prices can't be negative.`);
        clean[key] = String(o[key]).trim();
      }
      if (clean.price_min != null && clean.price_max != null && compare(dec(clean.price_min), dec(clean.price_max)) > 0) throw new CalculatorError(`${where}'s lowest price is above its highest.`);
      if (o.price_min_by_file_mb) clean.price_min_by_file_mb = o.price_min_by_file_mb.map(([mb, price]) => [Number(mb), String(price)]);
      for (const kind of o.deduct ?? []) {
        if (!DEDUCTIONS[kind]) throw new CalculatorError(`${where} takes off "${kind}", which isn't something the calculator knows.`);
        if (kind === 'delivery' && !(delivery && delivery.per_mb != null && delivery.minimum != null)) throw new CalculatorError(`${where} takes off a delivery cost, so the card needs a delivery cost per MB and a minimum.`);
        clean.deduct.push(kind);
      }
      return clean;
    });
  }
}

// 0.7 and "0.70" are the same rate; keep what the person typed unless it has no sense.
const toRate = (decimal) => {
  const text = decimal.digits.toString().padStart(decimal.scale + 1, '0');
  return decimal.scale ? `${text.slice(0, -decimal.scale)}.${text.slice(-decimal.scale)}` : text;
};

module.exports = { Calculator, CalculatorError, DEDUCTIONS };
