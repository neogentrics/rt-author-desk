'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { NAME, collectCommands, commandList, menuTemplate, runCommand } = require('../src/main/menu');
const { SCREENS } = require('../src/shared/screens');
const { THEMES } = require('../src/shared/themes');

// A menu for a computer that isn't a Mac, with every action recorded instead of done.
function make(options = {}) {
  const told = [];
  const done = [];
  const template = menuTemplate({
    send: (name, arg) => told.push([name, arg]),
    actions: {
      about: () => done.push('about'), checkForUpdates: () => done.push('updates'), reportProblem: () => done.push('report'),
      changeSettings: (changes) => done.push(changes),
    },
    settings: { theme: 'system', glass: false, colorSafe: false },
    version: '1.0.0', platform: 'linux', ...options,
  });
  return { template, told, done };
}
const named = (items, label) => items.find((item) => item.label === label);
const clickable = (items) => items.filter((item) => item.type !== 'separator');
const labels = (items) => clickable(items).map((item) => item.label ?? item.role);
function everyMenu(items, visit, trail = []) {
  for (const item of items) {
    if (Array.isArray(item.submenu)) {
      visit(item, [...trail, item.label]);
      everyMenu(item.submenu, visit, [...trail, item.label]);
    }
  }
}
const normalize = (accelerator) => accelerator.replace('CommandOrControl', 'CmdOrCtrl').toLowerCase();

test('the menu bar is File, Edit, View, Window and Help, in that order', () => {
  const { template } = make();
  assert.deepEqual(template.map((menu) => menu.label ?? menu.role), ['File', 'Edit', 'View', 'windowMenu', 'Help']);
});

test('on a Mac the app menu comes first, with About and Preferences, and File has neither Preferences nor Quit', () => {
  const { template } = make({ platform: 'darwin' });
  assert.equal(template[0].label, NAME);
  assert.deepEqual(labels(template[0].submenu).slice(0, 2), ['About RT Author Desk 1.0.0', 'Preferences…']);
  assert.ok(!labels(named(template, 'File').submenu).includes('Preferences…'));
  assert.ok(!named(template, 'File').submenu.some((item) => item.role === 'quit'));
});

test('every menu is short, and the rarely used things are in submenus', () => {
  for (const platform of ['linux', 'darwin']) {
    const { template } = make({ platform });
    for (const menu of template) {
      if (menu.submenu) assert.ok(clickable(menu.submenu).length <= 20, `${menu.label} has ${clickable(menu.submenu).length} items`);
    }
    everyMenu(template, (menu, trail) => assert.ok(clickable(menu.submenu).length <= 20, trail.join(' › ')));
  }
  const view = named(make().template, 'View').submenu;
  assert.ok(view.some((item) => item.label === 'Screens' && item.submenu), 'the screens are in a submenu');
  assert.ok(view.some((item) => item.label === 'Theme' && item.submenu), 'so are the themes');
});

test('Help is in the suite\'s order: Help Center (F1), Tutorial, Check for Updates…, then About with the version', () => {
  const help = named(make().template, 'Help').submenu;
  const names = labels(help);
  assert.equal(names[0], 'Help Center');
  assert.equal(help[0].accelerator, 'F1');
  assert.equal(names.at(-1), 'About RT Author Desk 1.0.0');
  const order = ['Help Center', 'Tutorial', 'Check for Updates…', 'About RT Author Desk 1.0.0'].map((label) => names.indexOf(label));
  assert.ok(order.every((at) => at >= 0), 'all four are there');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in that order');
  assert.ok(names.includes('Find a Command…') && names.includes('Keyboard Shortcuts'));
});

test('every command has an id and a name, and no id or shortcut is used twice', () => {
  const { template } = make();
  const ids = [];
  const keys = [];
  const walk = (items) => {
    for (const item of items) {
      if (item.submenu) walk(item.submenu);
      else if (item.click) {
        assert.ok(item.id && item.label, `${item.label ?? item.id} has an id and a label`);
        ids.push(item.id);
        if (item.accelerator) keys.push(normalize(item.accelerator));
      }
    }
  };
  walk(template);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.equal(new Set(keys).size, keys.length, `shortcuts are unique: ${keys.join(' ')}`);
});

test('the three screens used most keep Ctrl+1, 2 and 3, and every screen can be gone to', () => {
  const { template, told } = make();
  const registry = collectCommands(template);
  for (const screen of SCREENS) {
    const command = registry.get(`go-${screen.key}`);
    assert.ok(command, `${screen.label} is a command`);
    assert.equal(command.path, 'View › Screens');
    assert.equal(command.accelerator, screen.accelerator ?? '');
    runCommand(registry, command.key);
    assert.deepEqual(told.at(-1), ['go', screen.key]);
  }
  assert.deepEqual(['desk', 'books', 'calendar'].map((key) => registry.get(`go-${key}`).accelerator), ['CmdOrCtrl+1', 'CmdOrCtrl+2', 'CmdOrCtrl+3']);
});

test('Go to is Ctrl+K and Find a Command is Ctrl+Shift+K, and the second starts with a >', () => {
  const { template, told } = make();
  const registry = collectCommands(template);
  assert.equal(registry.get('go-to').accelerator, 'CmdOrCtrl+K');
  assert.equal(registry.get('command-palette').accelerator, 'CmdOrCtrl+Shift+K');
  runCommand(registry, 'go-to');
  runCommand(registry, 'command-palette');
  assert.deepEqual(told, [['palette', ''], ['palette', '>']]);
});

