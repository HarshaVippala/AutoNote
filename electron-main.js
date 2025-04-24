// electron-main.js
const { app, BrowserWindow, screen, Menu, globalShortcut } = require('electron'); // Added globalShortcut
const path = require('path');
const http = require('http');
const next = require('next');

// --- Configuration ---
const WINDOW_WIDTH = 600;
const WINDOW_HEIGHT = 600;
const CURSOR_OFFSET_X = 10;
const CURSOR_OFFSET_Y = 20;
const POLLING_INTERVAL_MS = 16;
const DEV = process.env.NODE_ENV === 'development';
const PORT = DEV ? 3000 : 0;
const FOLLOW_TOGGLE_SHORTCUT = 'CommandOrControl+Shift+P'; // Hotkey to toggle following

let mainWindow = null;
let followInterval = null;
let server;
let serverPort;
let isFollowingCursor = true; // <<< State for toggling follow

// Prepare Next.js app instance
const nextApp = next({ dev: DEV, dir: __dirname });
const handle = nextApp.getRequestHandler();

// --- Cursor Following Logic ---
// ... (startCursorFollowing function remains the same) ...
function startCursorFollowing() {
  if (followInterval || !isFollowingCursor) return;
  console.log('Starting cursor following interval...');
  followInterval = setInterval(() => {
    if (!mainWindow) {
      stopCursorFollowing();
      return;
    }
    try {
      const cursorPoint = screen.getCursorScreenPoint();
      const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
      const workArea = currentDisplay.workArea;
      const defaultTargetX = cursorPoint.x + CURSOR_OFFSET_X;
      const defaultTargetY = cursorPoint.y + CURSOR_OFFSET_Y;
      let targetX = defaultTargetX;
      let targetY = defaultTargetY;
      if (defaultTargetX + WINDOW_WIDTH > workArea.x + workArea.width) {
        targetX = cursorPoint.x + CURSOR_OFFSET_X - WINDOW_WIDTH;
      }
      if (defaultTargetY + WINDOW_HEIGHT > workArea.y + workArea.height) {
        targetY = cursorPoint.y + CURSOR_OFFSET_Y - WINDOW_HEIGHT;
      }
      if (targetX < workArea.x) {
        targetX = workArea.x;
      }
      if (targetY < workArea.y) {
        targetY = workArea.y;
      }
      if (mainWindow && typeof mainWindow.setPosition === 'function') {
        mainWindow.setPosition(Math.round(targetX), Math.round(targetY), false);
      }
    } catch (error) {
      console.error("Error getting cursor or setting window position:", error);
    }
  }, POLLING_INTERVAL_MS);
}

// --- End Cursor Following Logic ---

// --- Make sure stopCursorFollowing is also present ---
// ... (stopCursorFollowing function remains the same) ...
function stopCursorFollowing() {
  if (followInterval) {
    console.log('Stopping cursor following interval.');
    clearInterval(followInterval);
    followInterval = null;
  }
}

// --- Toggle Function ---
// ... (toggleCursorFollowing function remains the same) ...
function toggleCursorFollowing() {
  isFollowingCursor = !isFollowingCursor;
  console.log(`Cursor following ${isFollowingCursor ? 'enabled' : 'disabled'}`);
  if (isFollowingCursor) {
      if (mainWindow) {
          mainWindow.setIgnoreMouseEvents(true);
          console.log('Window ignoring mouse events: true');
      }
      startCursorFollowing();
  } else {
      if (mainWindow) {
          mainWindow.setIgnoreMouseEvents(false);
          console.log('Window ignoring mouse events: false');
      }
      stopCursorFollowing();
  }
}
// --- End Toggle Function ---


async function startServer() {
  // ... (startServer function remains the same) ...
  try {
    await nextApp.prepare();
    server = http.createServer((req, res) => { handle(req, res); });
    return new Promise((resolve, reject) => {
      server.listen(PORT, (err) => {
        if (err) { console.error("Failed to start server:", err); reject(err); return; }
        serverPort = server.address().port;
        console.log(`> Next.js server ready on http://localhost:${serverPort}`);
        resolve(serverPort);
      });
    });
  } catch (err) { console.error("Error preparing Next.js or starting server:", err); process.exit(1); }
}

