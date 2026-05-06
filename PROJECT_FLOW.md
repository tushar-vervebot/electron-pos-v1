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

### The asar archive

All the application's JavaScript source files go into an asar archive. When the app is running, Electron reads directly from this archive without extracting it. A casual user or attacker cannot simply browse to the install folder and open your JavaScript files in a text editor because everything is inside that archive.


### Renderer security

Even inside a running app, the renderer (the visible UI pages) is locked down further:
- **contextIsolation** — the UI page has no access to Node.js APIs at all. It lives in its own sandbox.
- **sandbox** — the renderer runs in a true OS-level sandboxed process, the same kind of sandbox Chromium uses for web pages.
- **nodeIntegration disabled** — `require()` is not available inside any UI page.
- **webSecurity enabled** — standard browser same-origin rules are enforced.
- A **Content Security Policy** header is applied to every page load. This prevents any inline script injection and blocks the page from making network calls directly (all network communication goes through the main process).

- **OnlyLoadAppFromAsar enabled** — the app will refuse to load code from anywhere except its own asar archive. This means someone cannot swap out or inject files next to the app folder.

### What this means in practice

If someone extracts the asar and looks at the JavaScript, they can read the code, but they cannot run it outside the app context, cannot inject extra code at runtime, and cannot attach a debugger to inspect live state. The combination of fuses plus sandboxed renderers is the current industry best practice for Electron security.

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











# Real-Time Sync & Rendering — How It Works

---

## The Big Picture

When a staff member changes a product price in Odoo, that change needs to appear on the cashier's screen within seconds — **without the screen freezing, flickering, or wasting time redrawing cards that didn't change**.

This is the system that makes that happen.

---

## Two Processes, One Bridge (Electron Architecture)

The app has two completely separate JavaScript environments that cannot share variables. They can only communicate through a bridge called **IPC**.

```
Odoo Server  ──(WebSocket)──►  Main Process (Node.js)
                                  remoteWsClient.js
                                  SQLite database
                                       │
                                      IPC  (the bridge)
                                       │
                               Renderer Process (React)
                                  posStore.js
                                  Product grid on screen
```

**Main Process** (`remoteWsClient.js`, `index.js`):
- Connects to Odoo via WebSocket
- Receives product change notifications
- Writes changes to SQLite
- Sends ONE IPC event to the renderer after all writes are done

**Renderer Process** (`posStore.js`, `ProductCard.jsx`):
- Never touches the database or network directly
- Receives IPC events from the main process
- Updates React state
- React re-renders only the affected card(s)

---

## Stage 1 — WebSocket Connection to Odoo

`remoteWsClient.js` opens a persistent WebSocket connection to the Odoo server and subscribes to three product channels:

- `product.created` — a new product was added
- `product.updated` — a price, name, or detail changed
- `product.deleted` — a product was deactivated or removed

### The 3-Ack Protocol

Odoo uses a reliable delivery system: it keeps re-sending a notification until it receives an acknowledgement (ack) back. If you don't ack, Odoo never stops sending.

The critical rule: **acks must be sent immediately, before any database write.**

Why? Imagine 60,000 products are being imported. If the app waited for the DB write before acking, Odoo's "pending ack" counter would sit at 60,000 for several seconds. That causes chaos on the server.

Instead:
```
Odoo sends notification
  → App immediately sends 3 acks: "received", "open", "action_done"
  → Odoo is happy, counter goes to zero
  → THEN the app writes to the database
```

Three acks per notification is just what Odoo's protocol requires — it's not something we control.

---

## Stage 2 — The Notification Queue (Dedup)

When a notification arrives, it does NOT go straight to the database. It goes into a **queue** first.

The queue is a JavaScript `Map` (an ordered key-value store), keyed by `"channel:productId"`:

```
Key                        Value
"product.updated:1042"  →  { latest product data }
"product.updated:2005"  →  { latest product data }
"product.deleted:999"   →  { id: 999 }
```

**The critical behaviour: if the same product arrives twice, the old entry is deleted and the new one replaces it.** So even if Odoo sends `product.updated` for product 1042 one hundred times, there will only ever be ONE entry for it in the queue — the latest version.

