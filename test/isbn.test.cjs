'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { clean, displayIsbn, isValidIsbn, parseIsbn } = require('../src/shared/isbn');

// Textbook example numbers, not anyone's books.
test('reads an ISBN-13 however it is written', () => {
  for (const text of ['9780306406157', '978-0-306-40615-7', '978 0 306 40615 7', 'ISBN 978-0-306-40615-7', 'isbn-13: 9780306406157']) {
    assert.deepEqual(parseIsbn(text), { ok: true, isbn13: '9780306406157', kind: 13, converted: false }, text);
  }
});

test('turns an ISBN-10 into its ISBN-13, including one that ends in X', () => {
  assert.deepEqual(parseIsbn('0-306-40615-2'), { ok: true, isbn13: '9780306406157', kind: 10, converted: true });
  assert.equal(parseIsbn('080442957x').isbn13, '9780804429573');
});

test('a wrong check digit is refused and says what it should be', () => {
  const bad13 = parseIsbn('9780306406158');
  assert.equal(bad13.ok, false);
  assert.match(bad13.reason, /should be 7/);
  const bad10 = parseIsbn('0306406153');
  assert.equal(bad10.ok, false);
  assert.match(bad10.reason, /should be 2/);
});

test('refuses the wrong length, wrong prefix, letters and nothing at all', () => {
  assert.match(parseIsbn('97803064061').reason, /10 or 13 digits.*11/);
  assert.match(parseIsbn('9771234567898').reason, /978 or 979/);
  assert.match(parseIsbn('97803064O6157').reason, /only digits/);
  assert.match(parseIsbn('').reason, /No number/);
  assert.match(parseIsbn(null).reason, /No number/);
  assert.equal(isValidIsbn('9780306406157'), true);
  assert.equal(isValidIsbn('9780306406150'), false);
});

test('a single mistyped digit or a swap of neighbours is caught', () => {
  const good = '9780306406157';
  for (let i = 0; i < 12; i += 1) {
    const changed = good.slice(0, i) + String((Number(good[i]) + 1) % 10) + good.slice(i + 1);
    assert.equal(isValidIsbn(changed), false, `digit ${i} changed`);
  }
  // Swapping neighbours is caught unless the two digits differ by 5 (a known limit of the ISBN-13 check).
  assert.equal(isValidIsbn('9780306406517'), false);
});

test('displays a number with its prefix and check digit apart, and stores bare digits', () => {
  assert.equal(clean('978-0-306-40615-7'), '9780306406157');
  assert.equal(displayIsbn('9780306406157'), '978-030640615-7');
  assert.equal(displayIsbn('not a number'), 'not a number');
});
