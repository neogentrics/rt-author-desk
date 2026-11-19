# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Email **author@neogentrics.com** with:

- a description of the issue and its impact,
- steps that reproduce it, using made-up data (never a real report, account number or login),
- the app version (in the name of the file you installed) and your operating system.

You should get a reply within 5 business days. Please give us reasonable time to release a fix before
disclosing the issue publicly.

## Supported versions

Only the latest release receives security fixes. Until 1.0.0, that means the latest test build.

## Design notes

What's built today. The vault for logins and the personal-money section are **not built yet**, and their
[design](docs/design/vault-and-privacy.md) says they get an independent review before they ship.

- **Your library is an encrypted database** (SQLCipher) in the app's own folder, with its own random key. With no password
  set, any copy of the app can open it, so that is privacy from a casual look, not secrecy.
- **The window can't reach the database.** It runs with Electron `sandbox: true`, `contextIsolation: true` and
  `nodeIntegration: false`, behind a Content-Security-Policy that allows only the app's own scripts and styles.
- **One small, listed way in.** The page can ask the app to do only the named calls in `src/main/api.js`. Anything else
  is refused, and a request that doesn't come from the app's own window is refused too.
- **Plain-words errors only.** An unexpected problem is logged and answered in general terms, so the window never shows a
  database error or a file path.
- **The window can't be navigated away or open new windows.** Web links open in your browser, and every web permission request (camera,
  microphone, notifications, and so on) is denied.
- **No store login, ever.** Sales reports come in as files you download. The app signs in to no store, and the vault, when
  it exists, will never be reachable by another app, an export you didn't ask for, or AI.
- **Works offline.** Nothing leaves the computer unless you turn on a feature that sends it.
