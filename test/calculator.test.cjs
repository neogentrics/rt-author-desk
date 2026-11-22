'use strict';
// The royalty and pricing calculator. Every number below was worked out by hand from the rule on the card, written beside it, and the
// engine has to agree to the cent. The cards used are the ones that ship (read from their pages on the dates they say) and a few made up here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Calculator, CalculatorError } = require('../src/main/calculator');
const shipped = require('../src/main/rates/cards.json');
const { BUILT_IN_STORES } = require('../src/main/storage/schema');
const { Library } = require('../src/main/storage/library');
const { isRealDate } = require('../src/shared/dates');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const TODAY = new Date('2026-11-18T12:00:00');

function start() {
  const library = new Library(temp()).open();
  return { library, calc: new Calculator(library, { locale: 'en-US', now: () => TODAY }) };
}
const refused = (fn, pattern) => assert.throws(fn, (e) => e instanceof CalculatorError && pattern.test(e.message), String(pattern));
const KDP = { storeId: 'store-kdp', channel: 'Amazon.com', currency: 'USD' };
const get = (options, name) => options.find((o) => o.name === name);

test('a paperback: 60% of the list price, less the printing cost, at and above $9.99, and 50% below', () => {
  const { library, calc } = start();
  // 0.60 x 12.99 = 7.794, less 4.25 = 3.544, which is $3.54
  const at = calc.earn({ ...KDP, format: 'paperback', price: '12.99', printingCost: '4.25' });
  const sixty = get(at.options, '60% (list price $9.99 or more)');
  assert.equal(sixty.royalty.amount, '3.54');
  assert.equal(sixty.gross.amount, '7.79', 'the list price share is shown, rounded for the eye');
  assert.deepEqual(sixty.deductions.map((d) => [d.kind, d.amount.amount]), [['printing', '4.25']]);
  assert.equal(sixty.eligible, true);
  const fifty = get(at.options, '50% (list price $9.98 or less)');
  assert.equal(fifty.eligible, false);
  assert.match(fifty.why, /at most \$9\.98/);
  assert.equal(at.best, '60% (list price $9.99 or more)');
  assert.equal(at.card.source.verified, true, 'the card it used says it was read on the store\'s own page');
  library.close();
});

test('a price one cent under a line is flagged, with what stepping over it would earn', () => {
  const { library, calc } = start();
  // 0.50 x 9.98 = 4.99, less 4.25 = 0.74.  At 9.99 the 60% rate applies: 0.60 x 9.99 = 5.994, less 4.25 = 1.744, which is $1.74
  const under = calc.earn({ ...KDP, format: 'paperback', price: '9.98', printingCost: '4.25' });
  assert.equal(get(under.options, '50% (list price $9.98 or less)').royalty.amount, '0.74');
  assert.equal(under.best, '50% (list price $9.98 or less)');
  assert.equal(under.lines.length, 1);
  assert.deepEqual([under.lines[0].price.amount, under.lines[0].royalty.amount, under.lines[0].better], ['9.99', '1.74', true]);
  assert.match(under.lines[0].says, /\$9\.99.*\$1\.74 a copy, against \$0\.74 now/);
  const over = calc.earn({ ...KDP, format: 'paperback', price: '9.99', printingCost: '4.25' });
  assert.deepEqual(over.lines, [], 'a price on the right side of the line has nothing to point out');
  library.close();
});

test('an ebook: 70% less the delivery cost inside the band, 35% outside it, and the band as it was on the date', () => {
  const { library, calc } = start();
  // delivery = 0.15 x 1.5 MB = 0.225 (above the 0.01 minimum).  0.70 x 4.99 = 3.493, less 0.225 = 3.268, which is $3.27
  const now = calc.earn({ ...KDP, format: 'ebook', price: '4.99', fileMb: '1.5' });
  const seventy = get(now.options, '70% option');
  assert.equal(seventy.royalty.amount, '3.27');
  assert.deepEqual(seventy.deductions.map((d) => [d.kind, d.amount.amount]), [['delivery', '0.23']]);
  // 0.35 x 4.99 = 1.7465, which is $1.75
  assert.equal(get(now.options, '35% option').royalty.amount, '1.75');
  assert.equal(now.best, '70% option');

  // $10.99 is inside the 70% band from 7 July 2026 ($12.99 at the top) and above it before ($9.99)
  const after = calc.earn({ ...KDP, format: 'ebook', price: '10.99', fileMb: '1.5', date: '2026-07-07' });
  assert.equal(get(after.options, '70% option').eligible, true);
  assert.equal(after.card.applies_from, '2026-07-07');
  const before = calc.earn({ ...KDP, format: 'ebook', price: '10.99', fileMb: '1.5', date: '2026-07-06' });
  assert.equal(get(before.options, '70% option').eligible, false);
  assert.equal(before.card.applies_until, '2026-07-06');
  assert.equal(before.best, '35% option');
  library.close();
});

