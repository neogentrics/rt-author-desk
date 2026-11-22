'use strict';
// Drives the real app the way a person would, over Electron's debugging port: it opens the window on a throwaway library,
// runs a little script in the page, and reads back what is there. Needs a display (on Linux: xvfb-run -a).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const repo = path.join(__dirname, '..', '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

// `packaged` is the path of an installed (or unpacked) build to run instead of the source, so the window of the real thing can be checked.
async function launch({ seed, env: extraEnv = {}, userData: given = null, welcome = false, packaged = null } = {}) {
  const userData = given ?? fs.mkdtempSync(path.join(os.tmpdir(), 'rt-author-desk-e2e-'));
  // Most tests aren't about the welcome, so they start with it already seen. A test that is passes welcome: true.
  if (!welcome && !fs.existsSync(path.join(userData, 'settings.json'))) fs.writeFileSync(path.join(userData, 'settings.json'), '{ "welcomed": true }\n');
  if (seed) await seed(userData);
  const port = await freePort();
  const env = { ...process.env, ...extraEnv };
  delete env.ELECTRON_RUN_AS_NODE;
  const electron = packaged ?? require('electron');
  const app = spawn(electron, [...(packaged ? [] : [repo]), '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], { env, stdio: 'ignore' });
  let target;
  for (let i = 0; i < 80 && !target; i += 1) {
    await sleep(250);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch { /* not up yet */ }
  }
  if (!target) {
    app.kill();
    throw new Error('The app did not start.');
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  let id = 0;
  const waiting = new Map();
  const problems = [];
  ws.addEventListener('message', (message) => {
    const data = JSON.parse(message.data);
    if (data.id && waiting.has(data.id)) { waiting.get(data.id)(data); waiting.delete(data.id); }
    if (data.method === 'Runtime.exceptionThrown') problems.push(`exception: ${data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text}`);
    if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') problems.push(`console.error: ${data.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error') problems.push(`log: ${data.params.entry.text} ${data.params.entry.url ?? ''}`);
  });
  const send = (method, params = {}) => new Promise((resolve) => { id += 1; waiting.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable');
  await send('Log.enable');

  const page = {
    problems,
    userData,
    // Runs a script in the page and gives back its value. A script that throws throws here, with the page's own message.
    async run(expression) {
      const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    },
    // Presses a key the way a keyboard does. A menu shortcut is listened for by the app, not the page, so this tries that path too.
    async key(key, { ctrl = false, shift = false, alt = false } = {}) {
      const named = { Enter: 13, Escape: 27, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, ' ': 32, F1: 112 };
      const single = key.length === 1 && key !== ' ';
      const punctuation = { ',': ['Comma', 188], '.': ['Period', 190], '/': ['Slash', 191] };
      const code = single ? (/[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : /[0-9]/.test(key) ? `Digit${key}` : punctuation[key]?.[0] ?? key) : key === ' ' ? 'Space' : key;
      const virtual = named[key] ?? punctuation[key]?.[1] ?? key.toUpperCase().charCodeAt(0);
      const base = { modifiers: (alt ? 1 : 0) | (ctrl ? 2 : 0) | (shift ? 8 : 0), key, code, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual };
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
      if ((single || key === ' ') && !ctrl) await send('Input.dispatchKeyEvent', { type: 'char', ...base, text: key });
      if (key === 'Enter') await send('Input.dispatchKeyEvent', { type: 'char', ...base, text: '\r' }); // a button is pressed by this half of Enter
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(120);
    },
    // Turns on a way the computer can ask for the page to look: [{ name: 'forced-colors', value: 'active' }] is Windows high contrast,
    // and [{ name: 'prefers-contrast', value: 'more' }] is a request for more contrast. An empty list turns them off.
    async media(features) {
      await send('Emulation.setEmulatedMedia', { features });
      await sleep(200);
    },
    // Makes the page this size, whatever the window is, so a picture comes out the same on every computer.
    async viewport(width, height) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await sleep(200);
    },
    // Saves a picture of the window, for looking at a screen rather than testing it.
    async screenshot(file) {
      const { result } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
    },
    async until(expression, what = expression, ms = 8000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (await page.run(`Boolean(${expression})`)) return;
        await sleep(100);
      }
      throw new Error(`Waited for ${what}, and it did not happen.`);
    },
    async goTo(hash) {
      await page.run(`location.hash = ${JSON.stringify(hash)}`);
      await sleep(400);
    },
    // Types into a field the way a person would: sets it, then tells the page it changed.
    async fill(selector, value) {
      await page.run(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('No field ' + ${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    },
    async click(selector) {
      await page.run(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('No ' + ${JSON.stringify(selector)}); el.click(); })()`);
    },
    // Clicks the first button or link with this text.
    async clickText(text, within = 'body') {
      await page.run(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(`${within} button, ${within} a`)})].find((e) => e.textContent.trim() === ${JSON.stringify(text)}); if (!el) throw new Error('No button called ' + ${JSON.stringify(text)}); el.click(); })()`);
    },
    async call(name, args = {}) {
      return page.run(`AD.call(${JSON.stringify(name)}, ${JSON.stringify(args)})`);
    },
    async close() {
      try { ws.close(); } catch { /* already gone */ }
      const gone = new Promise((resolve) => (app.exitCode !== null || app.signalCode !== null ? resolve() : app.once('exit', resolve)));
      app.kill();
      await Promise.race([gone, sleep(3000)]);
      if (app.exitCode === null && app.signalCode === null) {
        app.kill('SIGKILL');
        await Promise.race([gone, sleep(3000)]);
      }
      await sleep(300); // the helper processes (the graphics one and the like) finish writing into the profile folder
      // A temporary folder that could not be removed is not a failed test, and a slow machine can take a moment to let go of it.
      if (!given) {
        try { fs.rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* left for the system's own cleanup */ }
      }
    },
  };
  try {
    await page.until("window.AD && AD.routes && document.getElementById('nav')?.children.length > 0", 'the app to open');
  } catch (error) {
    // An app that never drew its page must not be left running, or the test run waits for it for ever.
    try { ws.close(); } catch { /* already gone */ }
    app.kill();
    error.message += ` The page reported: ${problems.slice(0, 3).join(' | ') || 'nothing'}`;
    throw error;
  }
  return page;
}

module.exports = { launch };
