# Electron POS Project Structure and Modular Plugin Architecture Guide

## Document Purpose

This document defines the recommended architecture for our Electron-based POS system.

The main goal is to build a POS platform where new features can be added as installable modules/plugins without repeatedly editing the base POS files.

This guide explains:

- The final recommended project structure
- What each folder is responsible for
- What each important file does
- Why the folder/file exists
- How plugin modularity works
- How UI, business logic, payments, receipts, themes, services, and hardware should be extended
- What rules the team should follow
- What mistakes to avoid

---

# 1. Main Architecture Principle

The most important rule:

```txt
Core defines extension points.
Plugins register into extension points.
Plugins never directly modify core files.
```

This means the base POS should not be edited every time we add a new feature such as loyalty, gift card, split payment, CCTV overlay, customer display, or custom receipt.

Instead, the base POS should expose safe extension points:

```txt
slots
registries
hooks
events
services
themes
payment methods
receipt templates
routes
component overrides
```

Plugins attach to those extension points.

---

# 2. Why We Need This Architecture

Our POS is not a simple React app.

It needs to support:

```txt
product grid
cart system
payment flow
receipt printing
barcode scanner
printer integration
CCTV text overlay
customer display
loyalty points
gift cards
split payment
custom receipt
store-specific themes
offline database
sync
hardware services
```

If all these features are added directly into core files, the project becomes difficult to maintain.

Bad example:

```txt
PaymentScreen.jsx
├── cash logic
├── card logic
├── gift card logic
├── split payment logic
├── loyalty logic
├── promotion logic
├── printer logic
└── CCTV logic
```

Better example:

```txt
core/payment engine
plugins/gift-card
plugins/split-payment
plugins/loyalty
plugins/cctv-overlay
plugins/custom-receipt
```

This keeps the core clean and stable.

---

# 3. Final Recommended Top-Level Structure

Because this project uses Electron, the structure should separate:

```txt
main process
preload bridge
renderer process
shared code
```

Final structure:

```txt
src/
├── main/
├── preload/
├── renderer/
└── shared/
```

## Why This Is Better Than Only `src/renderer/`

A POS system needs hardware and native features. These should not run directly inside React.

Example:

```txt
printer          → main process
CCTV TCP socket  → main process
database file    → main process
barcode hardware → main process
React UI         → renderer process
safe API bridge  → preload
```

So the project should not be structured like a browser-only frontend.

---

# 4. Full Recommended Folder Structure

```txt
src/
├── main/
│   ├── app/
│   │   ├── main.js
│   │   ├── windowManager.js
│   │   ├── appLifecycle.js
│   │   └── menuManager.js
│   │
│   ├── ipc/
│   │   ├── ipcHandlers.js
│   │   ├── ipcChannels.js
│   │   ├── printerIpc.js
│   │   ├── cctvIpc.js
│   │   ├── databaseIpc.js
│   │   └── paymentIpc.js
│   │
│   ├── services/
│   │   ├── printer/
│   │   │   ├── printerService.js
│   │   │   └── receiptPrintFormatter.js
│   │   │
│   │   ├── cctv/
│   │   │   ├── cctvService.js
│   │   │   └── cctvTextFormatter.js
│   │   │
│   │   ├── database/
│   │   │   ├── databaseService.js
│   │   │   ├── migrations/
│   │   │   └── repositories/
│   │   │
│   │   ├── barcode/
│   │   │   └── barcodeService.js
│   │   │
│   │   ├── payment-terminal/
│   │   │   └── terminalService.js
│   │   │
│   │   └── logging/
│   │       └── logger.js
│   │
│   ├── plugins/
│   │   ├── mainPluginLoader.js
│   │   ├── mainServiceRegistry.js
│   │   └── mainPluginContext.js
│   │
│   └── utils/
│       ├── filePaths.js
│       ├── safeJson.js
│       └── env.js
│
├── preload/
│   └── preload.js
│
├── renderer/
│   ├── app/
│   │   ├── App.jsx
│   │   ├── AppRouter.jsx
│   │   ├── AppProviders.jsx
│   │   ├── Startup.jsx
│   │   └── ErrorBoundary.jsx
│   │
│   ├── core/
│   │   ├── components/
│   │   ├── features/
│   │   ├── layouts/
│   │   ├── registry/
│   │   ├── plugin-api/
│   │   ├── slots/
│   │   ├── stores/
│   │   ├── services/
│   │   ├── styles/
│   │   ├── utils/
│   │   ├── constants/
│   │   └── permissions/
│   │
│   ├── plugins/
│   │   ├── pluginLoader.js
│   │   ├── activePlugins.js
│   │   ├── loyalty-discount/
│   │   ├── gift-card/
│   │   ├── split-payment/
│   │   ├── custom-receipt/
│   │   ├── customer-display/
│   │   └── cctv-overlay/
│   │
│   └── main.jsx
│
└── shared/
    ├── constants/
    │   ├── ipcChannels.js
    │   ├── paymentTypes.js
    │   ├── orderStatus.js
    │   └── permissions.js
    │
    ├── schemas/
    │   ├── orderSchema.js
    │   ├── paymentSchema.js
    │   └── pluginSchema.js
    │
    ├── types/
    │   ├── order.types.js
    │   ├── payment.types.js
    │   └── plugin.types.js
    │
    └── utils/
        ├── currency.js
        ├── date.js
        └── tax.js
```

