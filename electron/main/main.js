const { app, BrowserWindow, dialog, ipcMain, shell, session, screen } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const hardwareService = require('../services/hardwareService');
const pluginManager = require('../../src/pluginLoader');

const UPDATE_SERVER_URL = process.env.UPDATE_SERVER_URL || 'http://192.168.68.105:8080';

let mainWindow;
let customerWindow;
let updatePromptOpen = false;
let updateDownloadRequested = false;

// ── Shared app state — single source of truth for both windows ───────────────
let appState = {
  cart: [],
  subtotal: 0,
  tax: 0,
  total: 0,
  updatedAt: null,
};

function broadcastState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:state', appState);
  }
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.webContents.send('app:state', appState);
  }
}

function setState(updates) {
  appState = {
    cart: Array.isArray(updates?.cart) ? updates.cart : appState.cart,
    subtotal: updates?.subtotal !== undefined ? Number(updates.subtotal) : appState.subtotal,
    tax: updates?.tax !== undefined ? Number(updates.tax) : appState.tax,
    total: updates?.total !== undefined ? Number(updates.total) : appState.total,
    updatedAt: updates?.updatedAt || new Date().toISOString(),
  };
  broadcastState();
  // Notify plugins of every state change (non-blocking)
  pluginManager.emit('state:updated', { ...appState }).catch(() => {});
}

log.initialize();
log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// ── Security: disable remote module & any future remote content ──────────────
app.on('web-contents-created', (_event, contents) => {
  // Block all navigation away from our local files
  contents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'file:') {
      event.preventDefault();
    }
  });

  // Block new windows / popups from opening
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Open any external links in the OS browser, not inside the app
  contents.on('will-redirect', (event, url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'file:') {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    title: 'POS System',
    webPreferences: {
      // Path updated for new src/ structure
      preload: path.join(__dirname, '../preload/preload.js'),

      // ── Security flags ───────────────────────────────────────────────────
      contextIsolation: true,        // renderer cannot access Node APIs
      nodeIntegration: false,        // never allow Node in renderer
      sandbox: true,                 // OS-level process sandboxing
      webSecurity: true,             // enforce same-origin policy
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  // Set a strict Content-Security-Policy header for the session
  session.defaultSession.webRequest.onHeadersReceived((_details, callback) => {
    callback({
      responseHeaders: {
        ..._details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; connect-src 'self' http://localhost:* ws://localhost:*;"
        ],
      },
    });
  });

  // ── Renderer: React (Vite build) in production, Vite dev server in development ──
  const REACT_DIST = path.join(__dirname, '../../src/dist/index.html');
  const REACT_DEV_URL = 'http://localhost:5173';

  if (!app.isPackaged && process.env.VITE_DEV_SERVER === '1') {
    // Development: load from Vite dev server (run `npm run renderer:dev` separately)
    mainWindow.loadURL(REACT_DEV_URL);
  } else if (require('fs').existsSync(REACT_DIST)) {
    // Production / built: load the compiled React app
    mainWindow.loadFile(REACT_DIST);
  } else {
    // Fallback: vanilla renderer (pre-React)
    mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('app:state', appState);
  });

  // Remove default menu bar (hides dev-tools shortcut in production)
  if (app.isPackaged) {
    mainWindow.setMenu(null);
  }

  return mainWindow;
}

function getSecondaryDisplay() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const displays = screen.getAllDisplays();
  return displays.find((d) => d.id !== primaryDisplay.id) || null;
}

function createCustomerWindow(targetDisplay) {
  if (!targetDisplay) return null;

  const { x, y, width, height } = targetDisplay.bounds;
  customerWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    title: 'POS Customer Screen',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  customerWindow.loadFile(path.join(__dirname, '../../src/renderer/customer.html'));
  customerWindow.setMenuBarVisibility(false);
  customerWindow.setFullScreen(true);

  customerWindow.on('closed', () => {
    customerWindow = null;
  });

  customerWindow.webContents.on('did-finish-load', () => {
    if (!customerWindow || customerWindow.isDestroyed()) return;
    customerWindow.webContents.send('app:state', appState);
  });

  return customerWindow;
}

