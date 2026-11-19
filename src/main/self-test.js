'use strict';
// Proves storage, the catalog and report reading work in whatever build is running, installed or not. CI runs it from the real
// installers on Windows, Mac and Linux. It works in a temporary folder and never touches an author's library.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApi } = require('./api');
const { readWorkbook } = require('./reports/xlsx');
const { fillSample } = require('./sample');
const { readInstalled, writeInstalled } = require('./installed');
const { Settings } = require('./settings');
const { DATABASE_FILE, Library } = require('./storage/library');
const { WrongKeyError, openDatabase } = require('./storage/database');
const { parseMoney, toDecimalString, totals } = require('../shared/money');

function runChecks(dir, version) {
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

  // The catalog through the same calls the window makes, so a file left out of an installer shows up here.
  const catalog = new Library(path.join(dir, 'catalog')).open();
  try {
    const { call } = createApi(catalog, { now: () => new Date(2027, 0, 10) });
    const made = (name, args) => {
      const result = call(name, args);
      if (!result.ok) throw new Error(`${name}: ${result.message}`);
      return result.value;
    };
    const selfBook = made('saveBook', { title: 'Self-test Book' });
    const edition = made('saveEdition', { book_id: selfBook.id, format: 'paperback', release_date: '2027-02-01' });
    const listing = made('saveListing', { edition_id: edition.id, store_id: 'store-kdp', status: 'live' });
    made('setPrice', { listingId: listing.id, marketplace: 'US', currency: 'USD', amount: '12.99', fromDate: '2027-01-01' });
    const page = made('book', { id: selfBook.id });
    check('the catalog holds a priced listing', page.editions[0].listings[0].prices[0].amount === '12.99' && page.grid.rows[0].cells['store-kdp'][0].prices.length === 1);
    check('the clash checks run', made('clashes').some((item) => item.kind === 'release-without-final'));
    check('the nine built-in stores are there', made('names').stores.length === 9);
    check('the money screens have their data', made('earnings').currencies.length === 0 && made('readers').filter((r) => r.ready).length === 1 && made('imports').length === 0);
    // The spreadsheet reader's two libraries are in the build: a file that isn't a workbook is refused in words, not by a crash.
    let reader = 'loaded';
    try {
      readWorkbook(Buffer.from('not a workbook'));
    } catch (error) {
      reader = error.name;
    }
    check('the report reader is in the build', reader === 'WorkbookError', reader);
  } finally {
    catalog.close();
  }

  const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
  const files = [...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)].map((match) => match[1]);
  check('every page file is in the build', files.length >= 6 && files.every((file) => fs.existsSync(path.join(__dirname, '..', 'renderer', file))), files.join(' '));

  const fonts = [...fs.readFileSync(path.join(__dirname, '..', 'renderer', 'fonts.css'), 'utf8').matchAll(/url\('([^']+)'\)/g)].map((match) => match[1]);
  check('the fonts are in the build', fonts.length === 6 && fonts.every((file) => fs.existsSync(path.join(__dirname, '..', 'renderer', file))), fonts.join(' '));
  // The Help Center's guides, the made-up catalog for the tour, and the library that updates the app are all in the build.
  check('the Help Center has its guides', require('../shared/help').GUIDES.length >= 12);
  const demo = new Library(path.join(dir, 'tour')).open();
  try {
    fillSample(demo, '2027-01-10');
    check('the made-up catalog can be made', demo.list('books').length === 3 && demo.list('listings').length >= 6);
  } finally {
    demo.close();
  }
  let updates = 'loaded';
  try {
    // It can only be loaded inside Electron, so outside it the check is that the package is there.
    require.resolve('electron-updater');
    if (process.versions.electron) updates = typeof require('electron-updater').autoUpdater === 'object' ? 'loaded' : 'no updater';
  } catch (error) {
    updates = error.message.split('\n')[0];
  }
  check('the updater is in the build', updates === 'loaded', updates);
  // The installed-list file carries the app's version, so another app can tell which one is here.
  const shared = path.join(dir, 'link');
  const wrote = writeInstalled(shared, { version: version ?? '0', launch: process.execPath });
  const listed = readInstalled(shared)[0];
  check('the installed-list file says which version is here', wrote && listed?.id === 'rt-author-desk' && listed.version === String(version ?? '0'));
  const looks = new Settings(dir);
  looks.save({ theme: 'dusk', textSize: 17 });
  check('the look is remembered', new Settings(dir).values.theme === 'dusk' && new Settings(dir).values.textSize === 17);

  return { checks, versions: { sqlite: info.sqlite, cipher: info.cipher, step: info.step } };
}

function selfTest({ packaged, version }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-self-test-'));
  try {
    const { checks, versions } = runChecks(dir, version);
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