---

# 5. `src/main/` Explanation

`src/main/` contains Electron main-process code.

This is where native and hardware-level logic belongs.

## Responsibilities

```txt
create Electron windows
handle app lifecycle
register IPC handlers
access printers
access local database
open TCP sockets
connect CCTV/NVR
connect payment terminal
handle barcode hardware
load main-process plugins
```

## Why Use It

React renderer should not directly access Node.js, file system, database, socket, or printer code.

Correct flow:

```txt
Renderer UI → Preload API → IPC → Main Process Service
```

Wrong flow:

```txt
Renderer UI → direct printer/database/socket access
```

---

## 5.1 `src/main/app/`

```txt
src/main/app/
├── main.js
├── windowManager.js
├── appLifecycle.js
└── menuManager.js
```

### `main.js`

Electron main entry file.

Use it for:

```txt
starting the Electron app
loading main plugins
registering IPC handlers
creating main window
```

Example:

```js
app.whenReady().then(async () => {
  await loadMainPlugins();
  registerIpcHandlers();
  createMainWindow();
});
```

Reason:

`main.js` should be small. It should only coordinate startup.

---

### `windowManager.js`

Use it for:

```txt
creating BrowserWindow
creating customer display window
opening second monitor window
loading Vite dev URL
loading production build
setting preload path
```

Reason:

Window logic grows over time. Keep it separate from startup logic.

---

### `appLifecycle.js`

Use it for:

```txt
window-all-closed handling
activate handling
graceful shutdown
closing database connection
stopping sync services
cleaning temporary files
```

Reason:

A POS runs all day. Clean startup/shutdown matters.

---

### `menuManager.js`

Use it for:

```txt
native menu
developer menu
reload
settings
about
kiosk controls
debug options
```

Reason:

Menu logic should not be mixed with window creation.

---

## 5.2 `src/main/ipc/`

```txt
src/main/ipc/
├── ipcHandlers.js
├── ipcChannels.js
├── printerIpc.js
├── cctvIpc.js
├── databaseIpc.js
└── paymentIpc.js
```

### `ipcHandlers.js`

Central file that registers all IPC handlers.

Example:

```js
export function registerIpcHandlers() {
  registerPrinterIpc();
  registerCctvIpc();
  registerDatabaseIpc();
  registerPaymentIpc();
}
```

Reason:

One place controls IPC registration.

---

### `printerIpc.js`

Use it for:

```txt
print receipt
list printers
set default printer
print kitchen ticket
```

Example:

```js
ipcMain.handle("printer:print-receipt", async (_, payload) => {
  return printerService.printReceipt(payload);
});
```

Reason:

Printing should run in main process, not renderer.

---

### `cctvIpc.js`

Use it for:

```txt
send POS transaction text to NVR
test CCTV connection
save CCTV settings
```

Reason:

CCTV overlay usually uses TCP/UDP sockets. That belongs in main process.

---

### `databaseIpc.js`

Use it for:

```txt
save order
load products
store offline queue
load settings
save plugin config
```

Reason:

Renderer should not directly access local database files.

---

### `paymentIpc.js`

Use it for:

```txt
send charge request
void payment
refund
poll payment terminal status
batch close
```

Reason:

Payment terminal communication should be isolated and protected.

---

## 5.3 `src/main/services/`

```txt
src/main/services/
├── printer/
├── cctv/
├── database/
├── barcode/
├── payment-terminal/
└── logging/
```

Services are real system integrations.

### `printer/printerService.js`

Use for:

```txt
receipt printing
printer discovery
kitchen printing
print error handling
```

### `cctv/cctvService.js`

Use for:

```txt
NVR TCP connection
POS overlay text sending
connection retry
text formatting
```

### `database/databaseService.js`

Use for:

```txt
SQLite/local database
offline orders
sync queue
settings storage
plugin configuration
```

### `barcode/barcodeService.js`

Use for:

```txt
barcode input handling
scanner configuration
hardware-specific scanner behavior
```

### `payment-terminal/terminalService.js`

Use for:

```txt
terminal charge
refund
void
batch close
status polling
```

### `logging/logger.js`

Use for:

```txt
app errors
plugin errors
hardware errors
sync errors
debug logs
```

Reason:

A POS needs reliable logs for production support.

---

## 5.4 `src/main/plugins/`

```txt
src/main/plugins/
├── mainPluginLoader.js
├── mainServiceRegistry.js
└── mainPluginContext.js
```

Some plugins need main-process code.

Examples:

```txt
CCTV plugin
printer plugin
payment terminal plugin
scale/weight machine plugin
database sync plugin
```

### `mainPluginLoader.js`

Loads main-process plugins.

Reason:

Hardware-related plugins cannot be renderer-only.

---

### `mainServiceRegistry.js`

Stores main-process services.

Example:

```js
registerMainService("cctv", cctvService);
const cctv = getMainService("cctv");
```

Reason:

Keeps services modular and replaceable.

---

# 6. `src/preload/` Explanation

```txt
src/preload/
└── preload.js
```

## `preload.js`

This is the secure bridge between renderer and main process.

Example:

```js
contextBridge.exposeInMainWorld("electronAPI", {
  printer: {
    printReceipt: (payload) =>
      ipcRenderer.invoke("printer:print-receipt", payload),
  },
  cctv: {
    sendText: (payload) =>
      ipcRenderer.invoke("cctv:send-text", payload),
  },
});
```

## Why Use It

Use secure Electron settings:

```js
contextIsolation: true
nodeIntegration: false
```

Reason:

The renderer should only access safe APIs.

---

# 7. `src/renderer/` Explanation

`src/renderer/` contains React frontend code.

It has:

```txt
app startup
routes
layouts
components
features
stores
services
plugins
registries
styles
```

---

# 8. `src/renderer/app/`

```txt
src/renderer/app/
├── App.jsx
├── AppRouter.jsx
├── AppProviders.jsx
├── Startup.jsx
└── ErrorBoundary.jsx
```

## `App.jsx`

Main React application component.

Use for:

```txt
root layout
startup wrapper
router rendering
global UI shell
```

---

## `AppRouter.jsx`

Base routes plus plugin routes.

Example:

```jsx
const pluginRoutes = getRegisteredRoutes();

return (
  <Routes>
    <Route path="/" element={<POSScreen />} />
    <Route path="/orders" element={<OrdersScreen />} />
    <Route path="/settings" element={<SettingsScreen />} />

    {pluginRoutes.map(({ path, component: Screen }) => (
      <Route key={path} path={path} element={<Screen />} />
    ))}
  </Routes>
);
```

Reason:

Plugins should be able to add full screens without editing router.

---

## `AppProviders.jsx`

Use for:

```txt
theme provider
store provider
router provider
plugin context provider
error provider
```

Reason:

Provider setup should be centralized.

---

## `Startup.jsx`

Use for:

```txt
load plugins
load settings
initialize theme
initialize stores
check cashier login
start sync
```

Reason:

Startup logic should not be inside `App.jsx`.

---

## `ErrorBoundary.jsx`

Use for:

```txt
catch React errors
prevent broken plugin UI from crashing whole POS
show safe fallback screen
```

Reason:

Plugin errors should be isolated.

---

# 9. `src/renderer/core/`

```txt
src/renderer/core/
├── components/
├── features/
├── layouts/
├── registry/
├── plugin-api/
├── slots/
├── stores/
├── services/
├── styles/
├── utils/
├── constants/
└── permissions/
```

This is the stable renderer-side POS engine.

Plugins can use it through controlled APIs, but should not directly modify it.

---

# 10. `core/components/`

```txt
core/components/
├── Button/
├── Modal/
├── Input/
├── ProductCard/
├── CartPanel/
├── ReceiptView/
├── PaymentButton/
├── DataTable/
├── Loader/
└── EmptyState/
```

## Purpose

Reusable global UI components.

Example component folder:

```txt
Button/
├── Button.jsx
├── Button.module.css
└── index.js
```

## Why Use It

This gives:

```txt
consistent UI
shared accessibility behavior
shared loading behavior
shared keyboard behavior
less duplicate code
better styling control
```

