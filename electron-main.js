// electron-main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, // Example width
    height: 800, // Example height
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Recommended for security
      nodeIntegration: false, // Recommended for security
    },
    // Example: Add other configurations like frame: false, etc.
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../index.html')}`;
  console.log(`Loading URL: ${startUrl}`);
  mainWindow.loadURL(startUrl);

  // Open the DevTools (optional)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // Make sure the temp directory exists
  const tempDir = path.join(os.tmpdir(), 'AgentAssistScreenshots');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`Created screenshot temp directory: ${tempDir}`);
  }

  // Handle 'take-screenshot' request from renderer
  ipcMain.handle('take-screenshot', async () => {
    console.log('Main process received take-screenshot request.');
    if (!mainWindow) {
        console.error('Main window not available for screenshot.');
        return { success: false, error: 'Main window not found.' };
    }

    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(tempDir, `screenshot-${timestamp}.png`);

    // Arguments for screencapture: -C (capture cursor), -x (no sound), path
    const args = ['-C', '-x', screenshotPath];

    // Hide window briefly
    mainWindow.hide();
    // Add a small delay to ensure the window is hidden before capturing
    await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay

    try {
      // Execute the screencapture command
      await new Promise((resolve, reject) => {
        execFile('/usr/sbin/screencapture', args, (error, stdout, stderr) => {
          if (error) {
            console.error(`screencapture error: ${error.message}`);
            console.error(`screencapture stderr: ${stderr}`);
            reject(error);
          } else {
            console.log(`Screenshot saved to: ${screenshotPath}`);
            resolve();
          }
        });
      });
      return { success: true, filePath: screenshotPath };
    } catch (error) {
      console.error('Failed to take screenshot:', error);
      return { success: false, error: error.message || 'Unknown error occurred' };
    } finally {
        // Show the window again after capture attempt
        if (mainWindow && !mainWindow.isDestroyed()) {
            // Add a small delay before showing again (optional)
            await new Promise(resolve => setTimeout(resolve, 100));
            mainWindow.show();
        }
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
