'use strict';
// What keeps the window in its place: what it is allowed to be, who may ask the main process for anything, where it may go, and what it may
// ask the computer for. It is kept apart from the window itself so each part can be tested without opening one, and so a change to any of it
// shows up as a change to this one small file (test/window-security.test.cjs fails if a lock is loosened).

// The window is a web page and nothing more: no Node in it, no access to the system except through the few named calls in preload.js, and a
// page that is its own world (contextIsolation) inside the operating system's own sandbox. Each of these is also what Electron does by default,
// written out so that nothing is left to a default that could change.
const WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webviewTag: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  navigateOnDragDrop: false,
  safeDialogs: true,
});

// A request to the main process is answered only when it comes from this app's own page: the top page of the window, loaded from a file of the
// app. A frame inside it, another window, or a page from anywhere else is told no. `window` is the app's window.
function fromApp(event, window) {
  const frame = event?.senderFrame;
  const top = window?.webContents?.mainFrame;
  if (!frame || !top || frame.processId !== top.processId || frame.routingId !== top.routingId) return false;
  return typeof frame.url === 'string' && frame.url.startsWith('file://');
}

const isHttps = (url) => {
  try {
    return new URL(String(url)).protocol === 'https:';
  } catch {
    return false;
  }
};

// Applied to every page the app ever creates (see app.on('web-contents-created')): none can open another window, go anywhere else, or hold a
// web view. A link that goes to a web address (https only) is handed to the person's own browser, and nothing else is ever opened.
function lockDown(contents, openExternal) {
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.on('will-redirect', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (isHttps(url)) openExternal(url);
    return { action: 'deny' };
  });
}

// The window asks for nothing from the computer (camera, microphone, location, notifications, a device) and is told no to every one, whether
// it asks or only checks.
function denyPermissions(session) {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.setDevicePermissionHandler?.(() => false);
}

module.exports = { WEB_PREFERENCES, denyPermissions, fromApp, isHttps, lockDown };
