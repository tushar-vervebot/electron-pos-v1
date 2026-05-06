'use strict';

/**
 * pluginManager.js — Core plugin/module system for the POS app.
 *
 * Usage in main.js:
 *   const pluginManager = require('./plugins/pluginManager');
 *   pluginManager.init({ ipcMain, getMainWindow, getCustomerWindow, getState, setState, hardwareService });
 *   pluginManager.loadAll();
 *
 * Plugin contract:
 *   A plugin is a folder with plugin.json + index.js.
 *   index.js must export { activate(api), deactivate() }.
 *
 * Bundled plugins:  src/plugins/<plugin-folder>/
 * User plugins:     %APPDATA%\<appName>\plugins\<plugin-folder>/
 */

const path = require('path');
const fs   = require('fs');
const log  = require('electron-log');

class PluginManager {
  constructor() {
    this._plugins      = new Map();   // id → { manifest, instance, api, dir }
    this._hooks        = new Map();   // event → Set<fn>
    this._ipcHandlers  = new Set();   // full IPC channel names registered by plugins
    this._panels       = [];          // { pluginId, panelPath }

    // Injected via init()
    this._ipcMain          = null;
    this._getMainWindow    = null;
    this._getCustomerWindow = null;
    this._getState         = null;
    this._setState         = null;
    this._hardwareService  = null;
  }

  // ── Initialisation ─────────────────────────────────────────────────────────

