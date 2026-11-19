'use strict';
// Dates in the library are plain calendar days written year-month-day, with no time and no time zone: a release date is
// the same day everywhere. These helpers never go through the computer's time zone.

// True only for a day that exists. The database's own check catches the shape, this catches 2027-02-30.
function isRealDate(text) {
  if (typeof text !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= lengths[month - 1];
}

// Whole days from one date to another: positive when `to` is later.
function daysBetween(from, to) {
  if (!isRealDate(from) || !isRealDate(to)) throw new Error(`Not a real date: ${!isRealDate(from) ? from : to}`);
  const day = (text) => Date.UTC(...text.split('-').map((part, i) => (i === 1 ? Number(part) - 1 : Number(part)))) / 86_400_000;
  return Math.round(day(to) - day(from));
}

// Today as a plain date, from a clock that tests can replace.
function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

module.exports = { daysBetween, isRealDate, today };
