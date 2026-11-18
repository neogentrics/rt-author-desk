'use strict';
// Money rules, from docs/design/data-model.md: an amount is a whole number of the currency's smallest unit, with its
// currency beside it. No floating-point number ever holds money, so totals always add up.

const CODE = /^[A-Z]{3}$/;
const exponents = new Map();

class MoneyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MoneyError';
  }
}

// How many digits after the point a currency has: 2 for dollars, 0 for yen. Taken from the ICU data that Node and
// Electron ship, so it needs no table of our own. An unknown code is refused rather than guessed.
function exponentOf(currency) {
  if (typeof currency !== 'string' || !CODE.test(currency)) throw new MoneyError(`Not a currency code: ${currency}`);
  if (!exponents.has(currency)) {
    // Intl accepts any three letters, so the code has to be a real one first.
    if (!Intl.supportedValuesOf('currency').includes(currency)) throw new MoneyError(`Unknown currency: ${currency}`);
    let digits;
    try {
      digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
    } catch {
      throw new MoneyError(`Unknown currency: ${currency}`);
    }
    exponents.set(currency, digits);
  }
  return exponents.get(currency);
}

// Reads a decimal written as text, such as "1,234.56", "-0.35", "(2.00)" or "2.0699999999999998" (how a spreadsheet
// stores 2.07), into an exact fraction: digits as a BigInt and how many of them come after the point.
function parseDecimal(input) {
  if (typeof input === 'bigint') return { digits: input, scale: 0 };
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new MoneyError(`Not a number: ${input}`);
    input = String(input);
  }
  if (typeof input !== 'string') throw new MoneyError(`Not an amount: ${input}`);
  let text = input.trim().replace(/[\s,]/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  const match = /^([+-])?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) throw new MoneyError(`Not an amount: "${input}"`);
  if (match[1] === '-') negative = !negative;
  const whole = match[2] || '0';
  const fraction = match[3] ?? '';
  let scale = fraction.length - Number(match[4] ?? 0);
  let digits = BigInt(whole + fraction);
  if (scale < 0) {
    digits *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { digits: negative ? -digits : digits, scale };
}

// Rounds a fraction to a given number of places, half away from zero, the way the stores' own calculators round.
function roundTo({ digits, scale }, places) {
  if (scale <= places) return digits * 10n ** BigInt(places - scale);
  const divisor = 10n ** BigInt(scale - places);
  const quotient = digits / divisor;
  const remainder = digits % divisor;
  const twice = (remainder < 0n ? -remainder : remainder) * 2n;
  if (twice >= divisor) return quotient + (digits < 0n ? -1n : 1n);
  return quotient;
}

function money(minor, currency) {
  exponentOf(currency);
  if (typeof minor !== 'bigint') throw new MoneyError('An amount must be a BigInt of the smallest unit.');
  return Object.freeze({ minor, currency });
}

// An amount from a report or a form. Extra digits are rounded once, here, and never again.
function parseMoney(input, currency) {
  return money(roundTo(parseDecimal(input), exponentOf(currency)), currency);
}

const zero = (currency) => money(0n, currency);

function add(a, b) {
  if (a.currency !== b.currency) throw new MoneyError(`Can't add ${a.currency} to ${b.currency}. Convert one first.`);
  return money(a.minor + b.minor, a.currency);
}

const negate = (a) => money(-a.minor, a.currency);

// Totals by currency. Amounts are never added across currencies.
function totals(amounts) {
  const out = new Map();
  for (const amount of amounts) out.set(amount.currency, add(out.get(amount.currency) ?? zero(amount.currency), amount));
  return out;
}

// Converts with a rate you can see, written as text so it stays exact: "0.7834" means one unit of `a` is 0.7834 units
// of `currency`. The result is rounded once, to the new currency's smallest unit.
function convert(a, currency, rate) {
  const r = parseDecimal(rate);
  if (r.digits <= 0n) throw new MoneyError(`A rate must be more than zero: ${rate}`);
  const from = exponentOf(a.currency);
  const product = { digits: a.minor * r.digits, scale: from + r.scale };
  return money(roundTo(product, exponentOf(currency)), currency);
}

// Multiplies by a share written as text, such as "0.70" for a 70% royalty. Used by the calculator.
function multiply(a, factor) {
  const f = parseDecimal(factor);
  return money(roundTo({ digits: a.minor * f.digits, scale: f.scale }, 0), a.currency);
}

// "1234.50": a plain decimal, for files and tests. Never for showing to a person: use format().
function toDecimalString(a) {
  const places = exponentOf(a.currency);
  const negative = a.minor < 0n;
  const text = (negative ? -a.minor : a.minor).toString().padStart(places + 1, '0');
  const whole = places ? text.slice(0, -places) : text;
  return `${negative ? '-' : ''}${whole}${places ? `.${text.slice(-places)}` : ''}`;
}

// For a person to read, in their own locale. Intl takes a decimal string, so no precision is lost on the way.
function format(a, locale = undefined) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: a.currency }).format(toDecimalString(a));
}

const equals = (a, b) => a.currency === b.currency && a.minor === b.minor;

// For JSON and the database: the smallest unit as text, because JSON has no BigInt.
const toJSON = (a) => ({ minor: a.minor.toString(), currency: a.currency });
const fromJSON = (data) => money(BigInt(data.minor), data.currency);

module.exports = {
  MoneyError, add, convert, equals, exponentOf, format, fromJSON, money, multiply, negate, parseDecimal, parseMoney,
  roundTo, toDecimalString, toJSON, totals, zero,
};
