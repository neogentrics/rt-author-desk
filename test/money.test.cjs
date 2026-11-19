'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/shared/money');

test('reads amounts exactly, including how spreadsheets store them', () => {
  assert.equal(m.toDecimalString(m.parseMoney('2.0699999999999998', 'USD')), '2.07');
  assert.equal(m.toDecimalString(m.parseMoney('1,234.5', 'USD')), '1234.50');
  assert.equal(m.toDecimalString(m.parseMoney('(2.00)', 'USD')), '-2.00');
  assert.equal(m.toDecimalString(m.parseMoney('-0.005', 'USD')), '-0.01');
  assert.equal(m.toDecimalString(m.parseMoney('1.5E-2', 'EUR')), '0.02');
  assert.equal(m.toDecimalString(m.parseMoney(4.99, 'GBP')), '4.99');
});

test('knows how many digits each currency has, and refuses unknown codes', () => {
  assert.equal(m.exponentOf('USD'), 2);
  assert.equal(m.exponentOf('JPY'), 0);
  assert.equal(m.toDecimalString(m.parseMoney('1234.5', 'JPY')), '1235');
  assert.throws(() => m.parseMoney('1', 'usd'), m.MoneyError);
  assert.throws(() => m.parseMoney('1', 'XQZ'), m.MoneyError);
  assert.throws(() => m.parseMoney('one', 'USD'), m.MoneyError);
});

test('adds without drift, and never across currencies', () => {
  const tenCents = m.parseMoney('0.1', 'USD');
  let sum = m.zero('USD');
  for (let i = 0; i < 1000; i += 1) sum = m.add(sum, tenCents);
  assert.equal(m.toDecimalString(sum), '100.00');
  assert.throws(() => m.add(tenCents, m.parseMoney('1', 'GBP')), /Convert one first/);
  const t = m.totals([tenCents, m.parseMoney('1', 'GBP'), tenCents]);
  assert.equal(m.toDecimalString(t.get('USD')), '0.20');
  assert.equal(m.toDecimalString(t.get('GBP')), '1.00');
});

test('converts with a visible rate, rounding once', () => {
  assert.equal(m.toDecimalString(m.convert(m.parseMoney('2.74', 'GBP'), 'USD', '1.2645')), '3.46');
  assert.equal(m.toDecimalString(m.convert(m.parseMoney('100', 'USD'), 'JPY', '151.237')), '15124');
  assert.throws(() => m.convert(m.parseMoney('1', 'USD'), 'EUR', '0'), m.MoneyError);
});

test('works out a royalty share exactly', () => {
  assert.equal(m.toDecimalString(m.multiply(m.parseMoney('9.99', 'USD'), '0.60')), '5.99');
  assert.equal(m.toDecimalString(m.multiply(m.parseMoney('4.99', 'USD'), '0.35')), '1.75');
});

test('round-trips through JSON', () => {
  const a = m.parseMoney('123456789012345.67', 'USD');
  assert.ok(m.equals(m.fromJSON(JSON.parse(JSON.stringify(m.toJSON(a)))), a));
});
