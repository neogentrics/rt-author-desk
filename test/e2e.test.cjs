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
