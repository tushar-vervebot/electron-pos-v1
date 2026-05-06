# POS System — How Everything Works

This document explains how the major parts of the POS System work in plain language. It is meant for team members, new developers, or anyone who needs to understand the system without digging into code.

---

## 1. How the Installer Works

### What the installer is

The POS System ships as a single Windows setup file, for example `POS-System-Setup-1.0.13.exe`. A user double-clicks it and the app installs like any normal Windows program.

### How that installer file is built

The installer is created using a tool called **electron-builder** with a format called **NSIS** (Nullsoft Scriptable Install System). NSIS is one of the oldest and most battle-tested installer frameworks on Windows. It is what tools like VLC and 7-Zip have used for years, so it is widely trusted.

When you trigger a build:
1. electron-builder compiles the entire application into an optimised package.
2. It bundles all the JavaScript source files, renderer HTML pages, assets, and dependencies into a single compressed archive called an **asar** file. Think of asar like a zip file that Electron knows how to read without unpacking.
3. The icon on the final `.exe` is stamped in using a tool called **rcedit**. This runs automatically as a post-build hook in `build/afterPack.js`. Without this step the executable would show a generic icon on the desktop.
4. The NSIS script (`build/installer.nsh`) runs custom macros that create proper desktop and Start Menu shortcuts and tell Windows to refresh its icon cache so shortcuts appear immediately.
5. The final output lands in the `dist/` folder and includes three files: the setup `.exe`, a `.blockmap` file (used for partial updates), and a `latest.yml` file (a small text file that describes the current version, file size, and checksum).

### What happens when a user runs the installer

The installer lets the user choose where to install. After clicking install, it:
- Copies all the application files to `Program Files`.
- Registers the app in Windows Add/Remove Programs.
- Creates the desktop shortcut and Start Menu entry.
- The background Windows services are installed separately via a PowerShell script (explained in Section 2).

### Third-party tools used here and their reliability

| Tool | What it does | Is it reliable? |
|---|---|---|
| **electron-builder** | Packages and creates the installer | Yes — industry standard for Electron apps, used by Slack, Discord, VS Code's extension tooling. Well maintained. |
| **NSIS** | The installer framework inside the .exe | Yes — 20+ years old, extremely stable. |
| **rcedit** | Stamps branding icon into the .exe | Yes — maintained by Electron team itself. |

---

## 2. How the Code is Protected Inside the Installer

Protection is applied in four distinct layers. Each layer assumes an attacker has already bypassed the previous one. Together they form a complete defence-in-depth model.

| Layer | Purpose | What it stops |
|---|---|---|
| **ASAR → packaging** | Bundles all JS into one opaque archive | Casual browsing of install folder |
| **Obfuscation → readability** | Mangles code before it enters the ASAR | Reading extracted JS even after unpacking |
| **Fuses → runtime restrictions** | Burns security flags into the binary | Attaching a debugger, running via Node CLI |
| **Architecture → real protection** | Secrets never in renderer, narrow IPC bridge | No sensitive value to steal even if code is fully read |

The order matters. An attacker who defeats one layer immediately faces the next:

```
Attacker extracts ASAR      →  Obfuscation makes code unreadable
Attacker runs binary        →  Fuses block Node CLI / DevTools attach
Attacker reads source fully →  No secrets there; Architecture protected them
```

---

### Layer 1 — ASAR (packaging)

All the application's JavaScript source files go into an asar archive. When the app is running, Electron reads directly from this archive without extracting it. A casual user or attacker cannot simply browse to the install folder and open your JavaScript files in a text editor because everything is inside that archive.

- **OnlyLoadAppFromAsar enabled** — the app will refuse to load code from anywhere except its own asar archive. This means someone cannot swap out or inject files next to the app folder.

---

### Layer 2 — Obfuscation (readability)

Even if someone successfully extracts the ASAR archive, the JavaScript inside has been processed by an obfuscator before packaging. The obfuscator:

- Renames every variable, function, and class to meaningless identifiers (e.g. `_0x3f2a`, `_0xb12c`).
- Encodes string literals so they are not readable in plain text.
- Inserts dead-code paths and control-flow flattening to make logic very hard to follow.
- Removes all source maps from production builds.

The tool used is **javascript-obfuscator**, applied as a build step via `webpack-obfuscator` or `rollup-plugin-obfuscator` before electron-builder packages the output. This runs automatically during `npm run build` so the developer always works with readable source but the shipped binary always contains obfuscated output.

---

### Layer 3 — Fuses (runtime restrictions)

Electron Fuses are permanent flags burned into the Electron binary at build time by `@electron/fuses`. They cannot be changed at runtime and cannot be bypassed by environment variables or command-line flags.

The following fuses are enabled for this application:

| Fuse | Value | Effect |
|---|---|---|
| `RunAsNode` | `false` | Binary cannot be used as a Node.js runtime |
| `EnableNodeCliInspectArguments` | `false` | `--inspect` and `--inspect-brk` flags are ignored |
| `EnableNodeOptionsEnvironmentVariable` | `false` | `NODE_OPTIONS` env var is ignored |
| `OnlyLoadAppFromAsar` | `true` | App refuses to load code outside its ASAR |

These are configured in `forge.config.js` and must also be applied to the `electron-builder` NSIS path before the first production release.

---

### Layer 4 — Architecture (real protection)

This is the most important layer. The first three layers slow an attacker down, but architecture is what ensures there is nothing worth finding even if they succeed.

Rules enforced by architecture:

- **No secrets in the renderer** — API keys, Odoo credentials, payment keys, and update secrets are never placed in any file that ends up in the renderer bundle.
- **Narrow IPC bridge** — the preload script exposes only specific named functions (e.g. `getOrderList`, `printLabel`), never a generic `ipcRenderer.invoke(channel, ...args)` passthrough. An attacker who can call `window.electronAPI` can only trigger the exact operations that have been explicitly allowed.
- **contextIsolation** — the UI page has no access to Node.js APIs at all. It lives in its own sandbox.
- **sandbox** — the renderer runs in a true OS-level sandboxed process, the same kind of sandbox Chromium uses for web pages.
- **nodeIntegration disabled** — `require()` is not available inside any UI page.
- **webSecurity enabled** — standard browser same-origin rules are enforced.
- A **Content Security Policy** header is applied to every page load. This prevents inline script injection and blocks the page from making network calls directly (all network communication goes through the main process).

