// electron-main.js
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
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
    backgroundColor: '#FFFFFF',
    frame: true,
    titleBarStyle: 'hidden',
    // Add white border to window
    transparent: false,
    vibrancy: 'window',
    visualEffectState: 'active',
    // Make sure shadows are shown
    hasShadow: true,
    // Example: Add other configurations like frame: false, etc.
  });

  const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3001';
  console.log(`Loading URL: ${startUrl}`);
  mainWindow.loadURL(startUrl);

  // Open the DevTools (optional)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Synchronize theme with the renderer process
  mainWindow.webContents.on('did-finish-load', () => {
    // Get initial theme from localStorage or system preference
    mainWindow.webContents.executeJavaScript(`
      localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    `).then((theme) => {
      console.log(`Initial theme from renderer: ${theme}`);
      // Sync Electron's native theme with renderer
      nativeTheme.themeSource = theme;
      
      // Update window background color based on theme
      mainWindow.setBackgroundColor(theme === 'dark' ? '#0a0a0a' : '#FFFFFF');
    }).catch(err => {
      console.error('Error getting initial theme:', err);
    });
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

  // Listen for theme changes from renderer
  ipcMain.handle('update-theme', async (_, theme) => {
    console.log(`Theme updated from renderer to: ${theme}`);
    nativeTheme.themeSource = theme;
    
    // Update window appearance based on the new theme
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundColor(theme === 'dark' ? '#0a0a0a' : '#FFFFFF');
    }
    
    return { success: true };
  });

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

// Theme change detection in the system
nativeTheme.on('updated', () => {
  const isDarkMode = nativeTheme.shouldUseDarkColors;
  const newTheme = isDarkMode ? 'dark' : 'light';
  console.log(`System theme changed to: ${newTheme}`);
  
  // Update window style based on theme
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Update window background color based on theme
    mainWindow.setBackgroundColor(newTheme === 'dark' ? '#0a0a0a' : '#FFFFFF');
    
    // Only send to renderer if window exists
    mainWindow.webContents.executeJavaScript(`
      // Only update if user hasn't set a preference
      if (!localStorage.getItem('theme')) {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add('${newTheme}');
        document.documentElement.setAttribute('data-theme', '${newTheme}');
      }
    `).catch(err => {
      console.error('Error syncing theme to renderer:', err);
    });
  }
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
