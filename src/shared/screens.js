'use strict';
// The screens of the app, in the order of the sidebar. The sidebar, the View menu and Go to all read this one list, so a new screen
// is added in one place. `hash` is where it lives (the Desk is the empty one). Ctrl+1, 2 and 3 are the three used most.
(function defineScreens(root) {
const SCREENS = [
  { key: 'desk', hash: '', label: 'Desk', accelerator: 'CmdOrCtrl+1' },
  { key: 'books', hash: 'books', label: 'Books', accelerator: 'CmdOrCtrl+2' },
  { key: 'audiobooks', hash: 'audiobooks', label: 'Audiobooks' },
  { key: 'money', hash: 'money', label: 'Money', early: true },
  { key: 'royalties', hash: 'royalties', label: 'Royalties', early: true },
  { key: 'calendar', hash: 'calendar', label: 'Calendar', accelerator: 'CmdOrCtrl+3' },
  { key: 'clashes', hash: 'clashes', label: 'Clashes' },
  { key: 'isbns', hash: 'isbns', label: 'ISBNs' },
  { key: 'names', hash: 'names', label: 'Stores and names' },
  { key: 'trash', hash: 'trash', label: 'Trash' },
];

const screensApi = { SCREENS };
// The main process loads this as a module, and the window loads it as a plain script. It is wrapped in a function so the names inside
// can't meet the same names in another script on the page (the Help guides have a SCREENS of their own).
if (typeof module !== 'undefined' && module.exports) module.exports = screensApi;
else root.ADScreens = screensApi;
})(typeof window !== 'undefined' ? window : globalThis);