---

### What this means in practice

If someone extracts the ASAR, the obfuscated code is extremely hard to read. If they try to attach a debugger or run the binary with Node flags, the fuses block them. Even if they reverse-engineer every line of code, the architecture guarantees there are no secrets or exploitable generic channels to find. This four-layer model is the current industry best practice for Electron application security.

---

## 3. How the Background Services Work

When the MSI installer runs, three background Windows services are also installed. These services start automatically when Windows starts and keep running in the background even when the POS UI is closed. They all log to `C:\ProgramData\POS System\logs\`.

### How services get installed

A PowerShell script (`scripts/install-services.ps1`) is called automatically by the installer running with administrator rights. This script checks if each service binary exists, creates the log directory, then registers each service with Windows so they start automatically on every boot.

### Service 1 — POS Health Service

**What it does:**
This is a small always-running HTTP server on `localhost:5001`. If you open a browser and visit `http://localhost:5001/health` it returns a JSON response with the machine hostname, how long the service has been running, memory usage, and Node.js version. This is used by vendor monitoring systems or support tools to quickly verify the POS machine is alive and healthy.

**How it is wrapped as a Windows service:**
The service is a Node.js script (`src/services/pos-health/service.js`). Node.js scripts are not natively Windows services. To make it one, we use **WinSW** (Windows Service Wrapper). WinSW is an open-source tool that wraps any executable as a proper Windows service with automatic restart on crash, log rotation, and service lifecycle management. The script is also pre-compiled into a standalone `.exe` using a tool called **@yao-pkg/pkg** so that Node.js does not need to be installed on the user's machine for this service to run.

**Is WinSW reliable?** Yes. WinSW is a well-established open-source project backed by the Jenkins community. It has been used in production environments for over a decade.

### Service 2 — POS Hardware Bridge

**What it does:**
This service is designed to bridge hardware devices like barcode scanners, cash drawers, and specialty scales that communicate over serial (COM) ports. It runs as a Python process.

**How it is wrapped as a Windows service:**
We use **NSSM** (Non-Sucking Service Manager) to wrap the Python script. NSSM is similar to WinSW but more flexible for wrapping arbitrary executables. It captures stdout and stderr to log files and automatically restarts the process if it crashes.

**Current status:**
The Python script (`hw_bridge.py`) is currently a placeholder stub. The hardware integration logic for COM-port devices is handled directly in the main Electron process via the `hardwareService.js` module instead. The service infrastructure is in place for future use.

**Is NSSM reliable?** Yes. NSSM is widely used in professional Windows environments to run scripts as services. It is a standard tool in sysadmin workflows.

### Service 3 — Label Printer Service

**What it does:**
Intended to manage communication with label printers. The service binary has not yet been implemented, so the installer silently skips this one if the binary is missing.

---

## 4. How the OTA (Over-the-Air) Updater Works

OTA means the app can update itself without the user manually downloading and running a new installer. Here is the full flow.

### The update server

There is a simple HTTP server (`serve-updates.js`) that runs on the local network, listening on port 8080. It serves three types of files from the `dist/` folder:
- `latest.yml` — describes the newest version number, file size, and a checksum.
- The setup `.exe` file — the actual installer for the new version.
- The `.blockmap` file — a map of file chunks, used for downloading only the changed parts instead of the whole installer.

### How the app checks for updates

When the packaged app starts, it contacts `http://192.168.1.92:8080` (the update server address) and downloads `latest.yml`. It compares the version number inside that file to its own current version.

This uses the **electron-updater** library, which is the official companion package for electron-builder. It handles all the version comparison, download, hash verification, and installation logic.

### The user's experience

1. App opens and silently checks for updates in the background.
2. If a newer version exists, a dialog appears: "Version X.X.X is available. Download now or Later?"
3. If the user clicks Download, the new installer downloads in the background.
4. A progress percentage is logged while downloading.
5. When download completes, another dialog appears: "Update ready. Install and Restart or Later?"
6. If the user clicks Install and Restart, the app quits and the new installer runs automatically.
7. If the user chooses Later, the update is installed the next time the app closes.

### What makes this reliable

- The downloaded file's checksum is verified automatically against the value in `latest.yml`. If someone tampers with the file on the server or it gets corrupted in transit, the update is rejected.
- `autoDownload` is deliberately set to false, meaning the update never downloads without the user's consent.
- `autoInstallOnAppQuit` is true, so clicking Later still applies the update on the next restart.

**Is electron-updater reliable?** Yes. It is the most widely used update solution for Electron apps. It is maintained by the same team as electron-builder and used in production by many commercial Electron applications.

---

## 5. How Dual Screen and State Management Works

### Two windows, one shared state

The POS System runs two Electron windows at the same time:
- **Cashier window** — the main interface used by the operator. Loads at 1200×750 pixels. This is where the product grid, cart, and hardware controls live.
- **Customer display window** — a second window shown on a second monitor. Displays the cart items, subtotal, and total to the customer facing the other side of the counter.

Both windows always show exactly the same cart data because they share a single state object in the main process.

### How Electron detects screens

Electron's built-in `screen` module is used to list all connected displays. On startup and whenever a monitor is connected or disconnected, the app calls `screen.getAllDisplays()` and identifies which display is not the primary one. If a second display exists, the customer window is created positioned exactly on that display's coordinates and set to full screen automatically.

If the second display is disconnected while the app is running, the customer window closes. When another display is plugged in, a new customer window opens on it. This is handled by listening to the `display-added`, `display-removed`, and `display-metrics-changed` events from the screen module.

