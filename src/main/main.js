'use strict';
// Opens the encrypted library and the window. The catalog is in v1.0's first test build; the money follows (ROADMAP.md).
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } = require('electron');
const { createApi } = require('./api');
const { buildMenu } = require('./menu');
const { Settings } = require('./settings');
const { BookImportError } = require('./books-import');
const { ImportError } = require('./importer');
const { Library } = require('./storage/library');
const { fillSample } = require('./sample');
const { RELEASES_URL, Updater } = require('./updater');
const { today: todayOf } = require('../shared/dates');
const { selfTest } = require('./self-test');

const REPO_URL = 'https://github.com/neogentrics/rt-author-desk';
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
  let real = null; // { library, api, opened }: the person's own library
  let sample = null; // { library, api, dir }: the made-up catalog, while the tour or a look around is open
  let window = null;
  const active = () => sample ?? real;
  const fromApp = (event) => Boolean(event.senderFrame?.url.startsWith('file://'));
  const NOT_FROM_APP = { ok: false, message: 'That request did not come from the app.' };

  const updater = new Updater((status) => window?.webContents.send('desk:menu', 'update-status', status));

  const show = () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  };
  app.on('second-instance', show);

  // Asks for a file. The tests that drive the real app can't click a native dialog, so when the app is run from its source (never
  // an installed copy) they can name the file in RTAD_TEST_FILES, as {"books": "/path"} or {"report": "/path"}.
  const chooseFile = async (kind, options) => {
    if (!app.isPackaged && process.env.RTAD_TEST_FILES) {
      const file = JSON.parse(process.env.RTAD_TEST_FILES)[kind];
      return file ? { canceled: false, filePaths: [file] } : { canceled: true, filePaths: [] };
    }
    return dialog.showOpenDialog(window, options);
  };

  // The made-up catalog lives in its own library, which is thrown away when it's left, so it can't touch the real one.
  const sampleDir = () => path.join(app.getPath('userData'), 'sample-library');
  const leaveSample = () => {
    if (!sample) return;
    sample.library.close();
    fs.rmSync(sample.dir, { recursive: true, force: true });
    sample = null;
  };
  const startSample = () => {
    leaveSample();
    fs.rmSync(sampleDir(), { recursive: true, force: true });
    const library = new Library(sampleDir()).open();
    fillSample(library, todayOf());
    sample = { library, api: createApi(library, { locale: app.getLocale() }), dir: sampleDir() };
  };

  function showAbout() {
    dialog.showMessageBox(window, {
      type: 'none',
      title: 'About RT Author Desk',
      message: 'RT Author Desk',
      detail: `Version ${app.getVersion()}\nThe business side of being an author, on your own computer.\nBuilt by the Recon Towers Dev Department.\n\nYour library is kept in:\n${path.join(app.getPath('userData'), 'library')}`,
    });
  }

  async function checkForUpdatesFromMenu() {
    const result = await updater.check();
    const messages = {
      current: `You have the latest version, ${app.getVersion()}.`,
      downloading: `Version ${result.version} is downloading. You'll be asked to restart when it's ready.`,
      ready: `Version ${result.version} is ready. Use Restart to update at the top of the window.`,
      available: `Version ${result.version} is available. Use the download page link at the top of the window.`,
      off: 'Updates are off in this copy of the app, which is how it behaves when it is run from its source.',
      error: `Couldn't check for updates: ${result.message}`,
    };
    dialog.showMessageBox(window, { type: 'info', message: messages[result.state] ?? messages.current });
  }

  app.whenReady().then(() => {
    // Nothing in the window may reach the network. Reports come in as files you choose.
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !details.url.startsWith('file://') && !details.url.startsWith('devtools://') });
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

    // A made-up catalog left behind by a crash is cleared away.
    fs.rmSync(sampleDir(), { recursive: true, force: true });

    let opened = null;
    try {
      const library = new Library(path.join(app.getPath('userData'), 'library')).open();
      real = { library, api: createApi(library, { locale: app.getLocale() }) };
      opened = { ok: true, ...library.info() };
    } catch (error) {
      opened = { ok: false, message: error.message };
    }
    ipcMain.handle('desk:info', () => ({ version: app.getVersion(), library: opened, sample: Boolean(sample), update: updater.status }));
    // The window's only way to the library: one allowlisted call, and only from this app's own page.
    ipcMain.handle('desk:call', (event, name, args) => {
      if (!fromApp(event)) return NOT_FROM_APP;
      if (!active()) return { ok: false, message: 'Your library is not open.' };
      return active().api.call(name, args);
    });

    ipcMain.handle('desk:start-sample', (event) => {
      if (!fromApp(event)) return NOT_FROM_APP;
      try {
        startSample();
        return { ok: true };
      } catch (error) {
        console.error('[start-sample]', error);
        return { ok: false, message: "The made-up catalog couldn't be made. Nothing of yours was changed." };
      }
    });
    ipcMain.handle('desk:leave-sample', (event) => {
      if (!fromApp(event)) return NOT_FROM_APP;
      leaveSample();
      return { ok: true };
    });

    // A report is chosen here, in the main process, and read here. The window only ever sees what the app says is in it,
    // and then asks to accept it by the number it was given.
    ipcMain.handle('desk:pick-report', async (event) => {
      if (!fromApp(event)) return NOT_FROM_APP;
      if (sample) return { ok: false, message: 'This is a made-up catalog, so there is nothing to import into. Leave it first.' };
      if (!real) return { ok: false, message: 'Your library is not open.' };
      const choice = await chooseFile('report', {
        title: 'Choose a sales report',
        properties: ['openFile'],
        filters: [{ name: 'Sales reports (.xlsx)', extensions: ['xlsx'] }],
      });
      if (choice.canceled || !choice.filePaths[0]) return { ok: true, value: null };
      try {
        const file = choice.filePaths[0];
        if (fs.statSync(file).size > 50 * 1024 * 1024) return { ok: false, message: 'That file is too big to be a sales report.' };
        return { ok: true, value: real.api.importer.preview(fs.readFileSync(file), path.basename(file)) };
      } catch (error) {
        if (error instanceof ImportError) return { ok: false, message: error.message };
        console.error('[pick-report]', error);
        return { ok: false, message: "That file couldn't be read, and nothing was imported." };
      }
    });

    // A spreadsheet of books is chosen and read here too. The window gets the headings and a few rows to match columns with.
    ipcMain.handle('desk:pick-books-file', async (event) => {
      if (!fromApp(event)) return NOT_FROM_APP;
      if (!active()) return { ok: false, message: 'Your library is not open.' };
      const choice = await chooseFile('books', {
        title: 'Choose a spreadsheet of books',
        properties: ['openFile'],
        filters: [{ name: 'Spreadsheets saved as CSV', extensions: ['csv', 'txt', 'tsv'] }],
      });
      if (choice.canceled || !choice.filePaths[0]) return { ok: true, value: null };
      try {
        const file = choice.filePaths[0];
        if (fs.statSync(file).size > 20 * 1024 * 1024) return { ok: false, message: 'That file is too big to be a list of books.' };
        return { ok: true, value: active().api.booksImporter.open(fs.readFileSync(file), path.basename(file)) };
      } catch (error) {
        if (error instanceof BookImportError) return { ok: false, message: error.message };
        console.error('[pick-books-file]', error);
        return { ok: false, message: "That file couldn't be read, and nothing was brought in." };
      }
    });

    // How it looks lives beside the library, so it's right before anything is opened.
    const settings = new Settings(app.getPath('userData'));
    ipcMain.handle('desk:settings', (event) => (fromApp(event) ? settings.values : null));
    ipcMain.handle('desk:save-settings', (event, changes) => (fromApp(event) ? settings.save(changes) : null));

    // Updates: restarting into a downloaded one, and opening the page for a build that can't replace itself.
    ipcMain.handle('desk:install-update', (event) => (fromApp(event) ? updater.installNow() : false));
    ipcMain.handle('desk:open-releases', (event) => {
      if (fromApp(event)) shell.openExternal(RELEASES_URL);
    });

    // A menu item names what the window should do, and the window does it.
    const send = (name, arg) => window?.webContents.send('desk:menu', name, arg);
    Menu.setApplicationMenu(buildMenu({
      send,
      about: showAbout,
      help: [
        { label: 'Help Center', accelerator: 'F1', click: () => send('help') },
        { label: 'Take the Tour of a Made-up Catalog', click: () => send('tour') },
        { label: 'Keyboard Shortcuts', click: () => send('help', 'shortcuts') },
        { type: 'separator' },
        { label: 'Report a Problem…', click: () => shell.openExternal(`${REPO_URL}/issues/new?template=bug_report.yml`) },
        { label: 'Check for Updates…', click: checkForUpdatesFromMenu },
      ],
    }));

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
    updater.start();
  });

  app.on('window-all-closed', () => {
    leaveSample();
    real?.library.close();
    app.quit();
  });
}