test('a price under the 70% band says what the band would earn, and the 35% option\'s lowest price follows the file size', () => {
  const { library, calc } = start();
  // 0.35 x 2.50 = 0.875, which is $0.88.  At 2.99 the 70% option: 0.70 x 2.99 = 2.093, less 0.225 = 1.868, which is $1.87
  const low = calc.earn({ ...KDP, format: 'ebook', price: '2.50', fileMb: '1.5' });
  assert.equal(get(low.options, '70% option').eligible, false);
  assert.equal(get(low.options, '35% option').royalty.amount, '0.88');
  assert.equal(low.best, '35% option');
  assert.deepEqual([low.lines[0].price.amount, low.lines[0].royalty.amount, low.lines[0].better], ['2.99', '1.87', true]);
  // a file over 3 MB needs at least $1.99 for the 35% option, and over 10 MB, $2.99
  assert.equal(get(calc.earn({ ...KDP, format: 'ebook', price: '1.50', fileMb: '2.9' }).options, '35% option').eligible, true);
  assert.equal(get(calc.earn({ ...KDP, format: 'ebook', price: '1.50', fileMb: '3' }).options, '35% option').eligible, false);
  assert.equal(get(calc.earn({ ...KDP, format: 'ebook', price: '2.50', fileMb: '10' }).options, '35% option').eligible, false);
  library.close();
});

test('working backwards: the price that earns what you want, rounded up so it never falls a cent short', () => {
  const { library, calc } = start();
  // want $3.00 a copy with a printing cost of $4.25: 60%: (3.00 + 4.25) / 0.60 = 12.0833, rounded up to $12.09, which earns 7.254 - 4.25 = 3.004
  const back = calc.target({ ...KDP, format: 'paperback', want: '3.00', printingCost: '4.25' });
  const sixty = get(back.options, '60% (list price $9.99 or more)');
  assert.deepEqual([sixty.possible, sixty.price.amount, sixty.royalty.amount], [true, '12.09', '3.00']);
  // the 50% option would need (3.00 + 4.25) / 0.50 = 14.50, above its $9.98 top
  const fifty = get(back.options, '50% (list price $9.98 or less)');
  assert.equal(fifty.possible, false);
  assert.match(fifty.note, /\$14\.50.*above the \$9\.98/);
  assert.equal(back.cheapest, '60% (list price $9.99 or more)');
  // and the price it gives really does earn at least what was asked, for a spread of wishes
  for (const want of ['0.01', '0.50', '1.00', '2.50', '3.33', '5.00', '7.77']) {
    const answer = calc.target({ ...KDP, format: 'paperback', want, printingCost: '4.25' });
    const best = answer.options.find((o) => o.name === answer.cheapest);
    assert.ok(BigInt(best.royalty.minor) >= BigInt(Math.round(Number(want) * 100)), `${want}: got ${best.royalty.amount} at ${best.price.amount}`);
  }
  library.close();
});

test('an ebook asked for backwards respects the lowest price its option allows, and says so', () => {
  const { library, calc } = start();
  // want $0.10 a copy: the 70% option would need (0.10 + 0.225) / 0.70 = 0.4643, but it will not go under $2.99, which earns more
  const back = calc.target({ ...KDP, format: 'ebook', want: '0.10', fileMb: '1.5' });
  const seventy = get(back.options, '70% option');
  assert.equal(seventy.price.amount, '2.99');
  assert.match(seventy.note, /lowest price this option allows is \$2\.99/);
  assert.equal(seventy.royalty.amount, '1.87');
  library.close();
});

test('a price with no cents (yen) is worked out in whole yen, from your own card', () => {
  const { library, calc } = start();
  const saved = calc.saveOwnCard({
    name: 'Ebook in yen', store_id: 'store-kdp', format: 'ebook', channel: 'Amazon.co.jp', currency: 'JPY',
    options: [{ name: '70% option', rate: '0.70', price_min: '250', price_max: '1000' }, { name: '35% option', rate: '0.35', price_min: '99', price_max: '20000' }],
  });
  assert.equal(saved.currency, 'JPY');
  const result = calc.earn({ storeId: 'store-kdp', format: 'ebook', channel: 'Amazon.co.jp', currency: 'JPY', price: '999' });
  // 0.70 x 999 = 699.3, which is 699 yen
  assert.equal(get(result.options, '70% option').royalty.minor, '699');
  assert.equal(get(result.options, '70% option').royalty.amount, '699');
  library.close();
});

