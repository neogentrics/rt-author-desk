'use strict';
// The locks on the window. Each test is a lock that a future change must not loosen without meaning to: if one of these fails, the change
// that made it fail has to be looked at by the owner before it goes anywhere.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { WEB_PREFERENCES, denyPermissions, fromApp, isHttps, lockDown } = require('../src/main/window-security');

const ROOT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

// ---- The page's own policy ------------------------------------------------------------------------------------------------

test('the page may load only what is in the app, run only its own scripts, and reach nothing else', () => {
  const html = read('src/renderer/index.html');
  const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
  assert.ok(policy, 'the page has a content security policy');
  const directives = new Map(policy.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const [name, ...sources] = part.split(/\s+/);
    return [name, sources];
  }));
  assert.deepEqual(directives.get('default-src'), ["'none'"], 'everything not named is refused');
  assert.deepEqual(directives.get('script-src'), ["'self'"]);
  assert.deepEqual(directives.get('style-src'), ["'self'"]);
  assert.deepEqual(directives.get('base-uri'), ["'none'"], 'the page cannot be told to read its files from somewhere else');
  assert.deepEqual(directives.get('form-action'), ["'none'"], 'no form can send anything anywhere');
  const allowed = new Set(["'none'", "'self'", 'data:']);
  for (const [name, sources] of directives) {
    for (const source of sources) assert.ok(allowed.has(source), `${name} lets in ${source}`);
    if (sources.includes('data:')) assert.equal(name, 'img-src', 'only a picture may be written into the page itself');
  }
  assert.ok(!/unsafe-|\*|https?:|blob:|filesystem:/.test(policy), 'no inline script, no eval, no web address');
});

