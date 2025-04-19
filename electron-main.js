// electron-main.js
const path = require('path');
const { app, BrowserWindow, Tray, Menu } = require('electron');

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
    },
    
    // 🛡️ blocks screen‑shares & captures at the OS level
    contentProtection: true,
  });
  mainWindow.setContentProtection(true);


  // In dev you might point to http://localhost:3000,
  // but since you’ve built, point to your running Next.js server:
  mainWindow.loadURL('http://localhost:3000');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

//app.whenReady().then(createWindow);
app.whenReady().then(() => {
    createWindow();
  
    // --- add a Tray so users can quit or show the window ---
    tray = new Tray(path.join(__dirname, 'assets', 'trayIcon.png')); 
    const trayMenu = Menu.buildFromTemplate([
      { label: 'Show App', click: () => mainWindow ? mainWindow.show() : createWindow() },
      { label: 'Quit',   click: () => app.quit() }
    ]);
    tray.setContextMenu(trayMenu);
  });

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