test('your own card wins over the shipped one, shows what it replaced, and is kept apart', () => {
  const { library, calc } = start();
  const before = calc.cards().find((c) => c.store_id === 'store-kdp' && c.format === 'paperback' && c.channel === 'Amazon.com');
  assert.equal(before.own, false);
  const mine = calc.saveOwnCard({
    name: 'My print deal', based_on: 'kdp-paperback-usd-amazon', store_id: 'store-kdp', format: 'paperback', channel: 'Amazon.com', currency: 'USD',
    options: [{ name: '65% deal', rate: '0.65', price_min: '0.01', deduct: ['printing'] }],
  });
  assert.equal(mine.based_on, 'kdp-paperback-usd-amazon');
  const after = calc.cards().find((c) => c.store_id === 'store-kdp' && c.format === 'paperback' && c.channel === 'Amazon.com');
  assert.equal(after.own, true);
  assert.equal(after.replaces.id, 'kdp-paperback-usd-amazon', 'the card it covers is shown beside it');
  // 0.65 x 10.00 = 6.50, less 4.00 = 2.50
  const earned = calc.earn({ ...KDP, format: 'paperback', price: '10.00', printingCost: '4.00' });
  assert.deepEqual(earned.options.map((o) => [o.name, o.royalty.amount]), [['65% deal', '2.50']]);
  assert.equal(earned.card.own, true);
  // the shipped cards in the file are untouched, and removing yours brings the shipped one back
  assert.equal(shipped.cards.find((c) => c.id === 'kdp-paperback-usd-amazon').options.length, 2);
  calc.removeOwnCard(mine.id);
  assert.equal(calc.cards().find((c) => c.store_id === 'store-kdp' && c.format === 'paperback' && c.channel === 'Amazon.com').own, false);
  library.close();
});

