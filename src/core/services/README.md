# src/core/services

Shared **frontend services** (API clients, storage, sync, hardware bridge, auth).

## Sub-folders

| Folder | Purpose |
|---|---|
| `api/` | HTTP API client and per-resource API modules (`productApi.js`, `orderApi.js`, …) |
| `storage/` | Local storage abstractions: `localStorageService.js`, `indexedDbService.js`, `cacheService.js` |
| `sync/` | Offline queue, sync engine, conflict resolver |
| `websocket/` | WebSocket client (`socketService.js`) |
| `hardware/` | Renderer-side hardware abstractions that talk to the main process via IPC |
| `auth/` | Auth state, session management, token storage |
| `logging/` | `logger.js` – structured logging helper |

## Rules

- Register core services in the **service registry** so plugins can access them via `pluginAPI.getService('name')`.
- Services must not import plugin files directly.
- Hardware access goes through `electronAPI` (preload bridge), not `require('serialport')` in the renderer.
