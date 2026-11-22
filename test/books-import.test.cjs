'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApi } = require('../src/main/api');
const { BookImportError, BookImporter, amazonAsin, cleanRelation, formatsOf, guessMapping, parseDateText, statusOf } = require('../src/main/books-import');
const { Catalog } = require('../src/main/catalog');
const { Library } = require('../src/main/storage/library');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const refused = (fn, pattern) => assert.throws(fn, (e) => e instanceof BookImportError && pattern.test(e.message), String(pattern));
const count = (library, table) => library.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;

// A made-up export shaped like Notion's: the series is a relation, so its cell carries the page's address; formats are a multi-select,
// so they share a cell; the date is written out; and a range, a repeat and a row with no title are in there too.
const NOTION = [
  'Title,Series,Status,Formats,Publish Date,Amazon Link,Notes',
  'Tidewater,The Tidewater Books (https://www.notion.so/The-Tidewater-Books-0a1b2c3d),Published,"Ebook, Paperback, Audiobook","March 1, 2025",https://www.amazon.com/dp/B0SAMPLE01,"First book, the one with ""the lamp"""',
  'Low Water,The Tidewater Books (https://www.notion.so/The-Tidewater-Books-0a1b2c3d),Writing,"Ebook, Paperback",November 18 2026 → November 25 2026,,',
  'A Quiet Harbour,,Idea,,,,',
  ',,Published,Ebook,,,',
  'tidewater ,The Tidewater Books (https://www.notion.so/x),Published,Ebook,,,a repeat',
].join('\n');

function start(csv = NOTION) {
  const library = new Library(temp()).open();
  const importer = new BookImporter(library);
  const opened = importer.open(Buffer.from(`\uFEFF${csv}`, 'utf8'), 'books.csv');
  const mapping = opened.guess;
  return { library, importer, opened, mapping, args: { id: opened.id, mapping } };
}

test('a Notion export opens with its columns guessed, the byte order mark and the quotes handled', () => {
  const { library, opened } = start();
  assert.deepEqual(opened.headers, ['Title', 'Series', 'Status', 'Formats', 'Publish Date', 'Amazon Link', 'Notes']);
  assert.equal(opened.rowCount, 5);
  assert.equal(opened.encoding, 'UTF-8');
  assert.deepEqual(opened.guess, { title: 0, subtitle: null, series: 1, seriesNumber: null, penName: null, status: 2, formats: 3, releaseDate: 4, link: 5, notes: 6 });
  assert.equal(opened.sample[0][6], 'First book, the one with "the lamp"');
  assert.equal(opened.sample.length, 5);
  library.close();
});

test('other headings are guessed too, and a column is used for one thing only', () => {
  const guess = guessMapping(['Book Title', 'Subtitle', 'Saga', 'Book #', 'Pen Name', 'Stage', 'Format', 'Release Date', 'Amazon URL (Kindle)', 'Comments', 'Mystery']);
  assert.deepEqual(guess, { title: 0, subtitle: 1, series: 2, seriesNumber: null, penName: 4, status: 5, formats: 6, releaseDate: 7, link: 8, notes: 9 });
  const twice = guessMapping(['Title', 'Name', 'Date', 'Published']);
  assert.deepEqual([twice.title, twice.releaseDate], [0, 2]);
  assert.equal(new Set(Object.values(twice).filter((v) => v != null)).size, Object.values(twice).filter((v) => v != null).length);
  assert.deepEqual(guessMapping(['x', 'y']), { title: null, subtitle: null, series: null, seriesNumber: null, penName: null, status: null, formats: null, releaseDate: null, link: null, notes: null });
});

