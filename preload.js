const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Screenshot API
  onScreenshot: (callback) => ipcRenderer.on('screenshot-captured', (event, data) => callback(data)),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  getScreenshots: () => ipcRenderer.invoke('get-screenshots'),
  deleteScreenshot: (path) => ipcRenderer.invoke('delete-screenshot', path),
  
  // Window control APIs
  setOpacity: (value) => ipcRenderer.invoke('set-opacity', value),
  toggleVisibility: () => ipcRenderer.invoke('toggle-visibility'),
  toggleClickThrough: () => ipcRenderer.invoke('toggle-click-through'),
  moveWindow: (direction) => ipcRenderer.invoke('move-window', direction),
  
  // Provide information about available keyboard shortcuts
  getShortcutInfo: () => {
    return {
      toggleVisibility: 'Ctrl+B (Cmd+B on Mac)',
      decreaseOpacity: 'Ctrl+[ (Cmd+[ on Mac)',
      increaseOpacity: 'Ctrl+] (Cmd+] on Mac)',
      moveLeft: 'Ctrl+Left (Cmd+Left on Mac)',
      moveRight: 'Ctrl+Right (Cmd+Right on Mac)',
      moveUp: 'Ctrl+Up (Cmd+Up on Mac)',
      moveDown: 'Ctrl+Down (Cmd+Down on Mac)',
      toggleClickThrough: 'Ctrl+T (Cmd+T on Mac)',
      takeScreenshot: 'Ctrl+H (Cmd+H on Mac)'
    };
  }
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