## Required Component Pattern

Every reusable component should support:

```txt
className
replaceStyles
variant
disabled
loading
data attributes
```

Example:

```jsx
export function Button({
  children,
  className = "",
  replaceStyles = false,
  variant = "primary",
  ...props
}) {
  const finalClassName = replaceStyles
    ? className
    : `${styles.button} ${styles[variant]} ${className}`;

  return (
    <button className={finalClassName} {...props}>
      {children}
    </button>
  );
}
```

Reason:

Plugins can extend or replace styling without touching the base component file.

---

# 11. `core/features/`

```txt
core/features/
├── cart/
├── products/
├── orders/
├── payments/
├── receipts/
├── customers/
├── reports/
└── settings/
```

## Purpose

Feature-specific UI and business logic.

Example:

```txt
cart/
├── components/
│   ├── CartPanel.jsx
│   ├── CartItem.jsx
│   └── CartSummary.jsx
├── hooks/
│   └── useCartActions.js
├── services/
│   └── cartService.js
└── cart.constants.js
```

## Why Use It

A feature folder keeps related files together.

Cart code stays inside cart.

Payment code stays inside payments.

Receipt code stays inside receipts.

---

# 12. `core/layouts/`

```txt
core/layouts/
├── POSLayout/
├── DashboardLayout/
├── AuthLayout/
└── CustomerDisplayLayout/
```

## Purpose

Large page/screen structures.

Example POS layout:

```txt
top cashier header
left product grid
right cart panel
bottom payment actions
```

## Why Use It

Layouts define screen structure. They should not contain heavy business logic.

They should include slots where plugins can inject UI.

---

# 13. `core/registry/`

```txt
core/registry/
├── componentRegistry.js
├── slotRegistry.js
├── wrapperRegistry.js
├── routeRegistry.js
├── hookRegistry.js
├── eventBus.js
├── paymentRegistry.js
├── receiptRegistry.js
├── serviceRegistry.js
├── themeRegistry.js
└── pluginRegistry.js
```

This is the heart of the plugin architecture.

Registries are neutral ground:

```txt
plugins register into registries
core reads from registries
plugins and core do not directly depend on each other
```

---

## 13.1 `componentRegistry.js`

Purpose:

```txt
replace an existing UI section
```

Example:

```js
registerComponent("cart.DiscountRow", LoyaltyDiscountRow);
```

Core:

```js
const DiscountRow = getComponent("cart.DiscountRow", DefaultDiscountRow);
```

Use for:

```txt
discount row replacement
payment selector replacement
receipt footer replacement
customer info replacement
session banner replacement
```

Reason:

Plugin can replace one part of UI without editing parent component.

---

## 13.2 `slotRegistry.js`

Purpose:

```txt
inject new UI into predefined places
```

Example:

```js
registerSlot("cart.above-total", LoyaltySummary);
```

Core:

```jsx
<Slot name="cart.above-total" />
```

Use for:

```txt
loyalty points box
gift card balance
coupon box
promotion banner
receipt footer note
extra payment button
```

Recommended advanced registration:

```js
registerSlot("cart.above-total", LoyaltySummary, {
  id: "loyalty.summary",
  pluginId: "loyalty",
  order: 50,
});
```

Reason:

Multiple plugins can use same slot. `order` controls display sequence.

---

## 13.3 `wrapperRegistry.js`

Purpose:

```txt
wrap or decorate existing component
```

Example:

```js
wrapComponent("ProductCard", LoyaltyBadgeWrapper);
```

Use for:

```txt
loyalty badge
promotion ribbon
low-stock border
cart item warning
order row highlight
```

Reason:

Plugin can add visual decoration without replacing the component.

Important:

Wrapper registry should support multiple wrappers per component.

---

## 13.4 `routeRegistry.js`

Purpose:

```txt
add plugin screens/routes
```

Example:

```js
registerRoute({
  path: "/loyalty",
  label: "Loyalty",
  component: LoyaltyScreen,
  icon: LoyaltyIcon,
  order: 50,
  permission: "loyalty:view",
});
```

Use for:

```txt
loyalty dashboard
gift card screen
CCTV settings screen
customer display setup
custom receipt settings
reports
```

Reason:

Plugins can add full screens without editing `AppRouter.jsx` or sidebar.

---

## 13.5 `hookRegistry.js`

Purpose:

```txt
extend or modify business lifecycle
```

Example:

```js
registerHook("beforePayment", async (order) => {
  return applyLoyaltyDiscount(order);
});
```

