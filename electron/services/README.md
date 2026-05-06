# electron/services

Native **Electron services** running in the main process.

## What goes here

| File / Folder | Purpose |
|---|---|
| `hardwareService.js` | Manages hardware connections (serial ports, printers, scanners) |
| `serviceManager.js` | Lifecycle manager for all native services (start, stop, restart) |
| `hw_bridge/` | Python hardware bridge (serial ↔ HTTP) |
| `LabelPrinterService/` | Label printer driver integration |
| `nssm/` | NSSM binaries for running services as Windows background services |
| `pos-health/` | POS Health Windows service – watchdog that monitors the app |
| `python/` | Bundled Python runtime used by the hardware bridge |
| `printerService.js` | Receipt printer abstraction (ESC/POS commands) |
| `barcodeService.js` | Barcode scanner event source |
| `databaseService.js` | Local SQLite database access from the main process |
| `autoUpdaterService.js` | Electron auto-updater integration |

## Rules

- All services are accessed by the renderer via **IPC** through `ipcHandlers.js`.
- Services must register in `nativeServiceRegistry.js` so plugins can request them.
- Check plugin permissions before granting a plugin access to a service.
