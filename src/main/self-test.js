'use strict';
// Proves storage and report reading work in whatever build is running, installed or not. CI runs it from the real
// installers on Windows, Mac and Linux. It works in a temporary folder and never touches an author's library.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DATABASE_FILE, Library } = require('./storage/library');
const { WrongKeyError, openDatabase } = require('./storage/database');
const { parseMoney, toDecimalString, totals } = require('../shared/money');

function runChecks(dir) {
  const checks = [];
  const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), ...(detail ? { detail } : {}) });
  const secret = `SecretTitle${crypto.randomBytes(6).toString('hex')}`;

  let library = new Library(path.join(dir, 'library')).open();
  const book = library.put('books', { title: secret });
  library.put('books', { id: book.id, business_status: 'live' });
  check('logs every change', library.changesSince(0).length === 2);
  const info = library.info();
  library.close();

  library = new Library(path.join(dir, 'library')).open();
  check('reopens with the book', library.get('books', book.id)?.business_status === 'live');
  library.remove('books', book.id);
  check('leaves a removal marker', library.removals().some((item) => item.record_id === book.id));
  library.close();

  const bytes = fs.readFileSync(path.join(dir, 'library', DATABASE_FILE));
  check('the file is encrypted', !bytes.includes(Buffer.from(secret)) && !bytes.subarray(0, 16).toString('latin1').startsWith('SQLite format 3'));
  let refused = false;
  try {
    openDatabase(path.join(dir, 'library', DATABASE_FILE), crypto.randomBytes(32)).close();
  } catch (error) {
    refused = error instanceof WrongKeyError;
  }
  check('a wrong key is refused', refused);

  const sum = totals([parseMoney('0.1', 'USD'), parseMoney('0.2', 'USD'), parseMoney('2.0699999999999998', 'USD')]).get('USD');
  check('money adds up exactly', toDecimalString(sum) === '2.37');
  check('yen has no cents', toDecimalString(parseMoney('1234.6', 'JPY')) === '1235');
  return { checks, versions: { sqlite: info.sqlite, cipher: info.cipher, step: info.step } };
}

function selfTest({ packaged, version }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-self-test-'));
  try {
    const { checks, versions } = runChecks(dir);
    return {
      ok: checks.every((item) => item.passed),
      packaged,
      version,
      platform: process.platform,
      arch: process.arch,
      versions: { ...versions, electron: process.versions.electron, node: process.versions.node },
      checks,
    };
  } catch (error) {
    return { ok: false, packaged, version, platform: process.platform, arch: process.arch, versions: {}, checks: [], error: String(error?.stack ?? error) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { runChecks, selfTest };
