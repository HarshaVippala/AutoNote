const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onScreenshot: (callback) => ipcRenderer.on('screenshot-captured', (event, data) => callback(data)),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot')
});