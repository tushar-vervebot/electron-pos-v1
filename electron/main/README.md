# electron/main

Electron **main process** source files.

## What goes here

| File | Purpose |
|---|---|
| `main.js` | Electron Forge entry – creates BrowserWindow, registers app events |
| `index.js` | electron-vite entry – same role for the vite build pipeline |
| `remoteWsClient.js` | Manages the remote WebSocket connection from the main process |
| `windowManager.js` | Window creation helpers (main POS window, customer display window) |
| `ipcHandlers.js` | All `ipcMain.handle` definitions |
| `pluginMainLoader.js` | Loads plugin native-side services into the main process |
| `nativeServiceRegistry.js` | Registry for services exposed to the renderer via IPC |
| `security.js` | Content-Security-Policy, permission request handlers |

## Rules

- This folder runs in the **Node.js / Electron main process** – full Node access.
- Never import renderer React components from here.
- All communication with the renderer goes through `ipcMain` / `contextBridge`.
