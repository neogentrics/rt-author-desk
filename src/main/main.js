'use strict';
// Opens the encrypted library and the window. The catalog is in v1.0's first test build; the money follows (ROADMAP.md).
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, Menu, session, shell } = require('electron');
const { createApi } = require('./api');
const { Library } = require('./storage/library');
const { selfTest } = require('./self-test');

const selfTestArg = process.argv.find((arg) => arg.startsWith('--self-test='));

if (selfTestArg) {
  app.whenReady().then(() => {
    const report = selfTest({ packaged: app.isPackaged, version: app.getVersion() });
    const file = selfTestArg.slice('--self-test='.length);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
    app.exit(report.ok ? 0 : 1);
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let library = null;
  let window = null;

  const show = () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  };
  app.on('second-instance', show);

  app.whenReady().then(() => {
    // Nothing in the window may reach the network. Reports come in as files you choose.
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !details.url.startsWith('file://') && !details.url.startsWith('devtools://') });
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

    let opened = null;
    try {
      library = new Library(path.join(app.getPath('userData'), 'library')).open();
      opened = { ok: true, ...library.info() };
    } catch (error) {
      opened = { ok: false, message: error.message };
    }
    ipcMain.handle('desk:info', () => ({ version: app.getVersion(), library: opened }));
    // The window's only way to the library: one allowlisted call, and only from this app's own page.
    const api = library && opened.ok ? createApi(library, { locale: app.getLocale() }) : null;
    ipcMain.handle('desk:call', (event, name, args) => {
      if (!event.senderFrame?.url.startsWith('file://')) return { ok: false, message: 'That request did not come from the app.' };
      if (!api) return { ok: false, message: 'Your library is not open.' };
      return api.call(name, args);
    });

    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]));

    window = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 720,
      minHeight: 480,
      title: 'RT Author Desk',
      backgroundColor: '#eef1f6',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) shell.openExternal(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    window.on('closed', () => {
      window = null;
    });
  });

  app.on('window-all-closed', () => {
    library?.close();
    app.quit();
  });
}
