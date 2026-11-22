'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CsvError, decodeText, detectDelimiter, parseCsv, stringifyCsv } = require('../src/shared/csv');

test('plain rows, quoted cells with commas, doubled quotes and new lines inside quotes', () => {
  const text = 'Title,Notes\r\n"Tide, and Time","She said ""no"""\r\nTwo Lines,"first\nsecond"\r\n';
  assert.deepEqual(parseCsv(text), [['Title', 'Notes'], ['Tide, and Time', 'She said "no"'], ['Two Lines', 'first\nsecond']]);
});

test('every kind of line ending, a missing final newline, and blank lines', () => {
  assert.deepEqual(parseCsv('a,b\nc,d'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseCsv('a,b\rc,d\r'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseCsv('a,b\r\n\r\n,\r\nc,d\r\n'), [['a', 'b'], ['c', 'd']], 'a row of nothing is dropped');
  assert.deepEqual(parseCsv(''), []);
});

test('empty cells stay in their place, and spaces are kept as typed', () => {
  assert.deepEqual(parseCsv('a,,c\n, x ,'), [['a', '', 'c'], ['', ' x ', '']]);
});

test('the delimiter is found: comma, semicolon or tab', () => {
  assert.equal(detectDelimiter('Title,Series,Status\n'), ',');
  assert.equal(detectDelimiter('Title;Series;Status\n'), ';');
  assert.equal(detectDelimiter('Title\tSeries\tStatus\n'), '\t');
  assert.equal(detectDelimiter('"A, B";C;D\n'), ';', 'a comma inside quotes does not count');
  assert.equal(detectDelimiter('Title\n'), ',');
  assert.deepEqual(parseCsv('Title;Notes\n"a;b";c'), [['Title', 'Notes'], ['a;b', 'c']]);
});

test('a quote that never closes is an error in words, not a guess', () => {
  assert.throws(() => parseCsv('a,"b\nc,d'), (e) => e instanceof CsvError && /never closed/.test(e.message));
});

test('limits stop a file that is not a spreadsheet', () => {
  assert.throws(() => parseCsv('a\nb\nc\n', { maxRows: 2 }), /too many/);
  assert.throws(() => parseCsv(`a,${'x'.repeat(50)}`, { maxCell: 10 }), /too long/);
});

test('text is read as UTF-8 with or without a byte order mark, or as Windows-1252 when it is not UTF-8', () => {
  assert.equal(decodeText(Buffer.from('\uFEFFTitle,Café\n', 'utf8')).text, 'Title,Café\n');
  assert.equal(decodeText(Buffer.from('Title,Café\n', 'utf8')).encoding, 'UTF-8');
  const old = Buffer.from([0x43, 0x61, 0x66, 0xe9, 0x20, 0x92]); // "Café ’" in Windows-1252
  assert.deepEqual([decodeText(old).text, decodeText(old).encoding], ['Café ’', 'Windows-1252']);
  const sixteen = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Title\n', 'utf16le')]);
  assert.equal(decodeText(sixteen).text, 'Title\n');
});

test('what is written can be read back exactly, with spreadsheet formulas made harmless only when asked', () => {
  const rows = [['Title', 'Notes'], ['Tide, and "Time"', 'line one\nline two'], ['  padded  ', ''], ['=SUM(A1)', '+1 555'], ['-5', '-note'], ['@home', '2']];
  const exact = stringifyCsv(rows, { safe: false });
  assert.deepEqual(parseCsv(exact), rows);
  const safe = parseCsv(stringifyCsv(rows));
  assert.equal(safe[3][0], "'=SUM(A1)");
  assert.equal(safe[3][1], "'+1 555");
  assert.equal(safe[4][0], '-5', 'a negative number is a number, not a formula');
  assert.equal(safe[4][1], "'-note");
  assert.equal(safe[5][0], "'@home");
  assert.equal(safe[1][0], 'Tide, and "Time"');
  assert.ok(stringifyCsv([['a']]).endsWith('\r\n'));
});