function createWindow(url) {
  if (mainWindow) {
    mainWindow.show();
    return;
  }
  console.log('Creating window...');
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    frame: false,            // Recommended for overlays
    transparent: true,       // Recommended for overlays
    skipTaskbar: true,       // Keep it out of the taskbar/dock
    alwaysOnTop: true,       // Already set later, but doesn't hurt here
    show: false,             // Don't show until ready
    webPreferences: {
      // Consider adding preload script if needed for security
      // preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Best practice: Disable Node integration in renderer
      contextIsolation: true, // Best practice: Enable context isolation
    },
    // --- ADD THIS LINE ---
    contentProtection: true // Prevent content capture (screen sharing, recording)
    // --------------------
  });

  console.log(`Loading URL: ${url}`);
  mainWindow.loadURL(url).catch(err => { console.error(`Failed to load URL ${url}:`, err); });

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready-to-show.');
    // These settings ensure the overlay stays visible and behaves correctly
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setAlwaysOnTop(true, 'screen-saver'); // 'screen-saver' is a high level
    // mainWindow.setIgnoreMouseEvents(true); // Set initially based on isFollowingCursor state below
    mainWindow.setContentProtection(true);
    mainWindow.show();
    console.log('Window shown.');

    // Set initial mouse event state and start following if needed
    if (isFollowingCursor) {
        mainWindow.setIgnoreMouseEvents(true);
        console.log('Initial state: Window ignoring mouse events: true');
        startCursorFollowing();
    } else {
        mainWindow.setIgnoreMouseEvents(false); // Ensure it's interactive if starting paused
         console.log('Initial state: Window ignoring mouse events: false');
    }
  });

  mainWindow.on('closed', () => {
    console.log('Window closed.');
    stopCursorFollowing(); // Always stop on close
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`Failed to load window content: ${errorDescription} (Code: ${errorCode}) URL: ${validatedURL}`);
  });

  // Optional: If you wanted to use the method call instead, you'd put it here or in ready-to-show:
  // mainWindow.setContentProtection(true);
}

// --- App Lifecycle Events ---
// ... (app.whenReady remains the same) ...
app.whenReady().then(async () => {
  console.log('App ready. Starting server...');
  try {
    const port = await startServer();
    createWindow(`http://localhost:${port}`);

    if (!globalShortcut.isRegistered(FOLLOW_TOGGLE_SHORTCUT)) {
        const ret = globalShortcut.register(FOLLOW_TOGGLE_SHORTCUT, () => {
            console.log(`${FOLLOW_TOGGLE_SHORTCUT} is pressed`);
            toggleCursorFollowing();
        });
        if (!ret) {
            console.error('Failed to register global shortcut:', FOLLOW_TOGGLE_SHORTCUT);
        } else {
            console.log(`Global shortcut ${FOLLOW_TOGGLE_SHORTCUT} registered successfully.`);
        }
    }

    // Setup basic menu (Example - Customize as needed)
    const menu = Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' }, // Useful for debugging
        ]
      },
      {
        label: 'Window',
        submenu: [
           {
            label: 'Toggle Follow Cursor',
            accelerator: FOLLOW_TOGGLE_SHORTCUT,
            click: () => toggleCursorFollowing()
           }
        ]
      }
    ]);
    Menu.setApplicationMenu(menu);

  } catch (err) { console.error("Failed to start server during app startup:", err); app.quit(); }

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0 && serverPort) {
       console.log('App activated, creating window.');
      createWindow(`http://localhost:${serverPort}`);
    } else if (mainWindow) {
        console.log('App activated, showing existing window.');
        mainWindow.show(); // Ensure window is visible if activated
    }
  });
});

// ... (window-all-closed remains the same) ...
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ... (will-quit remains the same) ...
app.on('will-quit', () => { // Changed from before-quit for shortcut cleanup
  console.log('App will-quit event.');
  globalShortcut.unregisterAll();
  console.log('Global shortcuts unregistered.');
  stopCursorFollowing();
  if (server) { console.log('Closing server...'); server.close(); }
});

process.on('uncaughtException', (error) => { console.error('Uncaught Exception:', error); });