This is called **deduplication**. It prevents wasted DB writes.

As soon as the first item enters the queue, `_drain()` starts running automatically.

---

## Stage 3 — The Drain Loop (Writing to SQLite)

`_drain()` empties the queue and writes everything to SQLite. It runs in batches to keep the app responsive.

**What "batch of 300" means:**

```
Take 300 items from the queue
  → Write all 300 inside ONE SQLite transaction
  → await setImmediate   ← pause here, let the event loop breathe
Take next 300 items
  → Write all 300 in ONE transaction
  → await setImmediate
... repeat until queue is empty
```

**Why batches of 300?**
- Each batch of 300 takes about 5ms — fast enough to not block the UI
- `setImmediate` between batches lets the window repaint, IPC events process, etc.
- Without this yield, writing 60,000 items would freeze the app for minutes

**Why ONE transaction per batch (not 300 individual writes)?**
- SQLite must flush to disk after every transaction (a slow operation: 1–10ms)
- 300 individual writes = 300 flushes = potentially 3000ms
- 300 writes in 1 transaction = 1 flush = ~5ms
- That's ~40× faster

**What gets accumulated:**
As each item is written, `_drain()` keeps a running list called `changedProducts[]`. Each entry records what changed:
```
changedProducts = [
  { action: 'updated', id: 1042, product: { full product object } },
  { action: 'created', id: 2001, product: { full product object } },
  { action: 'deleted', id: 999 },
  ...
]
```

This list is used after the queue is fully empty to decide what to tell React.

---

## Stage 4 — One IPC Event to React (Three Paths)

After the queue is fully drained and all writes are done, **one single IPC event** is sent to the renderer. Its content depends on how many products changed.

### Why not send an event per product?

If 60,000 products changed and we sent 60,000 IPC events, the renderer's event loop would be flooded with 60,000 calls, each one asking React to re-render. The UI would freeze completely.

Instead: write everything first, then send **a single summary event** at the end.

---

### Path 1 — Small Change (≤ 5,000 products changed)

Send the **full product objects** in the IPC payload:

```
{ status: 'remote_update', changes: [
    { action: 'updated', id: 1042, product: { name, price, ... } },
    { action: 'updated', id: 2005, product: { name, price, ... } },
    ...
  ]
}
```

**Why this is safe:** 5,000 products × ~400 bytes each = ~2MB. This is well within Electron's IPC limit and transfers in milliseconds.

**Renderer does:** Look through the 50 currently visible products and swap only the ones that appear in this list. Zero SQLite reads needed — the new data is already in the payload.

---

### Path 2 — Large Change (> 5,000 products changed)

Sending full objects for 60,000 products would be ~24MB over IPC — too large and too slow. Instead, send **only the IDs**:

```
{ status: 'remote_update', changes: null, changedIds: [1, 2, 3, ..., 60000] }
```

60,000 IDs × 4 bytes = ~240KB — always safe regardless of product count.

**Renderer does:**
1. Build a `Set` from the 60,000 IDs (O(1) lookup)
2. Check which of the 50 visible products are in that set
3. If **0 match** → nothing on screen changed → do absolutely zero work
4. If **N match** → fetch only those N rows from SQLite → swap only those N cards

In a typical scenario (e.g., stock replenishment of one category), 0–5 of the 50 visible cards will be affected even if 60,000 total products changed.

---

### Path 3 — Fallback

If for some reason no change data was produced, the renderer calls `fetchProducts({ silent: true })` — a quiet page re-read from SQLite. Debounced by 300ms to absorb back-to-back events.

---

## Stage 5 — React Renders Only What Changed

### Copy-on-Write Array Update

When Path 1 runs, the renderer updates the products array like this:

```
Loop through changedProducts:
  Find index of changed product in visible 50

  First match found?
    → Copy the array once: newProducts = [...products]
    → Replace only that index: newProducts[idx] = change.product

  Second match found (if any)?
    → Array already copied — just replace that index

  Not in visible 50?
    → Skip. Do nothing.

End of loop: if anything changed → set({ products: newProducts })
             if nothing changed  → set() never called → React does zero work
```

