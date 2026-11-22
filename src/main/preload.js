'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desk', {
  info: () => ipcRenderer.invoke('desk:info'),
  call: (name, args) => ipcRenderer.invoke('desk:call', name, args),
  settings: () => ipcRenderer.invoke('desk:settings'),
  saveSettings: (changes) => ipcRenderer.invoke('desk:save-settings', changes),
  // The menu bar tells the window what to do by name. The listener never sees the event itself.
  // It hands back nothing, so the page never holds the channel it listens on.
  onMenu: (listener) => {
    if (typeof listener === 'function') ipcRenderer.on('desk:menu', (_event, name, arg) => listener(name, arg));
  },
  // Every command in the menus, so Go to can list them and run one by name.
  commands: () => ipcRenderer.invoke('desk:commands'),
  runCommand: (key) => ipcRenderer.invoke('desk:run-command', key),
  about: () => ipcRenderer.invoke('desk:about'),
  copyDetails: () => ipcRenderer.invoke('desk:copy-details'),
  startSample: () => ipcRenderer.invoke('desk:start-sample'),
  leaveSample: () => ipcRenderer.invoke('desk:leave-sample'),
  installUpdate: () => ipcRenderer.invoke('desk:install-update'),
  openReleases: () => ipcRenderer.invoke('desk:open-releases'),
  backupStatus: () => ipcRenderer.invoke('desk:backup-status'),
  chooseBackupFolder: () => ipcRenderer.invoke('desk:choose-backup-folder'),
  backupNow: () => ipcRenderer.invoke('desk:backup-now'),
  pickBackup: () => ipcRenderer.invoke('desk:pick-backup'),
  restoreBackup: () => ipcRenderer.invoke('desk:restore-backup'),
  exportAll: () => ipcRenderer.invoke('desk:export-all'),
  pickBooksFile: () => ipcRenderer.invoke('desk:pick-books-file'),
  pickReport: () => ipcRenderer.invoke('desk:pick-report'),
});