function ensureCustomerWindow() {
  const secondary = getSecondaryDisplay();

  if (!secondary) {
    if (customerWindow && !customerWindow.isDestroyed()) {
      customerWindow.close();
    }
    return;
  }

  if (!customerWindow || customerWindow.isDestroyed()) {
    createCustomerWindow(secondary);
    return;
  }

  const { x, y, width, height } = secondary.bounds;
  customerWindow.setBounds({ x, y, width, height });
}

async function showUpdateDialog(options) {
  if (!mainWindow || mainWindow.isDestroyed() || updatePromptOpen) {
    return null;
  }

  updatePromptOpen = true;
  try {
    return await dialog.showMessageBox(mainWindow, options);
  } finally {
    updatePromptOpen = false;
  }
}

// ── Blocked-version check (rollback support) ─────────────────────────────────
// Cached blocked list — populated once at startup, reused in update-available.
let cachedBlockedVersions = [];

// Downloads blocked.json from the update server and returns its parsed contents.
// Returns null if the file cannot be fetched (network down, server unreachable).
function fetchBlockedJson() {
  return new Promise((resolve) => {
    const url = `${UPDATE_SERVER_URL}/blocked.json`;
    const transport = url.startsWith('https') ? https : http;
    try {
      const req = transport.get(url, { timeout: 5000 }, (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            log.warn('blocked.json parse error — skipping blocked check');
            resolve(null);
          }
        });
      });
      req.on('error', () => { log.warn('blocked.json fetch error — skipping blocked check'); resolve(null); });
      req.on('timeout', () => { req.destroy(); log.warn('blocked.json fetch timed out — skipping blocked check'); resolve(null); });
    } catch (err) {
      log.warn('blocked.json fetch threw — skipping blocked check', err);
      resolve(null);
    }
  });
}