test('a card of your own that makes no sense is refused in words', () => {
  const { library, calc } = start();
  const good = { name: 'x', store_id: 'store-kdp', format: 'paperback', channel: 'Direct', currency: 'USD', options: [{ name: 'Rate', rate: '0.5', deduct: [] }] };
  assert.doesNotThrow(() => calc.saveOwnCard(good));
  refused(() => calc.saveOwnCard({ ...good, options: [{ name: 'Rate', rate: '1.5' }] }), /more than 0% and at most 100%/);
  refused(() => calc.saveOwnCard({ ...good, options: [{ name: 'Rate', rate: '0' }] }), /more than 0%/);
  refused(() => calc.saveOwnCard({ ...good, options: [{ name: 'Rate', rate: 'half' }] }), /isn't a number/);
  refused(() => calc.saveOwnCard({ ...good, options: [{ name: 'A', rate: '0.5' }, { name: 'A', rate: '0.6' }] }), /Two rates are called "A"/);
  refused(() => calc.saveOwnCard({ ...good, options: [] }), /at least one rate/);
  refused(() => calc.saveOwnCard({ ...good, options: [{ name: '', rate: '0.5' }] }), /needs a name/);
  refused(() => calc.saveOwnCard({ ...good, options: [{ name: 'A', rate: '0.5', deduct: ['delivery'] }] }), /delivery cost per MB/);
  refused(() => calc.saveOwnCard({ ...good, options: [{ name: 'A', rate: '0.5', deduct: ['tax'] }] }), /isn't something the calculator knows/);
  refused(() => calc.saveOwnCard({ ...good, options: [{ name: 'A', rate: '0.5', price_min: '9', price_max: '5' }] }), /lowest price is above its highest/);
  refused(() => calc.saveOwnCard({ ...good, currency: 'dollars' }), /currency/);
  refused(() => calc.saveOwnCard({ ...good, store_id: 'store-nope' }), /Choose one of your stores/);
  refused(() => calc.saveOwnCard({ ...good, format: '  ' }), /Say which format/);
  refused(() => calc.saveOwnCard({ ...good, applies_from: '2026-02-30' }), /real date/);
  refused(() => calc.saveOwnCard({ ...good, applies_from: '2026-05-01', applies_until: '2026-04-01' }), /ends before it starts/);
  refused(() => calc.saveOwnCard({ ...good, based_on: 'not-a-card' }), /isn't one the app ships/);
  refused(() => calc.saveOwnCard({ id: 'nothing-here', ...good }), /isn't in your library/);
  refused(() => calc.removeOwnCard('nothing-here'), /isn't in your library/);
  library.close();
});

test('what is asked for has to make sense, and the answers say what to fix', () => {
  const { library, calc } = start();
  refused(() => calc.earn({ ...KDP, format: 'paperback', price: '12.99' }), /Enter the printing cost/);
  refused(() => calc.earn({ ...KDP, format: 'paperback', price: '12.99', printingCost: '-1' }), /can't be negative/);
  refused(() => calc.earn({ ...KDP, format: 'ebook', price: '4.99' }), /file's size in MB/);
  refused(() => calc.earn({ ...KDP, format: 'ebook', price: '4.99', fileMb: '0' }), /more than zero/);
  refused(() => calc.earn({ ...KDP, format: 'paperback', price: 'abc', printingCost: '4' }), /isn't a number/);
  refused(() => calc.earn({ ...KDP, format: 'paperback', price: '0', printingCost: '4' }), /more than zero/);
  refused(() => calc.earn({ ...KDP, format: 'paperback', price: '-5', printingCost: '4' }), /more than zero/);
  refused(() => calc.earn({ ...KDP, storeId: 'store-nope', format: 'paperback', price: '5', printingCost: '4' }), /Choose a store/);
  refused(() => calc.earn({ ...KDP, format: '', price: '5' }), /Choose a format/);
  refused(() => calc.earn({ ...KDP, currency: 'EUR', format: 'paperback', price: '5', printingCost: '4' }), /no rate card for .*paperback in EUR/);
  refused(() => calc.earn({ ...KDP, currency: 'xx', format: 'paperback', price: '5', printingCost: '4' }), /currency/);
  refused(() => calc.earn({ ...KDP, channel: 'Nowhere', format: 'paperback', price: '5', printingCost: '4' }), /no "Nowhere" card/);
  refused(() => calc.earn({ storeId: 'store-kdp', format: 'paperback', currency: 'USD', price: '12.99', printingCost: '4' }), /more than one card: choose/);
  refused(() => calc.earn({ ...KDP, format: 'paperback', price: '5', printingCost: '4', date: '2026-13-01' }), /real date/);
  library.close();
});

test('a price with more cents than the currency has is rounded once, half away from zero, as the stores do', () => {
  const { library, calc } = start();
  // a list price of 12.985 is 12.99 (half rounds up); the royalty is then worked out from 12.99
  const result = calc.earn({ ...KDP, format: 'paperback', price: '12.985', printingCost: '4.25' });
  assert.equal(result.price.amount, '12.99');
  assert.equal(get(result.options, '60% (list price $9.99 or more)').royalty.amount, '3.54');
  library.close();
});

test('the cards that ship are well formed, dated, sourced, and say whether they were read on the store\'s own page', () => {
  const stores = new Set(BUILT_IN_STORES.map(([id]) => id));
  const ids = new Set();
  for (const card of shipped.cards) {
    assert.ok(!ids.has(card.id), `${card.id} is used twice`);
    ids.add(card.id);
    assert.ok(stores.has(card.store_id), `${card.id}: ${card.store_id} is not a built-in store`);
    assert.ok(Number.isInteger(card.version) && card.version >= 1, `${card.id} has a version`);
    assert.match(card.currency, /^[A-Z]{3}$/);
    for (const key of ['applies_from', 'applies_until']) assert.ok(card[key] == null || isRealDate(card[key]), `${card.id}: ${key} is a real date`);
    assert.equal(typeof card.source?.verified, 'boolean', `${card.id} says whether it was read on the store's own page`);
    assert.match(card.source.url, /^https:\/\//, `${card.id} says where it came from`);
    assert.ok(card.source.checked_on == null || isRealDate(card.source.checked_on), `${card.id}: the day it was checked is a real date`);
    if (card.source.verified) assert.ok(card.source.checked_on, `${card.id} is marked read, so it says on which day`);
    assert.ok(card.options.length >= 1);
    assert.equal(new Set(card.options.map((o) => o.name)).size, card.options.length, `${card.id}: each rate has its own name`);
    for (const option of card.options) {
      assert.match(option.rate, /^0\.\d+$/, `${card.id}: ${option.name} is a rate between 0 and 1`);
      for (const kind of option.deduct ?? []) assert.ok(['delivery', 'printing'].includes(kind));
      if ((option.deduct ?? []).includes('delivery')) assert.ok(card.delivery?.per_mb && card.delivery?.minimum, `${card.id}: takes off delivery, so says how much`);
    }
  }
  // two cards for the same store, format, channel and currency never apply on the same day
  const groups = new Map();
  for (const card of shipped.cards) {
    const key = [card.store_id, card.format, card.channel, card.currency].join('|');
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  for (const [key, cards] of groups) {
    for (const a of cards) for (const b of cards) {
      if (a === b) continue;
      const overlap = (a.applies_from ?? '0000-00-00') <= (b.applies_until ?? '9999-99-99') && (b.applies_from ?? '0000-00-00') <= (a.applies_until ?? '9999-99-99');
      assert.ok(!overlap, `${key}: ${a.id} and ${b.id} apply on the same days`);
    }
  }
});

test('every card that ships can be asked about, with the inputs it says it needs', () => {
  const { library, calc } = start();
  const names = new Map(BUILT_IN_STORES.map(([id, name]) => [id, name]));
  for (const card of shipped.cards) {
    const date = card.applies_from ?? card.applies_until ?? '2026-11-18';
    const answer = calc.earn({ storeId: card.store_id, format: card.format, channel: card.channel, currency: card.currency, price: '14.99', date, printingCost: '4.00', fileMb: '1.2' });
    assert.equal(answer.card.id, card.id, `${names.get(card.store_id)} ${card.format}`);
    assert.ok(answer.options.length === card.options.length);
    assert.match(answer.says, /estimate for planning/);
  }
  library.close();
});

// ---- Through the doorway the window uses, and out through Export -------------------------------------------------------------

const { createApi } = require('../src/main/api');
const { exportAll } = require('../src/main/export');

test('the window can ask for cards, a price, a price backwards, and make and remove a card of its own, and a mistake comes back in words', () => {
  const library = new Library(temp()).open();
  const { call } = createApi(library, { now: () => TODAY, locale: 'en-US' });
  const ok = (name, args) => { const r = call(name, args); assert.equal(r.ok, true, JSON.stringify(r)); return r.value; };

  const cards = ok('rateCards', {});
  assert.ok(cards.length >= 5 && cards.every((c) => c.source !== undefined && c.store));
  assert.ok(ok('rateCards', { date: '2026-07-06' }).some((c) => c.id === 'kdp-ebook-usd-before-2026-07-07'), 'the cards in force on a date');

  const earned = ok('earn', { ...KDP, storeId: 'store-kdp', format: 'paperback', price: '12.99', printingCost: '4.25' });
  assert.equal(earned.options[1].royalty.amount, '3.54');
  assert.equal(typeof earned.options[1].royalty.minor, 'string', 'an amount of money crosses as text, never as a number that could lose cents');
  const back = ok('priceFor', { storeId: 'store-kdp', channel: 'Amazon.com', currency: 'USD', format: 'paperback', want: '3.00', printingCost: '4.25' });
  assert.equal(back.cheapest, '60% (list price $9.99 or more)');

  const mine = ok('saveRateCard', { name: 'Direct sales', store_id: 'store-kdp', format: 'paperback', channel: 'Direct', currency: 'USD', options: [{ name: '90%', rate: '0.9' }] });
  assert.equal(ok('rateCards', {}).filter((c) => c.own).length, 1);
  assert.equal(ok('removeRateCard', { id: mine.id }), true);

  for (const [name, args] of [['earn', { storeId: 'store-kdp', format: 'paperback', channel: 'Amazon.com', currency: 'USD', price: '12.99' }], ['priceFor', {}], ['saveRateCard', {}], ['removeRateCard', { id: 'x' }], ['rateCards', { date: 'tomorrow' }]]) {
    const refusedCall = call(name, args);
    assert.equal(refusedCall.ok, false, name);
    assert.ok(/^[A-Z]/.test(refusedCall.message) && !/Error|undefined|at \/|\.js/.test(refusedCall.message), `${name}: ${refusedCall.message}`);
  }
  library.close();
});

test('a rate card of your own is in the export, with the store\'s name beside it', () => {
  const { library, calc } = start();
  calc.saveOwnCard({ name: 'My print deal', store_id: 'store-kdp', format: 'paperback', channel: 'Direct', currency: 'USD', options: [{ name: '65%', rate: '0.65', deduct: ['printing'] }] });
  const made = exportAll(library, temp(), { now: () => TODAY, version: '1.1.0' });
  assert.equal(made.counts.own_rate_cards, 1);
  const json = JSON.parse(fs.readFileSync(path.join(made.folder, 'library.json'), 'utf8'));
  assert.equal(json.tables.own_rate_cards[0].name, 'My print deal');
  const csv = fs.readFileSync(path.join(made.folder, 'csv', 'own-rate-cards.csv'), 'utf8');
  assert.match(csv, /My print deal/);
  assert.match(csv, /store_name/);
  assert.match(csv, /KDP/);
  library.close();
});
