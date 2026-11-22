'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApi } = require('../src/main/api');
const { Catalog, CatalogError } = require('../src/main/catalog');
const { findClashes } = require('../src/main/clashes');
const { exportAll } = require('../src/main/export');
const { migrate, openDatabase } = require('../src/main/storage/database');
const { Library } = require('../src/main/storage/library');
const { STEPS } = require('../src/main/storage/schema');
const { Trash } = require('../src/main/trash');
const { parseCsv } = require('../src/shared/csv');

const TODAY = '2027-01-10';
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));
const refused = (fn, pattern) => assert.throws(fn, (e) => e instanceof CatalogError && pattern.test(e.message), String(pattern));
const credit = (library) => findClashes(library, { today: TODAY }).filter((c) => c.kind === 'credits-differ');

// An ebook with an editor and a cover artist, live on two stores.
function shelf() {
  const library = new Library(temp()).open();
  const catalog = new Catalog(library);
  const book = catalog.saveBook({ title: 'Book One' });
  const ebook = catalog.saveEdition({ book_id: book.id, format: 'ebook' });
  const editor = catalog.savePerson({ name: 'Made-up Editor' });
  const artist = catalog.savePerson({ name: 'Made-up Artist' });
  const edited = catalog.saveCredit({ edition_id: ebook.id, person_id: editor.id, role: 'editor' });
  const covered = catalog.saveCredit({ edition_id: ebook.id, person_id: artist.id, role: 'cover-artist' });
  const kdp = catalog.saveListing({ edition_id: ebook.id, store_id: 'store-kdp', status: 'live' });
  const kobo = catalog.saveListing({ edition_id: ebook.id, store_id: 'store-kobo', status: 'live' });
  return { library, catalog, book, ebook, editor, artist, edited, covered, kdp, kobo };
}

test('a library from step 7 gains people and credits, and its listings start as not written down', () => {
  const file = path.join(temp(), 'old.db');
  const key = crypto.randomBytes(32);
  let db = openDatabase(file, key);
  migrate(db, file, { steps: STEPS.filter((s) => s.version <= 7) });
  db.prepare("INSERT INTO books (id, title, created_at, updated_at, device_id) VALUES ('b1', 'Made-up Book', '2026-01-01', '2026-01-01', 'd')").run();
  db.prepare("INSERT INTO editions (id, book_id, format, created_at, updated_at, device_id) VALUES ('e1', 'b1', 'ebook', '2026-01-01', '2026-01-01', 'd')").run();
  db.prepare("INSERT INTO listings (id, edition_id, store_id, created_at, updated_at, device_id) VALUES ('l1', 'e1', 'store-kdp', '2026-01-01', '2026-01-01', 'd')").run();
  db.close();
  db = openDatabase(file, key);
  const result = migrate(db, file, { steps: STEPS });
  assert.deepEqual([result.from, result.to], [7, STEPS.at(-1).version]);
  assert.equal(db.prepare("SELECT credits_recorded FROM listings WHERE id = 'l1'").get().credits_recorded, 0);
  for (const table of ['people', 'credits', 'listing_credits']) assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
  db.close();
});

test('a person is in the list once, whatever the capitals, and a name is needed', () => {
  const { library, catalog, editor } = shelf();
  refused(() => catalog.savePerson({ name: '  made-up EDITOR ' }), /already in your list/);
  refused(() => catalog.savePerson({ name: '   ' }), /needs a name/);
  assert.equal(catalog.savePerson({ id: editor.id, name: 'Made-up Editor', notes: 'Likes mornings' }).notes, 'Likes mornings', 'saving someone as themselves is fine');
  assert.equal(catalog.savePerson({ name: '  Padded Name  ' }).name, 'Padded Name');
  library.close();
});