### How state flows between windows

There is a single in-memory `appState` object in the main process:
```
cart items, subtotal, tax, total, last updated timestamp
```

When the cashier adds or removes an item:
1. The cashier's UI page (renderer) calls `setState()` through the preload bridge.
2. The main process updates `appState`.
3. The main process immediately sends the updated state to **both** windows using `webContents.send('app:state', appState)`.
4. Both windows receive the event and re-render their UI to reflect the new cart instantly.

This mechanism — the main process acting as a message bus between renderer windows — is called **IPC** (Inter-Process Communication) and it is a core feature of Electron. It is the correct and safe way to share data between windows.

### The preload bridge

Neither window can directly access Node.js or the main process. Instead, a preload script (`src/preload.js`) runs in a special isolated context and exposes a controlled API called `window.electronAPI` to the UI pages. The UI can only call functions that the preload explicitly permits. This is Electron's `contextBridge` feature and it is a security boundary.

---

## 6. How Scale and Scanner Integration Works

All hardware communication happens in the main process (`src/services/hardwareService.js`). The UI cannot talk to hardware directly.

### Printers

**Listing printers:**
The app runs a PowerShell command using Windows' built-in WMI (Windows Management Instrumentation): `Get-CimInstance Win32_Printer`. This returns all printers Windows knows about. The results are enriched — the app automatically detects if a printer is connected via USB, if it is offline, and flags common POS/thermal printer names like Epson, Xprinter, and Bixolon.

**Printing:**
The app writes the receipt text to a temporary file, then uses PowerShell's `Out-Printer` command to send it to the chosen printer. The temp file is deleted immediately after printing.

### Barcode Scanners

Scanners communicate over a **WebSocket** connection to a locally running scanner server (a separate `.exe`). The flow:
1. Renderer asks the main process to connect to the scanner server.
2. Main process opens a WebSocket connection to `ws://127.0.0.1:8765` (or whichever port the scanner server uses).
3. When a barcode is scanned, the scanner server sends a JSON message like `{ "data": "12345678" }` over the WebSocket.
4. Main process receives it and forwards the barcode value to the renderer.

A throttle mechanism prevents the same barcode being processed multiple times if the scanner sends rapid duplicate reads.

The **ws** library is used for WebSocket communication. It is the most widely used WebSocket library in the Node.js ecosystem, downloaded hundreds of millions of times monthly. Highly reliable.

### Scales

The scale integration works through two steps:

**Step 1 — Start the scale server:**
The scale is controlled by a third-party program (`scale_latest_w_id.exe`) that must be running for the weight to be readable. The main process can launch this `.exe` as a background process without a visible window.

**Step 2 — Read the weight:**
Once the scale server is running, the main process connects to it via WebSocket at `ws://127.0.0.1:8765`. After connecting, it sends a numeric trigger message (a client ID number). The scale server responds with a JSON message like `{ "id": "100001", "weight": 0.18 }`. The main process extracts the weight value, parses the unit (kg, g, lb), and returns it to the renderer.

The protocol also handles an older plain-text streaming format where the server sends `==` when the weight is stable. This gives backward compatibility with older scale server versions.

### Serial Ports

The **serialport** library is used to list all COM ports on the machine. Each port is checked to see if it is USB-connected by inspecting the Plug-and-Play ID. Vendor and product IDs are surfaced to help identify which device is on which port. This is used to help operators configure which COM port their printer or other device is on.

**Is serialport reliable?** Yes. It is the de facto standard Node.js library for serial communication. It is actively maintained and widely used in industrial and retail hardware integration.

---

## 7. Modules and Libraries at a Glance

| Module | Purpose | Reliability |
|---|---|---|
| **electron v41** | The application runtime framework | Excellent. Made by GitHub/Microsoft. Powers VS Code, Slack, Figma desktop. |
| **electron-builder** | Builds the installer | Excellent. Industry standard for Electron packaging. |
| **electron-updater** | OTA auto-update logic | Excellent. Official companion to electron-builder. |
| **electron-log** | Writes log files across main and renderer | Good. Standard logging library specifically built for Electron. |
| **electron-forge** | Alternative build and packaging pipeline | Good. Official Electron toolchain by the Electron team. |
| **@electron/fuses** | Burns security flags into the executable | Excellent. Maintained by the Electron team. |
| **@yao-pkg/pkg** | Compiles Node.js scripts into standalone .exe | Good. Fork of the original `pkg` by Vercel. Actively maintained. |
| **serialport** | Reads and lists serial/COM ports | Excellent. De facto standard for Node.js serial communication. |
| **ws** | WebSocket client for scanner and scale | Excellent. Most popular WebSocket library in Node.js ecosystem. |
| **rcedit** | Stamps icon onto Windows executables | Good. Maintained by the Electron team. |
| **WinSW** | Wraps Node.js as a Windows service | Excellent. Mature open-source project, backed by Jenkins ecosystem. |
| **NSSM** | Wraps Python as a Windows service | Good. Widely used in professional Windows environments. |
| **WiX v3** | Alternative MSI installer format | Good. Microsoft-originated, enterprise-grade installer toolchain. |

---

## 8. Overall Data and Event Flow (Plain Summary)

```
User clicks a product on the cashier screen
        │
        ▼
Renderer (UI page) calls window.electronAPI.appState.setState()
        │
        ▼
Preload bridge forwards the call to the main process via IPC
        │
        ▼
Main process updates its shared appState object
        │
        ├──▶ Sends updated state to cashier window  → cashier UI re-renders
        └──▶ Sends updated state to customer window → customer display re-renders

User reads weight from scale
        │
        ▼
Renderer calls window.electronAPI.hardware.readWeightOnce()
        │
        ▼
Preload bridge → main process
        │
        ▼
hardwareService opens WebSocket to scale server (local exe)
        │
        ▼
Scale server returns weight JSON
        │
        ▼
hardwareService returns parsed weight → renderer displays it

App starts up (packaged)
        │
        ▼
autoUpdater contacts update server at 192.168.1.92:8080
        │
        ├── No update → nothing happens
        └── Update found → shows download dialog to cashier
                │
                ▼
        Cashier approves → file downloads in background
                │
                ▼
        Download complete → shows install dialog
                │
                ▼
        Cashier approves → app restarts, new version installed
```

