const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onScreenshot: (callback) => ipcRenderer.on('screenshot-captured', (event, data) => callback(data)),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot')
});

contextBridge.exposeInMainWorld('themeAPI', {
  updateTheme: (theme) => ipcRenderer.invoke('update-theme', theme),
  onSystemThemeChange: (callback) => {
    ipcRenderer.on('system-theme-changed', (event, theme) => callback(theme));
    return () => {
      ipcRenderer.removeListener('system-theme-changed', callback);
    };
  }
});