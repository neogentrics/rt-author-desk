'use strict';
// End-to-end tests: the real app, driven through its window. They need a display and an installed Electron, so they run when
// asked (npm run test:e2e), on a computer with a screen or under xvfb-run -a on a server. Everything the unit tests can't reach is here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launch } = require('./e2e/driver.cjs');

// `npm run test:e2e` asks for them by name; so does RTAD_E2E=1. A plain `npm test` skips them, since they need a screen.
const enabled = process.env.RTAD_E2E === '1' || process.env.npm_lifecycle_event === 'test:e2e';
const e2e = (name, fn, launchOptions) => test(name, { skip: !enabled && 'run npm run test:e2e (or set RTAD_E2E=1) to try the real app', timeout: 60_000 }, async () => {
  const app = await launch(launchOptions);
  try {
    await fn(app);
    assert.deepEqual(app.problems, [], 'the page reported no errors');
  } finally {
    await app.close();
  }
});

e2e('a series, a pen name and a book are made together, right in the book form', async (app) => {
  await app.run('void AD.addBook()');
  await app.until("document.querySelector('dialog #f-title')", 'the Add a book form');
  await app.fill('#f-title', 'Tidewater');
  await app.fill('#f-pen_name_id', '__new__');
  await app.until("!document.querySelector('#f-pen_name_id-new').hidden", 'a box for the new pen name');
  await app.fill('#f-pen_name_id-new', 'A. Writer');
  await app.fill('#f-series_id', '__new__');
  await app.fill('#f-series_id-new', 'The Tidewater Books');
  await app.fill('#f-series_number', '1');
  await app.clickText('Save', 'dialog');
  await app.until("location.hash.startsWith('#/book/')", 'the book to open');

  const [book] = await app.call('books');
  assert.equal(book.title, 'Tidewater');
  assert.equal(book.series_name, 'The Tidewater Books');
  assert.equal(book.pen_name, 'A. Writer');
  const names = await app.call('names');
  assert.equal(names.series.length, 1);
  assert.equal(names.penNames.length, 1);
  assert.equal(names.series[0].pen_name_id, names.penNames[0].id, 'the new series is under the new pen name');
});

e2e('a new name has to be given a name, and nothing is made until it is', async (app) => {
  await app.run('void AD.addBook()');
  await app.until("document.querySelector('dialog #f-title')");
  await app.fill('#f-title', 'A Book');
  await app.fill('#f-series_id', '__new__');
  await app.clickText('Save', 'dialog');
  await app.until("document.querySelector('dialog .error:not([hidden])')", 'a message');
  assert.match(await app.run("document.querySelector('dialog .error').textContent"), /Give the new series a name/);
  assert.equal((await app.call('books')).length, 0);
  assert.equal((await app.call('names')).series.length, 0);
});

e2e('a book can be moved into a new series, and a save that fails does not make the series twice', async (app) => {
  const book = await app.call('saveBook', { title: 'Standalone' });
  await app.goTo(`#/book/${book.id}`);
  await app.until("[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Edit')");
  // The first save of the book fails, as if the disk were full. The new series has been made by then.
  await app.run("(() => { const call = AD.call; let failed = false; AD.call = async (name, args) => { if (name === 'saveBook' && !failed) { failed = true; throw new Error('The disk is full.'); } return call(name, args); }; })()");
  await app.clickText('Edit', 'main');
  await app.until("document.querySelector('dialog #f-series_id')");
  await app.fill('#f-series_id', '__new__');
  await app.fill('#f-series_id-new', 'Late Series');
  await app.clickText('Save', 'dialog');
  await app.until("document.querySelector('dialog .error:not([hidden])')", 'the failure to be shown');
  assert.match(await app.run("document.querySelector('dialog .error').textContent"), /disk is full/);
  assert.equal((await app.call('names')).series.length, 1, 'made once, before the save failed');
  await app.clickText('Save', 'dialog');
  await app.until("!document.querySelector('dialog')", 'the form to close');
  const [saved] = await app.call('books');
  assert.equal(saved.series_name, 'Late Series');
  assert.equal((await app.call('names')).series.length, 1, 'and still once after the second try');
});

e2e('an empty Calendar and an empty Audiobooks page say what to do and have the button for it', async (app) => {
  await app.goTo('#/calendar');
  await app.until("document.querySelector('main .empty button.primary')", 'the Calendar\'s button');
  assert.match(await app.run("document.querySelector('main .empty').textContent"), /no books yet/);
  assert.equal(await app.run("document.querySelector('main .empty button.primary').textContent"), 'Add a book');
  await app.goTo('#/audiobooks');
  await app.until("document.querySelector('main .empty button.primary')");
  assert.equal(await app.run("document.querySelector('main .empty button.primary').textContent"), 'Add a book');
  await app.click('main .empty button.primary');
  await app.until("document.querySelector('dialog #f-title')", 'the Add a book form to open from there');
  await app.run("document.querySelector('dialog').close()");

  // With a book but no editions, and then with an edition, the buttons change to the next thing to do.
  const book = await app.call('saveBook', { title: 'Tidewater' });
  await app.goTo('#/calendar');
  await app.until("document.querySelector('main .empty a.button')", 'a link to the books');
  assert.match(await app.run("document.querySelector('main .empty').textContent"), /Open a book and add one/);
  await app.goTo('#/audiobooks');
  await app.until("document.querySelector('main .empty button.primary')");
  assert.equal(await app.run("document.querySelector('main .empty button.primary').textContent"), 'Add an audiobook');

  await app.call('saveEdition', { book_id: book.id, format: 'ebook' });
  await app.goTo('#/calendar');
  await app.until("document.querySelector('main .empty button.primary')");
  assert.equal(await app.run("document.querySelector('main .empty button.primary').textContent"), 'Date a release');
  await app.click('main .empty button.primary');
  await app.until("document.querySelector('dialog #f-edition')");
  const choices = await app.run("[...document.querySelectorAll('dialog #f-edition option')].map((o) => o.textContent)");
  assert.deepEqual(choices, ['(choose)', 'Tidewater: ebook']);
  await app.fill('#f-edition', (await app.call('editionChoices'))[0].id);
  await app.fill('#f-release_date', '2027-03-01');
  await app.clickText('Save', 'dialog');
  await app.until("!document.querySelector('dialog')");
  await app.until("document.body.innerText.includes('March 2027')", 'the release on the calendar');
  assert.match(await app.run("document.querySelector('main').textContent"), /Tidewater/);
});

