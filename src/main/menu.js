'use strict';
// The menu bar, written as plain data so it can be tested without a window, and the list of commands taken from it. Every command in a
// menu can also be run by name from Go to (Ctrl+K, then >), so the menus can stay short. The shape follows RT Markdown Reader's: File,
// Edit, View and Help, rarely used things in submenus, and Help in the suite's order. There's no Reload on purpose: it would throw
// away whatever is half typed.
const { SCREENS } = require('../shared/screens');
const { THEMES } = require('../shared/themes');

const NAME = 'RT Author Desk';

// The themes as Reader's Theme menu lists them: Follow System, then the light ones, the dark ones, and High Contrast.
function themeGroups() {
  const keys = Object.keys(THEMES);
  return [
    keys.filter((key) => THEMES[key].tone === 'light' && key !== 'contrast'),
    keys.filter((key) => THEMES[key].tone === 'dark' && key !== 'contrast'),
    keys.filter((key) => key === 'contrast'),
  ];
}

/**
 * The menus. `send(name, arg)` tells the window what to do, `actions` are the few things the main process does itself, `settings` are
 * the current look (so the checked items are right), and the menu is built again whenever one of those changes.
 */
function menuTemplate({ send, actions = {}, settings = {}, version = '', platform = process.platform, name = NAME }) {
  const isMac = platform === 'darwin';
  const act = (id, label, accelerator, click, extra = {}) => ({ id, label, ...(accelerator ? { accelerator } : {}), click, ...extra });
  const tell = (id, label, accelerator, what = id, arg) => act(id, label, accelerator, () => send(what, arg));
  const separator = { type: 'separator' };
  const about = act('about', `About ${name} ${version}`.trim(), null, () => actions.about?.());
  const preferences = (accelerator) => tell('preferences', 'Preferences…', accelerator);

  const radio = (key, label) => act(`theme-${key}`, label, null, () => actions.changeSettings?.({ theme: key }), { type: 'radio', checked: settings.theme === key });
  const [lights, darks, contrast] = themeGroups();

  return [
    ...(isMac
      ? [{
          label: name,
          submenu: [about, separator, preferences('Cmd+,'), separator, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, separator, { role: 'quit' }],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        tell('new-book', 'New Book…', 'CmdOrCtrl+N'),
        tell('import-books', 'Bring In Books from a File…', 'CmdOrCtrl+Shift+I'),
        separator,
        tell('export-all', 'Export Everything…', 'CmdOrCtrl+E'),
        tell('backup-now', 'Back Up Now'),
        ...(isMac ? [] : [separator, preferences('Ctrl+,'), separator, { role: 'quit' }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, separator, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
    {
      label: 'View',
      submenu: [
        tell('go-to', 'Go to…', 'CmdOrCtrl+K', 'palette', ''),
        { label: 'Screens', submenu: SCREENS.map((screen) => tell(`go-${screen.key}`, screen.label, screen.accelerator, 'go', screen.key)) },
        separator,
        {
          label: 'Theme',
          submenu: [
            radio('system', 'Follow System'),
            separator,
            ...lights.map((key) => radio(key, THEMES[key].label)),
            separator,
            ...darks.map((key) => radio(key, THEMES[key].label)),
            separator,
            ...contrast.map((key) => radio(key, THEMES[key].label)),
          ],
        },
        act('glass', 'Glass', null, () => actions.changeSettings?.({ glass: !settings.glass }), { type: 'checkbox', checked: Boolean(settings.glass) }),
        act('colour-safe', 'Colour-safe Colours', null, () => actions.changeSettings?.({ colorSafe: !settings.colorSafe }), { type: 'checkbox', checked: Boolean(settings.colorSafe) }),
        separator,
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        separator,
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        tell('help-center', 'Help Center', 'F1', 'help'),
        tell('tutorial', 'Tutorial', null, 'tour'),
        tell('shortcuts', 'Keyboard Shortcuts', null, 'help', 'shortcuts'),
        tell('command-palette', 'Find a Command…', 'CmdOrCtrl+Shift+K', 'palette', '>'),
        separator,
        act('report-problem', 'Report a Problem…', null, () => actions.reportProblem?.()),
        act('check-updates', 'Check for Updates…', null, () => actions.checkForUpdates?.()),
        separator,
        about,
      ],
    },
  ];
}

// Every command in the menus, by its id, with where it is. Separators, standard roles (copy, quit) and items with no action are left
// out, because Go to can only run what has an action of its own.
function collectCommands(items, trail = [], out = new Map()) {
  for (const item of items) {
    if (item.type === 'separator' || item.role) continue;
    if (Array.isArray(item.submenu)) {
      collectCommands(item.submenu, [...trail, item.label], out);
      continue;
    }
    if (typeof item.click !== 'function' || !item.id || out.has(item.id)) continue;
    out.set(item.id, {
      key: item.id, label: item.label, path: trail.join(' › '), accelerator: item.accelerator ?? '',
      kind: item.type ?? 'command', checked: Boolean(item.checked), click: item.click,
    });
  }
  return out;
}

// What the window is told: everything but the action itself.
const commandList = (registry) => [...registry.values()].map(({ click, ...rest }) => rest);

// Runs one by its id. Anything that isn't a command does nothing.
function runCommand(registry, key) {
  const command = typeof key === 'string' ? registry.get(key) : null;
  if (!command) return false;
  command.click();
  return true;
}

// The real menu bar, and the commands in it. Electron is only loaded here, so everything above can be tested in plain Node.
function buildMenu(options) {
  const { Menu } = require('electron');
  const template = menuTemplate(options);
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  return collectCommands(template);
}

module.exports = { NAME, buildMenu, collectCommands, commandList, menuTemplate, runCommand, themeGroups };