Core:

```js
order = await runHooks("beforePayment", order);
await processPayment(order);
await runHooks("afterPayment", order);
```

Use for:

```txt
beforeAddToCart
afterAddToCart
beforeCartTotal
afterCartTotal
beforePayment
afterPayment
beforeOrderSave
afterOrderSave
beforeReceiptPrint
afterReceiptPrint
```

Reason:

Business logic should be extendable without editing core payment/order/cart files.

---

## 13.6 `eventBus.js`

Purpose:

```txt
allow plugins to react to things that happened
```

Example:

```js
emit("order:paid", order);
```

Plugin:

```js
on("order:paid", (order) => {
  sendOrderToCCTV(order);
});
```

Difference:

```txt
hook  = plugin can modify/control flow
event = plugin only reacts after something happened
```

Use events for:

```txt
CCTV overlay
customer display
analytics
audit logs
sync
notifications
```

Reason:

Events reduce coupling between features.

---

## 13.7 `paymentRegistry.js`

Purpose:

```txt
register payment methods
```

Example:

```js
registerPaymentMethod({
  id: "gift-card",
  label: "Gift Card",
  component: GiftCardPaymentButton,
  process: processGiftCardPayment,
  refund: refundGiftCardPayment,
});
```

Use for:

```txt
cash
card
gift card
store credit
EBT
split payment
wallet
manual terminal
```

Reason:

Payment methods should not be hardcoded into payment screen.

---

## 13.8 `receiptRegistry.js`

Purpose:

```txt
register or override receipt templates
```

Example:

```js
registerReceiptTemplate("restaurant", RestaurantReceipt);
overrideReceiptTemplate("default", CustomReceipt);
```

Use for:

```txt
grocery receipt
restaurant receipt
kitchen receipt
gift card receipt
return receipt
tax invoice
custom customer receipt
```

Reason:

Receipt customization is common in POS. It should be modular.

---

## 13.9 `serviceRegistry.js`

Purpose:

```txt
register renderer-side services
```

Example:

```js
registerService("loyalty", loyaltyService);
const loyalty = getService("loyalty");
```

Use for:

```txt
loyalty service
gift card service
sync client
customer display client
API client
```

Reason:

Avoid random imports and keep services replaceable.

---

## 13.10 `themeRegistry.js`

Purpose:

```txt
register plugin theme variables
```

Example:

```js
registerTheme("loyalty", {
  "--loyalty-color": "#d4a017",
  "--loyalty-bg": "#fff8dc",
});
```

Reason:

Plugins may need scoped colors and branding without touching global CSS.

---

## 13.11 `pluginRegistry.js`

Purpose:

```txt
track plugin metadata and status
```

Use for:

```txt
plugin id
name
version
enabled/disabled status
load order
dependencies
permissions
error state
```

Reason:

Admin/settings screen can show plugin status clearly.

---

# 14. `core/plugin-api/`

```txt
core/plugin-api/
├── createPluginAPI.js
├── pluginPermissions.js
└── pluginContext.js
```

## Purpose

Plugins should not directly import internal core files.

Instead, every plugin receives a controlled API.

Example:

```js
export default function register(pluginAPI) {
  pluginAPI.slots.register("cart.above-total", LoyaltySummary);
  pluginAPI.hooks.register("afterPayment", addLoyaltyPoints);
}
```

## Why Use It

This protects the core.

Bad:

```js
import cartStore from "@/core/stores/cartStore";
cartStore.items = [];
```

Good:

```js
pluginAPI.cart.clear();
```

Benefits:

```txt
better security
stable plugin contract
easier upgrades
permission control
less accidental breakage
```

---

# 15. `core/slots/`

```txt
core/slots/
├── Slot.jsx
└── slotNames.js
```

## `Slot.jsx`

Renders registered slot components.

Example:

```jsx
export function Slot({ name, props }) {
  const items = getSlotContent(name);

  return items.map(({ component: Component, id }) => (
    <Component key={id} {...props} />
  ));
}
```

## `slotNames.js`

Centralizes slot names.

Example:

```js
export const SLOT_NAMES = {
  CART_ABOVE_TOTAL: "cart.above-total",
  CART_BELOW_TOTAL: "cart.below-total",
  PAYMENT_METHODS: "payment.methods",
  RECEIPT_FOOTER: "receipt.footer",
};
```

Reason:

Avoid typo bugs in string-based extension points.

---

# 16. `core/stores/`

```txt
core/stores/
├── cartStore.js
├── orderStore.js
├── authStore.js
├── productStore.js
├── customerStore.js
└── settingsStore.js
```