e2e('Add an audiobook from the empty Audiobooks page opens the book with the new edition', async (app) => {
  const book = await app.call('saveBook', { title: 'Tidewater' });
  await app.goTo('#/audiobooks');
  await app.until("document.querySelector('main .empty button.primary')");
  await app.click('main .empty button.primary');
  await app.until("document.querySelector('dialog #f-book_id')");
  await app.fill('#f-book_id', book.id);
  await app.fill('#f-length_minutes', '480');
  await app.clickText('Save', 'dialog');
  await app.until("location.hash.startsWith('#/book/')", 'the book to open');
  const editions = (await app.call('book', { id: book.id })).editions;
  assert.deepEqual(editions.map((e) => [e.format, e.length_minutes]), [['audiobook', 480]]);
  await app.goTo('#/audiobooks');
  await app.until("document.querySelector('main table')", 'the tracker, now it has an audiobook');
});

// A made-up export shaped like Notion's, in a file the app is told to open instead of showing its file dialog.
const NOTION = [
  'Title,Series,Status,Formats,Publish Date,Amazon Link,Notes',
  'Tidewater,The Tidewater Books (https://www.notion.so/The-Tidewater-Books-0a1b2c3d),Published,"Ebook, Paperback, Audiobook","March 1, 2025",https://www.amazon.com/dp/B0SAMPLE01,First book',
  'Low Water,The Tidewater Books (https://www.notion.so/The-Tidewater-Books-0a1b2c3d),Parked,"Ebook, Zine",November 18 2026 → November 25 2026,,',
  'A Quiet Harbour,,Idea,,,,',
  ',,Published,Ebook,,,',
].join('\n');
const csvFile = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-csv-'));
  const file = path.join(dir, 'books.csv');
  fs.writeFileSync(file, `\uFEFF${NOTION}`);
  return file;
};

