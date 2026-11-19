'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApi } = require('../src/main/api');
const { findClashes } = require('../src/main/clashes');
const { Library } = require('../src/main/storage/library');
const { addDays, fillSample } = require('../src/main/sample');

const TODAY = '2026-11-18';
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-test-'));

test('the made-up catalog fills a library with books, a series and every kind of thing the tour shows', () => {
  const library = new Library(temp()).open();
  fillSample(library, TODAY);
  assert.deepEqual(library.list('books').map((b) => b.title).sort(), ['A Quiet Harbour', 'Low Water', 'Tidewater']);
  assert.equal(library.list('series').length, 1);
  assert.deepEqual(new Set(library.list('editions').map((e) => e.format)), new Set(['ebook', 'paperback', 'audiobook']));
  assert.ok(library.list('listings').length >= 6);
  assert.ok(library.list('recordings').some((r) => r.voice === 'synthesized') && library.list('recordings').some((r) => r.voice === 'human'));
  assert.ok(library.list('isbns').some((i) => !i.edition_id), 'a spare number in the register');
  assert.ok(library.list('prices').length >= 4);
  library.close();
});

test('the tour has problems to find, and something coming up', () => {
  const library = new Library(temp()).open();
  fillSample(library, TODAY);
  const kinds = new Set(findClashes(library, { today: TODAY }).map((c) => c.kind));
  for (const kind of ['exclusive-program-elsewhere', 'free-isbn-elsewhere', 'publisher-differs', 'release-without-final']) {
    assert.ok(kinds.has(kind), `no ${kind} clash in the sample`);
  }
  const { call } = createApi(library, { now: () => new Date(2026, 10, 18), locale: 'en-US' });
  const desk = call('desk').value;
  assert.equal(desk.nextRelease.title, 'Low Water');
  assert.equal(desk.nextRelease.days_away, 21);
  assert.equal(call('calendar').value.length >= 2, true);
  assert.equal(call('audiobooks').value.counts.waiting, 1);
  library.close();
});

test('everything in it is made up', () => {
  const library = new Library(temp()).open();
  fillSample(library, TODAY);
  const text = JSON.stringify(['books', 'series', 'pen_names', 'publisher_names', 'recordings', 'listings', 'isbns'].map((t) => library.list(t)));
  assert.ok(/A\. Writer/.test(text) && /Harbour Lane/.test(text));
  assert.ok(!/@/.test(text) && !/https?:/.test(text), 'no addresses of any kind');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  library.close();
});