---

## 9. How Offline Authentication Works Using a Cached Token

### The problem it solves

The POS machine connects to a central server for login. But what happens on the shop floor when the internet goes down or the server is unreachable? The cashier should still be able to log in and continue working. This section explains how that is done safely using a local cache.

### Step 1 — First login must be online

The very first time a user logs in on a machine, the internet must be available. Here is what happens during that first successful login:

1. The user enters their username and password.
2. The app sends the credentials to the Go backend server.
3. The server verifies them, and if correct, returns an **auth token** (a long random string that proves the login was genuine) along with the user's role and permissions.
4. The app takes the **password** and runs it through a **hashing algorithm** (explained below) and saves only the hash — never the original password — into the local SQLite database. The token expiry time and role snapshot are saved alongside it.
5. The device also records a **device ID** — a unique fingerprint of this specific machine — and ties the cached credentials to it.

From this point on, the machine has a secure local copy of enough information to verify the user again without the server.

### Step 2 — What is saved locally and how it is protected

The following is saved into the local SQLite database:

| What is saved | Why |
|---|---|
| Username | To look up the right cached record |
| Password hash (not the real password) | To verify future offline logins |
| Hashing algorithm used | So the app knows how to verify it |
| Role and permissions snapshot | So the app knows what the user is allowed to do |
| Device ID | So the cache only works on this specific machine |
| Token expiry time | So the offline window has a limit |
| Last online login time | To enforce re-authentication after a set period |

**The password is never saved as plain text.** Only a hash is stored. A hash is a one-way mathematical transformation — you can turn a password into a hash, but you cannot reverse a hash back into the password. This means even if someone steals the database file, they cannot read the actual password from it.

The hashing algorithm used is **Argon2id**, which is the current gold standard for password hashing. It is deliberately slow and memory-intensive, which makes it very hard for an attacker to guess passwords by trying millions of combinations quickly.

The entire sensitive section of the SQLite database is also **encrypted** using a key stored in the Windows OS credential store (Windows DPAPI). This means the encrypted database file is useless without also having access to that specific Windows user account on that specific machine.

### Step 3 — Offline login flow

When the cashier logs in and the server is unreachable:

1. The app detects no server connection.
2. The user enters username and password as normal.
3. The app looks up the username in the local SQLite cache.
4. It checks that the **device ID matches** this machine.
5. It checks that the **offline expiry time has not passed** (for example, 12 hours since last online login).
6. It runs the entered password through the same hashing algorithm and compares it to the stored hash.
7. If everything matches, the user is logged in using the last known role and permissions.

If the expiry window has passed, the login is blocked even if the password is correct. The cashier must go online at least once to refresh the cache.

### Step 4 — What the user can and cannot do when offline

Offline mode intentionally limits certain actions to reduce risk:

| Allowed offline | Blocked offline |
|---|---|
| Sales and checkout | Creating new user accounts |
| Printing receipts | Changing passwords |
| Reading weight and barcodes | Changing roles or permissions |
| Viewing previous transactions | Refund overrides above a set limit |

All actions taken offline are written to a local queue and synced to the server the moment the connection returns.

### Step 5 — What happens when the connection comes back

1. The app detects the server is reachable again.
2. It immediately performs a **revocation check** — asks the server whether this user's account is still active, not suspended, and whether their role has changed.
3. If the server says the account is still valid, the offline session is upgraded to a full online session and the cache is refreshed with a new expiry.
4. If the server says the account has been disabled or the password has changed, the user is immediately logged out even if they were in the middle of a session.
5. All queued offline transactions are synced to the server.

### Why this approach is safe

| Risk | How it is handled |
|---|---|
| Someone steals the database file | The file is encrypted with a Windows machine-bound key. Useless on another computer. |
| Someone tries to guess the password offline | Rate limiting — after 5 failed attempts, the account locks for 15 minutes. |
| Someone rolls back the system clock to extend the offline window | The app checks both the local clock and the server timestamp on reconnect and detects tampering. |
| Someone copies the database to another machine | The device ID check fails because the machine fingerprint does not match. |
| A manager revokes a user while they are offline | The revocation check on reconnect logs them out immediately. |
| Someone reads the database file and sees the hash | Argon2id makes brute-forcing the hash computationally infeasible. |

### Visual flow

```
First login (online)
        │
        ▼
User enters password → sent to Go server → server confirms OK
        │
        ▼
App hashes password with Argon2id
        │
        ▼
Saves hash + role + expiry + device ID → encrypted SQLite

Later login (offline)
        │
        ▼
User enters password → server unreachable → app checks local cache
        │
        ├── Device ID matches?          No  → login blocked
        ├── Offline expiry passed?      Yes → login blocked, must go online
        ├── Too many failed attempts?   Yes → locked out for 15 minutes
        └── Hash matches entered password? No → login blocked
                                           Yes → offline session granted

Connection restored
        │
        ▼
App contacts server → revocation check
        │
        ├── Account still valid → refresh cache, upgrade to online session
        └── Account disabled / password changed → force logout immediately
```

---

# Review Comments by ChatGPT

> These are additive review comments only. The original document content above has not been rewritten or removed.

## ChatGPT Comment 1 — Installer terminology must be consistent

The document says the application is packaged using **NSIS** and produces a Windows setup `.exe`, but Section 3 later says, "When the MSI installer runs." This should be clarified before production because NSIS and MSI have different behavior for service installation, upgrades, Group Policy deployment, rollback, uninstall, and enterprise support.

**Suggested action:** choose one official deployment model:

- **NSIS `.exe`** if you want to stay aligned with `electron-builder` and `electron-updater`.
- **MSI/WiX** if you need enterprise deployment through Intune, SCCM, Group Policy, or managed IT environments.

Do not mix both terms in architecture documentation unless both installer types are actually supported.

**Our Decision / Action Plan:**

NSIS is the official installer for all store machines. The WiX/MSI path exists for developer testing only and will never be shipped to stores. All documentation, including the incorrect "MSI installer" reference in Section 3, will be updated to say NSIS.

## ChatGPT Comment 2 — Service install, upgrade, and uninstall behavior needs more detail

The document explains that services are installed through `scripts/install-services.ps1`, but it does not define what happens during upgrades, failed service installation, uninstall, downgrade, or service binary replacement.

**Production risks:**

- Old service binary may keep running after app upgrade.
- Service may fail silently if antivirus blocks the executable.
- Uninstall may remove the app but leave Windows services behind.
- Upgrade may replace files while a service is still using them.
- A non-admin install may partially install the app but fail to install services.

**Suggested action:** document and implement service lifecycle rules:

```text
Fresh install  -> install service, start service, verify health
Upgrade        -> stop service, replace binary, start service, verify version
Uninstall      -> stop service, delete service, optionally keep logs/config
Downgrade      -> block unless explicitly supported
Failure        -> show visible installer error and write installer log
```

**Our Decision / Action Plan:**

Fresh install and clean uninstall are already handled by existing scripts. We will add upgrade logic: stop each service before replacing its files, bring it back up, and confirm it is healthy — any failure shows a visible error rather than silently continuing. Antivirus exclusion guidance will be added to the deployment documentation.

## ChatGPT Comment 3 — Consider consolidating background services

The current architecture uses multiple background technologies: Electron/Node, Python service through NSSM, Node service through WinSW, third-party scale executable, and possibly Go backend services. This can work, but it increases deployment and support complexity.

**Possible complication later:** support teams will need to debug different logging systems, service wrappers, antivirus behavior, crash behavior, and upgrade behavior for each runtime.

**Suggested action:** consider one local **Go POS Agent** service that handles:

- hardware bridge
- scanner bridge
- scale bridge
- printer bridge
- local health endpoint
- sync worker
- logs and diagnostics

Electron can then talk to one local authenticated API instead of managing many separate service processes.

**Our Decision / Action Plan:**

All existing services are already built and working, so we will keep them as they are for now. Consolidating them into a single service is noted as a future goal once everything is stable in production. Each service's log location and restart behaviour will be documented for the support team.

## ChatGPT Comment 4 — ASAR should not be described as strong code protection

The document correctly says ASAR makes the application harder for casual users to browse, but ASAR is not encryption and should not be treated as strong code protection. A technical user can extract ASAR files and inspect JavaScript.

**Suggested action:** adjust expectations internally and protect real secrets outside the renderer code. Do not store API secrets, update secrets, payment keys, or Odoo credentials in frontend JavaScript.

Recommended production hardening:

```text
- Code-sign app and service binaries
- Disable RunAsNode fuse
- Disable Node CLI inspect arguments fuse
- Enable OnlyLoadAppFromAsar
- Remove source maps from production builds
- Disable DevTools in production
- Keep secrets in backend/local protected storage only
```

**Our Decision / Action Plan:**

Runtime security flags are already set correctly in the Forge build path but not yet in the NSIS production build — this will be closed before release. Code signing will be added before the first public release. Confirmed: no passwords, credentials, or payment keys are stored in any renderer JavaScript file.

## ChatGPT Comment 5 — IPC bridge must expose narrow functions only

The document correctly uses `contextIsolation`, sandboxing, disabled Node integration, CSP, and a preload bridge. The next risk is the shape of the exposed `window.electronAPI`.

**Avoid:**

```js
window.electronAPI.invoke(channel, payload)
```

This creates a generic bridge and can become risky.

**Prefer:**

```js
window.electronAPI.cart.addItem(productId, quantity)
window.electronAPI.hardware.readWeightOnce()
window.electronAPI.receipts.print(orderId)
window.electronAPI.products.search(query)
```

Each IPC handler should validate:

- input type
- max length
- allowed values
- current cashier permission
- active POS session state
- calling window identity

**Our Decision / Action Plan:**

The IPC bridge is already split into named groups (appState, hardware, plugins) with no generic open channel. We will add input validation and a permission check to every handler so only the correct data types and authorised users can trigger each operation.

## ChatGPT Comment 6 — OTA update server should not stay hard-coded to `192.168.1.92`

The update flow currently depends on `http://192.168.1.92:8080`. This will become fragile when you deploy to multiple stores, networks, or machines.

**Suggested action:** make the update URL configurable through protected local config:

```json
{
  "update_base_url": "https://pos-server.local/updates",
  "store_id": "STORE-01",
  "terminal_id": "POS-02"
}
```

Store this config under a protected path such as:

```text
C:\ProgramData\POS System\config\pos-config.json
```

Normal cashier users should not be able to modify it.

**Our Decision / Action Plan:**

The hardcoded IP will be replaced with a proper domain name read from a protected config file on each machine at startup. This means the address can be set correctly per store without touching the code. Developers can still override it locally with an environment variable, but that override is never active on store machines.

## ChatGPT Comment 7 — Checksum verification is not enough if updates are served over HTTP

The updater verifies checksum from `latest.yml`, but if both the installer and metadata are served over plain HTTP, a network attacker could potentially replace both files.

**Suggested action:**

- Use HTTPS where possible.
- Code-sign the Electron app and installer.
- Code-sign service/helper binaries.
- Add blocked-version and minimum-version control.
- Keep update metadata on a trusted server.

**Our Decision / Action Plan:**

Since we are already switching to a domain (Comment 6), all update files will be served over HTTPS through a reverse proxy that handles the certificate automatically. Code signing for the installer will be added before the first public release.

## ChatGPT Comment 8 — Updates should not install during active sale, payment, or unsynced order state

