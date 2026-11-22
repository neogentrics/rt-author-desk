'use strict';
// Files that someone else made and the app opens: a sales report, a spreadsheet saved as CSV, a backup. Each one is treated as if it was made to
// do harm, and these tests are the proof that it can't: nothing in one can run, expand into something huge, make the app wait for minutes, or
// leave anything in the library that the app itself does not make. The last test is about the project's own files.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { strToU8, unzipSync, zipSync } = require('fflate');
const { BackupError, createBackup, restoreBackup, verifyBackup } = require('../src/main/backups');
const { BookImportError, BookImporter, cleanRelation, parseDateText } = require('../src/main/books-import');
const { readWorkbook, WorkbookError } = require('../src/main/reports/xlsx');
const { Library } = require('../src/main/storage/library');
const { KEY_FILE, createKeys, openWithAppSlot } = require('../src/main/storage/keys');
const { migrate, openDatabase } = require('../src/main/storage/database');
const { STEPS } = require('../src/main/storage/schema');
const { parseCsv, stringifyCsv } = require('../src/shared/csv');
const { makeXlsx } = require('./helpers/make-xlsx.cjs');

const ROOT = path.join(__dirname, '..');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const NOW = new Date('2026-11-18T14:30:05.123Z');

// ---- A spreadsheet that has been made to run something -----------------------------------------------------------------