test('a credit needs a real edition, a real person and a role from the list, and is made once', () => {
  const { library, catalog, ebook, editor } = shelf();
  refused(() => catalog.saveCredit({ edition_id: ebook.id, person_id: editor.id, role: 'editor' }), /already credited as editor/);
  refused(() => catalog.saveCredit({ edition_id: ebook.id, person_id: editor.id, role: 'wizard' }), /What did Made-up Editor do/);
  refused(() => catalog.saveCredit({ edition_id: ebook.id, person_id: 'nobody', role: 'editor' }), /isn't in your list/);
  refused(() => catalog.saveCredit({ edition_id: 'nothing', person_id: editor.id, role: 'editor' }), /isn't in your library/);
  refused(() => catalog.saveCredit({ person_id: editor.id, role: 'editor' }), /a person on an edition/);
  const second = catalog.saveCredit({ edition_id: ebook.id, person_id: editor.id, role: 'proofreader' });
  assert.equal(second.role, 'proofreader', 'one person can hold two roles');
  refused(() => catalog.saveCredit({ id: second.id, role: 'editor' }), /already credited as editor/);
  assert.equal(catalog.saveCredit({ id: second.id, notes: 'Second pass' }).notes, 'Second pass');
  library.close();
});

test('a person who is credited cannot be removed, and one who is not can', () => {
  const { library, catalog, editor, edited } = shelf();
  refused(() => catalog.removePerson(editor.id), /credited on 1 edition. Remove that credit first/);
  catalog.removeCredit(edited.id);
  catalog.removePerson(editor.id);
  assert.equal(library.get('people', editor.id), null);
  refused(() => catalog.removePerson(editor.id), /isn't in your list/);
  library.close();
});

test('what a store shows is chosen from the edition\'s own credits', () => {
  const { library, catalog, kdp, edited, covered } = shelf();
  const other = catalog.saveBook({ title: 'Book Two' });
  const elsewhere = catalog.saveCredit({ edition_id: catalog.saveEdition({ book_id: other.id, format: 'ebook' }).id, person_id: library.list('people')[0].id, role: 'editor' });
  refused(() => catalog.setListingCredits(kdp.id, [elsewhere.id]), /isn't on this listing's edition/);
  refused(() => catalog.setListingCredits('nothing', []), /isn't in your library/);
  assert.equal(library.get('listings', kdp.id).credits_recorded, 0);
  catalog.setListingCredits(kdp.id, [edited.id, covered.id, edited.id]);
  assert.deepEqual(new Set(catalog.creditsShownOn(kdp.id)), new Set([edited.id, covered.id]));
  catalog.setListingCredits(kdp.id, [covered.id]);
  assert.deepEqual(catalog.creditsShownOn(kdp.id), [covered.id], 'one is taken off');
  catalog.setListingCredits(kdp.id, []);
  assert.deepEqual(catalog.creditsShownOn(kdp.id), []);
  assert.equal(library.get('listings', kdp.id).credits_recorded, 1, 'showing none is something you wrote down');
  library.close();
});

test('taking a credit off an edition takes it off every store, and removing a listing takes its list', () => {
  const { library, catalog, kdp, kobo, edited, covered } = shelf();
  catalog.setListingCredits(kdp.id, [edited.id, covered.id]);
  catalog.setListingCredits(kobo.id, [edited.id]);
  catalog.removeCredit(edited.id);
  assert.deepEqual(catalog.creditsShownOn(kdp.id), [covered.id]);
  assert.deepEqual(catalog.creditsShownOn(kobo.id), []);
  catalog.removeListing(kdp.id);
  assert.equal(library.list('listing_credits').length, 0, 'what kdp showed went with it, and kobo\'s is empty');
  refused(() => catalog.removeCredit(edited.id), /isn't in your library/);
  library.close();
});

test('no check at all until a store\'s credits are written down', () => {
  const { library, catalog, kdp, kobo, edited, covered } = shelf();
  assert.deepEqual(credit(library), [], 'nothing written down, nothing to compare');
  catalog.setListingCredits(kdp.id, [edited.id, covered.id]);
  assert.deepEqual(credit(library), [], 'one store written down and complete; the other not looked at');
  catalog.setListingCredits(kobo.id, [covered.id]);
  const [clash] = credit(library);
  assert.equal(clash.severity, 'check');
  assert.match(clash.title, /Book One: ebook leaves Made-up Editor \(editor\) off Kobo/);
  assert.match(clash.detail, /on the edition and shown on Amazon KDP, but not on Kobo/);
  assert.deepEqual(clash.subjects.map((s) => s.table), ['listings', 'credits']);
  assert.equal(clash.edition_id, kobo.edition_id);
  library.close();
});

test('two missing credits are named together, and a store showing everything is fine', () => {
  const { library, catalog, kdp, kobo, edited, covered } = shelf();
  catalog.setListingCredits(kdp.id, []);
  const [clash] = credit(library);
  assert.match(clash.title, /leaves Made-up Editor \(editor\) and Made-up Artist \(cover artist\) off Amazon KDP/);
  assert.match(clash.detail, /These credits are on the edition, but not on Amazon KDP/);
  catalog.setListingCredits(kdp.id, [edited.id, covered.id]);
  assert.deepEqual(credit(library), []);
  library.close();
});

test('a store that is not on sale is not checked, and a dismissal holds until the facts change', () => {
  const { library, catalog, kdp, edited, covered } = shelf();
  catalog.setListingCredits(kdp.id, [covered.id]);
  assert.equal(credit(library).length, 1);
  catalog.saveListing({ id: kdp.id, status: 'planned' });
  assert.deepEqual(credit(library), [], 'planned');
  catalog.saveListing({ id: kdp.id, status: 'pulled' });
  assert.deepEqual(credit(library), [], 'pulled');
  catalog.saveListing({ id: kdp.id, status: 'pre-order' });
  const [clash] = credit(library);
  assert.ok(clash, 'a pre-order is on sale');
  const { dismissClash } = require('../src/main/clashes');
  dismissClash(library, clash.key, 'This store has no room for an editor');
  assert.deepEqual(credit(library), []);
  catalog.setListingCredits(kdp.id, []);
  assert.equal(credit(library).length, 1, 'now two are missing, so it is a different clash');
  library.close();
});

test('an edition in the Trash comes back with its credits and what each store showed', () => {
  const { library, catalog, ebook, kdp, kobo, edited, covered } = shelf();
  catalog.setListingCredits(kdp.id, [edited.id, covered.id]);
  catalog.setListingCredits(kobo.id, [covered.id]);
  const trash = new Trash(library);
  const before = JSON.stringify(['credits', 'listing_credits', 'listings'].map((t) => library.db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()));
  trash.removeEdition(ebook.id);
  for (const table of ['credits', 'listing_credits']) assert.equal(library.list(table).length, 0, `${table} went with it`);
  assert.equal(library.list('people').length, 2, 'the people stay');
  trash.restore(trash.list()[0].id);
  assert.equal(JSON.stringify(['credits', 'listing_credits', 'listings'].map((t) => library.db.prepare(`SELECT * FROM ${t} ORDER BY id`).all())), before, 'exactly as it was');
  assert.equal(credit(library).length, 1);
  library.close();
});

test('a listing in the Trash comes back with what it showed', () => {
  const { library, catalog, kdp, edited, covered } = shelf();
  catalog.setListingCredits(kdp.id, [edited.id, covered.id]);
  const trash = new Trash(library);
  trash.removeListing(kdp.id);
  assert.equal(library.list('listing_credits').length, 0);
  trash.restore(trash.list()[0].id);
  assert.deepEqual(new Set(catalog.creditsShownOn(kdp.id)), new Set([edited.id, covered.id]));
  assert.equal(library.get('listings', kdp.id).credits_recorded, 1);
  library.close();
});

test('a person who was removed while their edition waited in the Trash is left off when it comes back', () => {
  const { library, catalog, ebook, kdp, kobo, editor, edited, covered } = shelf();
  catalog.setListingCredits(kdp.id, [edited.id, covered.id]);
  const trash = new Trash(library);
  trash.removeEdition(ebook.id);
  library.remove('people', editor.id);
  trash.restore(trash.list()[0].id);
  assert.deepEqual(catalog.creditsOf(ebook.id).map((c) => c.role), ['cover-artist'], 'no credit pointing at nobody');
  assert.deepEqual(catalog.creditsShownOn(kdp.id), [covered.id]);
  assert.deepEqual(credit(library), [], 'and so nothing is left out');
  library.close();
});

test('the window can credit people, write down what a store shows, and is told what is in the way', () => {
  const library = new Library(temp()).open();
  const { call } = createApi(library, { now: () => new Date(2027, 0, 10), locale: 'en-US' });
  const book = call('saveBook', { title: 'Book One' }).value;
  const edition = call('saveEdition', { book_id: book.id, format: 'ebook' }).value;
  const person = call('savePerson', { name: 'Made-up Editor' }).value;
  assert.deepEqual(call('names').value.roles[0], { value: 'editor', label: 'Editor' });
  assert.match(call('savePerson', { name: 'made-up editor' }).message, /already in your list/);
  const made = call('saveCredit', { edition_id: edition.id, person_id: person.id, role: 'editor' }).value;
  assert.match(call('saveCredit', { edition_id: edition.id, person_id: person.id, role: 'editor' }).message, /already credited/);
  const listing = call('saveListing', { edition_id: edition.id, store_id: 'store-kdp', status: 'live' }).value;
  assert.equal(call('setListingCredits', { listingId: listing.id, creditIds: [made.id] }).ok, true);
  const page = call('book', { id: book.id }).value;
  const [shown] = page.editions[0].credits;
  assert.deepEqual([shown.person_name, shown.role_label], ['Made-up Editor', 'Editor']);
  assert.deepEqual(page.editions[0].listings[0].credit_ids, [made.id]);
  assert.equal(page.editions[0].listings[0].credits_recorded, 1);
  const [listed] = call('names').value.people;
  assert.deepEqual(listed.credits, [{ edition: 'Book One: ebook', role: 'Editor' }]);
  assert.match(call('removePerson', { id: person.id }).message, /credited on 1 edition/);
  assert.equal(call('removeCredit', { id: made.id }).ok, true);
  assert.equal(call('removePerson', { id: person.id }).ok, true);
  library.close();
});

test('the export holds people and credits, with names beside the ids', () => {
  const { library, catalog, kdp, edited } = shelf();
  catalog.setListingCredits(kdp.id, [edited.id]);
  const made = exportAll(library, temp(), { now: () => new Date(2027, 0, 10, 9, 0, 0), version: '1.0.0' });
  const read = (name) => parseCsv(fs.readFileSync(path.join(made.folder, 'csv', name), 'utf8').replace(/^\uFEFF/, ''));
  const [header, row] = read('credits.csv');
  const at = (rows, col) => rows.indexOf(col);
  assert.ok(header.includes('person_name') && header.includes('edition'));
  assert.equal(row[at(header, 'person_name')], 'Made-up Editor');
  assert.equal(row[at(header, 'role')], 'editor');
  assert.equal(read('people.csv').length, 3, 'a header and two people');
  const [lh, lr] = read('listing-credits.csv');
  assert.deepEqual([lr[at(lh, 'store_name')], lr[at(lh, 'person_name')], lr[at(lh, 'role')]], ['Amazon KDP', 'Made-up Editor', 'editor']);
  const json = JSON.parse(fs.readFileSync(path.join(made.folder, 'library.json'), 'utf8'));
  assert.deepEqual([json.counts.people, json.counts.credits, json.counts.listing_credits], [2, 2, 1]);
  assert.ok(json.tables.listings.some((l) => l.credits_recorded === 1));
  library.close();
});
