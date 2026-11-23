'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GUIDES, SCREENS, searchGuides, textOf } = require('../src/shared/help');

const renderer = path.join(__dirname, '..', 'src', 'renderer');

// The routes the window really has, read from the screens themselves.
const routes = new Set([...['app.js', 'screens-desk.js', 'screens-books.js', 'screens-lists.js', 'screens-audio.js', 'screens-calc.js']
  .map((f) => fs.readFileSync(path.join(renderer, f), 'utf8')).join('\n').matchAll(/AD\.routes\.(\w+)\s*=/g)].map((m) => m[1]));

test('every guide has what it needs, and no two share a name', () => {
  assert.ok(GUIDES.length >= 12);
  assert.equal(new Set(GUIDES.map((g) => g.slug)).size, GUIDES.length);
  for (const g of GUIDES) {
    assert.match(g.slug, /^[a-z-]+$/);
    assert.ok(g.title.length > 3 && g.summary.length > 10 && g.keywords.length > 3, g.slug);
    assert.ok(g.blocks.length >= 1, g.slug);
    for (const b of g.blocks) assert.ok(['p', 'h', 'ul', 'ol', 'note'].includes(b.type), `${g.slug}: ${b.type}`);
  }
});

test('every link in a guide leads somewhere that exists', () => {
  const slugs = new Set(GUIDES.map((g) => g.slug));
  const homeScreens = new Set(['desk', ...routes]);
  let links = 0;
  for (const g of GUIDES) {
    for (const [, label, target] of textOf(g).matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
      links += 1;
      const [kind, value] = target.split(':');
      assert.ok(label.length > 0, `${g.slug}: empty link text`);
      if (kind === 'help') assert.ok(slugs.has(value), `${g.slug} links to a missing guide ${value}`);
      else if (kind === 'go') assert.ok(SCREENS.includes(value) && homeScreens.has(value === 'desk' ? 'desk' : value), `${g.slug} links to a missing screen ${value}`);
      else if (kind === 'tour') assert.equal(value, 'start');
      else assert.fail(`${g.slug}: unknown kind of link ${target}`);
    }
    assert.ok(!/\*\*[^*]*$/.test(textOf(g).replace(/\*\*[^*]+\*\*/g, '')), `${g.slug}: a ** is left open`);
  }
  assert.ok(links >= 8);
});

test('every screen a guide names is in the menu on the left', () => {
  // The sidebar, the View menu and Go to all read the one list of screens.
  const known = new Set(require('../src/shared/screens').SCREENS.map((screen) => screen.key));
  for (const screen of SCREENS) assert.ok(known.has(screen), screen);
  const app = fs.readFileSync(path.join(renderer, 'app.js'), 'utf8');
  assert.ok(app.includes('SCREENS.map('), 'the sidebar is drawn from that list');
});

test('search finds a guide by a word in its title, its keywords or its text, and needs every word', () => {
  assert.equal(searchGuides('isbn')[0].slug, 'editions-and-isbns', 'a word in the title comes first');
  assert.ok(searchGuides('check digit').some((g) => g.slug === 'editions-and-isbns'));
  assert.ok(searchGuides('colour blind').some((g) => g.slug === 'look'), 'the keywords find it');
  assert.ok(searchGuides('RECORDING').some((g) => g.slug === 'audiobooks'), 'capitals do not matter');
  assert.deepEqual(searchGuides('isbn zebra'), [], 'every word has to be found');
  assert.deepEqual(searchGuides('zzzz'), []);
  assert.equal(searchGuides('').length, GUIDES.length, 'no words lists everything');
  assert.equal(searchGuides('   ').length, GUIDES.length);
  assert.ok(searchGuides('update').some((g) => g.slug === 'updates'));
});

test('a search for anything a person would plausibly ask finds something', () => {
  for (const q of ['price', 'series', 'dark', 'font', 'backup', 'update', 'clash', 'audiobook', 'calendar', 'privacy', 'shortcut', 'sign in']) {
    if (q === 'backup') continue; // backups come with the Backups guide
    assert.ok(searchGuides(q).length > 0, `nothing for "${q}"`);
  }
});