test('a cell that starts like a formula is written so that a spreadsheet will not run it', () => {
  const written = (value) => stringifyCsv([[value]]).trimEnd();
  for (const hostile of ['=1+1', '+1+1', '@SUM(A1)', '-1+1', '-2+3+cmd|\' /C calc\'!A0', '-abc', '-', '-@A1', '=HYPERLINK("http://example.test","x")', '\tcmd', '\rcmd']) {
    assert.ok(written(hostile).replace(/^"/, '').startsWith('\''), `${JSON.stringify(hostile)} should start with a quote mark, and is ${JSON.stringify(written(hostile))}`);
  }
  assert.equal(written('-2+3+cmd|\' /C calc\'!A0'), '\'-2+3+cmd|\' /C calc\'!A0', 'what follows the mark is kept exactly');
  assert.equal(written('-1+1'), '\'-1+1');
});

test('a plain negative number is left alone, because that is what an export of money has in it', () => {
  for (const number of ['-5', '-5.25', '-12.99', '-1,234.50', '-12,5', '-0', '12.99', '0', '1,234.50']) {
    assert.equal(stringifyCsv([[number]]).trimEnd(), number.includes(',') ? `"${number}"` : number);
  }
});

test('what the app writes comes back the same when it is read again', () => {
  const rows = [['=1+1', '-1+1', '-12.99', 'a, b', 'say "hi"', 'two\nlines']];
  const back = parseCsv(stringifyCsv(rows))[0];
  assert.deepEqual(back, ['\'=1+1', '\'-1+1', '-12.99', 'a, b', 'say "hi"', 'two\nlines'], 'only the formula starts gain a mark, and everything else is as it was');
});

// ---- A list of books that has been made to make the app wait -----------------------------------------------------------

test('cells made to make the matching crawl are cut short, so a file of them is read at once', () => {
  // A cell is trimmed when the file is read, so each one starts and ends with something that is not a space, and has a long run of them in the middle.
  const spaces = ' '.repeat(30_000);
  const half = ' '.repeat(15_000);
  const lines = ['Title,Series,Pen Name,Release Date,Formats'];
  for (let i = 0; i < 10; i += 1) lines.push(`Book ${i},x${spaces}(http://,x${spaces}(http://,1${spaces}2,x${half}and${half}y`);
  const library = new Library(temp()).open();
  const importer = new BookImporter(library);
  const began = Date.now();
  const opened = importer.open(Buffer.from(lines.join('\n'), 'utf8'), 'hostile.csv');
  const planned = importer.plan({ id: opened.id, mapping: opened.guess });
  const took = Date.now() - began;
  assert.equal(planned.rowCount, 10);
  // Before this was fixed a file like this took well over half a minute. Now it takes a fraction of a second, and this is generous for a slow machine.
  assert.ok(took < 5000, `reading it took ${took} ms`);
  library.close();
});

test('the two readers of messy text do not slow down however long the text is', () => {
  const began = Date.now();
  for (let i = 0; i < 20; i += 1) {
    cleanRelation(`${' '.repeat(32_000)}(http://`);
    cleanRelation('(http://'.repeat(4000));
    parseDateText(`${' '.repeat(32_000)} to ${' '.repeat(32_000)}`);
    parseDateText('1'.repeat(32_000));
  }
  assert.ok(Date.now() - began < 5000, `took ${Date.now() - began} ms`);
  assert.deepEqual(cleanRelation('Name (https://www.notion.so/a-b) '), { name: 'Name', several: false }, 'and the ordinary case still works');
  assert.equal(parseDateText('March 1, 2025 to March 9, 2025').iso, '2025-03-01', 'a range is still its first day');
});

test('a cell longer than a spreadsheet allows is refused, in words', () => {
  const library = new Library(temp()).open();
  const importer = new BookImporter(library);
  assert.throws(() => importer.open(Buffer.from(`Title\n${'x'.repeat(40_000)}`), 'big.csv'), (e) => e instanceof BookImportError && /far too long/.test(e.message));
  assert.doesNotThrow(() => importer.open(Buffer.from(`Title\n${'x'.repeat(32_000)}`), 'fine.csv'), 'one that a spreadsheet could hold is read');
  library.close();
});

// ---- A workbook that has been made to expand --------------------------------------------------------------------------

// A workbook with one of its parts replaced by this text.
function workbookWith(part, xml) {
  const parts = unzipSync(new Uint8Array(makeXlsx([{ name: 'Summary', rows: [['Date', 'Units'], ['2026-09-01', 4]] }])));
  parts[part] = strToU8(xml);
  return Buffer.from(zipSync(parts));
}

test('a workbook that declares a document type or an entity is refused before it is read', () => {
  const sheet = (head) => `<?xml version="1.0"?>${head}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&lol9;</t></is></c></row></sheetData></worksheet>`;
  const laughs = '<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;"><!ENTITY lol9 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">]>';
  for (const [part, head] of [['xl/worksheets/sheet1.xml', laughs], ['xl/workbook.xml', laughs], ['xl/sharedStrings.xml', '<!DOCTYPE sst>'], ['xl/worksheets/sheet1.xml', '<!ENTITY x "y">'], ['xl/worksheets/sheet1.xml', '<!doctype x>']]) {
    assert.throws(() => readWorkbook(workbookWith(part, sheet(head))), (e) => e instanceof WorkbookError && /isn't an Excel workbook/.test(e.message), `${part} with ${head.slice(0, 20)}`);
  }
});

test('a real workbook is still read, and a file that is not a workbook is refused in words', () => {
  const book = readWorkbook(makeXlsx([{ name: 'Summary', rows: [['Date', 'Units'], ['2026-09-01', 4]] }]));
  assert.equal(book.sheets[0].name, 'Summary');
  assert.throws(() => readWorkbook(Buffer.from('this is not a zip file')), (e) => e instanceof WorkbookError);
});

test('a workbook that claims to hold more than a sales report ever could is refused without being unpacked', () => {
  const bytes = Buffer.from(makeXlsx([{ name: 'Summary', rows: [['Date', 'Units'], ['2026-09-01', 4]] }]));
  claimSize(bytes, 'xl/workbook.xml', 0x7fffffff); // two gigabytes, written in the list at the end of the file
  assert.throws(() => readWorkbook(bytes), (e) => e instanceof WorkbookError);
});

// ---- A backup that someone else made --------------------------------------------------------------------------------------

// Changes what a zip file says about how big one of its parts is, in the list at its end, and nothing else. Changes the bytes it is given.
function claimSize(bytes, name, size, { compressed = false } = {}) {
  let changed = 0;
  for (let at = 0; at + 46 < bytes.length; at += 1) {
    if (bytes.readUInt32LE(at) !== 0x02014b50) continue;
    const length = bytes.readUInt16LE(at + 28);
    if (bytes.toString('utf8', at + 46, at + 46 + length) !== name) continue;
    bytes.writeUInt32LE(size >>> 0, at + 24);
    if (compressed) bytes.writeUInt32LE(size >>> 0, at + 20);
    changed += 1;
  }
  assert.equal(changed, 1, `${name} should be listed once`);
  return bytes;
}

function startLibrary() {
  const userData = temp();
  const library = new Library(path.join(userData, 'library')).open();
  library.db.prepare("INSERT INTO books (id, title, created_at, updated_at, device_id) VALUES ('b1', 'Tidewater', 'x', 'x', 'a-device')").run();
  return { userData, library };
}

// A real backup, with its library changed the way anyone could change it: the key a backup is closed with is the app's own and is the same
// on every computer, so the library inside is not a secret from whoever made the file, and it can be changed.
function backupWith(file, sql) {
  const parts = unzipSync(new Uint8Array(fs.readFileSync(file)));
  const work = temp();
  fs.writeFileSync(path.join(work, KEY_FILE), parts[KEY_FILE]);
  fs.writeFileSync(path.join(work, 'library.db'), parts['library.db']);
  const key = openWithAppSlot(work);
  const db = openDatabase(path.join(work, 'library.db'), key);
  key.fill(0);
  db.exec(sql);
  db.close();
  const made = path.join(temp(), 'changed.rtadbackup');
  fs.writeFileSync(made, Buffer.from(zipSync({ ...parts, 'library.db': new Uint8Array(fs.readFileSync(path.join(work, 'library.db'))) }, { level: 0 })));
  return made;
}

const refusedBackup = (fn, pattern) => assert.throws(fn, (e) => e instanceof BackupError && pattern.test(e.message), String(pattern));

test('a backup whose library holds a trigger, a view, a table or an index the app never makes is refused', () => {
  const { library } = startLibrary();
  const made = createBackup(library, temp(), { now: () => NOW, version: '1.0.0' });
  for (const sql of [
    "CREATE TRIGGER sneaky AFTER INSERT ON books BEGIN UPDATE books SET notes = 'changed'; END",
    'CREATE VIEW sneaky AS SELECT * FROM books',
    'CREATE TABLE sneaky (what)',
    'CREATE INDEX sneaky ON books (title)',
  ]) {
    refusedBackup(() => verifyBackup(backupWith(made.file, sql)), /never makes/);
  }
  library.close();
});

test('a backup that is not at a step this app knows, or is not marked as this app\'s, is refused', () => {
  const { library } = startLibrary();
  const made = createBackup(library, temp(), { now: () => NOW });
  refusedBackup(() => verifyBackup(backupWith(made.file, 'PRAGMA application_id = 12345')), /isn't a library made by this app/);
  refusedBackup(() => verifyBackup(backupWith(made.file, 'PRAGMA user_version = 0')), /isn't a library made by this app/);
  library.close();
});

test('a refused restore changes nothing: the library that was there is still there, and not moved', () => {
  const { userData, library } = startLibrary();
  const made = createBackup(library, temp(), { now: () => NOW });
  library.close();
  const hostile = backupWith(made.file, "CREATE TRIGGER sneaky AFTER INSERT ON books BEGIN UPDATE books SET notes = 'changed'; END");
  const before = fs.readdirSync(userData).sort();
  refusedBackup(() => restoreBackup({ userData, file: hostile }), /never makes/);
  assert.deepEqual(fs.readdirSync(userData).sort(), before, 'nothing was moved aside and nothing was added');
  const again = new Library(path.join(userData, 'library')).open();
  assert.equal(again.db.prepare('SELECT count(*) AS n FROM books').get().n, 1, 'the book is still there');
  again.close();
});

test('a backup that is compressed, or that says a part is a different size than it is, is refused before anything is made room for', () => {
  const { library } = startLibrary();
  const made = createBackup(library, temp(), { now: () => NOW });
  const parts = unzipSync(new Uint8Array(fs.readFileSync(made.file)));
  const file = (name, bytes) => { const f = path.join(temp(), name); fs.writeFileSync(f, bytes); return f; };

  refusedBackup(() => verifyBackup(file('squeezed.rtadbackup', Buffer.from(zipSync(parts, { level: 6 })))), /isn't a backup this app made/);

  const plain = Buffer.from(zipSync(parts, { level: 0 }));
  refusedBackup(() => verifyBackup(file('big.rtadbackup', claimSize(Buffer.from(plain), 'library.db', 0x7fffffff, { compressed: true }))), /isn't a backup this app made/);
  refusedBackup(() => verifyBackup(file('lie.rtadbackup', claimSize(Buffer.from(plain), 'library.db', parts['library.db'].length + 1))), /isn't a backup this app made/);
  refusedBackup(() => verifyBackup(file('small.rtadbackup', claimSize(Buffer.from(plain), 'keys.json', 1))), /isn't a backup this app made/);

  const began = Date.now();
  assert.ok(Date.now() - began < 5000);
  assert.equal(verifyBackup(file('plain.rtadbackup', plain)).holds.books, 1, 'and the same file, untouched, is fine');
  library.close();
});

test('a backup from an older step of the app still restores, and is brought up to date', () => {
  // The library an older version of the app made: its own steps only, and a backup note that says so.
  const old = temp();
  const key = createKeys(old, 'an-older-library');
  const file = path.join(old, 'library.db');
  const db = openDatabase(file, key);
  migrate(db, file, { steps: STEPS.filter((step) => step.version <= 3) });
  db.prepare("INSERT INTO books (id, title, created_at, updated_at, device_id) VALUES ('b1', 'Tidewater', 'x', 'x', 'a-device')").run();
  db.close();
  key.fill(0);
  const made = path.join(temp(), 'older.rtadbackup');
  const note = { app: 'rt-author-desk', format: 1, createdAt: NOW.toISOString(), version: '0.9.0', step: 3, libraryId: 'an-older-library', holds: { books: 1 } };
  fs.writeFileSync(made, Buffer.from(zipSync({
    'backup.json': strToU8(JSON.stringify(note)),
    [KEY_FILE]: new Uint8Array(fs.readFileSync(path.join(old, KEY_FILE))),
    'library.db': new Uint8Array(fs.readFileSync(file)),
  }, { level: 0 })));

  const info = verifyBackup(made);
  assert.deepEqual([info.step, info.holds.books], [3, 1]);

  const userData = temp();
  restoreBackup({ userData, file: made, now: () => NOW });
  const restored = new Library(path.join(userData, 'library')).open();
  assert.equal(restored.info().step, STEPS.at(-1).version, 'it was brought up to the current step on opening');
  assert.equal(restored.db.prepare('SELECT title FROM books').get().title, 'Tidewater');
  restored.close();
});

test('the library only ever trusts its own tables: nothing in a library can be made to call a function it does not need', () => {
  const { library } = startLibrary();
  assert.equal(library.db.pragma('trusted_schema', { simple: true }), 0);
  library.close();
});

// ---- The project's own files ---------------------------------------------------------------------------------------------

test('no file in the project hides text with invisible or direction-changing characters', (t) => {
  let listed;
  try {
    listed = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean);
  } catch {
    return t.skip('this is not a git checkout, so there is no list of the project\'s files to look through');
  }
  assert.ok(listed.length > 50, 'the list of files should not be empty');
  // The characters that change which way text runs or take up no room, so that what a person reads is not what a program reads (the
  // "Trojan Source" trick), the byte order mark away from where it belongs, and the tag and selector characters that carry hidden text.
  const hidden = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]|[\u{E0100}-\u{E01EF}]/u;
  const binary = /\.(?:png|ico|icns|jpe?g|gif|webp|woff2?|ttf|otf|zip|pdf|xlsx|db|rtadbackup|exe|dmg|deb|appimage)$/i;
  const found = [];
  for (const name of listed) {
    if (binary.test(name)) continue;
    let bytes;
    try { bytes = fs.readFileSync(path.join(ROOT, name)); } catch { continue; } // a file that is listed but removed in the working copy
    if (bytes.subarray(0, 8000).includes(0)) continue; // not text
    const text = bytes.toString('utf8');
    const at = text.search(hidden);
    if (at >= 0) found.push(`${name} (line ${text.slice(0, at).split('\n').length}: U+${text.codePointAt(at).toString(16).toUpperCase().padStart(4, '0')})`);
  }
  assert.deepEqual(found, [], 'write such a character as an escape (\\u200B), so that it can be seen');
});
