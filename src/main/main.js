'use strict';
// Opens the encrypted library and the window. The catalog is in v1.0's first test build; the money follows (ROADMAP.md).
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } = require('electron');
const { createApi } = require('./api');
const { buildMenu } = require('./menu');
const { Settings } = require('./settings');
const { ImportError } = require('./importer');
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

    // A report is chosen here, in the main process, and read here. The window only ever sees what the app says is in it,
    // and then asks to accept it by the number it was given.
    ipcMain.handle('desk:pick-report', async (event) => {
      if (!event.senderFrame?.url.startsWith('file://')) return { ok: false, message: 'That request did not come from the app.' };
      if (!api) return { ok: false, message: 'Your library is not open.' };
      const choice = await dialog.showOpenDialog(window, {
        title: 'Choose a sales report',
        properties: ['openFile'],
        filters: [{ name: 'Sales reports (.xlsx)', extensions: ['xlsx'] }],
      });
      if (choice.canceled || !choice.filePaths[0]) return { ok: true, value: null };
      try {
        const file = choice.filePaths[0];
        if (fs.statSync(file).size > 50 * 1024 * 1024) return { ok: false, message: 'That file is too big to be a sales report.' };
        return { ok: true, value: api.importer.preview(fs.readFileSync(file), path.basename(file)) };
      } catch (error) {
        if (error instanceof ImportError) return { ok: false, message: error.message };
        console.error('[pick-report]', error);
        return { ok: false, message: "That file couldn't be read, and nothing was imported." };
      }
    });

    // How it looks lives beside the library, so it's right before anything is opened.
    const settings = new Settings(app.getPath('userData'));
    ipcMain.handle('desk:settings', (event) => (event.senderFrame?.url.startsWith('file://') ? settings.values : null));
    ipcMain.handle('desk:save-settings', (event, changes) => (event.senderFrame?.url.startsWith('file://') ? settings.save(changes) : null));

    // A menu item names what the window should do, and the window does it.
    const send = (name, arg) => window?.webContents.send('desk:menu', name, arg);
    Menu.setApplicationMenu(buildMenu({ send }));

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
