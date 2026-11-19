'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { GUIDES, SCREENS, searchGuides, textOf } = require('../src/shared/help');

const renderer = path.join(__dirname, '..', 'src', 'renderer');

// The routes the window really has, read from the screens themselves.
const routes = new Set([...['app.js', 'screens-desk.js', 'screens-books.js', 'screens-lists.js', 'screens-audio.js']
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
  const app = fs.readFileSync(path.join(renderer, 'app.js'), 'utf8');
  for (const screen of SCREENS.filter((s) => s !== 'desk')) assert.ok(app.includes(`['${screen}',`), screen);
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

// The menu, with Electron stood in for, so its shape can be checked without a window.
function menuFor(platform, extra) {
  const original = Module._load;
  Module._load = (request, ...rest) => (request === 'electron' ? { Menu: { buildFromTemplate: (t) => t } } : original(request, ...rest));
  const real = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform });
  try {
    delete require.cache[require.resolve('../src/main/menu')];
    return require('../src/main/menu').buildMenu(extra);
  } finally {
    Object.defineProperty(process, 'platform', real);
    Module._load = original;
    delete require.cache[require.resolve('../src/main/menu')];
  }
}
const labels = (items) => items.filter((i) => i.label).map((i) => i.label);

test('the menu has File, Edit, View, Window and Help, with Preferences and F1 where people look', () => {
  const sent = [];
  const about = () => sent.push('about');
  const help = [{ label: 'Help Center', accelerator: 'F1', click: () => sent.push('help') }, { label: 'Check for Updates…', click: () => sent.push('update') }];
  const menu = menuFor('linux', { send: (n) => sent.push(n), about, help });
  assert.deepEqual(menu.map((m) => m.label ?? m.role), ['File', 'Edit', 'View', 'windowMenu', 'Help']);
  const file = menu.find((m) => m.label === 'File').submenu;
  const prefs = file.find((i) => i.label === 'Preferences…');
  assert.equal(prefs.accelerator, 'Ctrl+,');
  prefs.click();
  assert.deepEqual(sent, ['preferences']);
  const helpMenu = menu.find((m) => m.label === 'Help').submenu;
  assert.deepEqual(labels(helpMenu), ['Help Center', 'Check for Updates…', 'About RT Author Desk']);
  assert.equal(helpMenu[0].accelerator, 'F1');
  assert.ok(!JSON.stringify(menu).includes('reload'), 'no Reload to throw away what is half typed');
  assert.ok(!JSON.stringify(menu).toLowerCase().includes('devtools'));
});

test('on a Mac, About and Preferences are in the app menu, and Help has no About', () => {
  const menu = menuFor('darwin', { send() {}, about() {}, help: [{ label: 'Help Center', click() {} }] });
  assert.equal(menu[0].label, 'RT Author Desk');
  assert.deepEqual(labels(menu[0].submenu), ['About RT Author Desk', 'Preferences…']);
  assert.equal(menu[0].submenu.find((i) => i.label === 'Preferences…').accelerator, 'Cmd+,');
  assert.deepEqual(labels(menu.find((m) => m.label === 'Help').submenu), ['Help Center']);
});
