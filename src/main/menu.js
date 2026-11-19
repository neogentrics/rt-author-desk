'use strict';
// The menu bar. There's no Reload on purpose: it would throw away whatever is half typed. A menu item tells the window what
// to do by name, and the window does it, because every screen lives there.
const { Menu } = require('electron');

function buildMenu({ send, about, name = 'RT Author Desk', help = [] }) {
  const isMac = process.platform === 'darwin';
  return Menu.buildFromTemplate([
    ...(isMac
      ? [{
          label: name,
          submenu: [
            ...(about ? [{ label: `About ${name}`, click: about }, { type: 'separator' }] : []),
            { label: 'Preferences…', accelerator: 'Cmd+,', click: () => send('preferences') },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Book…', accelerator: 'CmdOrCtrl+N', click: () => send('new-book') },
        { label: 'Bring In Books from a File…', accelerator: 'CmdOrCtrl+Shift+I', click: () => send('import-books') },
        ...(isMac
          ? []
          : [
              { type: 'separator' },
              { label: 'Preferences…', accelerator: 'Ctrl+,', click: () => send('preferences') },
              { type: 'separator' },
              { role: 'quit' },
            ]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Desk', accelerator: 'CmdOrCtrl+1', click: () => send('go', 'desk') },
        { label: 'Books', accelerator: 'CmdOrCtrl+2', click: () => send('go', 'books') },
        { label: 'Calendar', accelerator: 'CmdOrCtrl+3', click: () => send('go', 'calendar') },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    ...(help.length || about ? [{ label: 'Help', submenu: [...help, ...(isMac || !about ? [] : [{ type: 'separator' }, { label: `About ${name}`, click: about }])] }] : []),
  ]);
}

module.exports = { buildMenu };