  /**
   * Wire the manager into the Electron main process.
   * Must be called inside app.whenReady(), before loadAll().
   */
  init({ ipcMain, getMainWindow, getCustomerWindow, getState, setState, hardwareService }) {
    this._ipcMain           = ipcMain;
    this._getMainWindow     = getMainWindow;
    this._getCustomerWindow = getCustomerWindow;
    this._getState          = getState;
    this._setState          = setState;
    this._hardwareService   = hardwareService;

    // Renderer → main: fire a lifecycle hook from the renderer process.
    // Renderer calls: window.electronAPI.plugins.emitHook(hookName, data)
    ipcMain.on('plugin:hook-emit', (_event, payload) => {
      if (!payload || typeof payload.hookName !== 'string') return;
      this.emit(payload.hookName, payload.data).catch(() => {});
    });

    // Renderer → main: request all registered plugin panel HTML.
    ipcMain.handle('plugin:get-panels', async () => {
      return this._panels
        .map(({ pluginId, panelPath }) => ({
          pluginId,
          htmlContent: fs.existsSync(panelPath)
            ? fs.readFileSync(panelPath, 'utf8')
            : '',
        }))
        .filter((p) => p.htmlContent.trim().length > 0);
    });

    // ── List ALL available plugins (active or not) ───────────────────────
    ipcMain.handle('plugin:list-all', () => {
      const results = [];
      const dirs = [path.join(__dirname, 'plugins')];
      try {
        const { app } = require('electron');
        const userDir = path.join(app.getPath('userData'), 'plugins');
        if (fs.existsSync(userDir)) dirs.push(userDir);
      } catch (_) {}

      for (const dir of dirs) {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const manifestPath = path.join(dir, entry.name, 'plugin.json');
            if (!fs.existsSync(manifestPath)) continue;
            try {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
              results.push({
                ...manifest,
                active: this._plugins.has(manifest.id),
                pluginDir: path.join(dir, entry.name),
              });
            } catch (_) {}
          }
        } catch (_) {}
      }
      return results;
    });

    // ── Enable / disable a plugin at runtime ────────────────────────────
    ipcMain.handle('plugin:set-enabled', (_event, { pluginId, enabled }) => {
      if (enabled) {
        if (this._plugins.has(pluginId)) return { ok: true };
        // Find dir by scanning
        const dirs = [path.join(__dirname, 'plugins')];
        try {
          const { app } = require('electron');
          const userDir = path.join(app.getPath('userData'), 'plugins');
          if (fs.existsSync(userDir)) dirs.push(userDir);
        } catch (_) {}

        let found = false;
        for (const base of dirs) {
          const dir = path.join(base, pluginId);
          if (fs.existsSync(path.join(dir, 'plugin.json'))) {
            this._loadPlugin(dir);
            found = true;
            break;
          }
        }
        return { ok: found && this._plugins.has(pluginId) };
      } else {
        const entry = this._plugins.get(pluginId);
        if (!entry) return { ok: true };
        try {
          if (typeof entry.instance.deactivate === 'function') entry.instance.deactivate();
        } catch (_) {}
        // Remove IPC handlers registered by this plugin
        for (const ch of this._ipcHandlers) {
          if (ch.startsWith(`plugin:${pluginId}:`)) {
            try { ipcMain.removeHandler(ch); } catch (_) {}
            this._ipcHandlers.delete(ch);
          }
        }
        this._plugins.delete(pluginId);
        this._panels = this._panels.filter(p => p.pluginId !== pluginId);
        log.info(`[PluginManager] "${pluginId}" deactivated.`);
        return { ok: true };
      }
    });
  }

  // ── Hook system ────────────────────────────────────────────────────────────

  /**
   * Emit a lifecycle event. All registered handlers are called in order.
   * Async handlers are awaited sequentially so a hook can be a gate.
   * Returns array of results from every handler.
   */
  async emit(event, data) {
    const handlers = this._hooks.get(event);
    if (!handlers || handlers.size === 0) return [];

    const results = [];
    for (const fn of handlers) {
      try {
        results.push(await fn(data));
      } catch (err) {
        log.error(`[PluginManager] Hook error in "${event}":`, err.message || String(err));
      }
    }
    return results;
  }

  _registerHook(event, fn) {
    if (!this._hooks.has(event)) this._hooks.set(event, new Set());
    this._hooks.get(event).add(fn);
    // Returns an unsubscribe function
    return () => this._hooks.get(event)?.delete(fn);
  }

  // ── Plugin loading ─────────────────────────────────────────────────────────

  /**
   * Scan all plugin directories and activate each valid plugin.
   * Call once after init().
   */
  loadAll() {
    const dirs = [
      path.join(__dirname, 'plugins'), // bundled plugins live in src/plugins/
    ];

    // User-installed plugins directory (outside asar, survives updates)
    try {
      const { app } = require('electron');
      const userPluginsDir = path.join(app.getPath('userData'), 'plugins');
      if (!fs.existsSync(userPluginsDir)) {
        fs.mkdirSync(userPluginsDir, { recursive: true });
      }
      dirs.push(userPluginsDir);
    } catch (_) {}

    for (const dir of dirs) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            this._loadPlugin(path.join(dir, entry.name));
          }
        }
      } catch (_) {}
    }

    log.info(`[PluginManager] ${this._plugins.size} plugin(s) loaded.`);
  }

  _loadPlugin(dir) {
    const manifestPath = path.join(dir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) return;

    // --- Parse manifest ---
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      log.warn(`[PluginManager] Bad manifest at ${manifestPath}: ${err.message}`);
      return;
    }

    if (!manifest.id) {
      log.warn(`[PluginManager] Plugin at "${dir}" is missing an "id" field.`);
      return;
    }

    if (manifest.enabled === false) {
      log.info(`[PluginManager] Plugin "${manifest.id}" is disabled, skipping.`);
      return;
    }

    if (this._plugins.has(manifest.id)) {
      log.warn(`[PluginManager] Duplicate id "${manifest.id}", skipping ${dir}`);
      return;
    }

    // --- Load entry file ---
    const entryPath = path.join(dir, manifest.entry || 'index.js');
    if (!fs.existsSync(entryPath)) {
      log.warn(`[PluginManager] Entry not found: ${entryPath}`);
      return;
    }

    let instance;
    try {
      instance = require(entryPath);
    } catch (err) {
      log.error(`[PluginManager] require() failed for "${manifest.id}": ${err.message}`);
      return;
    }

    if (typeof instance.activate !== 'function') {
      log.warn(`[PluginManager] "${manifest.id}" has no activate() export.`);
      return;
    }

    // --- Activate ---
    const api = this._buildApi(manifest, dir);
    try {
      instance.activate(api);
      this._plugins.set(manifest.id, { manifest, instance, api, dir });
      log.info(`[PluginManager] ✓ "${manifest.id}" v${manifest.version || '?'} activated.`);
    } catch (err) {
      log.error(`[PluginManager] activate() threw for "${manifest.id}": ${err.message}`);
    }
  }

  // ── Plugin API factory ─────────────────────────────────────────────────────

  /**
   * Build the frozen API object given to each plugin's activate(api) call.
   * Plugins can ONLY interact with the app through this surface.
   */
  _buildApi(manifest, pluginDir) {
    const manager  = this;
    const pluginId = manifest.id;
    const ipcMain  = this._ipcMain;

    return Object.freeze({
      /** Read-only copy of the plugin's own manifest */
      manifest: Object.freeze({ ...manifest }),

      // ── Lifecycle hooks ─────────────────────────────────────────────────
      hooks: Object.freeze({
        /**
         * Subscribe to a POS lifecycle event.
         * Built-in events: cart:item-added, cart:checkout, cart:cleared,
         *                  state:updated, app:ready, app:quit
         * Returns an unsubscribe function.
         */
        on(event, fn) {
          return manager._registerHook(event, fn);
        },
        /** Emit a custom event — other plugins can subscribe to it. */
        emit(event, data) {
          return manager.emit(event, data);
        },
      }),

      // ── IPC (main ↔ renderer) ────────────────────────────────────────────
      ipc: Object.freeze({
        /**
         * Register an IPC invoke handler.
         * Channel is auto-namespaced: "plugin:{pluginId}:{channel}"
         * Renderer calls: window.electronAPI.plugins.invoke('plugin:pluginId:channel', payload)
         */
        handle(channel, fn) {
          const full = `plugin:${pluginId}:${channel}`;
          if (manager._ipcHandlers.has(full)) {
            log.warn(`[Plugin:${pluginId}] Channel "${full}" already registered.`);
            return;
          }
          ipcMain.handle(full, fn);
          manager._ipcHandlers.add(full);
        },

        /** Register a fire-and-forget IPC listener */
        on(channel, fn) {
          const full = `plugin:${pluginId}:${channel}`;
          ipcMain.on(full, fn);
          manager._ipcHandlers.add(full);
        },

        /** Push a message to the main POS renderer window */
        sendToMain(channel, data) {
          const win = manager._getMainWindow?.();
          if (win && !win.isDestroyed()) {
            win.webContents.send(`plugin:${pluginId}:${channel}`, data);
          }
        },

        /** Push a message to the customer display window */
        sendToCustomer(channel, data) {
          const win = manager._getCustomerWindow?.();
          if (win && !win.isDestroyed()) {
            win.webContents.send(`plugin:${pluginId}:${channel}`, data);
          }
        },
      }),

      // ── App state ────────────────────────────────────────────────────────
      state: Object.freeze({
        /** Read the current shared POS state (cart, subtotal, tax, total) */
        get() {
          return manager._getState?.() ?? {};
        },
        /**
         * Patch the shared state — same contract as setState() in main.js.
         * Use with caution: this broadcasts to all windows.
         */
        patch(updates) {
          manager._setState?.(updates);
        },
      }),

      // ── Hardware extensions ──────────────────────────────────────────────
      hardware: Object.freeze({
        /**
         * Register a new hardware command callable from the renderer.
         * Channel: "plugin:{pluginId}:hw:{commandName}"
         * Renderer calls: window.electronAPI.plugins.invoke('plugin:pluginId:hw:cmd', payload)
         */
        register(commandName, fn) {
          const full = `plugin:${pluginId}:hw:${commandName}`;
          if (manager._ipcHandlers.has(full)) return;
          ipcMain.handle(full, fn);
          manager._ipcHandlers.add(full);
        },
        /** Delegate to the core hardware service */
        listPrinters:    () => manager._hardwareService?.listPrinters(),
        listSerialPorts: () => manager._hardwareService?.listSerialPorts(),
      }),

      // ── UI panel slot ────────────────────────────────────────────────────
      renderer: Object.freeze({
        /**
         * Register an HTML file to be injected into the #plugin-panels
         * slot in the main renderer.
         * The HTML must be pure markup — no <script> tags (they won't run).
         * Wire interactivity using data-plugin-id + data-plugin-action attributes;
         * the renderer's plugin loader attaches all event handlers automatically.
         */
        addPanel(panelFile) {
          const panelPath = path.resolve(pluginDir, panelFile);
          if (!fs.existsSync(panelPath)) {
            log.warn(`[Plugin:${pluginId}] Panel file not found: ${panelPath}`);
            return;
          }
          manager._panels.push({ pluginId, panelPath });
        },
      }),

      // ── Logging ──────────────────────────────────────────────────────────
      logger: Object.freeze({
        info:  (...a) => log.info( `[Plugin:${pluginId}]`, ...a),
        warn:  (...a) => log.warn( `[Plugin:${pluginId}]`, ...a),
        error: (...a) => log.error(`[Plugin:${pluginId}]`, ...a),
      }),
    });
  }
}

module.exports = new PluginManager();
