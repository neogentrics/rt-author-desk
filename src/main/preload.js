'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desk', {
  info: () => ipcRenderer.invoke('desk:info'),
  call: (name, args) => ipcRenderer.invoke('desk:call', name, args),
  pickReport: () => ipcRenderer.invoke('desk:pick-report'),
});
