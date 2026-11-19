'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desk', {
  info: () => ipcRenderer.invoke('desk:info'),
  call: (name, args) => ipcRenderer.invoke('desk:call', name, args),
  settings: () => ipcRenderer.invoke('desk:settings'),
  saveSettings: (changes) => ipcRenderer.invoke('desk:save-settings', changes),
  // The menu bar tells the window what to do by name. The listener never sees the event itself.
  onMenu: (listener) => ipcRenderer.on('desk:menu', (_event, name, arg) => listener(name, arg)),
  startSample: () => ipcRenderer.invoke('desk:start-sample'),
  leaveSample: () => ipcRenderer.invoke('desk:leave-sample'),
  installUpdate: () => ipcRenderer.invoke('desk:install-update'),
  openReleases: () => ipcRenderer.invoke('desk:open-releases'),
  pickBooksFile: () => ipcRenderer.invoke('desk:pick-books-file'),
  pickReport: () => ipcRenderer.invoke('desk:pick-report'),
});
