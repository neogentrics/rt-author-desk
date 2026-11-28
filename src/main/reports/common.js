'use strict';
// What the readers built from a store's own description share: finding columns by their headings, reading amounts without guessing, and
// settling which way a date is written. `refuse(message)` makes the reader's own error, so each says whose report it is about.
const { readDate, readNumber } = require('./mapped');
const { parseDecimal, roundTo } = require('../../shared/money');

const blank = (cells) => cells.every((cell) => String(cell ?? '').trim() === '');

// Where each needed heading is, which are missing and which are there twice. `columns` is { field: heading }, and `keyOf` says how two
// headings are compared.
function findColumns(header, columns, keyOf) {
  const keys = header.map(keyOf);
  const at = {};
  const missing = [];
  const twice = [];
  for (const [field, name] of Object.entries(columns)) {
    const key = keyOf(name);
    const first = keys.indexOf(key);
    if (first < 0) missing.push(name);
    else if (keys.indexOf(key, first + 1) >= 0) twice.push(name);
    at[field] = first;
  }
  return { at, missing, twice };
}

const quoted = (names) => names.map((name) => `"${name}"`).join(', ');

// Which comes first in a date such as 03/04/2026. The file settles it when any date in it can only be read one way. When it doesn't and a
// date could be read both ways, `order` is null until the person says, and `ask` holds the question.
function dateOrderOf(texts, asked, { report, refuse }) {
  let monthFirst = false;
  let dayFirst = false;
  let unsure = null;
  for (const text of texts) {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}/.exec(text);
    if (!m) continue;
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a > 12) dayFirst = true;
    else if (b > 12) monthFirst = true;
    else if (a !== b) unsure ??= text;
  }
  if (monthFirst && dayFirst) throw refuse(`${report} writes some sale dates with the month first and some with the day first, so the app can't read them.`);
  if (monthFirst) return { order: 'month-first' };
  if (dayFirst) return { order: 'day-first' };
  if (!unsure) return { order: 'month-first' }; // every date reads the same either way, or is written year first or in words
  if (asked === 'month-first' || asked === 'day-first') return { order: asked, ask: { example: unsure, chosen: asked } };
  return { order: null, ask: { example: unsure, chosen: null } };
}

// The same day written another way, or read with the month and day the other way round, gives the same key, so choosing a date order
// differently one time can't make a sale count twice.
const dayKey = (iso) => {
  const [year, ...rest] = iso.split('-');
  return [year, ...rest.sort()].join('-');
};

// A number as a cell holds it, with a point for the cents. A comma is only taken between thousands, so a number written with a comma for the
// point is refused rather than read a hundred times too big. A workbook can store a number with an exponent, which is read too.
function amountOf(text) {
  const t = String(text ?? '').trim();
  if (/^-?\d+(?:\.\d+)?[eE][+-]?\d{1,3}$/.test(t)) return { text: t };
  const read = readNumber(t, '.');
  if (read.empty) return { empty: true };
  if (read.problem || (t.includes(',') && !/^\D*\d{1,3}(?:,\d{3})+(?:\.\d+)?\D*$/.test(t))) return { problem: true };
  return read;
}

// A number exactly as written, without the crumbs a spreadsheet leaves far past the point (2.07 is stored as 2.0699999999999998).
const CRUMBS = 8;
const cleaned = (text, places) => {
  const exact = parseDecimal(text);
  return exact.scale > places + CRUMBS ? { digits: roundTo(exact, places + CRUMBS), scale: places + CRUMBS } : exact;
};
// True when a figure really has more places than the currency does.
const finerThan = (exact, places) => exact.scale > places && exact.digits % 10n ** BigInt(exact.scale - places) !== 0n;

module.exports = { amountOf, blank, cleaned, dateOrderOf, dayKey, findColumns, finerThan, quoted, readDate };