## Purpose

Global frontend state.

Use for:

```txt
cart items
current order
cashier session
customer selection
products
settings
active theme
active plugins
```

Reason:

State should not be duplicated across components.

Plugins should use `pluginAPI`, not directly mutate stores.

---

# 17. `core/services/`

```txt
core/services/
├── api/
├── storage/
├── sync/
├── websocket/
└── hardware-clients/
```

## Purpose

Renderer-side service clients.

Important:

These are not direct hardware services. They call preload/main APIs.

Example:

```js
export async function printReceipt(order) {
  return window.electronAPI.printer.printReceipt(order);
}
```

Reason:

UI components should not call IPC directly everywhere.

Better flow:

```txt
Component → renderer service → preload API → IPC → main service
```

---

# 18. `core/styles/`

```txt
core/styles/
├── variables.css
├── themes.css
├── global.css
├── reset.css
└── typography.css
```

## Purpose

Global styling system.

Use:

```txt
CSS Modules + CSS Variables
```

Example variables:

```css
:root {
  --color-primary: #22c55e;
  --color-danger: #ef4444;
  --color-warning: #f59e0b;
  --color-surface: #ffffff;
  --color-text: #111827;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --radius-md: 8px;
}
```

## Why CSS Modules + CSS Variables

Best for this POS because:

```txt
styles are scoped
plugin styles do not conflict
themes can change at runtime
modules can override safely
precision layout is easier
uninstall leaves no leftover style changes
```

Avoid using Tailwind as the main system for this plugin-based POS.

---

# 19. `src/renderer/plugins/`

```txt
renderer/plugins/
├── pluginLoader.js
├── activePlugins.js
├── loyalty-discount/
├── gift-card/
├── split-payment/
├── custom-receipt/
├── customer-display/
└── cctv-overlay/
```

This folder contains renderer-side plugins.

Each plugin should be self-contained.

---

# 20. Standard Plugin Folder Structure

Example:

```txt
plugins/loyalty-discount/
├── plugin.json
├── index.js
├── components/
│   ├── LoyaltySummary.jsx
│   ├── LoyaltyButton.jsx
│   └── LoyaltyPopup.jsx
│
├── hooks/
│   ├── applyLoyaltyDiscount.js
│   └── addLoyaltyPoints.js
│
├── services/
│   ├── loyaltyApi.js
│   └── loyaltyService.js
│
├── slots/
│   └── CartAboveTotalSlot.jsx
│
├── styles/
│   ├── LoyaltySummary.module.css
│   └── loyaltyTheme.css
│
├── assets/
│   └── loyalty-icon.svg
│
└── tests/
    └── loyalty.test.js
```

---

## 20.1 `plugin.json`

Plugin metadata.

Example:

```json
{
  "id": "loyalty-discount",
  "name": "Loyalty Discount",
  "version": "1.0.0",
  "enabled": true,
  "entry": "./index.js",
  "permissions": [
    "cart:read",
    "cart:update",
    "orders:read",
    "orders:update"
  ],
  "slots": [
    "cart.above-total"
  ],
  "hooks": [
    "beforePayment",
    "afterPayment"
  ],
  "dependencies": [],
  "order": 50
}
```

Why use it:

```txt
plugin identity
version control
permission check
dependency check
load order
settings display
```

---

## 20.2 `index.js`

Plugin registration entry point.

Example:

```js
import { LoyaltySummary } from "./components/LoyaltySummary";
import { applyLoyaltyDiscount } from "./hooks/applyLoyaltyDiscount";
import { addLoyaltyPoints } from "./hooks/addLoyaltyPoints";
import { loyaltyService } from "./services/loyaltyService";

export default function register(pluginAPI) {
  pluginAPI.slots.register("cart.above-total", LoyaltySummary, {
    id: "loyalty.summary",
    order: 50,
  });

  pluginAPI.hooks.register("beforePayment", applyLoyaltyDiscount, {
    id: "loyalty.apply-discount",
    order: 40,
  });

  pluginAPI.hooks.register("afterPayment", addLoyaltyPoints, {
    id: "loyalty.add-points",
    order: 60,
  });

  pluginAPI.services.register("loyalty", loyaltyService);
}
```

Why use it:

```txt
one clear plugin entry
plugin owns its registration
core does not know plugin internals
```

---

# 21. Plugin Loader

## `activePlugins.js`

```js
export const activePlugins = [
  () => import("./loyalty-discount"),
  () => import("./gift-card"),
  () => import("./split-payment"),
];
```