`autoInstallOnAppQuit` can be risky in a POS because the app may close while a cashier has an active cart, a payment is in progress, or offline orders are waiting to sync.

**Suggested action:** block update installation when any of these are true:

```text
active cart exists
payment is in progress
receipt print is in progress
unsynced orders exist
POS session is open without manager approval
```

Allow downloading the update, but delay installation until a safe state.

**Our Decision / Action Plan:**

Updates download silently in the background with no visible prompt to the cashier. The update only installs when the app closes cleanly with an empty cart and no payment in progress — otherwise it waits for the next clean quit.

```js
// Updated update-downloaded handler
autoUpdater.on('update-downloaded', () => {
  updateReadyToInstall = true;
  log.info('Update ready. Will install on next clean app quit.');
});

app.on('before-quit', () => {
  if (updateReadyToInstall && appState.cart.length === 0) {
    autoUpdater.quitAndInstall(false, true);
  }
});
```

## ChatGPT Comment 9 — Add staged rollout and rollback controls

A bad POS update can stop checkout across a store. The updater should support:

```text
minimum_allowed_version
blocked_versions
rollout_percentage
store_group
force_update_after
```

This lets you stop a bad release and gradually roll out a new version.

**Our Decision / Action Plan:**

A `blocked.json` file on the update server will list any version numbers that should not run. If a machine's installed version appears in that list, it automatically rolls back to the previous good version on its next update check — no manual visit to the store required.

```json
{
  "blocked_versions": [],
  "minimum_version": "1.0.0"
}
```

On app startup, the updater downloads `blocked.json` first. If the app's own version is listed in `blocked_versions`, it installs the version pointed to by `previous.yml` instead (a downgrade). To roll back a bad release: add the bad version to `blocked_versions` in `blocked.json` on the server, and point `latest.yml` back to the last known-good version. The app picks up the rollback on its next update check automatically without any manual intervention on client machines.

## ChatGPT Comment 10 — Scanner and scale WebSocket ports appear to conflict

The document says the barcode scanner connects to `ws://127.0.0.1:8765`, and the scale also connects to `ws://127.0.0.1:8765`. Two different local servers cannot normally bind to the same port at the same time.

**Suggested action:** either use separate ports:

```text
scanner_ws_port = 8765
scale_ws_port   = 8766
```

Or better, use one hardware-agent WebSocket with typed messages:

```json
{ "type": "barcode_scanned", "data": "12345678" }
{ "type": "scale_weight", "weight": 0.18, "unit": "kg", "stable": true }
```

**Our Decision / Action Plan:**

No action needed — the scale and scanner already use separate ports in the code. The earlier documentation was incorrect and will be updated to reflect the actual setup.

## ChatGPT Comment 11 — Local WebSocket services need authentication

Binding to `127.0.0.1` is good, but it is not enough. A malicious local process, or in some cases a browser page, may try to connect to localhost WebSocket services.

**Suggested action:** require a local token for scanner/scale/hardware WebSocket connections.

Minimum safeguards:

```text
- bind only to 127.0.0.1, never 0.0.0.0
- require Authorization token
- validate WebSocket Origin
- rate-limit commands
- validate JSON message schema
- do not expose sensitive data on health endpoints
```

**Our Decision / Action Plan:**

On startup the app generates a one-time secret and sends it as the first message to each hardware service. Any connection that does not present the correct secret is immediately closed. Both services already bind correctly to localhost only, which has been confirmed in the code.

## ChatGPT Comment 12 — Barcode duplicate throttling must not suppress valid repeated scans

The document says duplicate barcode reads are throttled. This is useful for scanner bounce, but customers often buy multiple units of the same product.

**Risk:** cashier scans the same barcode three times, but throttle records only one item.

**Suggested action:** only suppress duplicates inside a tiny hardware-noise window, such as 80–150 ms. The same barcode after a normal human scan interval should be treated as a valid second scan.

**Our Decision / Action Plan:**

Duplicate reads arriving within 120ms of each other are treated as hardware noise and ignored. Anything after that window is a valid new scan, so scanning the same product multiple times in a row works correctly.

```js
// Debounce logic to add in listenScannerServer
const DEBOUNCE_MS = 120;
let lastBarcode = null;
let lastBarcodeAt = 0;

// Inside ws.on('message'):
const now = Date.now();
if (text === lastBarcode && (now - lastBarcodeAt) < DEBOUNCE_MS) return; // hardware echo
lastBarcode = text;
lastBarcodeAt = now;
```

## ChatGPT Comment 13 — Scale integration needs stable-weight, tare, and audit handling

The scale protocol mentions stable format support, but the business rules should be more explicit.

**Suggested action:** for each weighed order line, store:

```json
{
  "product_id": 123,
  "weight": 0.18,
  "unit": "kg",
  "stable": true,
  "scale_id": "SCALE-01",
  "raw_payload": "...",
  "timestamp": "..."
}
```

Also add:

- stable-weight requirement
- min/max weight validation
- unit validation
- tare support
- zero-scale operation
- manager-only manual override
- scale executable checksum/version validation

**Our Decision / Action Plan:**

Every weight reading will be logged with a full snapshot: stability state, device ID, raw value, and timestamp. Min/max and unit validation will be added. Tare and zero-scale controls will come once the firmware supports them, and any manual weight override will require a manager PIN.

```json
// Updated weight response payload
{
  "ok": true,
  "value": 0.18,
  "unit": "kg",
  "stable": true,
  "raw": "000.18",
  "scale_id": "SCALE-01",
  "capturedAt": "2026-05-01T10:00:00.000Z"
}
```

## ChatGPT Comment 14 — Receipt printing through `Out-Printer` may be limited

PowerShell `Out-Printer` can work for basic text printing, but POS thermal printers often need ESC/POS commands for cutter, cash drawer, QR codes, barcodes, bold text, and code pages.

**Suggested action:** create a dedicated receipt printer service/module that supports:

- ESC/POS raw commands
- paper width handling: 58mm/80mm
- cash drawer kick
- cutter command
- QR/barcode printing
- printer status detection
- receipt reprint audit
- duplicate-print protection

**Our Decision / Action Plan:**

Detected thermal printers will use an ESC/POS print path supporting paper cut, cash drawer kick, bold totals, QR code, and 58mm/80mm paper widths. Non-thermal printers continue using the existing Windows print method. Reprints are available from order history and are logged with a timestamp and cashier name.

## ChatGPT Comment 15 — Label printer service should not be silently skipped in production

The document says the label printer service is skipped if the binary is missing. Silent skipping is acceptable during development, but not in production if the feature is expected.

**Suggested action:** if the label printer service is missing, show capability status in the POS settings page:

```text
Label printing: Not installed / Disabled / Service missing
```

This avoids hidden production failures.

**Our Decision / Action Plan:**

The Settings screen will show a live status for each hardware service — running, stopped, or not installed. The installer still completes normally when a service is missing; the operator just sees it clearly flagged in Settings rather than wondering why a feature is not working.

## ChatGPT Comment 16 — Dual-screen recovery cases should be added

The dual-screen architecture is sound, but the document should define edge behavior.

Add expected behavior for:

- customer display crash
- second monitor disconnected during sale
- second monitor reconnected
- monitor resolution/DPI change
- customer display accidentally becoming primary display
- fullscreen escape
- sensitive cashier-only fields not shown on customer display

Also consider maintaining a separate customer-display state instead of mirroring all cart metadata.

**Our Decision / Action Plan:**

The core dual-screen logic is already working. We will add: auto-reopen if the customer window crashes, block Escape from exiting fullscreen on the customer display, and auto-close the customer window if only one screen remains. Cashier-only data (PINs, discount codes) is already kept out of the customer display by design.

## ChatGPT Comment 17 — Offline authentication needs DPAPI scope decision

The document says Windows DPAPI protects the encryption key. You should decide whether the key is scoped to the current Windows user or the local machine.

**Risk:** if Electron runs as the logged-in user but background services run as `LocalSystem`, they may not be able to decrypt the same data.

**Suggested action:** document the DPAPI scope and which process owns encryption/decryption.

**Our Decision / Action Plan:**

> **Note:** Offline authentication is not yet implemented. This defines the design decision for when it is built.

The offline database encryption key will be tied to the machine, not to any individual Windows user account, so both the app and background services can access it without conflict. The key will be stored in a protected system folder and will never appear in any log or readable file.

## ChatGPT Comment 18 — Offline lockout and clock rollback protection must be persistent

Offline failed-login counters should be stored persistently, not only in memory. Otherwise, restarting the app may reset the lockout.

Suggested fields:

```text
failed_count
locked_until
last_failed_at
last_seen_server_time
last_successful_online_auth
max_offline_until
```

For clock rollback detection, do not trust only the Windows wall clock.

**Our Decision / Action Plan:**

> **Note:** Offline authentication is not yet implemented. This defines the implementation plan.

Failed login counters will be stored in the database so restarting the app cannot reset them. The last confirmed server time will also be stored, allowing the app to detect and reject clock rollback attempts during offline login.

```sql
CREATE TABLE auth_lockout (
  username          TEXT NOT NULL PRIMARY KEY,
  device_id         TEXT NOT NULL,
  failed_count      INTEGER NOT NULL DEFAULT 0,
  locked_until      TEXT,
  last_failed_at    TEXT,
  last_server_time  TEXT
);
```

## ChatGPT Comment 19 — Offline queued actions need durable order/payment design

The document says offline actions are written to a local queue, but it does not define durable order states, payment states, retry rules, or idempotency.

**This is a critical POS production point.**

Suggested table concept:

```sql
CREATE TABLE offline_order_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    local_order_uuid TEXT NOT NULL UNIQUE,
    store_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    cashier_id TEXT NOT NULL,
    order_number TEXT NOT NULL UNIQUE,
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    payment_status TEXT NOT NULL,
    sync_status TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    synced_at TEXT
);
```

Every sync request should include an idempotency key:

```text
store_id + terminal_id + session_id + local_order_uuid
```

This prevents duplicate Odoo/POS orders when a network retry happens.

**Our Decision / Action Plan:**

> **Note:** Offline queue is not yet implemented. This defines the implementation plan.

Offline orders are saved to a local queue and synced one at a time when the connection returns. Each order carries a unique identifier (store + terminal + order ID) so the server will never create a duplicate if the same order is submitted more than once.

```sql
CREATE TABLE offline_order_queue (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  local_order_uuid  TEXT NOT NULL UNIQUE,
  store_id          TEXT NOT NULL,
  terminal_id       TEXT NOT NULL,
  cashier_id        TEXT NOT NULL,
  order_number      TEXT NOT NULL UNIQUE,
  payload_json      TEXT NOT NULL,
  payload_hash      TEXT NOT NULL,
  payment_method    TEXT NOT NULL,
  payment_status    TEXT NOT NULL,
  sync_status       TEXT NOT NULL DEFAULT 'pending',
  retry_count       INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  created_at        TEXT NOT NULL,
  synced_at         TEXT
);
```

## ChatGPT Comment 20 — Payment flow is missing and should be documented early

Even if the first version is cash-only, payment state should be modeled now.

Suggested payment attempt model:

```text
payment_attempt_uuid
local_order_uuid
method: cash | card | wallet | credit
amount
status: started | approved | failed | cancelled | reversed
provider_reference
terminal_reference
created_at
```

Important cases:

- payment approved but app crashes before sync
- receipt print fails after payment
- duplicate click on Pay
- refund against original order
- cash over/short at closing

**Our Decision / Action Plan:**

> **Note:** Payment model is not yet implemented beyond the basic checkout UI. This defines the implementation plan.

Every payment is recorded from the moment Pay is pressed. The Pay button locks on first tap to prevent double submission. Cash tendered and change given are stored with every transaction, and any payment with no confirmed order is recovered automatically on the next app startup.

