# POS System — Project Structure

---

## Top-Level Layout

```
pos-system/
│
├── apps/
│   ├── desktop/                 Electron cashier app (UI + hardware + OTA + dual screen)
│   └── update-server/           Local HTTP server that delivers app updates
│
├── backend/                     Go service — login, auth, data API, offline sync
│
├── services/                    Three Windows background services (auto-start on boot)
│   ├── pos-health/              Health check endpoint on localhost:5001
│   ├── hw-bridge/               Python hardware bridge for COM-port devices
│   └── label-printer/           Label printer service (not yet implemented)
│
├── hardware/                    Hardware integration code + vendor server programs
│   ├── hardwareService.js       Single file that handles all hardware calls
│   └── drivers/                 Vendor-supplied server executables (scale, scanner)
│
├── database/                    SQLite schema and migration files
│   └── migrations/              Numbered SQL files applied in order on startup
│
├── scripts/                     PowerShell scripts — install/uninstall Windows services
│
├── tools/                       Portable build tools (WiX, NSSM) — no system install needed
│   ├── wix/                     WiX v3 for MSI installer builds
│   └── nssm/                    NSSM for wrapping Python script as a Windows service
│
├── docs/                        All project documentation
│
└── dist/                        Build output — installer files (not committed to git)
```

---

## Desktop App — Internal Structure (`apps/desktop/`)

```
apps/desktop/
│
├── src/
│   │
│   ├── main/                            Main process — has full OS access, runs as Node.js
│   │   ├── index.js                     App entry point
│   │   ├── windows/
│   │   │   ├── cashier.js               Cashier window (1200×750 px)
│   │   │   └── customer.js              Customer display window (fullscreen on 2nd monitor)
│   │   ├── display/
│   │   │   └── screenManager.js         Detects monitors, auto-opens/closes customer window
│   │   ├── state/
│   │   │   └── appState.js              Shared cart state — broadcasts to both windows on change
│   │   ├── ipc/
│   │   │   ├── state.ipc.js             Handles: app:set-state, app:get-state
│   │   │   ├── hardware.ipc.js          Handles: hardware:print, hardware:read-weight, hardware:scan
│   │   │   └── auth.ipc.js              Handles: auth:login, auth:logout, auth:refresh
│   │   ├── updater/
│   │   │   └── autoUpdater.js           Checks update server, prompts cashier, downloads, installs
│   │   └── security/
│   │       └── csp.js                   Applies Content-Security-Policy headers to every page
│   │
│   ├── preload/
│   │   └── preload.js                   Security bridge — exposes only allowed APIs to the UI
│   │                                    Uses Electron contextBridge. UI cannot bypass this.
│   │
│   └── renderer/                        UI pages — sandboxed, no Node.js or OS access
│       ├── cashier/
│       │   ├── index.html               Product grid, cart, totals, hardware controls
│       │   ├── renderer.js              All POS logic: add items, checkout, print, scale, scanner
│       │   └── styles.css
│       └── customer/
│           ├── customer.html            Customer display: cart items + total
│           ├── customer.js              Listens for app:state events and re-renders
│           └── customer.css
│
├── build/
│   ├── afterPack.js                     Post-build hook: stamps icon.ico onto the .exe
│   └── installer.nsh                    NSIS macros: desktop + Start Menu shortcuts
│
├── assets/
│   └── icon.ico                         App icon used in installer, exe, and shortcuts
│
├── forge.config.js                      MSI build config + Electron Fuses (security flags)
├── build-msi.js                         Legacy MSI builder (electron-wix-msi)
└── package.json                         Dependencies + electron-builder config
```

---

## Go Backend — Internal Structure (`backend/`)

```
backend/
│
├── cmd/
│   └── pos-server/
│       └── main.go                      Entry point — starts server, connects DB, registers routes
│
└── internal/
    ├── auth/
    │   ├── handler.go                   Routes: POST /login, POST /logout, POST /refresh
    │   ├── service.go                   Logic: verify credentials, issue token, check revocation
    │   └── cache.go                     On login: saves password hash + role + device ID to SQLite
    │
    ├── sync/
    │   ├── handler.go                   Routes: POST /sync/push, GET /sync/pull
    │   ├── service.go                   Conflict detection and merge logic
    │   └── queue.go                     Drains outbox_events → sends to server → marks acked
    │
    └── db/
        ├── sqlite.go                    Opens SQLite, decrypts with Windows DPAPI key, runs migrations
        └── migrations/
            ├── 001_auth_cache.sql       user_id, username, password_hash, role, device_id, expiry
            ├── 002_session_state.sql    session_id, user_id, mode (online/offline), expires_at
            ├── 003_outbox_events.sql    Offline write queue — synced when connection returns
            ├── 004_sync_checkpoint.sql  Tracks last synced version per data stream
            ├── 005_conflict_queue.sql   Same record changed in two places — awaits resolution
            └── 006_audit_log.sql        Every privileged action, online or offline, permanent
```

---

## Windows Services — What Each One Does (`services/`)

| Service | Folder | Runs on | Wrapper | Status |
|---|---|---|---|---|
| POS Health | `pos-health/` | `localhost:5001/health` | WinSW | Live |
| Hardware Bridge | `hw-bridge/` | Python + COM ports | NSSM | Stub |
| Label Printer | `label-printer/` | ESC/POS printer protocol | Native | Not built |

**Key files in `pos-health/`:**
- `service.js` — HTTP server returning uptime, memory, hostname, PID
- `pos-health-service.exe` — compiled standalone exe (no Node.js needed on machine)
- `POS_HealthService.exe` — WinSW wrapper
- `POS_HealthService.xml` — WinSW config (service name, auto-restart, log paths)

---

## Scripts (`scripts/`)

| File | When it runs | What it does |
|---|---|---|
| `install-services.ps1` | MSI install (admin) | Creates log folder, registers all 3 services with Windows auto-start |
| `uninstall-services.ps1` | MSI uninstall | Stops and removes all 3 services cleanly |

---

## Quick Reference — Where to Go

| Task | Location |
|---|---|
| Cashier screen UI | `apps/desktop/src/renderer/cashier/` |
| Customer display UI | `apps/desktop/src/renderer/customer/` |
| Dual screen / monitor detection | `apps/desktop/src/main/display/screenManager.js` |
| Shared cart state | `apps/desktop/src/main/state/appState.js` |
| Printer / scale / scanner logic | `hardware/hardwareService.js` |
| Vendor hardware server programs | `hardware/drivers/` |
| OTA update settings | `apps/desktop/src/main/updater/autoUpdater.js` |
| Update server | `apps/update-server/serve-updates.js` |
| Login and offline auth | `backend/internal/auth/` |
| Data sync after reconnect | `backend/internal/sync/` |
| Add a new database table | New file in `database/migrations/` (increment the number) |
| Health service response | `services/pos-health/service.js` |
| Windows service setup | `scripts/install-services.ps1` |
| Installer shortcuts / branding | `apps/desktop/build/installer.nsh` + `assets/icon.ico` |
| Documentation | `docs/` |