function initAutoUpdater() {
  if (!app.isPackaged) {
    log.info('Auto-update disabled in development mode.');
    return;
  }

  try {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: UPDATE_SERVER_URL,
      channel: 'latest',
    });
    log.info('Auto-update feed URL set to:', UPDATE_SERVER_URL);
  } catch (error) {
    log.error('Failed to set auto-update feed URL:', error);
  }

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
  });

  autoUpdater.on('update-available', async (info) => {
    log.info('Update available:', info.version);

    // If the available version is blocked, silently ignore it — do not prompt.
    if (cachedBlockedVersions.includes(info.version)) {
      log.warn(`Update to ${info.version} suppressed — version is blocked.`);
      return;
    }

    const result = await showUpdateDialog({
      type: 'info',
      title: 'POS System Update',
      message: `Version ${info.version} is available.`,
      detail: 'Download the update now? The app will ask to restart after the download finishes.',
      buttons: ['Download', 'Later'],
      cancelId: 1,
      defaultId: 0,
      noLink: true,
    });

    if (result && result.response === 0) {
      updateDownloadRequested = true;
      autoUpdater.downloadUpdate().catch((error) => {
        log.error('Failed to start update download:', error);
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('No updates available. Current version:', info.version || app.getVersion());
  });

  autoUpdater.on('error', async (error) => {
    log.error('Auto-update error:', error);
    if (!updateDownloadRequested) {
      return;
    }

    updateDownloadRequested = false;

    await showUpdateDialog({
      type: 'error',
      title: 'POS System Update',
      message: 'The update could not be downloaded.',
      detail: error == null ? 'Unknown update error.' : String(error),
      buttons: ['OK'],
      defaultId: 0,
      noLink: true,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`Update download progress: ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    log.info('Update downloaded:', info.version);
    updateDownloadRequested = false;

    const result = await showUpdateDialog({
      type: 'info',
      title: 'POS System Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Click Install and Restart to apply the update now.',
      buttons: ['Install and Restart', 'Later'],
      cancelId: 1,
      defaultId: 0,
      noLink: true,
    });

    if (result && result.response === 0) {
      setImmediate(() => {
        autoUpdater.quitAndInstall(false, true);
      });
    }
  });

  // ── Startup update check: blocked-version check first, then normal check ───
  setTimeout(async () => {
    try {
      const blocked = await fetchBlockedJson();
      const currentVersion = app.getVersion();

      if (blocked) {
        const { blocked_versions = [], minimum_version = '0.0.0' } = blocked;
        // Cache so the update-available handler can also filter blocked versions
        cachedBlockedVersions = blocked_versions;
        const isBlocked = blocked_versions.includes(currentVersion);
        const isBelowMinimum = currentVersion.localeCompare(minimum_version, undefined, { numeric: true, sensitivity: 'base' }) < 0;

        if (isBlocked || isBelowMinimum) {
          log.warn(`Version ${currentVersion} is ${isBlocked ? 'blocked' : 'below minimum ('+minimum_version+')'}. Triggering rollback.`);

          // Switch to previous.yml so the downgrade target is the last known-good build
          autoUpdater.allowDowngrade = true;
          autoUpdater.setFeedURL({
            provider: 'generic',
            url: UPDATE_SERVER_URL,
            channel: 'previous',
          });

          await showUpdateDialog({
            type: 'warning',
            title: 'POS System — Version Recalled',
            message: `Version ${currentVersion} has been recalled.`,
            detail: 'The app will automatically download and install the previous stable version, then restart. This may take a minute.',
            buttons: ['OK'],
            defaultId: 0,
            noLink: true,
          });

          // Force silent download — no prompts, install immediately on download
          autoUpdater.autoDownload = true;
          autoUpdater.autoInstallOnAppQuit = false;

          // Override update-downloaded to auto-install without asking
          autoUpdater.once('update-downloaded', () => {
            log.info('Rollback version downloaded — installing now.');
            autoUpdater.quitAndInstall(false, true);
          });

          autoUpdater.checkForUpdates().catch((err) => {
            log.error('Rollback update check failed:', err);
          });
          return; // skip normal update check
        }
      }

      // Normal update check
      autoUpdater.checkForUpdatesAndNotify().catch((error) => {
        log.error('Update check failed:', error);
      });
    } catch (err) {
      log.error('Startup update check error:', err);
      autoUpdater.checkForUpdatesAndNotify().catch((error) => {
        log.error('Update check failed:', error);
      });
    }
  }, 5000);
}

function setupHardwareIpc() {
  ipcMain.on('app:set-state', (_event, payload) => {
    setState(payload);
  });

  ipcMain.handle('app:get-state', async () => appState);

  ipcMain.handle('hardware:list-printers', async () => {
    return hardwareService.listPrinters();
  });

  ipcMain.handle('hardware:print-test', async (_event, payload) => {
    return hardwareService.printText(payload || {});
  });

  ipcMain.handle('hardware:list-serial-ports', async () => {
    return hardwareService.listSerialPorts();
  });

  ipcMain.handle('hardware:read-weight-once', async (_event, payload) => {
    return hardwareService.readWeightFromScaleServer(payload || {});
  });

  ipcMain.handle('hardware:launch-scale-server', async (_event, payload) => {
    return hardwareService.launchScaleServer(payload || {});
  });

  ipcMain.handle('hardware:read-scanner-once', async (_event, payload) => {
    return hardwareService.readScannerOnce(payload || {});
  });

  ipcMain.handle('hardware:launch-scanner-server', async (_event, payload) => {
    return hardwareService.launchScannerServer(payload || {});
  });

  ipcMain.handle('hardware:listen-scanner', async (_event, payload) => {
    return hardwareService.listenScannerServer(payload || {});
  });
}

app.whenReady().then(() => {
  setupHardwareIpc();

  // ── Plugin system ────────────────────────────────────────────────────────
  pluginManager.init({
    ipcMain,
    getMainWindow:     () => mainWindow,
    getCustomerWindow: () => customerWindow,
    getState:          () => appState,
    setState,
    hardwareService,
  });
  pluginManager.loadAll();
  pluginManager.emit('app:ready', {}).catch(() => {});
  // ─────────────────────────────────────────────────────────────────────────

  createWindow();
  ensureCustomerWindow();
  initAutoUpdater();

  screen.on('display-added', () => ensureCustomerWindow());
  screen.on('display-removed', () => ensureCustomerWindow());
  screen.on('display-metrics-changed', () => ensureCustomerWindow());

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    ensureCustomerWindow();
  });
});

app.on('window-all-closed', () => {
  pluginManager.emit('app:quit', {}).catch(() => {});
  if (process.platform !== 'darwin') app.quit();
});