test('a relation loses its page address, and several related pages leave the first', () => {
  assert.deepEqual(cleanRelation('The Tidewater Books (https://www.notion.so/The-Tidewater-Books-0a1b)'), { name: 'The Tidewater Books', several: false });
  assert.deepEqual(cleanRelation('Plain Name'), { name: 'Plain Name', several: false });
  assert.deepEqual(cleanRelation('One (https://www.notion.so/a), Two (https://www.notion.so/b)'), { name: 'One', several: true });
  assert.deepEqual(cleanRelation('A Title (with brackets)'), { name: 'A Title (with brackets)', several: false }, 'brackets that are not an address stay');
  assert.deepEqual(cleanRelation(''), { name: '', several: false });
});

test('dates as people write them, a range as its first day, and slashes as the person says', () => {
  const iso = (text, order) => parseDateText(text, order).iso;
  assert.equal(iso('2026-11-18'), '2026-11-18');
  assert.equal(iso('2026/11/18'), '2026-11-18');
  assert.equal(iso('2026-11-18T09:30:00'), '2026-11-18');
  assert.equal(iso('November 18, 2026'), '2026-11-18');
  assert.equal(iso('Nov 18, 2026'), '2026-11-18');
  assert.equal(iso('Nov. 8th, 2026'), '2026-11-08');
  assert.equal(iso('18 November 2026'), '2026-11-18');
  assert.equal(iso('November 18, 2026 → November 25, 2026'), '2026-11-18');
  assert.equal(iso('3/1/2025'), '2025-03-01', 'month first unless told');
  assert.equal(iso('3/1/2025', 'day-first'), '2025-01-03');
  assert.equal(iso('25/12/2026'), '2026-12-25', 'a 25 can only be the day');
  assert.equal(iso('1.3.2025', 'day-first'), '2025-03-01');
  assert.match(parseDateText('March 2025').reason, /no day in it/);
  assert.match(parseDateText('2025').reason, /no day in it/);
  assert.match(parseDateText('soon').reason, /isn't a date/);
  assert.match(parseDateText('2026-02-30').reason, /isn't a real day/);
  assert.equal(parseDateText('').empty, true);
  assert.equal(parseDateText('   ').iso, null);
});

test('formats: the usual words, several in a cell, and what is left out is said', () => {
  assert.deepEqual(formatsOf('Ebook, Paperback, Audiobook').formats, ['ebook', 'paperback', 'audiobook']);
  assert.deepEqual(formatsOf('E-book / Kindle').formats, ['ebook'], 'two words for one format are one format');
  assert.deepEqual(formatsOf('Print + Audio').formats, ['paperback', 'audiobook']);
  assert.deepEqual(formatsOf('Ebook (Kindle)').formats, ['ebook']);
  assert.deepEqual(formatsOf('Paperback ebook').formats.sort(), ['ebook', 'paperback']);
  assert.deepEqual(formatsOf('Hardback and Large Print').formats, ['hardcover', 'large print']);
  assert.deepEqual(formatsOf('Zine, Ebook'), { formats: ['ebook'], unknown: ['zine'] });
  assert.deepEqual(formatsOf('Print', { print: 'hardcover' }).formats, ['hardcover'], 'the person can say what a word means');
  assert.deepEqual(formatsOf('Zine, Ebook', { zine: '' }), { formats: ['ebook'], unknown: [] }, 'or that it is to be left out');
  assert.deepEqual(formatsOf(''), { formats: [], unknown: [] });
});

test('statuses: the usual words, and a word it does not know is asked about', () => {
  const s = (t, o) => statusOf(t, o);
  assert.equal(s('Published').status, 'live');
  assert.equal(s('LIVE').status, 'live');
  assert.equal(s('Writing').status, 'in progress');
  assert.equal(s('Idea').status, 'planned');
  assert.equal(s('Not started').status, 'planned');
  assert.equal(s('Out of Print').status, 'pulled');
  assert.equal(s('Second edition').status, 'being reworked');
  assert.deepEqual(s('Parked'), { status: null, unknown: 'parked' });
  assert.equal(s('Parked', { parked: 'pulled' }).status, 'pulled');
  assert.equal(s('Parked', { parked: 'nonsense' }).status, null, 'an override has to be a real status');
  assert.deepEqual(s(''), { status: null });
});

test('an Amazon address gives its code', () => {
  assert.equal(amazonAsin('https://www.amazon.com/dp/B0SAMPLE01'), 'B0SAMPLE01');
  assert.equal(amazonAsin('https://www.amazon.co.uk/Some-Title/dp/B0SAMPLE02/ref=sr_1_1?keywords=x'), 'B0SAMPLE02');
  assert.equal(amazonAsin('https://www.amazon.com/gp/product/b0sample03?th=1'), 'B0SAMPLE03');
  assert.equal(amazonAsin('https://example.com/dp/B0SAMPLE01'), 'B0SAMPLE01', 'the shape is what counts');
  assert.equal(amazonAsin('https://www.amazon.com/dp/SHORT'), null);
  assert.equal(amazonAsin('not a link'), null);
});

test('the plan accounts for every row, and says why a row is not used', () => {
  const { library, importer, args } = start();
  const plan = importer.plan(args);
  assert.deepEqual(plan.counts, { new: 3, exists: 0, repeat: 1, problem: 1 });
  assert.equal(plan.counts.new + plan.counts.exists + plan.counts.repeat + plan.counts.problem, plan.rowCount);
  assert.deepEqual(plan.rows.map((r) => [r.row, r.outcome]), [[2, 'new'], [3, 'new'], [4, 'new'], [5, 'problem'], [6, 'repeat']]);
  assert.deepEqual(plan.problems, [{ row: 5, reason: 'No title in this row' }]);
  assert.match(plan.rows[4].reason, /same title is higher up/);
  assert.equal(plan.rows[0].series, 'The Tidewater Books', 'without the page address');
  assert.deepEqual(plan.rows[0].formats, ['ebook', 'paperback', 'audiobook']);
  assert.equal(plan.rows[0].releaseDate, '2025-03-01');
  assert.equal(plan.rows[1].releaseDate, '2026-11-18', 'a range is its first day');
  assert.equal(plan.rows[1].status, 'in progress');
  assert.equal(plan.rows[2].status, 'planned');
  assert.ok(!('_rows' in plan), 'the window is not sent the whole file');
  assert.equal(count(library, 'books'), 0, 'planning saves nothing');
  library.close();
});

test('a status or format it does not know is listed, and what the person chooses is used', () => {
  const csv = 'Title,Status,Formats\nOne,Parked,Zine\nTwo,Parked,Ebook\nThree,Published,Ebook';
  const { library, importer, args } = start(csv);
  const plan = importer.plan(args);
  assert.deepEqual(plan.unknown, { statuses: ['parked'], formats: ['zine'] });
  assert.equal(plan.rows[0].status, 'planned', 'planned until told');
  assert.match(plan.rows[0].warnings.join(' '), /isn't a status the app knows/);
  assert.match(plan.rows[0].warnings.join(' '), /left out/);
  assert.deepEqual(plan.statuses.find((s) => s.value === 'parked'), { value: 'parked', rows: 2, mapped: null });
  const chosen = importer.plan({ ...args, maps: { status: { parked: 'being reworked' }, formats: { zine: 'paperback' } } });
  assert.equal(chosen.rows[0].status, 'being reworked');
  assert.deepEqual(chosen.rows[0].formats, ['paperback']);
  assert.deepEqual(chosen.unknown, { statuses: [], formats: [] });
  library.close();
});

test('accepting makes the books, the series, the editions with their dates, and a KDP listing from the link', () => {
  const { library, importer, args } = start();
  const done = importer.accept(args);
  assert.deepEqual([done.counts.books, done.counts.editions, done.counts.listings, done.counts.series], [3, 5, 1, 1], 'three editions for the first book, two for the second, none for the third');
  const catalog = new Catalog(library);
  const [tide, low, harbour] = ['Tidewater', 'Low Water', 'A Quiet Harbour'].map((t) => library.list('books').find((b) => b.title === t));
  assert.equal(tide.business_status, 'live');
  assert.equal(tide.notes, 'First book, the one with "the lamp"');
  assert.equal(low.business_status, 'in progress');
  assert.equal(harbour.business_status, 'planned');
  assert.equal(library.list('series').length, 1);
  assert.equal(library.list('series')[0].name, 'The Tidewater Books');
  assert.equal(tide.series_id, low.series_id);
  assert.deepEqual(catalog.editionsOf(tide.id).map((e) => [e.format, e.release_date]), [['ebook', '2025-03-01'], ['paperback', '2025-03-01'], ['audiobook', '2025-03-01']]);
  assert.deepEqual(catalog.editionsOf(low.id).map((e) => [e.format, e.release_date]), [['ebook', '2026-11-18'], ['paperback', '2026-11-18']]);
  assert.deepEqual(catalog.editionsOf(harbour.id), []);
  const ebook = catalog.editionsOf(tide.id)[0];
  const [listing] = catalog.listingsOf(ebook.id);
  assert.deepEqual([listing.store_id, listing.store_item_id, listing.status, listing.url], ['store-kdp', 'B0SAMPLE01', 'live', 'https://www.amazon.com/dp/B0SAMPLE01']);
  assert.equal(importer.history()[0].counts.books, 3);
  assert.equal(count(library, 'catalog_imports'), 1);
  library.close();
});

test('the link can be kept in the notes instead, and is when there is no ebook for it to belong to', () => {
  const { library, importer, args } = start();
  importer.accept({ ...args, options: { link: 'notes' } });
  assert.equal(count(library, 'listings'), 0);
  assert.match(library.list('books').find((b) => b.title === 'Tidewater').notes, /Link: https:\/\/www\.amazon\.com\/dp\/B0SAMPLE01/);
  library.close();

  const noEbook = start('Title,Formats,Amazon Link\nPrint Only,Paperback,https://www.amazon.com/dp/B0SAMPLE05');
  const plan = noEbook.importer.plan(noEbook.args);
  assert.match(plan.rows[0].warnings.join(' '), /kept in the notes, because there is no ebook/);
  noEbook.importer.accept(noEbook.args);
  assert.equal(count(noEbook.library, 'listings'), 0);
  assert.match(noEbook.library.list('books')[0].notes, /Link: https:\/\/www\.amazon\.com\/dp\/B0SAMPLE05/);
  noEbook.library.close();
});

test('an address that is not https is never made into a listing', () => {
  const { library, importer, args } = start('Title,Formats,Amazon Link\nOne,Ebook,http://www.amazon.com/dp/B0SAMPLE06');
  importer.accept(args);
  assert.equal(count(library, 'listings'), 0);
  assert.match(library.list('books')[0].notes, /Link: http:\/\//);
  library.close();
});

test('a book already in the library is skipped, and its series and pen name are used, not made again', () => {
  const library = new Library(temp()).open();
  const catalog = new Catalog(library);
  const pen = catalog.savePenName({ name: 'A. Writer' });
  const series = catalog.saveSeries({ name: 'the tidewater books', pen_name_id: pen.id });
  catalog.saveBook({ title: 'TIDEWATER', series_id: series.id });
  const importer = new BookImporter(library);
  const csv = 'Title,Series,Pen Name\nTidewater,The Tidewater Books,A. Writer\nLow Water,The Tidewater Books,A. Writer\nFresh Start,New Saga,A. WRITER';
  const opened = importer.open(Buffer.from(csv), 'x.csv');
  const plan = importer.plan({ id: opened.id, mapping: opened.guess });
  assert.deepEqual(plan.counts, { new: 2, exists: 1, repeat: 0, problem: 0 });
  assert.equal(plan.rows[0].outcome, 'exists');
  importer.accept({ id: opened.id, mapping: opened.guess });
  assert.equal(library.list('series').length, 2, 'only New Saga is new');
  assert.equal(library.list('pen_names').length, 1);
  assert.equal(library.list('books').length, 3);
  assert.equal(library.list('books').find((b) => b.title === 'Low Water').series_id, series.id);
  assert.equal(library.list('series').find((s) => s.name === 'New Saga').pen_name_id, pen.id, 'a new series is under the pen name');
  library.close();
});

test('importing the same file twice brings in nothing the second time, and says so', () => {
  const { library, importer, opened, mapping } = start();
  importer.accept({ id: opened.id, mapping });
  const again = importer.open(Buffer.from(NOTION), 'again.csv');
  const plan = importer.plan({ id: again.id, mapping: again.guess });
  assert.deepEqual(plan.counts, { new: 0, exists: 4, repeat: 0, problem: 1 }, 'the repeated row is already here too');
  refused(() => importer.accept({ id: again.id, mapping: again.guess }), /already in your library/);
  assert.equal(count(library, 'books'), 3);
  assert.equal(count(library, 'catalog_imports'), 1);
  library.close();
});

test('undoing takes back everything the import made, and leaves what was there before', () => {
  const library = new Library(temp()).open();
  const catalog = new Catalog(library);
  const older = catalog.saveSeries({ name: 'The Tidewater Books' });
  const importer = new BookImporter(library);
  const opened = importer.open(Buffer.from(NOTION), 'books.csv');
  const args = { id: opened.id, mapping: opened.guess };
  const done = importer.accept(args);
  assert.equal(count(library, 'books'), 3);
  const undone = importer.undo({ id: done.importId });
  assert.deepEqual(undone, { removed: 3, kept: [] });
  assert.equal(count(library, 'books') + count(library, 'editions') + count(library, 'listings'), 0);
  assert.deepEqual(library.list('series').map((s) => s.id), [older.id], 'the series that was already there stays');
  assert.equal(importer.history()[0].status, 'undone');
  refused(() => importer.undo({ id: done.importId }), /already undone/);
  refused(() => importer.undo({ id: 'nope' }), /isn't in your library/);
  assert.ok(library.removals().length >= 3, 'removals leave their markers');
  // and the file can be brought in again
  const again = importer.open(Buffer.from(NOTION), 'books.csv');
  assert.equal(importer.accept({ id: again.id, mapping: again.guess }).counts.books, 3);
  library.close();
});

test('a book you have added to since is not taken away by an undo, and the series it needs stays', () => {
  const { library, importer, args } = start();
  const done = importer.accept(args);
  const catalog = new Catalog(library);
  const low = library.list('books').find((b) => b.title === 'Low Water');
  catalog.saveEdition({ book_id: low.id, format: 'hardcover' });
  const undone = importer.undo({ id: done.importId });
  assert.deepEqual(undone, { removed: 2, kept: ['Low Water'] });
  assert.deepEqual(library.list('books').map((b) => b.title), ['Low Water']);
  assert.equal(library.list('series').length, 1, 'the series is still used by the book that stayed');
  library.close();
});

test('if anything fails, nothing is brought in, and the message says which row', () => {
  const { library, importer, args } = start();
  const put = library.put.bind(library);
  let editions = 0;
  library.put = (table, record) => {
    if (table === 'editions' && (editions += 1) === 4) throw new Error('the disk is full');
    return put(table, record);
  };
  assert.throws(() => importer.accept(args), /disk is full/);
  library.put = put;
  assert.equal(count(library, 'books') + count(library, 'editions') + count(library, 'series') + count(library, 'catalog_imports'), 0);

  // A refusal from the catalog names the row.
  const real = library.get.bind(library);
  const catalog = Catalog.prototype.saveEdition;
  Catalog.prototype.saveEdition = function broken(fields) {
    if (fields.format === 'paperback') throw new (require('../src/main/catalog').CatalogError)('A paperback has gone wrong.');
    return catalog.call(this, fields);
  };
  try {
    refused(() => importer.accept(args), /Row 2, "Tidewater": A paperback has gone wrong\. Nothing was brought in\./);
  } finally {
    Catalog.prototype.saveEdition = catalog;
  }
  assert.equal(count(library, 'books'), 0);
  assert.ok(real);
  library.close();
});

test('the columns have to make sense, and are checked in words', () => {
  const { library, importer, opened } = start();
  refused(() => importer.plan({ id: opened.id, mapping: { ...opened.guess, title: null } }), /Choose which column holds the title/);
  refused(() => importer.plan({ id: opened.id, mapping: { ...opened.guess, series: 0 } }), /Each column can be used once/);
  refused(() => importer.plan({ id: opened.id, mapping: { ...opened.guess, notes: 99 } }), /isn't in the file/);
  refused(() => importer.plan({ id: 'gone', mapping: opened.guess }), /no longer open/);
  library.close();
});

test('a file that is not a list of books is refused in words', () => {
  const library = new Library(temp()).open();
  const importer = new BookImporter(library);
  refused(() => importer.open(Buffer.from('Title,Series\n'), 'x.csv'), /no rows of books/);
  refused(() => importer.open(Buffer.from(''), 'x.csv'), /no rows of books/);
  refused(() => importer.open(Buffer.from('a,"b\nc'), 'x.csv'), /never closed/);
  refused(() => importer.open('not a buffer'), /isn't a file/);
  refused(() => importer.open(Buffer.alloc(21 * 1024 * 1024)), /too big/);
  library.close();
});

test('semicolons, tabs, Windows-1252 and blank or repeated headings all open', () => {
  const library = new Library(temp()).open();
  const importer = new BookImporter(library);
  const semi = importer.open(Buffer.from('Title;Series\nTidewater;Saga'), 's.csv');
  assert.deepEqual(semi.headers, ['Title', 'Series']);
  const tab = importer.open(Buffer.from('Title\tStatus\nTidewater\tLive'), 't.tsv');
  assert.deepEqual(tab.guess.status, 1);
  const old = importer.open(Buffer.concat([Buffer.from('Title\nCaf'), Buffer.from([0xe9]), Buffer.from(' Noir')]), 'old.csv');
  assert.equal(old.encoding, 'Windows-1252');
  assert.equal(old.sample[0][0], 'Café Noir');
  const odd = importer.open(Buffer.from('Title,,Title\nA,b,c'), 'odd.csv');
  assert.deepEqual(odd.headers, ['Title', 'Column 2', 'Title (2)']);
  library.close();
});

test('a day-first date setting changes what 3/1/2025 means, and the plan shows it', () => {
  const { library, importer, args } = start('Title,Formats,Publish Date\nOne,Ebook,3/1/2025');
  assert.equal(importer.plan(args).rows[0].releaseDate, '2025-03-01');
  assert.equal(importer.plan({ ...args, options: { dateOrder: 'day-first' } }).rows[0].releaseDate, '2025-01-03');
  library.close();
});

test('the window can plan, accept and undo, and a bad request comes back in words', () => {
  const library = new Library(temp()).open();
  const { call, booksImporter } = createApi(library, { now: () => new Date(2026, 10, 18), locale: 'en-US' });
  const opened = booksImporter.open(Buffer.from(NOTION), 'books.csv');
  const args = { id: opened.id, mapping: opened.guess };
  const planned = call('planBooksImport', args);
  assert.equal(planned.ok, true);
  assert.equal(planned.value.counts.new, 3);
  const done = call('acceptBooksImport', args);
  assert.equal(done.ok, true);
  assert.equal(call('booksImports').value.length, 1);
  assert.equal(call('undoBooksImport', { id: done.value.importId }).value.removed, 3);
  const bad = call('acceptBooksImport', { id: 'gone', mapping: {} });
  assert.deepEqual([bad.ok, /no longer open/.test(bad.message)], [false, true]);
  library.close();
});
