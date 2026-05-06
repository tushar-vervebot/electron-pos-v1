// preload.js — runs in an isolated context before the renderer
// Expose only what the renderer needs via contextBridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  appState: {
    setState: (payload) => ipcRenderer.send('app:set-state', payload),
    getState: () => ipcRenderer.invoke('app:get-state'),
    onState: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('app:state', handler);
      return () => ipcRenderer.removeListener('app:state', handler);
    },
  },
  hardware: {
    listPrinters:       () => ipcRenderer.invoke('hardware:list-printers'),
    printTest:          (payload) => ipcRenderer.invoke('hardware:print-test', payload),
    listSerialPorts:    () => ipcRenderer.invoke('hardware:list-serial-ports'),
    readWeightOnce:     (payload) => ipcRenderer.invoke('hardware:read-weight-once', payload),
    launchScaleServer:  (payload) => ipcRenderer.invoke('hardware:launch-scale-server', payload),
    launchScannerServer:(payload) => ipcRenderer.invoke('hardware:launch-scanner-server', payload),
    listenScanner:      (payload) => ipcRenderer.invoke('hardware:listen-scanner', payload),
    readScannerOnce:    (payload) => ipcRenderer.invoke('hardware:read-scanner-once', payload),
  },
  // ── Plugin / module system ───────────────────────────────────────────────
  plugins: {
    /**
     * List ALL available plugins (including disabled ones).
     * Returns [{ id, name, version, description, enabled, active, ... }]
     */
    listAll: () => ipcRenderer.invoke('plugin:list-all'),

    /**
     * Enable or disable a plugin at runtime.
     * { pluginId: string, enabled: boolean } → { ok: boolean }
     */
    setEnabled: (pluginId, enabled) =>
      ipcRenderer.invoke('plugin:set-enabled', { pluginId, enabled }),

    /**
     * Fetch all registered plugin panels (returns [{ pluginId, htmlContent }]).
     * Called once by the renderer on startup.
     */
    getPanels: () => ipcRenderer.invoke('plugin:get-panels'),

    /**
     * Invoke any plugin IPC handler by its full namespaced channel.
     * Channel format: "plugin:{pluginId}:{handlerName}"
     * Example: window.electronAPI.plugins.invoke('plugin:test-plugin:ping', { from: 'renderer' })
     */
    invoke: (channel, payload) => {
      // Safety: only allow channels that start with "plugin:" to reach plugin handlers
      if (typeof channel !== 'string' || !channel.startsWith('plugin:')) {
        return Promise.reject(new Error(`plugins.invoke: invalid channel "${channel}"`));
      }
      return ipcRenderer.invoke(channel, payload);
    },

    /**
     * Fire a POS lifecycle hook from the renderer side.
     * Main process forwards it to all plugin hook listeners.
     * Usage: window.electronAPI.plugins.emitHook('cart:checkout', { ... })
     */
    emitHook: (hookName, data) => {
      ipcRenderer.send('plugin:hook-emit', { hookName, data });
    },

    /**
     * Subscribe to a push event sent by a plugin via api.ipc.sendToMain().
     * Channel format: "plugin:{pluginId}:{eventName}"
     * Returns an unsubscribe function.
     */
    onEvent: (channel, callback) => {
      if (typeof channel !== 'string' || !channel.startsWith('plugin:')) return () => {};
      const handler = (_event, data) => callback(data);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
  },
});