The array is copied **at most once** regardless of how many changes there are. This preserves the object references for all unchanged products.

### Why Preserving Object References Matters — `React.memo`

`ProductCard` is wrapped in `React.memo`:

```jsx
const ProductCard = React.memo(function ProductCard({ product, onAdd }) {
  ...
})
```

`React.memo` tells React: **"Only re-render this card if its `product` prop is a different object reference than before."**

Because the copy-on-write approach only replaces the specific array index that changed, every other card in the grid still holds the exact same object reference it had before. `React.memo` sees "same reference → skip render" for all of them.

**Result:** If 1 product out of 50 changes → 1 card re-renders. The other 49 are completely untouched.

---

## Full End-to-End: Single Product Update

```
Staff changes a price in Odoo and saves
        │
        ▼
Odoo fires "product.updated" over WebSocket
        │
        ▼
remoteWsClient.js receives the message
  ├── Immediately sends 3 acks → Odoo's counter = 0 ✓
  └── enqueue("product.updated", { id:1042, price:2.75, ... })
        │
        ▼
_queueMap = { "product.updated:1042" → {...} }  (1 item)
_drain() starts
  └── 1 SQLite UPSERT in 1 transaction (~5ms)
      changedProducts = [{ action:'updated', id:1042, product:{...} }]
        │
        ▼
changedProducts.length = 1  →  Path 1 (≤ 5000)
IPC → renderer: { status:'remote_update', changes:[{ action:'updated', id:1042, product:{...} }] }
        │
        ▼
posStore remote_update handler:
  findIndex(p => p.id === 1042) in the 50 visible products
        │
        ├── Found at index 7
        │     → copy array once, replace index 7 with new product object
        │     → set({ products: newProducts })
        │     → React sees new array reference → re-renders ProductScreen
        │     → React.memo: 49 cards same reference → skipped
        │     → 1 card (index 7) new reference → re-renders ✓
        │
        └── Not found (product not on current page)
              → set() never called
              → React does zero work ✓
```

---

## Full End-to-End: Bulk Import (60,000 Products)

```
Staff imports 60,000 products in Odoo
        │
        ▼
Odoo fires 60,000 WS notifications in rapid succession
        │
        ▼
remoteWsClient.js: 60,000 calls to enqueue()
  → _queueMap grows (duplicates merging into one entry per product)
  → _draining = true, queue processes continuously
        │
        ▼
_drain() runs:
  Batch 1:  300 writes in 1 transaction → setImmediate (yield)
  Batch 2:  300 writes → setImmediate
  ...
  Batch 200: 300 writes → queue empty
  Total time: ~2 seconds, app stayed fully responsive throughout
        │
        ▼
changedProducts.length = 60,000  →  60,000 > 5,000  →  Path 2
IPC → renderer: { status:'remote_update', changes:null, changedIds:[1,2,...,60000] }
(~240KB — fast and safe)
        │
        ▼
posStore remote_update handler:
  Build Set from 60,000 IDs
  Filter visible 50 products: which ones are in the Set?
        │
        ├── 0 match  →  none of the visible 50 were in the import
        │               zero work done ✓
        │
        └── N match  →  N of the visible 50 were changed
                        fetch those N rows from SQLite
                        swap only those N cards
                        React.memo skips the rest ✓
```

---

## Key Constants

| Constant | Value | Why |
|---|---|---|
| `DRAIN_BATCH_SIZE` | 300 | Each batch < 10ms; 60k items done in ~200 ticks (~2 seconds) |
| `SURGICAL_THRESHOLD` | 5000 | 5000 × 400B = ~2MB IPC payload — safe limit |
| `productPageSize` | 50 | Fills one screen at 1080p |
| `BROWSE_LIMIT` | 200 | 4 pages of 50 |
| `SEARCH_LIMIT` | 200 | FTS5 ranks by relevance; 200 is more than enough |
| Reconnect delay | 5000ms | Prevents flooding the server after a network drop |
| Fallback debounce | 300ms | Absorbs two back-to-back sync events |

---

*Last updated: April 2026*
