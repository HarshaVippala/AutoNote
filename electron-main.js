// electron-main.js
const { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut, screen } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const ScreenshotHelper = require('./ScreenshotHelper');

// Hide from dock on macOS
if (process.platform === 'darwin') {
  app.dock.hide();
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow = null;

// Application state tracking
const state = {
  isWindowVisible: true,
  opacity: 1.0,
  step: 60, // Pixels to move per arrow key press
  currentX: 0,
  currentY: 0,
  screenWidth: 0,
  screenHeight: 0,
  screenshotHelper: null
};

// Initialize the screenshot helper
function initScreenshotHelper() {
  state.screenshotHelper = new ScreenshotHelper();
  console.log("Screenshot helper initialized");
}

function createWindow() {
  // Get primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workAreaSize;
  state.screenWidth = workArea.width;
  state.screenHeight = workArea.height;
  state.currentX = Math.floor(workArea.width / 2) - 600; // Center window horizontally
  state.currentY = 50; // Position near top of screen

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    x: state.currentX,
    y: state.currentY,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // Transparency and frameless window settings
    backgroundColor: "#00000000", // Transparent background
    frame: false,                 // Remove window frame
    transparent: true,            // Enable window transparency
    hasShadow: false,             // Disable window shadow
    titleBarStyle: 'hidden',      // Hide title bar
    alwaysOnTop: true,            // Keep window above others
    skipTaskbar: true,            // Hide from taskbar
    fullscreenable: false,        // Prevent fullscreen
    resizable: true,              // Allow resizing
    movable: true,                // Allow moving
    focusable: true,              // Allow focus
    paintWhenInitiallyHidden: true // Paint while hidden for smooth transitions
  });

  // Enable content protection to prevent window from being captured
  // in screen recordings or during screen sharing
  mainWindow.setContentProtection(true);

  // Additional screen capture protection for macOS
  if (process.platform === 'darwin') {
    mainWindow.setHiddenInMissionControl(true);
    mainWindow.setWindowButtonVisibility(false);
  }

  // Set window above all others
  mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
  
  // Make window visible on all workspaces
  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
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
      mainWindow.setBackgroundColor(theme === 'dark' ? '#0a0a0a00' : '#FFFFFF00');
    }).catch(err => {
      console.error('Error getting initial theme:', err);
    });

    // Set initial opacity from localStorage or default
    mainWindow.webContents.executeJavaScript(`
      localStorage.getItem('windowOpacity') || "1.0"
    `).then((savedOpacity) => {
      const opacity = parseFloat(savedOpacity);
      if (!isNaN(opacity)) {
        setWindowOpacity(opacity);
      }
    }).catch(err => {
      console.error('Error getting opacity:', err);
    });
  });

  // Track window position when moved
  mainWindow.on('move', () => {
    if (!mainWindow) return;
    const position = mainWindow.getPosition();
    state.currentX = position[0];
    state.currentY = position[1];
  });

  // Register global shortcuts
  registerShortcuts();
}

// ----- Window Control Functions -----

function setWindowOpacity(value) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  // Clamp value between 0.1 and 1.0
  const opacity = Math.max(0.1, Math.min(1.0, value));
  state.opacity = opacity;
  
  // Apply opacity to window
  mainWindow.setOpacity(opacity);
  
  // Save to localStorage for persistence
  mainWindow.webContents.executeJavaScript(`
    localStorage.setItem('windowOpacity', "${opacity}")
  `).catch(err => {
    console.error('Error saving opacity to localStorage:', err);
  });
  
  console.log(`Window opacity set to ${opacity}`);
  return opacity;
}

function incrementOpacity(step = 0.1) {
  return setWindowOpacity(state.opacity + step);
}

function decrementOpacity(step = 0.1) {
  return setWindowOpacity(state.opacity - step);
}

function toggleWindowVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (state.isWindowVisible) {
    // Hide window
    const savedOpacity = mainWindow.getOpacity();
    mainWindow.setOpacity(0);
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    state.isWindowVisible = false;
    console.log('Window hidden');
    
    // Save current opacity for restoration
    mainWindow.webContents.executeJavaScript(`
      localStorage.setItem('savedOpacity', "${savedOpacity}")
    `).catch(() => {});
  } else {
    // Show window
    mainWindow.webContents.executeJavaScript(`
      localStorage.getItem('savedOpacity') || "1.0"
    `).then((savedOpacity) => {
      const opacity = parseFloat(savedOpacity) || state.opacity || 1.0;
      mainWindow.setOpacity(opacity);
      state.opacity = opacity;
    }).catch(() => {
      mainWindow.setOpacity(state.opacity || 1.0);
    });
    
    mainWindow.setIgnoreMouseEvents(false);
    state.isWindowVisible = true;
    console.log('Window shown');
  }
}

function toggleClickThrough() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  // Toggle between click-through and normal interaction
  const currentIgnoreState = mainWindow.webContents.executeJavaScript(`
    localStorage.getItem('ignoreMouseEvents') === "true"
  `).catch(() => false);
  
  currentIgnoreState.then(ignoreState => {
    const newState = !ignoreState;
    mainWindow.setIgnoreMouseEvents(newState, { forward: true });
    mainWindow.webContents.executeJavaScript(`
      localStorage.setItem('ignoreMouseEvents', "${newState}")
    `).catch(err => console.error('Error saving mouse ignore state:', err));
    
    console.log(`Window ${newState ? 'now ignores' : 'now accepts'} mouse events`);
  });
}

// ----- Window Movement Functions -----

function moveWindowLeft() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  state.currentX = Math.max(-(mainWindow.getBounds().width / 2), state.currentX - state.step);
  mainWindow.setPosition(Math.round(state.currentX), Math.round(state.currentY));
}

function moveWindowRight() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  state.currentX = Math.min(
    state.screenWidth - (mainWindow.getBounds().width / 2),
    state.currentX + state.step
  );
  mainWindow.setPosition(Math.round(state.currentX), Math.round(state.currentY));
}

function moveWindowUp() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  state.currentY = Math.max(-(mainWindow.getBounds().height / 2), state.currentY - state.step);
  mainWindow.setPosition(Math.round(state.currentX), Math.round(state.currentY));
}

function moveWindowDown() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  state.currentY = Math.min(
    state.screenHeight - (mainWindow.getBounds().height / 3),
    state.currentY + state.step
  );
  mainWindow.setPosition(Math.round(state.currentX), Math.round(state.currentY));
}

// ----- Shortcuts Registration -----

function registerShortcuts() {
  // Unregister existing shortcuts to prevent duplicates
  globalShortcut.unregisterAll();
  
  // Window visibility toggle
  globalShortcut.register('CommandOrControl+B', toggleWindowVisibility);
  
  // Opacity control
  globalShortcut.register('CommandOrControl+[', () => decrementOpacity(0.1));
  globalShortcut.register('CommandOrControl+]', () => incrementOpacity(0.1));
  
  // Window movement
  globalShortcut.register('CommandOrControl+Left', moveWindowLeft);
  globalShortcut.register('CommandOrControl+Right', moveWindowRight);
  globalShortcut.register('CommandOrControl+Up', moveWindowUp);
  globalShortcut.register('CommandOrControl+Down', moveWindowDown);
  
  // Toggle click-through mode
  globalShortcut.register('CommandOrControl+T', toggleClickThrough);
  
  // Screenshot capture shortcut
  globalShortcut.register('CommandOrControl+H', async () => {
    if (mainWindow) {
      try {
        const screenshotPath = await takeScreenshot();
        const preview = await getImagePreview(screenshotPath);
        mainWindow.webContents.send('screenshot-captured', { path: screenshotPath, preview });
        console.log('Screenshot sent to renderer:', screenshotPath);
      } catch (error) {
        console.error('Error capturing screenshot:', error);
      }
    }
  });
  
  console.log('Shortcuts registered');
}

// ----- Screenshot Functions -----

// Take a screenshot using the screenshot helper
async function takeScreenshot() {
  console.log('Taking screenshot...');
  if (!state.screenshotHelper) {
    console.error('Screenshot helper not initialized');
    throw new Error('Screenshot helper not initialized');
  }

  try {
    return await state.screenshotHelper.takeScreenshot(
      () => hideMainWindow(),
      () => showMainWindow()
    );
  } catch (error) {
    console.error('Screenshot error:', error);
    throw error;
  }
}