```sql
CREATE TABLE payment_attempts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_uuid      TEXT NOT NULL UNIQUE,
  local_order_uuid  TEXT NOT NULL,
  method            TEXT NOT NULL,
  amount_requested  REAL NOT NULL,
  amount_tendered   REAL,
  change_due        REAL,
  status            TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  completed_at      TEXT
);
```

## ChatGPT Comment 21 — Cash session, Z-report, and audit trail are missing

A production POS needs clear shift/session controls.

Suggested flows:

```text
Open session:
- cashier login
- opening cash amount
- terminal ID
- store ID

During session:
- sales
- refunds
- cash in/out
- drawer open events
- discounts
- manager overrides

Close session:
- counted cash
- expected cash
- difference
- card/wallet totals
- unsynced order warning
- Z report
```

Audit events should include login, refunds, voids, overrides, reprints, discounts, order sync failures, and configuration changes.

**Our Decision / Action Plan:**

> **Note:** Session management is not yet implemented. This defines the implementation plan.

Each shift starts with an opening cash count and ends with a counted vs. expected cash comparison. Every significant action during the shift — sales, refunds, drawer opens, manager overrides, reprints — is logged automatically with a timestamp. A Z-report is printed automatically when the session closes.

```sql
CREATE TABLE pos_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_uuid    TEXT NOT NULL UNIQUE,
  store_id        TEXT NOT NULL,
  terminal_id     TEXT NOT NULL,
  cashier_id      TEXT NOT NULL,
  opened_at       TEXT NOT NULL,
  closed_at       TEXT,
  opening_cash    REAL NOT NULL DEFAULT 0,
  counted_cash    REAL,
  expected_cash   REAL,
  cash_difference REAL, 
  status          TEXT NOT NULL DEFAULT 'open'
);
```

## ChatGPT Comment 22 — Odoo 15 mapping must be explicitly documented

Because this POS is connected to Odoo 15, the Go backend should define exactly how Electron orders map into Odoo objects.

Key mapping areas:

```text
POS order        -> pos.order
Order lines      -> pos.order.line
POS session      -> pos.session
POS config       -> pos.config
Products         -> product.product / product.template
Taxes            -> account.tax
Customers        -> res.partner
Payment methods  -> pos.payment.method
```

Questions to answer before production:

- Who creates and closes the Odoo POS session?
- Can multiple Electron terminals share one Odoo POS session?
- How are order names generated?
- How are refunds represented?
- How are taxes and rounding matched with Odoo?
- What happens if Odoo accepts payment but order sync fails?
- What is the source of truth for payment status?

**Our Decision / Action Plan:**

No Odoo API calls exist yet — products are currently hardcoded. A backend service will handle all Odoo integration when it is built. The full mapping between POS objects and Odoo objects will be agreed and documented before development begins, and the backend will be the single source of truth for payment status.

## ChatGPT Comment 23 — Add structured logs and support bundle

The document mentions logs under `C:\ProgramData\POS System\logs\`. Add structured logging and a support bundle.

Each log line should include:

```json
{
  "ts": "2026-04-28T10:15:30+05:30",
  "level": "info",
  "service": "pos-electron-main",
  "version": "1.0.13",
  "store_id": "STORE-01",
  "terminal_id": "POS-02",
  "session_id": "SESSION-123",
  "correlation_id": "abc-123",
  "event": "order_sync_failed"
}
```

Support bundle should collect:

- app version
- service versions
- redacted config
- recent logs
- unsynced order count
- SQLite integrity status
- printer list
- COM port list
- display list
- backend/Odoo reachability
- update status

**Our Decision / Action Plan:**

All log entries will use a consistent structured format including version, store, terminal, and event description. A button in the Settings screen will let support staff collect all relevant diagnostic information — logs, service statuses, hardware list, update reachability, unsynced order count — into a single shareable file.

```js
// Structured log format to add in main.js
log.transports.file.format = ({ data, level, date }) => {
  return JSON.stringify({
    ts: date.toISOString(),
    level,
    service: 'pos-electron-main',
    version: app.getVersion(),
    store_id: config.store_id || 'unknown',
    terminal_id: config.terminal_id || 'unknown',
    event: typeof data[0] === 'string' ? data[0] : 'log',
    data: data.slice(1),
  });
};
```

## ChatGPT Comment 24 — Local configuration management should be added

Hard-coded ports, IPs, terminal IDs, store IDs, printer names, and service paths will create support problems.

Suggested protected config:

```json
{
  "store_id": "STORE-01",
  "terminal_id": "POS-02",
  "api_base_url": "https://pos-server.local/api",
  "update_base_url": "https://pos-server.local/updates",
  "hardware": {
    "scanner": { "mode": "keyboard_wedge" },
    "scale": { "enabled": true, "port": 8766 },
    "receipt_printer": { "name": "EPSON TM-T82" }
  }
}
```

Protect this file using Windows ACLs.

**Our Decision / Action Plan:**

All per-machine settings live in a single protected config file created by the installer with safe defaults. Only administrators can modify it. Environment variable overrides are for developer use only and are never active on store machines.

```json
{
  "store_id": "STORE-01",
  "terminal_id": "POS-01",
  "update_base_url": "https://updates.yourcompany.com",
  "api_base_url": "https://api.yourcompany.com",
  "hardware": {
    "scale_ws_port": 8765,
    "scanner_ws_port": 8766,
    "receipt_printer": "",
    "scale_exe_path": ""
  },
  "offline": {
    "max_offline_hours": 12,
    "max_failed_logins": 5,
    "lockout_minutes": 15
  }
}
```

```powershell
# ACL command added to install-services.ps1
icacls "C:\ProgramData\POS System\config" /inheritance:r /grant:r "BUILTIN\Administrators:(OI)(CI)F" /grant:r "NT AUTHORITY\SYSTEM:(OI)(CI)F"
```