e2e('books come in from a Notion-style file: match the columns, fix what is not known, bring them in, and take it all back', async (app) => {
  await app.goTo('#/books');
  await app.until("document.querySelector('main .empty')", 'the empty Books page');
  assert.match(await app.run("document.querySelector('main .empty').textContent"), /bring it in as a CSV file/);
  await app.clickText('Bring in books from a file…', 'main .empty');
  await app.until("document.querySelector('dialog.import-dialog #col-title')", 'the column matching step');

  // The guess is right for a Notion export, so there is nothing to fix. The first rows are shown beside each column.
  const guess = await app.run("Object.fromEntries([...document.querySelectorAll('dialog select[id^=col-]')].map((s) => [s.id.slice(4), s.selectedOptions[0].textContent]))");
  assert.deepEqual(guess, { title: 'Title', subtitle: '(not in the file)', series: 'Series', seriesNumber: '(not in the file)', penName: '(not in the file)', status: 'Status', formats: 'Formats', releaseDate: 'Publish Date', link: 'Amazon Link', notes: 'Notes' });
  await app.clickText('Check what it found', 'dialog');
  await app.until("document.querySelector('dialog .import-list')", 'the preview');
  const summary = await app.run("document.querySelector('dialog .import-body p').textContent");
  assert.match(summary, /3 books will be added/);
  assert.match(summary, /1 can't be used/);
  assert.match(await app.run("document.querySelector('dialog .import-body').textContent"), /Parked/, 'the status it does not know is listed');

  // Parked means pulled, and the Zine is left out, which is what the app already does with it.
  await app.run("(() => { const s = [...document.querySelectorAll('dialog tr.attention select')][0]; s.value = 'pulled'; s.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await app.until("[...document.querySelectorAll('dialog .import-list tbody tr')].some((r) => r.textContent.includes('Pulled'))", 'the row to show Pulled');
  await app.clickText('Bring in 3 books', 'dialog');
  await app.until("!document.querySelector('dialog')", 'the window to close');
  await app.until("location.hash === '#/books' && document.querySelector('main table')", 'the books list');

  const books = await app.call('books');
  assert.deepEqual(books.map((b) => [b.title, b.series_name, b.business_status, b.formats]).sort(), [
    ['A Quiet Harbour', null, 'planned', []],
    ['Low Water', 'The Tidewater Books', 'pulled', ['ebook']],
    ['Tidewater', 'The Tidewater Books', 'live', ['ebook', 'paperback', 'audiobook']],
  ]);
  const grid = (await app.call('book', { id: books.find((b) => b.title === 'Tidewater').id })).editions[0];
  assert.equal(grid.listings[0].store_item_id, 'B0SAMPLE01');

  // The imports card is on the page, and Undo takes everything back.
  await app.until("document.querySelector('main section[aria-labelledby=imports-h]')", 'the card that lists imports');
  assert.match(await app.run("document.querySelector('main section[aria-labelledby=imports-h]').textContent"), /books\.csv.*3 books/);
  await app.clickText('Undo', 'main section[aria-labelledby=imports-h]');
  await app.until("document.querySelector('dialog')", 'the question');
  await app.clickText('Undo the import', 'dialog');
  await app.until("document.querySelector('main .empty')", 'the empty Books page again');
  assert.equal((await app.call('books')).length, 0);
  assert.equal((await app.call('names')).series.length, 0, 'the series the import made went too');
}, { env: { RTAD_TEST_FILES: JSON.stringify({ books: csvFile() }) } });

e2e('a file with no title column is stopped in step one, and a repeat import is refused in words', async (app) => {
  await app.goTo('#/books');
  await app.until("document.querySelector('main .empty')");
  await app.clickText('Bring in books from a file…', 'main .empty');
  await app.until("document.querySelector('dialog.import-dialog #col-title')");
  await app.fill('#col-title', '');
  assert.equal(await app.run("document.querySelector('dialog .actions .primary').disabled"), true, 'the title column is needed to go on');
  await app.fill('#col-title', '0');
  await app.clickText('Check what it found', 'dialog');
  await app.until("document.querySelector('dialog .import-list')");
  await app.clickText('Bring in 3 books', 'dialog');
  await app.until("!document.querySelector('dialog')");

  await app.clickText('Bring in books from a file…', 'main');
  await app.until("document.querySelector('dialog.import-dialog #col-title')");
  await app.clickText('Check what it found', 'dialog');
  await app.until("document.querySelector('dialog .import-list')");
  assert.match(await app.run("document.querySelector('dialog .import-body p').textContent"), /0 books will be added/);
  assert.equal(await app.run("document.querySelector('dialog .actions .primary').disabled"), true, 'nothing new to bring in');
  assert.equal(await app.run("document.querySelector('dialog .actions .primary').textContent"), 'Nothing to bring in');
}, { env: { RTAD_TEST_FILES: JSON.stringify({ books: csvFile() }) } });

// The installed list: a copy of the app that says it is installed leaves a small file with its own version in it. Run from the source
// it says nothing, so the test names the program to start (and a folder of its own to leave the file in).
const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-link-'));
const stand = path.join(shared, 'program');
fs.writeFileSync(stand, 'x', { mode: 0o755 });
e2e('an installed copy leaves the installed-list file, with its version in it', async () => {
  const file = path.join(shared, 'installed', 'rt-author-desk.json');
  assert.ok(fs.existsSync(file), 'the file is there once the app has opened');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { id: 'rt-author-desk', name: 'RT Author Desk', version: require('../package.json').version, launch: stand, protocol: 1 });
}, { env: { NMR_LINK_DIR: shared, RTAD_INSTALLED_LAUNCH: stand } });

const quiet = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-link-'));
e2e('run from its source, the app does not say it is installed', async () => {
  assert.deepEqual(fs.readdirSync(quiet), [], 'nothing was written');
}, { env: { NMR_LINK_DIR: quiet } });

// Backups, from Preferences: choose a folder (the app's own folder dialog is bypassed in these tests), back up, and see the file.
const backupFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-backups-'));
e2e('Preferences: choose a folder, back up now, and find a backup there that checks out', async (app) => {
  await app.call('saveBook', { title: 'Tidewater' });
  await app.run('void AD.openPreferences()');
  await app.until("document.querySelector('#backup-choose')", 'the Backups section');
  assert.match(await app.run("document.querySelector('.backup-folder').textContent"), /No folder chosen yet/);
  await app.click('#backup-choose');
  await app.until(`document.querySelector('.backup-folder').textContent === ${JSON.stringify(backupFolder)}`, 'the chosen folder');
  await app.fill('#pref-backup-every', 'day');
  await app.until("document.querySelector('#pref-backup-every').value === 'day'");
  await app.click('#backup-now');
  await app.until("/Last backup:/.test(document.querySelector('dialog[id=preferences] p[role=status]').textContent)", 'the backup to finish');
  const made = fs.readdirSync(backupFolder);
  assert.equal(made.length, 1);
  assert.match(made[0], /^RT Author Desk backup \d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.rtadbackup$/);
  const info = require('../src/main/backups').verifyBackup(path.join(backupFolder, made[0]));
  assert.equal(info.holds.books, 1);
  assert.equal(info.version, require('../package.json').version);
}, { env: { RTAD_TEST_FILES: JSON.stringify({ backupFolder }) } });

// A backup made elsewhere, to restore. The test stops at the question: the restart that follows can't be watched from the page.
const backupToRestore = (() => {
  const { Library } = require('../src/main/storage/library');
  const { Catalog } = require('../src/main/catalog');
  const { createBackup } = require('../src/main/backups');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-made-'));
  const library = new Library(path.join(dir, 'library')).open();
  const catalog = new Catalog(library);
  catalog.saveBook({ title: 'One' });
  catalog.saveBook({ title: 'Two' });
  const made = createBackup(library, path.join(dir, 'out'), { version: '1.0.0-alpha.0' });
  library.close();
  return made.file;
})();
e2e('Preferences: a backup chosen to restore says what is in it and what restoring does, and Cancel changes nothing', async (app) => {
  const mine = await app.call('saveBook', { title: 'Mine' });
  await app.run('void AD.openPreferences()');
  await app.until("document.querySelector('#backup-restore')");
  await app.click('#backup-restore');
  await app.until("document.querySelector('dialog:last-of-type .danger')", 'the question');
  const text = await app.run("document.querySelector('dialog:last-of-type').textContent");
  assert.match(text, /holds 2 books, 0 editions and 0 listings/);
  assert.match(text, /by version 1\.0\.0-alpha\.0/);
  assert.match(text, /not deleted: it is kept in a folder beside it/);
  await app.clickText('Cancel', 'dialog:last-of-type');
  assert.deepEqual((await app.call('books')).map((b) => b.id), [mine.id], 'nothing was changed');
}, { env: { RTAD_TEST_FILES: JSON.stringify({ backupFile: backupToRestore }) } });

e2e('removing an edition from a book page moves it to the Trash, and bringing it back returns it with its listing and price', async (app) => {
  const book = await app.call('saveBook', { title: 'Tidewater' });
  const edition = await app.call('saveEdition', { book_id: book.id, format: 'ebook' });
  const listing = await app.call('saveListing', { edition_id: edition.id, store_id: 'store-kdp', status: 'live' });
  await app.call('setPrice', { listingId: listing.id, marketplace: 'US', currency: 'USD', amount: '4.99', fromDate: '2026-01-01' });
  await app.goTo(`#/book/${book.id}`);
  await app.until("[...document.querySelectorAll('main .editions button')].some((b) => b.textContent.trim() === 'Remove')", 'the edition card');
  await app.clickText('Remove', 'main .editions');
  await app.until("document.querySelector('dialog .danger')", 'the question');
  const asked = await app.run("document.querySelector('dialog').textContent");
  assert.match(asked, /1 listing and prices go with it/);
  assert.match(asked, /waits in the Trash for 30 days/);
  await app.clickText('Move to the Trash', 'dialog');
  await app.until("!document.querySelector('dialog')");
  await app.until("document.querySelector('#nav a[href=\"#/trash\"] .tally')", 'the count beside Trash');
  assert.equal((await app.call('book', { id: book.id })).editions.length, 0);

  await app.goTo('#/trash');
  await app.until("document.querySelector('main .list li')", 'the item in the Trash');
  assert.match(await app.run("document.querySelector('main .list li').textContent"), /Tidewater: ebook.*30 days left/);
  await app.clickText('Bring it back', 'main');
  await app.until("document.querySelector('main .empty')", 'the Trash to be empty again');
  const back = (await app.call('book', { id: book.id })).editions[0];
  assert.equal(back.id, edition.id, 'the same edition');
  assert.equal(back.listings[0].prices[0].amount, '4.99');
});

// Export, from the menu's command: the folder is chosen by the test instead of a dialog.
const exportParent = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-export-'));
e2e('Export Everything puts the library, spreadsheets and reports in a new folder, and says so', async (app) => {
  await app.call('saveBook', { title: 'Tidewater' });
  await app.run('void AD.exportAll()');
  await app.until("/Exported 1 book/.test(document.getElementById('toast').textContent)", 'the message');
  const [made] = fs.readdirSync(exportParent);
  assert.match(made, /^RT Author Desk export \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}$/);
  const json = JSON.parse(fs.readFileSync(path.join(exportParent, made, 'library.json'), 'utf8'));
  assert.deepEqual(json.tables.books.map((b) => b.title), ['Tidewater']);
  assert.ok(fs.existsSync(path.join(exportParent, made, 'csv', 'books.csv')));
}, { env: { RTAD_TEST_FILES: JSON.stringify({ exportFolder: exportParent }) } });