test('nothing in the page builds the page out of text, runs text as a script or writes into the document', () => {
  const risky = /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write(?:ln)?|eval\s*\(|new\s+Function\s*\(|execScript)\b|\bset(?:Timeout|Interval)\s*\(\s*['"`]/;
  const found = [];
  for (const folder of ['src/renderer', 'src/shared']) {
    for (const name of fs.readdirSync(path.join(ROOT, folder)).filter((n) => n.endsWith('.js') || n.endsWith('.html'))) {
      const text = read(folder, name);
      const at = text.search(risky);
      if (at >= 0) found.push(`${folder}/${name} line ${text.slice(0, at).split('\n').length}`);
    }
  }
  assert.deepEqual(found, [], 'use the h() builder, so that nothing a file or a title contains can ever be read as page code');
});

// ---- The window --------------------------------------------------------------------------------------------------------------

test('the window is a sandboxed page with no Node in it, written out so no default can change it', () => {
  assert.deepEqual({ ...WEB_PREFERENCES }, {
    contextIsolation: true, sandbox: true, nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
    webviewTag: false, webSecurity: true, allowRunningInsecureContent: false, experimentalFeatures: false, navigateOnDragDrop: false, safeDialogs: true,
  });
  assert.ok(Object.isFrozen(WEB_PREFERENCES));
  const main = read('src/main/main.js');
  assert.match(main, /webPreferences:\s*\{\s*preload:[^}]*\.\.\.WEB_PREFERENCES\s*\}/, 'the window is made with those settings, and nothing after them');
  assert.equal((main.match(/new BrowserWindow\(/g) ?? []).length, 1, 'there is one window');
  assert.ok(!/nodeIntegration:\s*true|contextIsolation:\s*false|sandbox:\s*false|webSecurity:\s*false|webviewTag:\s*true|allowRunningInsecureContent:\s*true/.test(main), 'no lock is turned off anywhere');
});

test('every page the app makes is locked in the same way, and every permission is refused', () => {
  const main = read('src/main/main.js');
  assert.match(main, /app\.on\('web-contents-created',[^\n]*lockDown\(/, 'the lock is put on each page as it is made');
  assert.match(main, /denyPermissions\(session\.defaultSession\)/);
  assert.match(main, /onBeforeRequest\([\s\S]*?cancel:[^\n]*file:\/\/[^\n]*devtools:\/\//, 'a request for anything that is not a file of the app is cancelled');
});

test('a page cannot navigate, open a window or hold a web view, and only a secure web address is handed to the browser', () => {
  const listeners = new Map();
  let opener;
  const contents = { on: (name, fn) => listeners.set(name, fn), setWindowOpenHandler: (fn) => { opener = fn; } };
  const opened = [];
  lockDown(contents, (url) => opened.push(url));
  for (const name of ['will-attach-webview', 'will-navigate', 'will-redirect']) {
    let stopped = false;
    listeners.get(name)({ preventDefault: () => { stopped = true; } });
    assert.ok(stopped, `${name} is stopped`);
  }
  for (const url of ['https://github.com/neogentrics/rt-author-desk/issues', 'HTTPS://example.test/x']) assert.deepEqual(opener({ url }), { action: 'deny' });
  for (const url of ['http://example.test', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<b>x</b>', 'smb://host/share', 'ms-msdt:/id', 'about:blank', '', 'not a url']) assert.deepEqual(opener({ url }), { action: 'deny' });
  assert.deepEqual(opened, ['https://github.com/neogentrics/rt-author-desk/issues', 'HTTPS://example.test/x'], 'only the secure web addresses were passed on');
  assert.ok(isHttps('https://a.test') && !isHttps('http://a.test') && !isHttps(null) && !isHttps('//a.test'));
});

test('every permission a page could ask for is refused, whether it asks or only checks', () => {
  const calls = {};
  const session = {
    setPermissionRequestHandler: (fn) => { calls.request = fn; },
    setPermissionCheckHandler: (fn) => { calls.check = fn; },
    setDevicePermissionHandler: (fn) => { calls.device = fn; },
  };
  denyPermissions(session);
  for (const permission of ['media', 'geolocation', 'notifications', 'clipboard-read', 'midi', 'openExternal', 'fullscreen', 'usb', 'serial']) {
    let answer;
    calls.request({}, permission, (value) => { answer = value; });
    assert.equal(answer, false, `asking for ${permission}`);
    assert.equal(calls.check({}, permission), false, `checking ${permission}`);
  }
  assert.equal(calls.device({}), false);
});

// ---- Who may ask the main process for anything -------------------------------------------------------------------------------

test('a request is answered only if it comes from the top page of the app\'s own window', () => {
  const top = { processId: 7, routingId: 2 };
  const window = { webContents: { mainFrame: top } };
  const frame = (over = {}) => ({ processId: 7, routingId: 2, url: 'file:///opt/RT%20Author%20Desk/resources/app.asar/src/renderer/index.html', ...over });
  assert.equal(fromApp({ senderFrame: frame() }, window), true);
  assert.equal(fromApp({ senderFrame: frame({ url: 'file:///C:/Program%20Files/RT%20Author%20Desk/resources/app.asar/src/renderer/index.html' }) }, window), true);
  assert.equal(fromApp({ senderFrame: frame({ url: 'https://example.test/' }) }, window), false, 'a page from the web');
  assert.equal(fromApp({ senderFrame: frame({ url: 'devtools://devtools/bundled/inspector.html' }) }, window), false);
  assert.equal(fromApp({ senderFrame: frame({ url: undefined }) }, window), false);
  assert.equal(fromApp({ senderFrame: frame({ routingId: 9 }) }, window), false, 'a frame inside the page');
  assert.equal(fromApp({ senderFrame: frame({ processId: 8 }) }, window), false, 'a page in another process');
  assert.equal(fromApp({ senderFrame: null }, window), false);
  assert.equal(fromApp({}, window), false);
  assert.equal(fromApp(undefined, window), false);
  assert.equal(fromApp({ senderFrame: frame() }, null), false, 'before there is a window');
  assert.equal(fromApp({ senderFrame: frame() }, { webContents: {} }), false);
});

// Every handler in main.js, with the text of it.
function handlers() {
  const main = read('src/main/main.js');
  const starts = [...main.matchAll(/ipcMain\.handle\('([^']+)'/g)];
  return starts.map((match, i) => ({ channel: match[1], text: main.slice(match.index, starts[i + 1]?.index ?? main.length) }));
}

test('every call the window can make to the main process asks first where it came from', () => {
  const all = handlers();
  assert.ok(all.length >= 20, `found ${all.length} handlers`);
  for (const { channel, text } of all) {
    assert.match(text.split('\n').slice(0, 3).join('\n'), /fromApp\(event\)/, `${channel} does not check where the request came from`);
  }
});

test('the window\'s doorway lists exactly the calls the main process answers, and gives the page nothing else', () => {
  const answered = new Set(handlers().map((h) => h.channel));
  const preload = read('src/main/preload.js');
  const asked = new Set([...preload.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual([...asked].sort(), [...answered].sort(), 'every channel the page can use has an answer, and every answer has a way in');

  // Run the real doorway against a stand-in for Electron, and look at exactly what the page is given.
  const given = {};
  const sent = [];
  const listeners = [];
  const fake = {
    contextBridge: { exposeInMainWorld: (name, api) => { given[name] = api; } },
    ipcRenderer: { invoke: (...args) => { sent.push(args); return Promise.resolve(); }, on: (...args) => { listeners.push(args); return 'the emitter itself'; } },
  };
  const key = require.resolve('electron');
  const before = require.cache[key];
  require.cache[key] = { id: key, filename: key, loaded: true, exports: fake };
  delete require.cache[require.resolve('../src/main/preload.js')];
  try {
    require('../src/main/preload.js');
  } finally {
    if (before) require.cache[key] = before; else delete require.cache[key];
    delete require.cache[require.resolve('../src/main/preload.js')];
  }
  assert.deepEqual(Object.keys(given), ['desk'], 'one name is added to the page');
  const desk = given.desk;
  assert.ok(Object.values(desk).every((value) => typeof value === 'function'), 'and it holds only functions');
  assert.ok(!Object.keys(desk).some((name) => /require|process|ipc|shell|fs|eval/i.test(name)));
  for (const [name, fn] of Object.entries(desk)) {
    if (name !== 'onMenu') fn('a', { b: 1 });
  }
  assert.ok(sent.length >= 20);
  assert.ok(sent.every(([channel]) => /^desk:[a-z-]+$/.test(channel) && answered.has(channel)), 'each one goes to a named channel the main process answers');

  const heard = [];
  assert.equal(desk.onMenu((...args) => heard.push(args)), undefined, 'listening hands back nothing the page could use');
  assert.equal(desk.onMenu('not a function'), undefined);
  assert.equal(listeners.length, 1, 'and a listener that is not a function is not added');
  listeners[0][1]({ sender: 'the event itself', senderFrame: {} }, 'go', 'books');
  assert.deepEqual(heard, [['go', 'books']], 'the listener is told the name and the argument, never the event');
});