// Get a preview of a screenshot
async function getImagePreview(filepath) {
  if (!state.screenshotHelper) {
    console.error('Screenshot helper not initialized');
    return '';
  }
  return state.screenshotHelper.getImagePreview(filepath);
}

// Delete a screenshot
async function deleteScreenshot(path) {
  if (!state.screenshotHelper) {
    console.error('Screenshot helper not initialized');
    return { success: false, error: 'Screenshot helper not initialized' };
  }
  return state.screenshotHelper.deleteScreenshot(path);
}

// Get the list of screenshots
function getScreenshots() {
  if (!state.screenshotHelper) {
    console.error('Screenshot helper not initialized');
    return [];
  }
  return state.screenshotHelper.getScreenshotQueue();
}

// ----- Window Visibility Functions -----

function hideMainWindow() {
  if (!mainWindow?.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    state.windowPosition = { x: bounds.x, y: bounds.y };
    state.windowSize = { width: bounds.width, height: bounds.height };
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.setOpacity(0);
    state.isWindowVisible = false;
    console.log('Window hidden, opacity set to 0');
  }
}

function showMainWindow() {
  if (!mainWindow?.isDestroyed()) {
    if (state.windowPosition && state.windowSize) {
      mainWindow.setBounds({
        ...state.windowPosition,
        ...state.windowSize
      });
    }
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
    mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true
    });
    mainWindow.setContentProtection(true);
    mainWindow.setOpacity(0); // Set opacity to 0 before showing
    mainWindow.showInactive(); // Use showInactive instead of show+focus
    mainWindow.setOpacity(1); // Then set opacity to 1 after showing
    state.isWindowVisible = true;
    console.log('Window shown with showInactive(), opacity set to 1');
  }
}

app.whenReady().then(() => {
  // Initialize screenshot helper
  initScreenshotHelper();
  
  // Create the main window
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
      mainWindow.setBackgroundColor(theme === 'dark' ? '#0a0a0a00' : '#FFFFFF00');
    }
    
    return { success: true };
  });

  // Handle 'take-screenshot' request from renderer
  ipcMain.handle('take-screenshot', async () => {
    console.log('Main process received take-screenshot request.');
    try {
      const screenshotPath = await takeScreenshot();
      const preview = await getImagePreview(screenshotPath);
      return { success: true, path: screenshotPath, preview };
    } catch (error) {
      console.error('Failed to take screenshot:', error);
      return { success: false, error: error.message || 'Unknown error occurred' };
    }
  });

  // Handle 'get-screenshots' request from renderer
  ipcMain.handle('get-screenshots', () => {
    return getScreenshots();
  });

  // Handle 'delete-screenshot' request from renderer
  ipcMain.handle('delete-screenshot', async (_, path) => {
    return deleteScreenshot(path);
  });

  // New IPC handlers for window control
  ipcMain.handle('set-opacity', (_, value) => {
    return setWindowOpacity(parseFloat(value));
  });
  
  ipcMain.handle('toggle-visibility', () => {
    toggleWindowVisibility();
    return { visible: state.isWindowVisible };
  });
  
  ipcMain.handle('toggle-click-through', () => {
    toggleClickThrough();
    return { success: true };
  });
  
  ipcMain.handle('move-window', (_, direction) => {
    switch (direction) {
      case 'left': moveWindowLeft(); break;
      case 'right': moveWindowRight(); break;
      case 'up': moveWindowUp(); break;
      case 'down': moveWindowDown(); break;
    }
    return { x: state.currentX, y: state.currentY };
  });
});

// Theme change detection in the system
nativeTheme.on('updated', () => {
  const isDarkMode = nativeTheme.shouldUseDarkColors;
  const newTheme = isDarkMode ? 'dark' : 'light';
  console.log(`System theme changed to: ${newTheme}`);
  
  // Update window style based on theme
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Update window background color based on theme (with transparency)
    mainWindow.setBackgroundColor(newTheme === 'dark' ? '#0a0a0a00' : '#FFFFFF00');
    
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

// Clean up shortcuts when app is quitting
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});