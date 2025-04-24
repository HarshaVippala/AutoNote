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
function startCursorFollowing() {
  // Only start if not already running and following is enabled
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

      // 1. Calculate DEFAULT target position (top-left corner relative to cursor)
      const defaultTargetX = cursorPoint.x + CURSOR_OFFSET_X;
      const defaultTargetY = cursorPoint.y + CURSOR_OFFSET_Y;

      // Initialize target position with default
      let targetX = defaultTargetX;
      let targetY = defaultTargetY;

      // 2. Check for RIGHT edge overflow and potentially "flip" X anchor
      if (defaultTargetX + WINDOW_WIDTH > workArea.x + workArea.width) {
        // Calculate position so the WINDOW'S RIGHT edge aligns with the cursor offset point
        targetX = cursorPoint.x + CURSOR_OFFSET_X - WINDOW_WIDTH;
        // console.log("Flipping X anchor"); // Optional debug log
      }

      // 3. Check for BOTTOM edge overflow and potentially "flip" Y anchor
      if (defaultTargetY + WINDOW_HEIGHT > workArea.y + workArea.height) {
        // Calculate position so the WINDOW'S BOTTOM edge aligns with the cursor offset point
        targetY = cursorPoint.y + CURSOR_OFFSET_Y - WINDOW_HEIGHT;
        // console.log("Flipping Y anchor"); // Optional debug log
      }

      // 4. Clamp final position to TOP and LEFT boundaries
      if (targetX < workArea.x) {
        targetX = workArea.x;
      }
      if (targetY < workArea.y) {
        targetY = workArea.y;
      }

      // --- End Boundary Checks/Flipping ---

      if (mainWindow && typeof mainWindow.setPosition === 'function') {
        // Ensure coordinates are integers
        mainWindow.setPosition(Math.round(targetX), Math.round(targetY), false);
      }
    } catch (error) {
      console.error("Error getting cursor or setting window position:", error);
    }
  }, POLLING_INTERVAL_MS);
}
// --- End Cursor Following Logic ---

// --- Make sure stopCursorFollowing is also present ---
function stopCursorFollowing() {
  if (followInterval) {
    console.log('Stopping cursor following interval.');
    clearInterval(followInterval);
    followInterval = null;
  }
}

// --- Toggle Function ---
function toggleCursorFollowing() {
  isFollowingCursor = !isFollowingCursor; // Flip the state
  console.log(`Cursor following ${isFollowingCursor ? 'enabled' : 'disabled'}`);

  if (isFollowingCursor) {
      // ENABLE following: Ignore mouse events again, start interval
      if (mainWindow) {
          mainWindow.setIgnoreMouseEvents(true); // <<< Make click-through
          console.log('Window ignoring mouse events: true');
      }
      startCursorFollowing(); // Start interval
  } else {
      // DISABLE following: Stop ignoring mouse events, stop interval
      if (mainWindow) {
          mainWindow.setIgnoreMouseEvents(false); // <<< Make interactive
          console.log('Window ignoring mouse events: false');
      }
      stopCursorFollowing(); // Stop interval
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
  // ... (createWindow function mostly the same) ...
  if (mainWindow) { mainWindow.show(); return; }
  console.log('Creating window...');
  mainWindow = new BrowserWindow({ /* ... options ... */ });
  console.log(`Loading URL: ${url}`);
  mainWindow.loadURL(url).catch(err => { console.error(`Failed to load URL ${url}:`, err); });

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready-to-show.');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setIgnoreMouseEvents(true); // Keep ignoring mouse events for the overlay itself
    mainWindow.show();
    console.log('Window shown.');
    // Start following only if initially enabled
    if (isFollowingCursor) {
        startCursorFollowing();
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
}

// --- App Lifecycle Events ---
app.whenReady().then(async () => {
  console.log('App ready. Starting server...');
  try {
    const port = await startServer();
    createWindow(`http://localhost:${port}`);

    // Register the global shortcut
    if (!globalShortcut.isRegistered(FOLLOW_TOGGLE_SHORTCUT)) {
        const ret = globalShortcut.register(FOLLOW_TOGGLE_SHORTCUT, () => {
            console.log(`${FOLLOW_TOGGLE_SHORTCUT} is pressed`);
            toggleCursorFollowing(); // Call toggle function on hotkey press
        });
        if (!ret) {
            console.error('Failed to register global shortcut:', FOLLOW_TOGGLE_SHORTCUT);
        } else {
            console.log(`Global shortcut ${FOLLOW_TOGGLE_SHORTCUT} registered successfully.`);
        }
    }

    // Setup basic menu
    const menu = Menu.buildFromTemplate([ /* ... basic menu ... */ ]);
    Menu.setApplicationMenu(menu);

  } catch (err) { console.error("Failed to start server during app startup:", err); app.quit(); }

  app.on('activate', () => { /* ... same activate logic ... */ });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') { app.quit(); } });

// Make sure to unregister shortcuts on quit
app.on('will-quit', () => { // Changed from before-quit for shortcut cleanup
  console.log('App will-quit event.');
  // Unregister all shortcuts.
  globalShortcut.unregisterAll();
  console.log('Global shortcuts unregistered.');
  // Stop following and close server
  stopCursorFollowing();
  if (server) { console.log('Closing server...'); server.close(); }
});

process.on('uncaughtException', (error) => { console.error('Uncaught Exception:', error); });