## `pluginLoader.js`

```js
import { createPluginAPI } from "../core/plugin-api/createPluginAPI";
import { activePlugins } from "./activePlugins";

export async function loadPlugins() {
  const pluginAPI = createPluginAPI();

  for (const loadPlugin of activePlugins) {
    try {
      const plugin = await loadPlugin();
      await plugin.default(pluginAPI);
    } catch (error) {
      console.error("Plugin failed to load:", error);
    }
  }
}
```

## Why Use This

Install plugin:

```txt
add one line in activePlugins.js
```

Uninstall plugin:

```txt
remove one line from activePlugins.js
```

Reason:

No base file cleanup is required.

---

# 22. Bundled Plugins vs Runtime External Plugins

## Phase 1: Bundled Plugins

Plugins are included in the source/build.

Example:

```js
() => import("./loyalty-discount")
```

Best for now because:

```txt
simple
safe
works with Vite
easy to debug
good for first-party modules
no runtime security complexity
```

## Phase 2: Runtime External Plugins

Plugins are installed after packaging.

Example:

```txt
userData/plugins/plugin-name/
```

Only do this later because it requires:

```txt
signature validation
manifest validation
sandboxing
version compatibility
permission enforcement
dependency resolution
safe runtime imports
```

Recommendation:

```txt
Start with bundled plugins.
Add runtime external plugin support later only if truly needed.
```

---

# 23. Plugin Decision Guide

When building a plugin, choose the correct extension point:

```txt
Adds UI inside screen?          → slotRegistry
Replaces UI section?            → componentRegistry
Decorates existing component?   → wrapperRegistry
Adds full screen?               → routeRegistry
Changes business flow?          → hookRegistry
Only reacts to action?          → eventBus
Adds payment method?            → paymentRegistry
Changes receipt?                → receiptRegistry
Adds shared logic/service?       → serviceRegistry
Changes theme/branding?         → themeRegistry
Needs hardware/native access?   → main process service + IPC
```

---

# 24. Example Plugin Flows

## 24.1 Loyalty Plugin

Needs:

```txt
show points in cart
apply discount before payment
add points after payment
add loyalty dashboard
style loyalty UI
```

Uses:

```txt
slotRegistry
hookRegistry
routeRegistry
serviceRegistry
themeRegistry
CSS Modules
```

Should not edit:

```txt
CartPanel.jsx
PaymentScreen.jsx
AppRouter.jsx
Button.module.css
```

---

## 24.2 Gift Card Plugin

Needs:

```txt
gift card payment button
gift card validation
balance deduction
gift card receipt line
gift card management screen
```

Uses:

```txt
paymentRegistry
hookRegistry
receiptRegistry
routeRegistry
serviceRegistry
```

---

## 24.3 Split Payment Plugin

Needs:

```txt
split payment UI
multiple payment entries
partial payment calculation
final payment validation
```

Uses:

```txt
paymentRegistry
componentRegistry
hookRegistry
slotRegistry
```

---

## 24.4 CCTV Overlay Plugin

Needs:

```txt
send order/cart text to NVR
use TCP socket
listen to order events
add CCTV settings screen
```

Uses:

```txt
eventBus
mainServiceRegistry
IPC
routeRegistry
main process service
```

---

## 24.5 Custom Receipt Plugin

Needs:

```txt
override receipt template
add custom footer
modify receipt data before print
```

Uses:

```txt
receiptRegistry
slotRegistry
hookRegistry
CSS Modules
```

---

# 25. Plugin Install/Uninstall Flow

## Install

```txt
1. Add plugin folder under renderer/plugins/
2. Add plugin import in activePlugins.js
3. Plugin index.js registers its UI/logic/services
4. App loads plugin during startup
5. Registry entries become available
```

## Uninstall

```txt
1. Remove plugin import from activePlugins.js
2. Plugin no longer registers
3. Core falls back to default UI and default logic
4. No base files need cleanup
```

---

# 26. Plugin Error Handling

Every plugin load should be isolated.

Example:

```js
try {
  const plugin = await loadPlugin();
  await plugin.default(pluginAPI);
} catch (error) {
  logger.error("Plugin failed", error);
}
```

Recommended behavior:

```txt
log error
mark plugin as failed
continue loading other plugins
show warning in admin/settings screen
do not crash POS
```

---

# 27. Plugin Permissions

Plugins should declare permissions in `plugin.json`.

Examples:

```txt
cart:read
cart:update
orders:read
orders:update
payment:process
receipt:override
printer:use
cctv:send
settings:update
```

