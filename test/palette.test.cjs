'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fuzzy, prettyShortcut, readQuery, search } = require('../src/shared/palette');
const { SCREENS } = require('../src/shared/screens');

test('matching: a run of letters beats scattered ones, a word start beats the middle, and words can be typed with spaces', () => {
  assert.ok(fuzzy('book', 'Books'));
  assert.ok(fuzzy('go bo', 'Go to Books'));
  assert.equal(fuzzy('go zz', 'Go to Books'), null);
  assert.equal(fuzzy('zz', 'Books'), null);
  assert.ok(fuzzy('meet', 'Meeting').score > fuzzy('mtg', 'Meeting').score);
  assert.ok(fuzzy('read', 'Readme').score > fuzzy('read', 'Spreadsheet').score, 'the start of a word ranks higher');
  assert.deepEqual(fuzzy('', 'anything'), { score: 0, hits: [] });
  assert.deepEqual(fuzzy('bo', 'Books').hits, [0, 1], 'it says which letters matched');
});

test('a shortcut is written the way this computer writes it', () => {
  assert.equal(prettyShortcut('CmdOrCtrl+Shift+K'), 'Ctrl+Shift+K');
  assert.equal(prettyShortcut('CmdOrCtrl+Shift+K', 'darwin'), '⌘⇧K');
  assert.equal(prettyShortcut('F1'), 'F1');
  assert.equal(prettyShortcut('CmdOrCtrl++'), 'Ctrl++');
  assert.equal(prettyShortcut(''), '');
  assert.equal(prettyShortcut(undefined), '');
});

test('a leading > means commands, and what follows is what to look for', () => {
  assert.deepEqual(readQuery('>theme'), { mode: 'commands', text: 'theme' });
  assert.deepEqual(readQuery('  >  theme night '), { mode: 'commands', text: 'theme night' });
  assert.deepEqual(readQuery('>'), { mode: 'commands', text: '' });
  assert.deepEqual(readQuery('books'), { mode: 'places', text: 'books' });
  assert.deepEqual(readQuery(undefined), { mode: 'places', text: '' });
});

test('with nothing typed the list stays as given, and with something typed the best match comes first', () => {
  const screens = SCREENS.map((s) => ({ label: s.label }));
  assert.deepEqual(search(screens, '').map((r) => r.item.label), SCREENS.map((s) => s.label));
  assert.equal(search(screens, 'bo')[0].item.label, 'Books');
  assert.equal(search(screens, 'cal')[0].item.label, 'Calendar');
  assert.equal(search(screens, 'stores')[0].item.label, 'Stores and names');
  assert.deepEqual(search(screens, 'zzz'), []);
  assert.equal(search(screens, '', 3).length, 3, 'the list is cut at the limit');
});

test('a command can be found by the menu it is in, so "theme night" finds Night under Theme', () => {
  const commands = [
    { label: 'Night', detail: 'View › Theme' }, { label: 'Night Mode Guide', detail: 'Help' }, { label: 'Dark', detail: 'View › Theme' }, { label: 'Glass', detail: 'View' },
  ];
  const found = search(commands, 'theme dark');
  assert.equal(found[0].item.label, 'Dark');
  assert.ok(!found.some((r) => r.item.label === 'Glass'));
  assert.deepEqual(search(commands, 'theme').map((r) => r.item.label).sort(), ['Dark', 'Night']);
  assert.deepEqual(search(commands, 'glass')[0].hits, [0, 1, 2, 3, 4], 'a match on the name is marked; one on the menu is not');
  assert.deepEqual(search(commands, 'theme')[0].hits, [], 'a match on the menu alone marks nothing');
});

test('ties keep the order they were given in', () => {
  const same = [{ label: 'Alpha one' }, { label: 'Alpha two' }, { label: 'Alpha tre' }];
  assert.deepEqual(search(same, 'alpha').map((r) => r.item.label), ['Alpha one', 'Alpha two', 'Alpha tre']);
});
