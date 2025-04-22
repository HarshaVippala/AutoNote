// electron-main.js
const path = require('path');
const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'), // we'll add this for IPC
    },
    contentProtection: true,
  });
  mainWindow.setContentProtection(true);

  mainWindow.loadURL('http://localhost:3000');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // Register global hotkey: Command+Shift+Tab
  const hotkey = 'CommandOrControl+Shift+Tab';
  globalShortcut.register(hotkey, async () => {
    try {
      // AppleScript to get the frontmost window's bounds and app name
      const script = `
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set appName to name of frontApp
          tell frontApp
            set win to first window
            set {x, y} to position of win
            set {w, h} to size of win
            return appName & "|" & x & "|" & y & "|" & w & "|" & h
          end tell
        end tell
      `;
      const osaResult = execFileSync('/usr/bin/osascript', ['-e', script], { encoding: 'utf8' }).trim();
      const [appName, x, y, w, h] = osaResult.split('|');
      // Use screencapture to capture the region
      const tmpFile = path.join(os.tmpdir(), `electron_screenshot_${Date.now()}.png`);
      execFileSync('/usr/sbin/screencapture', [
        '-x', // no sound
        '-R', `${x},${y},${w},${h}`,
        tmpFile,
      ]);
      const imageBuffer = fs.readFileSync(tmpFile);
      fs.unlinkSync(tmpFile);

      // Send the screenshot buffer to the renderer
      if (mainWindow) {
        mainWindow.webContents.send('screenshot-captured', {
          buffer: imageBuffer,
          appName,
          bounds: { x: Number(x), y: Number(y), width: Number(w), height: Number(h) }
        });
      }
    } catch (err) {
      console.error('Screenshot hotkey error:', err);
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