Reason:

```txt
clear plugin capabilities
safer future runtime plugins
easier audit
less accidental overreach
```

---

# 28. Plugin Load Order

Some plugins depend on others.

Example:

```txt
split-payment depends on payment core
gift-card should load before split-payment
theme plugins should load before UI plugins
receipt plugin should load before print plugin
```

Use:

```json
{
  "dependencies": ["gift-card"],
  "order": 50
}
```

Reason:

Prevents plugin conflict and unpredictable behavior.

---

# 29. Styling Rules

Use:

```txt
CSS Modules + CSS Variables
```

## Component style example

```txt
Button/
├── Button.jsx
└── Button.module.css
```

## Plugin style example

```txt
plugins/loyalty-discount/styles/
├── LoyaltySummary.module.css
└── loyaltyTheme.css
```

## Rules

```txt
do not hardcode brand colors inside components
use CSS variables for colors/spacing
use CSS Modules for component/plugin isolation
allow className forwarding
allow replaceStyles for full visual replacement
```

Reason:

Plugins can override styles without editing base CSS.

---

# 30. Anti-Patterns to Avoid

## 30.1 Plugin editing core file

Bad:

```txt
plugin edits CartPanel.jsx
plugin edits PaymentScreen.jsx
plugin edits ReceiptView.jsx
```

Good:

```txt
plugin uses slot/hook/registry
```

---

## 30.2 Hardware logic in React

Bad:

```txt
React component opens TCP socket
React component talks to printer directly
React component accesses database file
```

Good:

```txt
React → renderer service → preload → IPC → main service
```

---

## 30.3 Hardcoded payment methods

Bad:

```jsx
<CashButton />
<CardButton />
<GiftCardButton />
```

Good:

```jsx
<PaymentMethods />
```

---

## 30.4 Hardcoded receipt templates

Bad:

```js
if (storeType === "restaurant") {
  renderRestaurantReceipt();
}
```

Good:

```js
const Receipt = getReceiptTemplate(activeReceiptTemplate);
```

---

## 30.5 Random string extension names

Bad:

```js
registerSlot("cart.top.total.extra", Component);
```

Good:

```js
SLOT_NAMES.CART_ABOVE_TOTAL
```

---

## 30.6 Plugin directly mutating stores

Bad:

```js
cartStore.items = [];
```

Good:

```js
pluginAPI.cart.clear();
```

---

# 31. Development Checklist

When creating a new core feature, ask:

```txt
Where can plugins extend this?
Does this screen need slots?
Does this flow need hooks?
Does this component need wrapper support?
Does this UI section need replacement support?
Does this feature need events?
Does this need payment/receipt/service registration?
```

When creating a plugin, ask:

```txt
Does it add UI?                 → slotRegistry
Does it replace UI?             → componentRegistry
Does it decorate UI?            → wrapperRegistry
Does it add screen?             → routeRegistry
Does it modify business flow?   → hookRegistry
Does it only react?             → eventBus
Does it add payment?            → paymentRegistry
Does it change receipt?         → receiptRegistry
Does it expose service?         → serviceRegistry
Does it change theme?           → themeRegistry
Does it need native access?     → main process + IPC
```

---

# 32. Recommended Implementation Order

Build in this order:

```txt
1. Basic Electron main/preload/renderer structure
2. Secure preload IPC bridge
3. Core React app
4. Base POS screens
5. Registry folder
6. Plugin loader
7. Slot system
8. Route registry
9. Component registry
10. Wrapper registry
11. Hook registry
12. Event bus
13. Payment registry
14. Receipt registry
15. Service registry
16. Theme registry
17. Plugin metadata and permissions
18. Main-process plugin services
19. Plugin admin/settings screen
20. Runtime external plugin support if required later
```

---

# 33. Final Recommendation

Use this architecture:

```txt
src/
├── main/
├── preload/
├── renderer/
│   ├── app/
│   ├── core/
│   └── plugins/
└── shared/
```

Use this plugin pattern:

```txt
Plugin Loader
+ Plugin API
+ Registries
+ Slots
+ Hooks
+ Events
+ Services
+ CSS Modules
+ CSS Variables
```

Final rule:

```txt
Core should be stable.
Plugins should be isolated.
Registries should connect them.
```

This architecture is best for our Electron POS because it supports:

```txt
modular features
clean install/uninstall
safe UI overrides
business logic extension
payment customization
receipt customization
hardware integration
runtime theming
long-term maintainability
team-based development
```
