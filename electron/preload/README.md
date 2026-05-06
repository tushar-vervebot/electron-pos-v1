# electron/preload

Electron **preload scripts** – the secure bridge between main and renderer.

## What goes here

| File | Purpose |
|---|---|
| `preload.js` | Electron Forge preload – exposes `electronAPI` via `contextBridge` |
| `index.js` | electron-vite preload entry – same role for the vite build pipeline |

## Rules

- `contextIsolation: true` and `nodeIntegration: false` must be maintained.
- Only expose safe, explicitly approved APIs to the renderer.
- Validate every value passed to `ipcRenderer.invoke` before sending.
- Never expose raw Node.js APIs (e.g. `fs`, `child_process`) directly.

## API shape (target)

```js
contextBridge.exposeInMainWorld('electronAPI', {
  printReceipt:       (payload)  => ipcRenderer.invoke('printer:printReceipt', payload),
  scanBarcode:        ()         => ipcRenderer.invoke('barcode:scan'),
  getInstalledPlugins: ()        => ipcRenderer.invoke('plugins:list'),
  enablePlugin:       (pluginId) => ipcRenderer.invoke('plugins:enable', pluginId),
  disablePlugin:      (pluginId) => ipcRenderer.invoke('plugins:disable', pluginId),
})
```