// The first run. These start without the welcome already seen, which every other test does.
const manual = (name, fn) => test(name, { skip: !enabled && 'run npm run test:e2e (or set RTAD_E2E=1) to try the real app', timeout: 90_000 }, fn);
const settingsOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
// The setting is saved a moment after the dialog closes, so wait for it rather than guessing.
const welcomedIn = async (dir) => {
  for (let i = 0; i < 40; i += 1) {
    try { if (settingsOf(dir).welcomed === true) return true; } catch { /* not written yet */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
};
const choose = (title) => `[...document.querySelectorAll('dialog button.choice')].find((b) => b.querySelector('strong').textContent === ${JSON.stringify(title)}).click()`;
const welcomeOpen = "[...document.querySelectorAll('dialog h2')].some((h) => h.textContent === 'Welcome to RT Author Desk')";

manual('a new library is welcomed once, with three ways to begin, and starting a catalog opens the first book', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-first-'));
  let app = await launch({ userData: dir, welcome: true });
  try {
    await app.until(welcomeOpen, 'the welcome');
    const choices = await app.run("[...document.querySelectorAll('dialog button.choice strong')].map((b) => b.textContent)");
    assert.deepEqual(choices, ['Start my own catalog', 'Bring in my books from a file', 'Look around a made-up catalog first']);
    await app.run(choose('Start my own catalog'));
    await app.until("document.querySelector('dialog #f-title')", 'the Add a book form');
    assert.equal(await welcomedIn(dir), true);
    assert.deepEqual(app.problems, []);
  } finally {
    await app.close();
  }
  // The next time, nothing is said.
  app = await launch({ userData: dir, welcome: true });
  try {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.equal(await app.run(welcomeOpen), false, 'not welcomed twice');
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

manual('closing the welcome without choosing counts, and a library that already has books is never welcomed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-first-'));
  let app = await launch({ userData: dir, welcome: true });
  try {
    await app.until(welcomeOpen);
    await app.clickText("I'll look around myself", 'dialog');
    await app.until('!document.querySelector("dialog")');
    assert.equal(await welcomedIn(dir), true);
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // A copy of the app that already holds someone's books (an earlier test build, say) is left alone, and not welcomed later either.
  const old = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-first-'));
  const { Library } = require('../src/main/storage/library');
  const { Catalog } = require('../src/main/catalog');
  const library = new Library(path.join(old, 'library')).open();
  new Catalog(library).saveBook({ title: 'Already here' });
  library.close();
  app = await launch({ userData: old, welcome: true });
  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal(await app.run(welcomeOpen), false);
    await app.until("document.querySelector('main .card')", 'the Desk');
    assert.equal(await welcomedIn(old), true, 'marked, so it can never turn up later');
  } finally {
    await app.close();
    fs.rmSync(old, { recursive: true, force: true });
  }
});

manual('the welcome can start the tour of a made-up catalog, and leaving the tour puts the empty library back', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-first-'));
  const app = await launch({ userData: dir, welcome: true });
  try {
    await app.until(welcomeOpen);
    await app.run(choose('Look around a made-up catalog first'));
    await app.until("document.querySelector('.tour') && document.querySelector('.bar')", 'the tour and the bar that says where you are');
    assert.match(await app.run("document.querySelector('.bar').textContent"), /A made-up catalog/);
    assert.equal((await app.call('books')).length, 3);
    await app.clickText('Leave it', '.bar');
    await app.until("!document.querySelector('.bar')", 'the made-up catalog to go');
    assert.equal((await app.call('books')).length, 0, 'the real library was never touched');
    assert.equal(fs.existsSync(path.join(dir, 'sample-library')), false, 'and the sample library is thrown away');
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

e2e('someone is credited on an edition, a store\'s credits are written down, and the one it leaves out is pointed out', async (app) => {
  const book = await app.call('saveBook', { title: 'Tidewater' });
  const edition = await app.call('saveEdition', { book_id: book.id, format: 'ebook' });
  const kdp = await app.call('saveListing', { edition_id: edition.id, store_id: 'store-kdp', status: 'live' });
  await app.call('saveListing', { edition_id: edition.id, store_id: 'store-kobo', status: 'live' });
  await app.goTo(`#/book/${book.id}`);
  await app.until("[...document.querySelectorAll('main button')].some((b) => b.textContent.trim() === 'Credit someone')", 'the credits section');

  // A person is made right in the credit form, as a series is in the book form.
  await app.clickText('Credit someone', 'main');
  await app.until("document.querySelector('dialog #f-person_id')");
  await app.fill('#f-person_id', '__new__');
  await app.fill('#f-person_id-new', 'Made-up Editor');
  await app.fill('#f-role', 'editor');
  await app.clickText('Save', 'dialog');
  await app.until("!document.querySelector('dialog')", 'the form to close');
  await app.until("document.querySelector('main .editions')?.textContent.includes('Made-up Editor')", 'the credit to show');
  const [credit] = (await app.call('book', { id: book.id })).editions[0].credits;
  assert.deepEqual([credit.person_name, credit.role], ['Made-up Editor', 'editor']);
  assert.equal((await app.call('clashes')).length, 0, 'nothing is written down yet, so nothing is wrong');

  // One store shows the editor. Then Kobo is opened from the grid, and written down as showing no one.
  await app.call('setListingCredits', { listingId: kdp.id, creditIds: [credit.id] });
  await app.goTo(`#/book/${book.id}`);
  await app.until("document.querySelectorAll('.cellbtn').length >= 2");
  await app.run("[...document.querySelectorAll('.cellbtn')].find((b) => /Kobo/.test(b.getAttribute('aria-label')))?.click()");
  await app.until("document.querySelector('dialog')?.textContent.includes('Credits shown here')", 'the store\'s square');
  assert.match(await app.run("document.querySelector('dialog').textContent"), /Not written down yet/);
  await app.clickText('Write down what it shows', 'dialog');
  await app.until("document.querySelectorAll('dialog').length === 2 && document.querySelector('dialog:last-of-type input[type=checkbox]')", 'the tick list');
  assert.equal(await app.run("document.querySelector('dialog:last-of-type input[type=checkbox]').checked"), false, 'nothing ticked for you');
  await app.run("document.querySelector('dialog:last-of-type form').requestSubmit()");
  await app.until("document.querySelectorAll('dialog').length === 0", 'the dialogs to close');
  const [clash] = await app.call('clashes');
  assert.equal(clash.kind, 'credits-differ');
  assert.match(clash.title, /leaves Made-up Editor \(editor\) off Kobo/);
  await app.goTo(`#/book/${book.id}`);
  await app.until("document.querySelector('main')?.textContent.includes('1 clash on this book')", 'the clash on the book');

  // The person is in the list on the Names page, and can't be removed while credited.
  await app.goTo('#/names');
  await app.until("document.querySelector('#people')", 'the People section');
  assert.match(await app.run("document.querySelector('#people').closest('section').textContent"), /Made-up Editor · Editor, Tidewater: ebook/);
  await app.run("[...document.querySelectorAll('#people ~ ul button, section[aria-labelledby=people] button')].find((b) => b.textContent.trim() === 'Remove').click()");
  await app.until("document.getElementById('toast') && !document.getElementById('toast').hidden", 'a message');
  assert.match(await app.run("document.getElementById('toast').textContent"), /credited on 1 edition/);
});

// ---- Go to, and the commands in the menus ----

const paletteRows = (app) => app.run("[...document.querySelectorAll('#palette-list li')].map((li) => ({ label: li.querySelector('.pi-label')?.textContent ?? li.textContent, detail: li.querySelector('.pi-detail')?.textContent ?? '', selected: li.getAttribute('aria-selected') }))");
const openPalette = async (app, keys = { ctrl: true }) => {
  await app.key('k', keys);
  await app.until("document.querySelector('dialog#palette[open]') && document.activeElement?.id === 'palette-input'", 'Go to to open with its box ready');
};

e2e('Ctrl+K opens Go to, a few letters find a screen or a book, Enter goes there, and Escape puts you back where you were', async (app) => {
  const book = await app.call('saveBook', { title: 'Tidewater' });
  await app.call('saveBook', { title: 'Low Water' });
  await app.run("document.querySelector('#nav a[href=\"#/books\"]').focus()");
  await openPalette(app);
  assert.equal(await app.run("document.querySelector('#palette-input').getAttribute('role')"), 'combobox');
  await app.until("document.querySelectorAll('#palette-list li').length === 12", 'ten screens and two books');
  let rows = await paletteRows(app);
  assert.deepEqual(rows.slice(0, 3).map((r) => r.label), ['Desk', 'Books', 'Audiobooks'], 'screens first, in the sidebar\'s order');
  assert.equal(rows.at(-1).detail, 'Book');

  // Arrow keys move the choice, and the box says which one (for a screen reader) as well as showing it.
  await app.key('ArrowDown');
  assert.equal(await app.run("document.querySelector('#palette-input').getAttribute('aria-activedescendant')"), 'palette-opt-1');
  assert.equal(await app.run("document.querySelector('#palette-opt-1').getAttribute('aria-selected')"), 'true');
  await app.key('ArrowUp');
  assert.equal(await app.run("document.querySelector('#palette-opt-0').getAttribute('aria-selected')"), 'true');

  await app.fill('#palette-input', 'tide');
  rows = await paletteRows(app);
  assert.deepEqual([rows[0].label, rows[0].detail], ['Tidewater', 'Book']);
  await app.key('Enter');
  await app.until(`location.hash === '#/book/${book.id}'`, 'the book to open');
  assert.equal(await app.run("Boolean(document.querySelector('dialog#palette'))"), false, 'Go to closes when you have gone');

  await openPalette(app);
  await app.fill('#palette-input', 'cal');
  assert.equal((await paletteRows(app))[0].label, 'Calendar');
  await app.key('Enter');
  await app.until("location.hash === '#/calendar'");

  // Escape closes it and puts you back on what you were on, with nothing changed.
  await app.run("document.querySelector('#nav a[href=\"#/isbns\"]').focus()");
  await openPalette(app);
  await app.fill('#palette-input', 'zzzz');
  assert.match((await paletteRows(app))[0].label, /Nothing matches/);
  await app.key('Escape');
  await app.until("!document.querySelector('dialog#palette')");
  assert.equal(await app.run("document.activeElement.getAttribute('href')"), '#/isbns');
  assert.equal(await app.run('location.hash'), '#/calendar');
});

e2e('Go to runs a command by name: > lists the menu commands with where each is and its shortcut, and running one does it', async (app) => {
  await openPalette(app, { ctrl: true, shift: true });
  assert.equal(await app.run("document.querySelector('#palette-input').value"), '>', 'Find a Command starts with the >');
  await app.until("document.querySelectorAll('#palette-list li').length > 30", 'the commands to arrive');
  const everything = await paletteRows(app);
  const find = (rows, label) => rows.find((r) => r.label === label);
  assert.equal(find(everything, 'New Book…').detail, 'File  ·  Ctrl+N');
  assert.equal(find(everything, 'Go to…').detail, 'View  ·  Ctrl+K');
  assert.equal(find(everything, 'Books').detail, 'View › Screens  ·  Ctrl+2');
  assert.equal(find(everything, 'Help Center').detail, 'Help  ·  F1');
  assert.equal(find(everything, 'Glass').detail, 'View  ·  Off');
  assert.equal(find(everything, 'Follow System').detail, 'View › Theme  ·  Current');
  assert.ok(!everything.some((r) => /^(Quit|Copy|Paste|Undo)$/.test(r.label)), 'standard items are not offered');

  // A theme, by name: it changes at once, and is kept.
  await app.fill('#palette-input', '>dark');
  assert.deepEqual([(await paletteRows(app))[0].label, (await paletteRows(app))[0].detail], ['Dark', 'View › Theme']);
  await app.key('Enter');
  await app.until("document.documentElement.dataset.theme === 'dark'", 'the page to turn dark');
  assert.equal((await app.run('window.desk.settings()')).theme, 'dark');

  // The words of the menu help too: "theme sepia" finds Sepia under Theme.
  await openPalette(app);
  await app.fill('#palette-input', '>theme sepia');
  const sepia = await paletteRows(app);
  assert.equal(sepia[0].label, 'Sepia');
  await app.key('Enter');
  await app.until("document.documentElement.dataset.theme === 'sepia'");

  // Something that is on or off says which, and running it flips it.
  await openPalette(app);
  await app.fill('#palette-input', '>glass');
  assert.equal((await paletteRows(app))[0].detail, 'View  ·  Off');
  await app.key('Enter');
  await app.until("document.documentElement.dataset.surface === 'glass'", 'Glass to come on');
  await openPalette(app);
  await app.fill('#palette-input', '>glass');
  assert.equal((await paletteRows(app))[0].detail, 'View  ·  On');
  await app.key('Escape');

  // A command that opens something opens it.
  await openPalette(app);
  await app.fill('#palette-input', '>new book');
  assert.equal((await paletteRows(app))[0].label, 'New Book…');
  await app.key('Enter');
  await app.until("document.querySelector('dialog #f-title')", 'the Add a book form');
});

e2e('a change made from the View menu reaches Preferences while it is open, and F1 opens the Help Center', async (app) => {
  await app.run('void AD.openPreferences()');
  await app.until("document.querySelector('dialog#preferences #pref-theme')", 'Preferences to open');
  assert.equal(await app.run("document.querySelector('#pref-theme').value"), 'system');
  assert.equal(await app.run('window.desk.runCommand("theme-sepia")'), true);
  await app.until("document.querySelector('#pref-theme').value === 'sepia'", 'Preferences to follow the menu');
  assert.equal(await app.run('window.desk.runCommand("colour-safe")'), true);
  await app.until("document.querySelector('#pref-safe').checked", 'colour-safe to show as on');
  assert.equal(await app.run('window.desk.runCommand("no-such-command")'), false);
  await app.run("document.querySelector('dialog#preferences').close()");
  await app.key('F1');
  await app.until("document.querySelector('dialog#help[open]')", 'the Help Center to open on F1');
});

// ---- About ----

e2e('About shows the icon, the name and version, the four links and the legal ones, the versions and the copyright, and copies the details', async (app) => {
  assert.equal(await app.run('window.desk.runCommand("about")'), true, 'About is a command in the Help menu');
  await app.until("document.querySelector('dialog#about[open]')", 'About to open');
  assert.equal(await app.run("document.activeElement.id"), 'about-done', 'the focus is on the way out');
  assert.equal(await app.run("document.querySelector('dialog#about').getAttribute('aria-labelledby')"), 'about-title');
  assert.equal(await app.run("document.querySelector('#about-title').textContent"), 'RT Author Desk');
  assert.match(await app.run("document.querySelector('.about-version').textContent"), /^Version \d+\.\d+\.\d+/);
  assert.equal(await app.run("document.querySelector('.about-logo').complete && document.querySelector('.about-logo').naturalWidth > 0"), true, 'the icon is drawn');

  const links = await app.run("[...document.querySelectorAll('#about a')].map((a) => ({ label: a.firstChild.textContent, url: a.href, target: a.target, rel: a.rel, said: a.textContent }))");
  assert.deepEqual(links.map((l) => l.label), ['Website', 'What’s new in this version', 'Report a problem or suggest a feature', 'Source code', 'License', 'Open-source notices']);
  for (const link of links) {
    assert.match(link.url, /^https:\/\/(github\.com\/neogentrics\/rt-author-desk|recontowers\.com\/projects\/)/);
    assert.equal(link.target, '_blank');
    assert.match(link.rel, /noopener/);
    assert.match(link.said, /opens in your browser/, 'a screen reader is told');
  }
  const [, notes] = links;
  const { version } = await app.run('window.desk.info()');
  assert.ok(notes.url.endsWith(`/releases/tag/v${version}`), 'the notes are for this version');
  assert.equal((await app.run("[...document.querySelectorAll('.about-links li span:not(.visually-hidden)')].map((s) => s.textContent)")).length, 4, 'each of the four says where it goes');

  const tech = await app.run("document.querySelector('.about-tech').textContent");
  assert.match(tech, /Electron \d+\.\d+/);
  assert.match(tech, /Chromium \d+/);
  assert.match(tech, /Node \d+/);
  assert.match(await app.run("document.querySelector('.about-legal').textContent"), new RegExp(`© ${new Date().getFullYear()} Recon Towers\\. All rights reserved\\.`));

  await app.click('#about-copy');
  await app.until("document.getElementById('toast') && !document.getElementById('toast').hidden && /copied/.test(document.getElementById('toast').textContent)", 'the copied message');
  const copied = (await app.run('window.desk.copyDetails()')).value;
  assert.match(copied, /^RT Author Desk \d+\.\d+\.\d+.*\nElectron \d+.* · Chromium \d+.* · Node \d+.*\n(Windows|macOS|Linux) \S+ \(\w+\)$/);

  await app.key('Escape');
  await app.until("!document.querySelector('dialog#about')", 'Escape to close it');
});

e2e('About says portable when this is the portable build, and the Help menu\'s About opens it', async (app) => {
  await app.run('window.desk.runCommand("about")');
  await app.until("document.querySelector('dialog#about[open]')");
  assert.match(await app.run("document.querySelector('.about-version').textContent"), /^Version \d+\.\d+\.\d+ \(portable\)$/);
  assert.match((await app.run('window.desk.copyDetails()')).value, /^RT Author Desk \d+\.\d+\.\d+ \(portable\)\n/);
}, { env: { PORTABLE_EXECUTABLE_DIR: '/tmp/somewhere' } });

// ---- The toolbar ----

e2e('the toolbar has icon buttons, each with a name for a screen reader and for hover, and each does what its name says', async (app) => {
  const buttons = await app.run("[...document.querySelectorAll('#toolbar > .tb-group button')].map((b) => ({ id: b.id, name: b.getAttribute('aria-label') || b.textContent.trim(), title: b.title, icon: Boolean(b.querySelector('svg[aria-hidden=\"true\"]')) }))");
  assert.deepEqual(buttons, [
    { id: 'tb-goto', name: 'Go to a screen, a book or a command', title: 'Go to a screen, a book or a command (Ctrl+K)', icon: true },
    { id: 'tb-new', name: 'New Book', title: 'New Book (Ctrl+N)', icon: true },
    { id: 'tb-import', name: 'Bring in books from a file', title: 'Bring in books from a file (Ctrl+Shift+I)', icon: true },
    { id: 'theme-button', name: 'Theme and look', title: 'Theme and look', icon: true },
    { id: 'tb-prefs', name: 'Preferences', title: 'Preferences (Ctrl+,)', icon: true },
    { id: 'tb-help', name: 'Help Center', title: 'Help Center (F1)', icon: true },
  ]);
  assert.equal(await app.run("document.getElementById('toolbar').getAttribute('aria-label')"), 'Common commands');

  await app.click('#tb-goto');
  await app.until("document.querySelector('dialog#palette[open]')", 'Go to');
  await app.key('Escape');
  await app.click('#tb-new');
  await app.until("document.querySelector('dialog #f-title')", 'the New Book form');
  await app.run("document.querySelector('dialog').close()");
  await app.click('#tb-prefs');
  await app.until("document.querySelector('dialog#preferences')", 'Preferences');
  await app.run("document.querySelector('dialog#preferences').close()");
  await app.click('#tb-help');
  await app.until("document.querySelector('dialog#help')", 'the Help Center');
  await app.run("document.querySelector('dialog#help').close()");
  await app.run("window.__asked = 0; AD.importBooks = () => { window.__asked += 1; }");
  await app.click('#tb-import');
  assert.equal(await app.run('window.__asked'), 1, 'Bring in books asks to bring books in');
  await app.click('#theme-button');
  await app.until("document.querySelector('#theme-pop:popover-open')", 'the theme pop-up');
});

e2e('the shortcuts the toolbar shows are the ones that work: Ctrl+N adds a book and Ctrl+, opens Preferences', async (app) => {
  await app.key('n', { ctrl: true });
  await app.until("document.querySelector('dialog #f-title')", 'the New Book form');
  await app.run("document.querySelector('dialog').close()");
  await app.key(',', { ctrl: true });
  await app.until("document.querySelector('dialog#preferences')", 'Preferences');
});

e2e('the theme button opens a pop-up with the theme, Glass and colour-safe colours, which change at once, and Escape closes it and puts the focus back', async (app) => {
  // From the keyboard: the button is reached, and Enter opens the pop-up.
  await app.run("document.getElementById('theme-button').focus()");
  await app.key('Enter');
  await app.until("document.querySelector('#theme-pop:popover-open')", 'the pop-up');
  assert.equal(await app.run("document.activeElement.id"), 'tb-theme', 'the focus is on the first thing to change');
  assert.equal(await app.run("document.querySelector('#tb-theme').value"), 'system');
  assert.equal(await app.run("document.querySelector('#tb-theme option').textContent"), 'Follow System');
  assert.equal(await app.run("document.querySelectorAll('#tb-theme option').length"), 16, 'Follow System and the fifteen themes');
  assert.equal(await app.run("document.querySelector('#tb-solid').getAttribute('aria-pressed')"), 'true');

  await app.fill('#tb-theme', 'sepia');
  await app.until("document.documentElement.dataset.theme === 'sepia'", 'the page to change');
  assert.equal((await app.run('window.desk.settings()')).theme, 'sepia', 'and it is kept');
  await app.click('#tb-glass');
  await app.until("document.documentElement.dataset.surface === 'glass'", 'Glass');
  assert.equal(await app.run("document.querySelector('#tb-glass').getAttribute('aria-pressed')"), 'true');
  assert.equal(await app.run("document.querySelector('#tb-solid').getAttribute('aria-pressed')"), 'false');
  await app.click('#tb-safe');
  await app.until("document.documentElement.dataset.colors === 'safe'", 'colour-safe colours');

  // High Contrast stays solid, and says why.
  await app.fill('#tb-theme', 'contrast');
  await app.until("document.documentElement.dataset.theme === 'contrast'");
  assert.equal(await app.run("document.querySelector('#tb-glass').disabled"), true);
  assert.match(await app.run("document.querySelector('#tb-glass-note').textContent"), /High Contrast stays solid/);

  await app.key('Escape');
  await app.until("!document.querySelector('#theme-pop:popover-open')", 'Escape to close the pop-up');
  assert.equal(await app.run("document.activeElement.id"), 'theme-button', 'the focus is back on the button');

  // Preferences shows the same, and a change there reaches the pop-up the next time it opens.
  await app.run('void AD.openPreferences()');
  await app.until("document.querySelector('#pref-theme')");
  assert.equal(await app.run("document.querySelector('#pref-theme').value"), 'contrast');
  assert.equal(await app.run("document.querySelector('#pref-theme option').textContent"), 'Follow System');
  await app.fill('#pref-theme', 'plum');
  await app.until("document.documentElement.dataset.theme === 'plum'");
  await app.run("document.querySelector('dialog#preferences').close()");
  await app.click('#theme-button');
  await app.until("document.querySelector('#theme-pop:popover-open')");
  assert.equal(await app.run("document.querySelector('#tb-theme').value"), 'plum');
});

e2e('the pop-up closes when you click away, and its link goes to Preferences', async (app) => {
  await app.click('#theme-button');
  await app.until("document.querySelector('#theme-pop:popover-open')");
  await app.click('#tb-more');
  await app.until("document.querySelector('dialog#preferences')", 'Preferences to open');
  assert.equal(await app.run("document.querySelector('#theme-pop:popover-open') === null"), true, 'the pop-up is gone');
  await app.run("document.querySelector('dialog#preferences').close()");
  await app.click('#theme-button');
  await app.until("document.querySelector('#theme-pop:popover-open')");
  await app.run("document.getElementById('view').click(); document.body.click()");
  await app.run("document.querySelector('#theme-pop').hidePopover()"); // a click outside does the same, and the browser does it for real
  assert.equal(await app.run("document.querySelector('#theme-pop:popover-open') === null"), true);
});

e2e('the sidebar starts below the bars and the toolbar, and keeps below them when a bar appears', async (app) => {
  const measure = () => app.run("({ top: document.getElementById('top').offsetHeight, variable: getComputedStyle(document.documentElement).getPropertyValue('--bars-h').trim(), side: document.querySelector('.side').getBoundingClientRect().top })");
  let now = await measure();
  assert.equal(now.variable, `${now.top}px`, 'the sidebar knows how tall the top is');
  assert.ok(now.top >= 40, 'the toolbar is there');
  assert.ok(now.side >= now.top - 1, 'and the sidebar starts below it');
  await app.run('AD.state.sample = true; AD.drawBars()');
  await app.until("getComputedStyle(document.documentElement).getPropertyValue('--bars-h').trim() === document.getElementById('top').offsetHeight + 'px' && document.getElementById('top').offsetHeight > 60", 'the made-up catalog bar to add its height');
  now = await measure();
  assert.ok(now.side >= now.top - 1, 'the sidebar is still below it');
});

// ---- Customize Theme ----

// A colour picker being dragged says "input" over and over, and "change" only when it is let go.
const drag = (app, selector, colour) => app.run(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(colour)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const variable = (app, name) => app.run(`getComputedStyle(document.documentElement).getPropertyValue('${name}').trim()`);

e2e('Customize Theme: a swatch or any colour changes the page, stays readable, is kept, and goes back', async (app) => {
  assert.equal(await app.run('window.desk.runCommand("customize-theme")'), true, 'it is a command in the View menu');
  await app.until("document.querySelector('dialog#customize[open]')", 'Customize Theme to open');
  const plain = { accent: await variable(app, '--t-accent'), panel: await variable(app, '--t-panel'), desk: await variable(app, '--t-desk') };

  // Every swatch and picker has a name, and nothing is chosen yet: "the theme's own" is the one pressed.
  const names = await app.run("[...document.querySelectorAll('#customize .swatch, #customize input[type=color]')].map((e) => e.getAttribute('aria-label'))");
  assert.equal(names.length, 3 * 8 + 3);
  assert.ok(names.every((n) => n && n.length > 5));
  assert.equal(await app.run("document.querySelectorAll('#customize .swatch[aria-pressed=\"true\"]').length"), 3, 'the theme\'s own, for each of the three');

  // An accent swatch: the page takes it (changed only as much as it takes to be read), and it is kept.
  await app.run("document.querySelector('#customize [aria-label=\"Accent colour #e8590c\"]').click()");
  await app.until(`getComputedStyle(document.documentElement).getPropertyValue('--t-accent').trim() !== '${plain.accent}'`, 'the accent to change');
  const accent = await variable(app, '--t-accent');
  const expected = await app.run("ADBrand.brandTokens(ADThemes.THEMES[AD.themeName(AD.currentLook())], { accent: '#e8590c' })['--t-accent']");
  assert.equal(accent, expected);
  assert.equal((await app.run('window.desk.settings()')).brand.accent, '#e8590c', 'kept');
  assert.equal(await app.run("document.querySelector('#customize [aria-label=\"Accent colour #e8590c\"]').getAttribute('aria-pressed')"), 'true');
  assert.equal(await app.run("ADBrand.contrast(getComputedStyle(document.documentElement).getPropertyValue('--t-accent').trim(), ADThemes.THEMES.light.sheet) >= 4.5"), true, 'a link in it can be read on the page');

  // A panel swatch changes the sidebar and the toolbar, and its words follow.
  await app.run("document.querySelector('#customize [aria-label=\"Panel colour #12355b\"]').click()");
  await app.until("getComputedStyle(document.documentElement).getPropertyValue('--t-panel').trim() === '#12355b'", 'the panel to change');
  assert.equal(await variable(app, '--t-on-panel') === '#ffffff' || (await app.run("ADBrand.contrast(getComputedStyle(document.documentElement).getPropertyValue('--t-on-panel').trim(), '#12355b') >= 4.5")), true);
  assert.equal(await app.run("getComputedStyle(document.querySelector('.side')).color === getComputedStyle(document.querySelector('.toolbar')).color"), true, 'the sidebar and the toolbar agree');

  // Any colour, from the picker: it shows while it is dragged, and is kept when it is let go.
  await drag(app, '#custom-background', '#2d1a47');
  assert.equal(await variable(app, '--t-desk'), '#2d1a47', 'shown as it is dragged');
  assert.equal((await app.run('window.desk.settings()')).brand.background, '', 'not kept yet');
  await app.run("document.querySelector('#custom-background').dispatchEvent(new Event('change', { bubbles: true }))");
  for (let i = 0; i < 30 && (await app.run('window.desk.settings()')).brand.background !== '#2d1a47'; i += 1) await new Promise((r) => setTimeout(r, 100));
  assert.equal((await app.run('window.desk.settings()')).brand.background, '#2d1a47', 'kept when let go');

  // A colour that would not be readable is changed so that it is: pale yellow on a white page.
  await drag(app, '#custom-accent', '#ffff00');
  await app.run("document.querySelector('#custom-accent').dispatchEvent(new Event('change', { bubbles: true }))");
  for (let i = 0; i < 30 && (await app.run('window.desk.settings()')).brand.accent !== '#ffff00'; i += 1) await new Promise((r) => setTimeout(r, 100));
  assert.notEqual(await variable(app, '--t-accent'), '#ffff00');
  assert.equal(await app.run("ADBrand.contrast(getComputedStyle(document.documentElement).getPropertyValue('--t-accent').trim(), ADThemes.THEMES.light.sheet) >= 4.5"), true);

  // Glass stays solid while a panel or background colour is in use, and the dialog says so.
  await app.run("window.desk.saveSettings({ glass: true }).then((s) => { AD.applyLook(s); document.dispatchEvent(new CustomEvent('ad:look', { detail: s })); })");
  await app.until("document.documentElement.dataset.surface === 'solid' && /Glass stays solid/.test(document.querySelector('#customize .note').textContent)", 'the note about Glass');

  // High Contrast keeps its own colours, and says so.
  await app.run("window.desk.saveSettings({ theme: 'contrast' }).then((s) => { AD.applyLook(s); document.dispatchEvent(new CustomEvent('ad:look', { detail: s })); })");
  await app.until("/High Contrast, which keeps its own colours/.test(document.querySelector('#customize .note').textContent)", 'the note about High Contrast');
  assert.equal(await variable(app, '--t-accent'), '#ffff00', 'High Contrast\'s own yellow');
  assert.equal(await variable(app, '--t-panel'), '#000000');
  await app.run("window.desk.saveSettings({ theme: 'system' }).then((s) => { AD.applyLook(s); document.dispatchEvent(new CustomEvent('ad:look', { detail: s })); })");

  // Back to the theme's own: all three at once.
  await app.click('#customize-reset');
  await app.until(`getComputedStyle(document.documentElement).getPropertyValue('--t-panel').trim() === '${plain.panel}'`, 'the panel to go back');
  assert.deepEqual({ accent: await variable(app, '--t-accent'), panel: await variable(app, '--t-panel'), desk: await variable(app, '--t-desk') }, plain);
  assert.deepEqual((await app.run('window.desk.settings()')).brand, { accent: '', panel: '', background: '' });
  assert.equal(await app.run("document.querySelectorAll('#customize .swatch[aria-pressed=\"true\"]').length"), 3);
  await app.key('Escape');
  await app.until("!document.querySelector('dialog#customize')", 'Escape to close it');
});

e2e('a colour that was only being tried does not stay when the dialog is closed, and Customize Theme opens from the pop-up and from Preferences', async (app) => {
  await app.click('#theme-button');
  await app.until("document.querySelector('#theme-pop:popover-open')");
  await app.click('#tb-customize');
  await app.until("document.querySelector('dialog#customize[open]')", 'Customize Theme from the pop-up');
  const plain = await variable(app, '--t-desk');
  await drag(app, '#custom-background', '#4d1518');
  assert.equal(await variable(app, '--t-desk'), '#4d1518');
  await app.key('Escape'); // without letting the colour go
  await app.until("!document.querySelector('dialog#customize')");
  await app.until(`getComputedStyle(document.documentElement).getPropertyValue('--t-desk').trim() === '${plain}'`, 'the tried colour to go');
  assert.equal((await app.run('window.desk.settings()')).brand.background, '');

  await app.run('void AD.openPreferences()');
  await app.until("document.querySelector('#pref-customize')");
  await app.click('#pref-customize');
  await app.until("document.querySelector('dialog#customize[open]') && !document.querySelector('dialog#preferences')", 'Customize Theme from Preferences');
});

e2e('Back to the usual in Preferences takes your colours off too', async (app) => {
  await app.run("window.desk.saveSettings({ brand: { accent: '#e8590c', panel: '#14432f' }, theme: 'sepia' }).then((s) => { AD.applyLook(s); })");
  await app.until("getComputedStyle(document.documentElement).getPropertyValue('--t-panel').trim() === '#14432f'");
  await app.run('void AD.openPreferences()');
  await app.until("document.querySelector('#pref-theme')");
  await app.clickText('Back to the usual', 'dialog');
  await app.until("document.documentElement.dataset.theme !== 'sepia' && getComputedStyle(document.documentElement).getPropertyValue('--t-panel').trim() !== '#14432f'", 'the usual look to come back');
  assert.deepEqual((await app.run('window.desk.settings()')).brand, { accent: '', panel: '', background: '' });
});