test('every theme is in the Theme menu, Follow System first, with the one in use checked and the rest not', () => {
  for (const theme of ['system', 'sepia', 'contrast']) {
    const { template } = make({ settings: { theme } });
    const menu = named(named(template, 'View').submenu, 'Theme').submenu;
    const radios = menu.filter((item) => item.type === 'radio');
    assert.equal(radios[0].label, 'Follow System');
    assert.deepEqual(new Set(radios.map((item) => item.id)), new Set(['theme-system', ...Object.keys(THEMES).map((key) => `theme-${key}`)]));
    assert.deepEqual(radios.filter((item) => item.checked).map((item) => item.id), [`theme-${theme}`]);
    for (const [key, value] of Object.entries(THEMES)) assert.equal(radios.find((item) => item.id === `theme-${key}`).label, value.label);
  }
});

test('the light themes come before the dark ones, then High Contrast, with a line between', () => {
  const menu = named(named(make().template, 'View').submenu, 'Theme').submenu;
  const names = menu.map((item) => (item.type === 'separator' ? '|' : item.id.replace('theme-', '')));
  const tones = names.filter((n) => n !== '|' && n !== 'system').map((n) => (n === 'contrast' ? 'contrast' : THEMES[n].tone));
  assert.deepEqual(tones, [...tones].sort((a, b) => ['light', 'dark', 'contrast'].indexOf(a) - ['light', 'dark', 'contrast'].indexOf(b)));
  assert.equal(names.filter((n) => n === '|').length, 3);
});

test('choosing a theme, Glass or colour-safe colours changes that one setting, from where it is now', () => {
  const { template, done } = make({ settings: { theme: 'dark', glass: true, colorSafe: false } });
  const registry = collectCommands(template);
  runCommand(registry, 'theme-sepia');
  runCommand(registry, 'theme-system');
  runCommand(registry, 'glass');
  runCommand(registry, 'colour-safe');
  assert.deepEqual(done, [{ theme: 'sepia' }, { theme: 'system' }, { glass: false }, { colorSafe: true }]);
  const view = named(template, 'View').submenu;
  assert.equal(named(view, 'Glass').checked, true);
  assert.equal(named(view, 'Colour-safe Colours').checked, false);
});

test('the commands the window is given are the ones with an action, where each is, and nothing it could run by accident', () => {
  const { template, told, done } = make({ settings: { theme: 'mist', glass: true } });
  const registry = collectCommands(template);
  const list = commandList(registry);
  assert.ok(list.every((command) => command.click === undefined), 'the actions stay in the app');
  for (const key of ['new-book', 'import-books', 'export-all', 'backup-now', 'preferences', 'help-center', 'tutorial', 'shortcuts', 'report-problem', 'check-updates', 'about', 'glass', 'theme-mist']) {
    assert.ok(list.some((command) => command.key === key), key);
  }
  assert.ok(!list.some((command) => /quit|copy|paste|undo|zoom/i.test(command.key)), 'standard items are the menu\'s own');
  assert.deepEqual(list.find((command) => command.key === 'theme-mist'), { key: 'theme-mist', label: 'Mist', path: 'View › Theme', accelerator: '', kind: 'radio', checked: true });
  assert.equal(list.find((command) => command.key === 'glass').kind, 'checkbox');
  assert.equal(list.find((command) => command.key === 'new-book').path, 'File');
  assert.equal(runCommand(registry, 'nothing-like-this'), false);
  assert.equal(runCommand(registry, { key: 'new-book' }), false);
  assert.equal(runCommand(registry, undefined), false);
  assert.equal(runCommand(registry, 'new-book'), true);
  runCommand(registry, 'check-updates');
  runCommand(registry, 'report-problem');
  runCommand(registry, 'about');
  assert.deepEqual(told, [['new-book', undefined]]);
  assert.deepEqual(done, ['updates', 'report', 'about']);
});

test('a Mac lists Preferences and About once, whichever menu they are in', () => {
  const registry = collectCommands(make({ platform: 'darwin' }).template);
  const list = commandList(registry);
  assert.equal(list.filter((command) => command.key === 'preferences').length, 1);
  assert.equal(list.filter((command) => command.key === 'about').length, 1);
});

test('Preferences is Ctrl+, (Cmd+, on a Mac), and nothing in the menus reloads the page or opens developer tools', () => {
  const { template, told } = make();
  const prefs = named(named(template, 'File').submenu, 'Preferences…');
  assert.equal(prefs.accelerator, 'Ctrl+,');
  prefs.click();
  assert.deepEqual(told, [['preferences', undefined]]);
  assert.equal(named(make({ platform: 'darwin' }).template[0].submenu, 'Preferences…').accelerator, 'Cmd+,');
  const text = JSON.stringify(make().template).toLowerCase();
  assert.ok(!text.includes('reload'), 'no Reload to throw away what is half typed');
  assert.ok(!text.includes('devtools'));
});

test('About is in Help on every computer, and in the app menu too on a Mac, and it names the version', () => {
  for (const platform of ['linux', 'darwin']) {
    const { template, done } = make({ platform, version: '2.3.4' });
    const help = named(template, 'Help').submenu;
    assert.equal(help.at(-1).label, 'About RT Author Desk 2.3.4');
    help.at(-1).click();
    assert.deepEqual(done, ['about']);
  }
});
