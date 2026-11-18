'use strict';
// ISBN checks: read a number the way people write it, say whether its check digit is right, and turn an ISBN-10 into
// its ISBN-13. Pure functions with no database, so the catalog, the clash checks and the report matcher all share them.
// Hyphen placement needs the registration-group tables, so it's left out: numbers are stored as bare digits.

// Removes spaces, hyphens and a leading "ISBN" label. A trailing x on an ISBN-10 is the digit ten.
function clean(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/^\s*ISBN(?:-1[03])?\s*:?\s*/i, '').replace(/[\s‐-―-]/g, '').toUpperCase();
}

function check13(digits) {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function check10(digits) {
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
  const remainder = (11 - (sum % 11)) % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

// Says what the text is and whether it can be used. `reason` is plain words for the person who typed it.
//   { ok: true, isbn13: '978…', kind: 10 | 13, converted: boolean }
//   { ok: false, reason }
function parseIsbn(input) {
  const text = clean(input);
  if (text === '') return { ok: false, reason: 'No number was entered.' };
  if (/^\d{13}$/.test(text)) {
    if (!/^97[89]/.test(text)) return { ok: false, reason: 'An ISBN-13 starts with 978 or 979.' };
    const expected = check13(text);
    if (Number(text[12]) !== expected) {
      return { ok: false, reason: `The last digit should be ${expected}. A digit was probably mistyped.` };
    }
    return { ok: true, isbn13: text, kind: 13, converted: false };
  }
  if (/^\d{9}[\dX]$/.test(text)) {
    const expected = check10(text);
    if (text[9] !== expected) {
      return { ok: false, reason: `The last character should be ${expected}. A digit was probably mistyped.` };
    }
    const body = `978${text.slice(0, 9)}`;
    return { ok: true, isbn13: body + check13(body), kind: 10, converted: true };
  }
  if (/[^\dX]/.test(text)) return { ok: false, reason: 'An ISBN holds only digits, with an X allowed at the end of a 10-digit one.' };
  return { ok: false, reason: `An ISBN has 10 or 13 digits, and this has ${text.length}.` };
}

const isValidIsbn = (input) => parseIsbn(input).ok;

// The same number, grouped for reading: 978 1 23456 789 7 is not possible without range tables, so it's shown in one
// run with the prefix and check digit separated.
function displayIsbn(isbn13) {
  return /^\d{13}$/.test(isbn13) ? `${isbn13.slice(0, 3)}-${isbn13.slice(3, 12)}-${isbn13[12]}` : isbn13;
}

module.exports = { check10, check13, clean, displayIsbn, isValidIsbn, parseIsbn };
