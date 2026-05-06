# POS Modularity and Folder Structure Guide

## Purpose

This document defines the recommended modular architecture for the Electron + React POS system.

The goal is to make the POS system work like a plugin-based platform:

- Core POS features stay stable.
- Optional features can be installed, enabled, disabled, or removed.
- Plugins can add UI, business logic, services, payment methods, receipt templates, and themes.
- Plugins must not directly edit core files.
- Styling must remain isolated, predictable, and easy to override.

This guide is designed for a Windows Electron POS application with React/Vite on the frontend and plugin-style feature installation.

---

# 1. Core Idea

The system should be separated into two major parts:

```txt
Core POS = stable engine
Plugins  = installable feature modules
```

The core application should provide:

- App startup
- Routing
- Layouts
- Base UI components
- Global state
- Plugin loader
- Registries
- Slots
- Hooks
- Event bus
- Services
- Theme system
- Permission system

Plugins should provide:

- Extra screens
- Extra UI inside existing screens
- Payment methods
- Discount logic
- Receipt customizations
- Hardware/service integrations
- Customer-specific themes
- Reports
- Sync logic

The most important rule:

```txt
Plugins register functionality. Plugins do not edit core files.
```

---

# 2. Best Architecture Pattern

Use this combined modular pattern:

```txt
Plugin Manifest
+ Plugin Loader
+ Registries
+ Slots
+ Hooks
+ Event Bus
+ Service Registry
+ CSS Modules
+ CSS Variables
+ Permissions
```

Each part solves a different problem.

| Need | Best solution |
|---|---|
| Add new screen | Screen Registry |
| Add UI inside existing screen | Slots |
| Add business rule | Hooks |
| Listen to system activity | Event Bus |
| Add payment method | Payment Registry |
| Add receipt layout | Receipt Registry |
| Add native/backend feature | Service Registry |
| Add theme/brand styling | CSS Variables |
| Override component style | CSS Modules + className |
| Full style replacement | replaceStyles prop |
| Install/remove plugin | plugin.json + Plugin Loader |
| Control plugin access | Permission system |

---

# 3. Recommended Root Structure

```txt
pos-app/
├── electron/
│   ├── main/
│   ├── preload/
│   └── services/
│
├── src/
│   ├── core/
│   ├── plugins/
│   ├── main.jsx
│   ├── bootstrap.js
│   ├── pluginLoader.js
│   └── routes.jsx
│
├── installed-plugins/
│   └── external plugins installed after app deployment
│
├── public/
├── docs/
├── package.json
├── vite.config.js
└── README.md
```

## Folder Meaning

| Folder | Purpose |
|---|---|
| `electron/` | Electron main process, preload bridge, native integrations |
| `src/core/` | Stable POS engine and shared frontend logic |
| `src/plugins/` | Built-in plugins bundled with the app |
| `installed-plugins/` | Runtime-installed external plugins |
| `public/` | Static public assets |
| `docs/` | Architecture and developer documentation |

---

# 4. Complete Recommended Folder Structure

```txt
src/
├── core/
│   ├── app/
│   ├── components/
│   ├── layouts/
│   ├── pages/
│   ├── registries/
│   ├── slots/
│   ├── hooks/
│   ├── events/
│   ├── services/
│   ├── stores/
│   ├── utils/
│   ├── constants/
│   ├── styles/
│   ├── permissions/
│   ├── types/
│   └── config/
│
├── plugins/
│   ├── loyalty/
│   ├── gift-card/
│   ├── split-payment/
│   ├── cctv-overlay/
│   ├── customer-display/
│   ├── custom-receipt/
│   └── analytics/
│
├── main.jsx
├── bootstrap.js
├── pluginLoader.js
└── routes.jsx
```

---

# 5. Core Folder Explained

## 5.1 `src/core/app/`

This folder controls app bootstrapping and the root application structure.

```txt
src/core/app/
├── App.jsx
├── Router.jsx
├── AppProviders.jsx
├── Startup.jsx
├── ErrorBoundary.jsx
└── PluginBootstrap.jsx
```

| File | Purpose |
|---|---|
| `App.jsx` | Root React app component |
| `Router.jsx` | Main route rendering |
| `AppProviders.jsx` | Wraps app with providers such as store, theme, auth, plugin context |
| `Startup.jsx` | Runs startup tasks like loading settings and enabled plugins |
| `ErrorBoundary.jsx` | Prevents plugin crashes from breaking the whole app |
| `PluginBootstrap.jsx` | Initializes plugins after core services are ready |

Example:

```jsx
// src/core/app/App.jsx
import { AppProviders } from './AppProviders';
import { Router } from './Router';
import { ErrorBoundary } from './ErrorBoundary';

export function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <Router />
      </AppProviders>
    </ErrorBoundary>
  );
}
```

---

## 5.2 `src/core/components/`

This folder contains reusable UI components used by both core and plugins.

```txt
src/core/components/
├── Button/
│   ├── Button.jsx
│   ├── Button.module.css
│   └── index.js
│
├── Modal/
├── Input/
├── Select/
├── ProductCard/
├── CartPanel/
├── ReceiptView/
├── DataTable/
├── Loader/
├── Badge/
├── EmptyState/
└── Toast/
```

Rules:

- Components must be generic.
- Components must not contain plugin-specific logic.
- Components must accept `className` for style extension.
- Important components should support `replaceStyles`.
- Components should use CSS variables, not hard-coded colors.

Recommended base component pattern:

```jsx
// src/core/components/Button/Button.jsx
import styles from './Button.module.css';

export function Button({
  children,
  className = '',
  replaceStyles = false,
  variant = 'primary',
  ...props
}) {
  const finalClassName = replaceStyles
    ? className
    : `${styles.button} ${styles[variant] || ''} ${className}`;

  return (
    <button className={finalClassName} {...props}>
      {children}
    </button>
  );
}
```

```css
/* src/core/components/Button/Button.module.css */
.button {
  background: var(--color-primary);
  color: var(--color-on-primary);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  font-weight: 600;
  border: none;
  cursor: pointer;
}

.secondary {
  background: var(--color-secondary);
}
```

---

## 5.3 `src/core/layouts/`

Layouts define reusable screen structures.

```txt
src/core/layouts/
├── POSLayout/
│   ├── POSLayout.jsx
│   ├── POSLayout.module.css
│   └── index.js
│
├── DashboardLayout/
├── AuthLayout/
├── SettingsLayout/
└── CustomerDisplayLayout/
```

Use layouts for:

- Header/sidebar structure
- Main POS grid
- Product area + cart area
- Dashboard structure
- Customer display window layout

Example POS layout:

```jsx
// src/core/layouts/POSLayout/POSLayout.jsx
import { Slot } from '../../slots/Slot';
import styles from './POSLayout.module.css';

export function POSLayout({ productArea, cartArea }) {
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <Slot name="app.header.left" />
        <Slot name="app.header.right" />
      </header>

      <main className={styles.main}>
        <section className={styles.products}>{productArea}</section>
        <aside className={styles.cart}>{cartArea}</aside>
      </main>
    </div>
  );
}
```

---

## 5.4 `src/core/pages/`

Core pages are stable application pages.

```txt
src/core/pages/
├── LoginPage/
├── POSPage/
├── PaymentPage/
├── OrdersPage/
├── InventoryPage/
├── ReportsPage/
├── SettingsPage/
└── NotFoundPage/
```

Plugins can add pages through `screenRegistry`, but core pages should remain in this folder.

Example:

```txt
POSPage = base billing screen
PaymentPage = base payment flow
SettingsPage = base settings shell where plugin settings can be injected
```

---

## 5.5 `src/core/registries/`

Registries are the backbone of plugin modularity.

```txt
src/core/registries/
├── pluginRegistry.js
├── screenRegistry.js
├── componentRegistry.js
├── slotRegistry.js
├── hookRegistry.js
├── eventRegistry.js
├── serviceRegistry.js
├── paymentRegistry.js
├── receiptRegistry.js
├── themeRegistry.js
├── settingsRegistry.js
├── permissionRegistry.js
└── index.js
```

| Registry | Purpose |
|---|---|
| `pluginRegistry.js` | Tracks installed/enabled plugins |
| `screenRegistry.js` | Stores plugin-provided screens/pages |
| `componentRegistry.js` | Stores replaceable UI components |
| `slotRegistry.js` | Stores UI injections for slot areas |
| `hookRegistry.js` | Stores business lifecycle hooks |
| `eventRegistry.js` | Stores event listeners |
| `serviceRegistry.js` | Stores services provided by core or plugins |
| `paymentRegistry.js` | Stores payment methods |
| `receiptRegistry.js` | Stores receipt templates and print layouts |
| `themeRegistry.js` | Stores CSS variable theme overrides |
| `settingsRegistry.js` | Stores plugin settings screens |
| `permissionRegistry.js` | Stores plugin permissions and access rules |

Simple registry example:

```js
// src/core/registries/screenRegistry.js
const screens = new Map();

export function registerScreen(id, config) {
  if (screens.has(id)) {
    throw new Error(`Screen already registered: ${id}`);
  }

  screens.set(id, config);
}

export function getScreen(id) {
  return screens.get(id);
}

export function getAllScreens() {
  return Array.from(screens.values());
}
```

---

## 5.6 `src/core/slots/`

Slots are fixed UI extension points where plugins can inject components.

```txt
src/core/slots/
├── Slot.jsx
├── SlotProvider.jsx
├── slotRenderer.js
├── slotNames.js
└── slotTypes.js
```

Recommended slot names:

```txt
app.header.left
app.header.right
app.sidebar.top
app.sidebar.bottom
pos.product.card.badge
pos.cart.header
pos.cart.item.afterName
pos.cart.footer
pos.cart.actions
payment.methods
payment.summary.afterTotal
receipt.header
receipt.footer
settings.menu
settings.panel
order.actions
customer.display.footer
```

Slot renderer:

```jsx
// src/core/slots/Slot.jsx
import { getSlotItems } from '../registries/slotRegistry';

export function Slot({ name, props = {} }) {
  const items = getSlotItems(name);

  if (!items.length) return null;

  return (
    <>
      {items.map((item) => {
        const Component = item.component;
        return <Component key={item.id} {...props} />;
      })}
    </>
  );
}
```

Plugin example:

```js
pluginAPI.registerSlot('pos.cart.footer', {
  id: 'loyalty-cart-footer',
  component: LoyaltyCartFooter,
  order: 50
});
```

Use slots when a plugin needs to add visible UI inside an existing page.

Best examples:

- Loyalty points box inside cart footer
- Gift card field inside payment screen
- Promo badge inside product card
- Receipt footer text
- Settings menu item

---

## 5.7 `src/core/hooks/`

Hooks are business lifecycle extension points.

```txt
src/core/hooks/
├── lifecycleHooks.js
├── useCart.js
├── useOrders.js
├── usePayments.js
├── useProducts.js
├── useCustomers.js
└── usePluginHooks.js
```

Recommended business hooks:

```txt
cart.beforeAddItem
cart.afterAddItem
cart.beforeRemoveItem
cart.afterRemoveItem
cart.beforeTotalCalculate
cart.afterTotalCalculate
order.beforeCreate
order.afterCreate
order.beforeSave
order.afterSave
payment.beforeStart
payment.afterSuccess
payment.afterFailure
receipt.beforeRender
receipt.afterRender
receipt.beforePrint
receipt.afterPrint
sync.beforeUpload
sync.afterUpload
```

Hook runner:

```js
// src/core/registries/hookRegistry.js
const hooks = new Map();

export function registerHook(name, handler, options = {}) {
  if (!hooks.has(name)) hooks.set(name, []);

  hooks.get(name).push({
    handler,
    order: options.order || 100,
    pluginId: options.pluginId
  });

  hooks.get(name).sort((a, b) => a.order - b.order);
}

export async function runHooks(name, payload) {
  const handlers = hooks.get(name) || [];
  let result = payload;

  for (const item of handlers) {
    result = await item.handler(result);
  }

  return result;
}
```

Core usage:

```js
import { runHooks } from '../registries/hookRegistry';

export async function calculateCartTotal(cart) {
  let draft = await runHooks('cart.beforeTotalCalculate', cart);

  // Core total calculation here.

  draft = await runHooks('cart.afterTotalCalculate', draft);
  return draft;
}
```

Plugin usage:

```js
pluginAPI.registerHook('cart.afterTotalCalculate', async (cart) => {
  if (cart.customer?.loyaltyTier === 'gold') {
    cart.discountTotal += 5;
  }

  return cart;
});
```

Use hooks when a plugin needs to modify data or business flow.

---

## 5.8 `src/core/events/`

Events are for decoupled communication.

```txt
src/core/events/
├── eventBus.js
├── eventNames.js
├── emitters.js
└── listeners.js
```

Event bus:

```js
// src/core/events/eventBus.js
const listeners = new Map();

export function on(eventName, callback) {
  if (!listeners.has(eventName)) listeners.set(eventName, []);
  listeners.get(eventName).push(callback);

  return () => off(eventName, callback);
}

export function off(eventName, callback) {
  const callbacks = listeners.get(eventName) || [];
  listeners.set(
    eventName,
    callbacks.filter((item) => item !== callback)
  );
}

export function emit(eventName, payload) {
  const callbacks = listeners.get(eventName) || [];
  callbacks.forEach((callback) => callback(payload));
}
```

Recommended event names:

```txt
app.started
plugin.enabled
plugin.disabled
cart.itemAdded
cart.itemRemoved
cart.cleared
order.created
order.saved
order.paid
payment.started
payment.success
payment.failed
receipt.printed
customer.selected
sync.completed
hardware.barcodeScanned
hardware.printerError
```

Use events when plugins only need to observe something.

Example:

```js
pluginAPI.events.on('order.paid', async (order) => {
  await loyaltyService.addPoints(order.customerId, order.total);
});
```

Difference between hooks and events:

| Type | Can modify data? | Use for |
|---|---:|---|
| Hook | Yes | Discounts, validation, total calculation, receipt modification |
| Event | Usually no | Analytics, logs, sync, CCTV overlay, customer display |

---

## 5.9 `src/core/services/`

Services contain shared logic and APIs.

```txt
src/core/services/
├── api/
│   ├── apiClient.js
│   ├── authApi.js
│   ├── productApi.js
│   ├── orderApi.js
│   └── customerApi.js
│
├── storage/
│   ├── localStorageService.js
│   ├── indexedDbService.js
│   └── cacheService.js
│
├── hardware/
│   ├── printerService.js
│   ├── barcodeService.js
│   ├── scannerService.js
│   └── cctvService.js
│
├── sync/
│   ├── syncService.js
│   ├── offlineQueue.js
│   └── conflictResolver.js
│
├── websocket/
│   └── socketService.js
│
├── logging/
│   └── logger.js
│
└── auth/
    ├── authService.js
    └── sessionService.js
```

Core services should be registered in the service registry:

```js
pluginAPI.registerService('printer', printerService);
pluginAPI.registerService('barcode', barcodeService);
pluginAPI.registerService('orders', orderService);
```

Plugins can use services through the plugin API instead of importing service files directly.

```js
const printer = pluginAPI.getService('printer');
await printer.printReceipt(order);
```

---

## 5.10 `src/core/stores/`

Stores hold global state.

```txt
src/core/stores/
├── cartStore.js
├── orderStore.js
├── authStore.js
├── productStore.js
├── customerStore.js
├── settingsStore.js
├── pluginStore.js
└── index.js
```

Use Zustand, Redux Toolkit, or React Context. For POS, Zustand is often simple and efficient.

Example:

```js
// src/core/stores/cartStore.js
import { create } from 'zustand';

export const useCartStore = create((set) => ({
  items: [],
  addItem: (item) =>
    set((state) => ({ items: [...state.items, item] })),
  clearCart: () => set({ items: [] })
}));
```

Plugin rule:

```txt
Plugins should not directly mutate core stores unless the core exposes a safe action/API for it.
```

---

## 5.11 `src/core/utils/`

Pure helper functions.

```txt
src/core/utils/
├── currency.js
├── tax.js
├── date.js
├── uuid.js
├── debounce.js
├── validation.js
├── receiptFormatter.js
└── objectUtils.js
```

Rules:

- No React state.
- No side effects.
- No plugin-specific logic.
- Easy to test.

---

## 5.12 `src/core/constants/`

Shared constants.

```txt
src/core/constants/
├── routes.js
├── permissions.js
├── paymentTypes.js
├── eventNames.js
├── hookNames.js
├── slotNames.js
└── storageKeys.js
```

Example:

```js
// src/core/constants/slotNames.js
export const SLOT_NAMES = {
  POS_CART_FOOTER: 'pos.cart.footer',
  PAYMENT_METHODS: 'payment.methods',
  RECEIPT_FOOTER: 'receipt.footer'
};
```

---

## 5.13 `src/core/styles/`

Global style system.

```txt
src/core/styles/
├── reset.css
├── global.css
├── variables.css
├── themes.css
├── typography.css
└── zIndex.css
```

Use CSS Modules for component styles and CSS Variables for themes/design tokens.

Core variables:

```css
/* src/core/styles/variables.css */
:root {
  --color-primary: #22c55e;
  --color-secondary: #0f172a;
  --color-danger: #ef4444;
  --color-warning: #f59e0b;
  --color-surface: #ffffff;
  --color-background: #f8fafc;
  --color-text: #111827;
  --color-muted: #6b7280;

  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  --font-size-sm: 12px;
  --font-size-md: 14px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
}
```

Theme example:

```css
/* src/core/styles/themes.css */
[data-theme='dark'] {
  --color-primary: #3b82f6;
  --color-surface: #1f2937;
  --color-background: #111827;
  --color-text: #f9fafb;
  --color-muted: #9ca3af;
}
```

---

## 5.14 `src/core/permissions/`

Permission and access control system.

```txt
src/core/permissions/
├── permissionGuard.js
├── roleManager.js
├── accessRules.js
├── pluginPermissions.js
└── permissionChecker.js
```

Use this for:

- Cashier/admin/supervisor access
- Plugin permission checks
- Payment restrictions
- Settings page access
- Sensitive service access

Example:

```js
export function canUsePlugin(user, plugin) {
  return plugin.requiredRoles.some((role) => user.roles.includes(role));
}
```

---

## 5.15 `src/core/types/`

Shared TypeScript or JSDoc type definitions.

```txt
src/core/types/
├── plugin.types.ts
├── order.types.ts
├── payment.types.ts
├── receipt.types.ts
├── customer.types.ts
└── product.types.ts
```

Even if the project uses JavaScript, define types with JSDoc or migrate this folder to TypeScript later.

---

## 5.16 `src/core/config/`

Configuration files.

```txt
src/core/config/
├── appConfig.js
├── pluginConfig.js
├── featureFlags.js
├── environment.js
└── buildInfo.js
```

Use this for:

- API base URL
- enabled features
- app version
- default theme
- plugin mode
- environment-specific settings

---

# 6. Plugins Folder Explained

Plugins are self-contained modules.

Each plugin should have this structure:

```txt
src/plugins/plugin-name/
├── plugin.json
├── index.js
├── components/
├── pages/
├── hooks/
├── services/
├── slots/
├── events/
├── styles/
├── assets/
├── permissions.js
└── README.md
```

## Required Files

| File | Required? | Purpose |
|---|---:|---|
| `plugin.json` | Yes | Metadata, version, permissions, entry file |
| `index.js` | Yes | Registration entry point |
| `components/` | Optional | Plugin-specific UI components |
| `pages/` | Optional | Full screens added by plugin |
| `hooks/` | Optional | Business logic extensions |
| `services/` | Optional | Plugin-specific business/API logic |
| `slots/` | Optional | Components inserted into core UI slots |
| `events/` | Optional | Event listeners |
| `styles/` | Optional | CSS Modules and theme variables |
| `assets/` | Optional | Icons/images used only by plugin |
| `permissions.js` | Optional | Plugin-specific permission rules |
| `README.md` | Recommended | Developer documentation |

---

# 7. Plugin Example: Loyalty

```txt
src/plugins/loyalty/
├── plugin.json
├── index.js
├── components/
│   ├── LoyaltyButton/
│   │   ├── LoyaltyButton.jsx
│   │   ├── LoyaltyButton.module.css
│   │   └── index.js
│   ├── LoyaltyBadge/
│   └── LoyaltyPopup/
│
├── pages/
│   └── LoyaltyDashboard.jsx
│
├── hooks/
│   ├── applyLoyaltyDiscount.js
│   └── calculateLoyaltyPoints.js
│
├── services/
│   ├── loyaltyService.js
│   └── loyaltyApi.js
│
├── slots/
│   ├── LoyaltyCartFooter.jsx
│   └── LoyaltyCustomerBadge.jsx
│
├── events/
│   └── loyaltyEventListeners.js
│
├── styles/
│   ├── loyaltyTheme.css
│   └── LoyaltyCard.module.css
│
├── assets/
│   └── loyalty-icon.svg
│
├── permissions.js
└── README.md
```

## `plugin.json`

```json
{
  "id": "loyalty",
  "name": "Loyalty Program",
  "version": "1.0.0",
  "entry": "./index.js",
  "enabled": true,
  "description": "Adds loyalty points, discounts, and customer rewards.",
  "permissions": [
    "customers:read",
    "customers:update",
    "orders:read",
    "orders:update"
  ],
  "slots": [
    "pos.cart.footer",
    "pos.customer.badge"
  ],
  "hooks": [
    "cart.afterTotalCalculate",
    "payment.afterSuccess"
  ]
}
```

## `index.js`

```js
import { LoyaltyCartFooter } from './slots/LoyaltyCartFooter';
import { LoyaltyDashboard } from './pages/LoyaltyDashboard';
import { applyLoyaltyDiscount } from './hooks/applyLoyaltyDiscount';
import { loyaltyService } from './services/loyaltyService';
import './styles/loyaltyTheme.css';

export default function register(pluginAPI) {
  pluginAPI.registerService('loyalty', loyaltyService);

  pluginAPI.registerScreen('loyalty.dashboard', {
    path: '/loyalty',
    label: 'Loyalty',
    component: LoyaltyDashboard,
    permission: 'loyalty:view'
  });

  pluginAPI.registerSlot('pos.cart.footer', {
    id: 'loyalty-cart-footer',
    component: LoyaltyCartFooter,
    order: 50
  });

  pluginAPI.registerHook('cart.afterTotalCalculate', applyLoyaltyDiscount, {
    order: 30
  });

  pluginAPI.registerTheme('loyalty', {
    '--loyalty-color': '#d4a017',
    '--loyalty-background': '#fff8dc'
  });
}
```

---

# 8. Plugin API Design

The plugin API is the only way plugins should connect to the core app.

```txt
Plugin -> pluginAPI -> Core registries/services
```

Recommended API:

```js
export const pluginAPI = {
  registerScreen,
  registerSlot,
  registerHook,
  registerService,
  registerPaymentMethod,
  registerReceiptTemplate,
  registerTheme,
  registerSettingsPanel,
  getService,
  events,
  permissions,
  logger
};
```

Example implementation:

```js
// src/pluginLoader.js
import * as screenRegistry from './core/registries/screenRegistry';
import * as slotRegistry from './core/registries/slotRegistry';
import * as hookRegistry from './core/registries/hookRegistry';
import * as serviceRegistry from './core/registries/serviceRegistry';
import * as paymentRegistry from './core/registries/paymentRegistry';
import * as receiptRegistry from './core/registries/receiptRegistry';
import * as themeRegistry from './core/registries/themeRegistry';
import * as eventBus from './core/events/eventBus';

export function createPluginAPI(pluginMeta) {
  return {
    registerScreen: screenRegistry.registerScreen,
    registerSlot: slotRegistry.registerSlot,
    registerHook: hookRegistry.registerHook,
    registerService: serviceRegistry.registerService,
    registerPaymentMethod: paymentRegistry.registerPaymentMethod,
    registerReceiptTemplate: receiptRegistry.registerReceiptTemplate,
    registerTheme: themeRegistry.registerTheme,
    getService: serviceRegistry.getService,
    events: eventBus,
    logger: console,
    plugin: pluginMeta
  };
}
```

Important rule:

```txt
Plugins should not import core internals directly unless they are public API exports.
```

Good:

```js
const printer = pluginAPI.getService('printer');
```

Bad:

```js
import { printerService } from '../../core/services/hardware/printerService';
```

---

# 9. Plugin Loader

The plugin loader discovers plugins, validates them, and registers them.

```txt
Plugin loading flow:
1. Read plugin manifest.
2. Check enabled/disabled state.
3. Validate app version compatibility.
4. Check permissions.
5. Import plugin entry file.
6. Create pluginAPI.
7. Call plugin register function.
8. Store plugin in pluginRegistry.
```

Example:

```js
// src/pluginLoader.js
import { createPluginAPI } from './createPluginAPI';
import { registerPlugin } from './core/registries/pluginRegistry';

export async function loadPlugin(pluginMeta, importEntry) {
  if (!pluginMeta.enabled) return;

  const pluginModule = await importEntry();
  const register = pluginModule.default;

  if (typeof register !== 'function') {
    throw new Error(`Plugin ${pluginMeta.id} does not export a register function`);
  }

  const api = createPluginAPI(pluginMeta);
  await register(api);

  registerPlugin(pluginMeta);
}
```

For built-in plugins:

```js
// src/bootstrap.js
import loyaltyMeta from './plugins/loyalty/plugin.json';
import giftCardMeta from './plugins/gift-card/plugin.json';
import { loadPlugin } from './pluginLoader';

export async function bootstrapPlugins() {
  await loadPlugin(loyaltyMeta, () => import('./plugins/loyalty'));
  await loadPlugin(giftCardMeta, () => import('./plugins/gift-card'));
}
```

---

# 10. Built-in Plugins vs Runtime Installed Plugins

There are two plugin types.

## Type A: Built-in Plugins

These live in:

```txt
src/plugins/
```

They are compiled with the app.

Best for:

- First version of the POS
- Internal modules
- Stable business features
- Better security
- Easier builds
- Easier testing

Examples:

```txt
loyalty
gift-card
split-payment
custom-receipt
customer-display
```

## Type B: Runtime Installed Plugins

These live in:

```txt
installed-plugins/
```

They are installed after the app is deployed.

Best for:

- Customer-specific extensions
- Third-party integrations
- Region-specific tax modules
- Payment provider modules
- Custom reporting modules

Runtime plugin folder example:

```txt
installed-plugins/
└── my-customer-tax-plugin/
    ├── plugin.json
    ├── renderer.bundle.js
    ├── main.bundle.js
    ├── styles.css
    └── assets/
```

Recommended approach:

```txt
Phase 1: Use built-in plugins only.
Phase 2: Add enable/disable plugin settings.
Phase 3: Add runtime-installed plugin packages.
Phase 4: Add plugin signing and sandboxing.
```

This is safer and easier than trying to support full external plugins from day one.

---

# 11. Electron Layer Structure

Because this POS runs inside Electron, native and hardware services should be separated from React UI.

```txt
electron/
├── main/
│   ├── main.js
│   ├── windowManager.js
│   ├── ipcHandlers.js
│   ├── pluginMainLoader.js
│   ├── nativeServiceRegistry.js
│   └── security.js
│
├── preload/
│   └── preload.js
│
└── services/
    ├── printerService.js
    ├── barcodeService.js
    ├── cctvService.js
    ├── fileService.js
    ├── databaseService.js
    └── autoUpdaterService.js
```

## What belongs in Electron main process

| Feature | Location |
|---|---|
| Window creation | `electron/main/windowManager.js` |
| IPC handlers | `electron/main/ipcHandlers.js` |
| Printer integration | `electron/services/printerService.js` |
| Barcode scanner integration | `electron/services/barcodeService.js` |
| Local database | `electron/services/databaseService.js` |
| CCTV overlay | `electron/services/cctvService.js` |
| Runtime plugin native services | `electron/main/pluginMainLoader.js` |

## Preload bridge

```js
// electron/preload/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printReceipt: (payload) => ipcRenderer.invoke('printer:printReceipt', payload),
  scanBarcode: () => ipcRenderer.invoke('barcode:scan'),
  getInstalledPlugins: () => ipcRenderer.invoke('plugins:list'),
  enablePlugin: (pluginId) => ipcRenderer.invoke('plugins:enable', pluginId),
  disablePlugin: (pluginId) => ipcRenderer.invoke('plugins:disable', pluginId)
});
```

Security rules:

```txt
contextIsolation: true
nodeIntegration: false
Expose only safe APIs through preload
Do not give renderer full Node.js access
Validate every IPC payload
Check plugin permissions before native access
```

---

# 12. Payment Registry

Payments should be modular.

```txt
src/core/registries/paymentRegistry.js
```

Payment method shape:

```js
pluginAPI.registerPaymentMethod({
  id: 'gift-card',
  label: 'Gift Card',
  component: GiftCardPaymentPanel,
  processPayment: async (paymentRequest) => {
    return giftCardService.charge(paymentRequest);
  },
  order: 30,
  permission: 'payments:gift-card'
});
```

Core payment screen:

```jsx
import { getPaymentMethods } from '../../registries/paymentRegistry';

export function PaymentMethods({ order }) {
  const methods = getPaymentMethods();

  return methods.map((method) => {
    const Component = method.component;
    return <Component key={method.id} order={order} />;
  });
}
```

Recommended default payment plugins:

```txt
cash
card
gift-card
split-payment
store-credit
online-wallet
```

---

# 13. Receipt Registry

Receipts should not be hardcoded.

```txt
src/core/registries/receiptRegistry.js
```

Receipt template example:

```js
pluginAPI.registerReceiptTemplate({
  id: 'restaurant-receipt',
  label: 'Restaurant Receipt',
  component: RestaurantReceiptTemplate,
  printRenderer: restaurantPrintRenderer
});
```

Use receipt registry for:

- POS receipt
- Kitchen receipt
- Tax invoice
- Customer-specific receipt
- Return receipt
- Gift receipt

Core usage:

```js
const template = receiptRegistry.getActiveTemplate();
await printer.print(template.render(order));
```

---

# 14. Theme Registry

Themes are runtime CSS variable overrides.

```js
pluginAPI.registerTheme('customer-brand', {
  '--color-primary': '#1d4ed8',
  '--color-secondary': '#111827',
  '--receipt-width': '320px'
});
```

Theme application:

```js
export function applyThemeVariables(variables) {
  const root = document.documentElement;

  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}
```

Use this for:

- Light/dark mode
- Customer branding
- Store-specific color scheme
- Kiosk mode sizing
- Touchscreen mode
- Receipt dimensions

---

# 15. Styling Rules for Modularity

Use:

```txt
CSS Modules + CSS Variables
```

Avoid using Tailwind as the main styling system for this plugin-based POS.

Reason:

- CSS Modules isolate styles by file.
- CSS Variables allow runtime theme changes.
- Plugins can safely override styles.
- Removing a plugin leaves no leftover base changes.
- Complex POS layouts need precision CSS.

## Required styling rules

```txt
1. Every component gets its own .module.css file.
2. Do not hard-code colors in component CSS.
3. Use CSS variables for color, spacing, radius, sizing, and fonts.
4. Core files must not import plugin CSS directly.
5. Plugins must keep their CSS inside their own folder.
6. Base components should accept className.
7. Important base components should support replaceStyles.
8. Use all: revert only when a plugin needs a clean CSS reset.
```

## Preferred override order

```txt
1. CSS Variables      - broad theme/branding changes
2. className prop     - small component override
3. CSS Modules        - isolated plugin styles
4. CSS composes       - reusable style variants
5. replaceStyles      - full visual replacement
6. all: revert        - emergency clean reset
```

## Example: className override

```jsx
<Button className={styles.loyaltyButton}>Apply Points</Button>
```

```css
.loyaltyButton {
  background: var(--loyalty-color);
  border: 2px solid var(--loyalty-border);
}
```

## Example: full style replacement

```jsx
<Button replaceStyles className={styles.kioskButton}>Pay Now</Button>
```

```css
.kioskButton {
  background: #111827;
  font-size: 24px;
  padding: 24px;
}
```

---

# 16. Plugin Communication Rules

Plugins should communicate through core systems, not direct imports.

Good communication paths:

```txt
Plugin -> Slot Registry -> UI extension
Plugin -> Hook Registry -> Business logic extension
Plugin -> Event Bus -> Listen to events
Plugin -> Service Registry -> Shared services
Plugin -> Payment Registry -> Payment methods
Plugin -> Receipt Registry -> Receipt templates
Plugin -> Theme Registry -> Theme variables
```

Bad communication paths:

```txt
Plugin directly edits core file
Plugin imports another plugin internal file
Plugin mutates core store directly
Plugin accesses Electron IPC directly without permission
Plugin overrides global CSS selectors
```

---

# 17. Best Plugin Install/Uninstall Flow

## Install flow

```txt
1. User selects plugin package.
2. App validates package format.
3. App reads plugin.json.
4. App checks app version compatibility.
5. App checks required permissions.
6. App verifies plugin signature if available.
7. App copies plugin into installed-plugins/.
8. App marks plugin as installed but disabled.
9. Admin enables plugin from settings.
10. Plugin loader registers plugin on next startup or immediately if hot-load is supported.
```

## Enable flow

```txt
1. Admin enables plugin.
2. Core loads plugin manifest.
3. Core creates restricted pluginAPI.
4. Plugin registers slots/hooks/services/screens.
5. Plugin appears in UI.
```

## Disable flow

```txt
1. Admin disables plugin.
2. Core unregisters plugin slots/hooks/events/screens.
3. Core stops plugin services.
4. Plugin UI disappears.
5. Plugin data remains unless admin deletes it.
```

## Uninstall flow

```txt
1. Admin uninstalls plugin.
2. Core disables plugin first.
3. Core removes plugin files.
4. Core removes plugin settings.
5. Core optionally keeps or deletes plugin data based on admin choice.
```

Important:

```txt
Every registry entry must store pluginId so it can be removed cleanly.
```

Example:

```js
registerSlot('pos.cart.footer', {
  id: 'loyalty-cart-footer',
  pluginId: 'loyalty',
  component: LoyaltyCartFooter
});
```

Then disable/uninstall can remove everything from that plugin:

```js
removeEntriesByPluginId('loyalty');
```

---

# 18. Plugin Permissions

Plugins must declare permissions in `plugin.json`.

Example:

```json
{
  "permissions": [
    "orders:read",
    "orders:update",
    "customers:read",
    "payments:create",
    "printer:use"
  ]
}
```

Permission examples:

```txt
orders:read
orders:create
orders:update
orders:delete
customers:read
customers:update
payments:create
payments:refund
printer:use
barcode:read
settings:read
settings:update
reports:view
hardware:cctv
```

The plugin API should expose only allowed services.

Example:

```js
function getServiceForPlugin(pluginMeta, serviceName) {
  const requiredPermission = servicePermissionMap[serviceName];

  if (!pluginMeta.permissions.includes(requiredPermission)) {
    throw new Error(`Plugin ${pluginMeta.id} does not have permission: ${requiredPermission}`);
  }

  return serviceRegistry.getService(serviceName);
}
```

---

# 19. Efficient Development Strategy

Do not build the most complex plugin system on day one.

Use this roadmap:

## Phase 1: Modular folder structure

```txt
src/core/
src/plugins/
registries
slots
hooks
events
CSS Modules
CSS Variables
```

Plugins are bundled inside the app.

## Phase 2: Enable/disable plugins

Add:

```txt
pluginRegistry
plugin settings screen
enabledPlugins config
unregister by pluginId
```

## Phase 3: Runtime installed plugins

Add:

```txt
installed-plugins/
plugin package validation
manifest reader
signature verification
safe dynamic loading
```

## Phase 4: Sandboxed third-party plugins

Add:

```txt
plugin sandbox
restricted APIs
permission prompts
separate plugin process
crash isolation
```

This gives speed now and extensibility later.

---

# 20. Best Practical Scenario for This POS

For this POS system, the best-case scenario is:

```txt
Use built-in plugins for main business modules.
Use runtime-installed plugins only for customer-specific extensions.
Use CSS Modules and CSS Variables for styling.
Use registries, slots, hooks, and events for modularity.
Keep Electron native services behind preload and IPC.
```

Recommended module split:

```txt
Core POS:
- Login
- Products
- Cart
- Orders
- Basic payment flow
- Basic receipt
- Settings shell
- Plugin manager

Built-in plugins:
- Cash payment
- Card payment
- Split payment
- Gift card
- Loyalty
- Customer display
- CCTV overlay
- Custom receipt
- Reports

Runtime external plugins:
- Customer-specific tax rule
- Regional invoice format
- Custom payment provider
- Store-specific promotion
- Custom hardware integration
```

---

# 21. Naming Conventions

## Folders

```txt
kebab-case for plugin folders
PascalCase for component folders
camelCase for utility files
```

Examples:

```txt
plugins/split-payment/
components/ProductCard/
utils/formatCurrency.js
```

## Registries

```txt
registerX
getX
getAllX
removeX
removeByPluginId
```

Examples:

```js
registerSlot()
getSlotItems()
removeSlot()
removeSlotsByPluginId()
```

## Events

Use dot naming:

```txt
cart.itemAdded
order.paid
payment.failed
plugin.enabled
```

## Hooks

Use lifecycle naming:

```txt
cart.beforeAddItem
cart.afterAddItem
payment.beforeStart
receipt.beforePrint
```

## Slots

Use UI location naming:

```txt
pos.cart.footer
payment.methods
receipt.footer
settings.menu
```

---

# 22. What Goes Where

| Feature | Folder/File |
|---|---|
| Root React app | `src/core/app/App.jsx` |
| App providers | `src/core/app/AppProviders.jsx` |
| Core routes | `src/core/app/Router.jsx` |
| Base Button | `src/core/components/Button/` |
| POS layout | `src/core/layouts/POSLayout/` |
| POS page | `src/core/pages/POSPage/` |
| Slot rendering | `src/core/slots/Slot.jsx` |
| Register slot | `src/core/registries/slotRegistry.js` |
| Business hooks | `src/core/registries/hookRegistry.js` |
| Event bus | `src/core/events/eventBus.js` |
| Plugin metadata tracking | `src/core/registries/pluginRegistry.js` |
| Payment methods | `src/core/registries/paymentRegistry.js` |
| Receipt templates | `src/core/registries/receiptRegistry.js` |
| Theme variables | `src/core/styles/variables.css` |
| Plugin theme overrides | `src/plugins/plugin-name/styles/` |
| Loyalty plugin | `src/plugins/loyalty/` |
| Gift card plugin | `src/plugins/gift-card/` |
| Split payment plugin | `src/plugins/split-payment/` |
| Electron printer service | `electron/services/printerService.js` |
| Electron preload bridge | `electron/preload/preload.js` |
| IPC handlers | `electron/main/ipcHandlers.js` |
| Runtime external plugins | `installed-plugins/` |

---

# 23. Anti-Patterns to Avoid

Avoid these patterns:

```txt
1. Plugins editing core component files.
2. Plugins modifying global CSS selectors like .button or div.
3. Business logic inside UI components.
4. Payment methods hardcoded in PaymentPage.
5. Receipt template hardcoded in printer service.
6. Direct plugin-to-plugin imports.
7. Direct renderer access to Node.js APIs.
8. Hard-coded colors and spacing in component CSS.
9. One giant services folder with unrelated logic.
10. One plugin doing too many jobs.
```

Bad example:

```js
// PaymentPage.jsx
if (giftCardEnabled) {
  showGiftCardPayment();
}
```

Good example:

```js
const paymentMethods = paymentRegistry.getAll();
```

Bad example:

```css
.button {
  background: red;
}
```

Good example:

```css
.myPluginButton {
  background: var(--my-plugin-button-bg);
}
```

---

# 24. Testing Strategy

Recommended test folders:

```txt
src/
├── core/
│   └── __tests__/
│
├── plugins/
│   └── loyalty/
│       └── __tests__/
```

Test these areas:

```txt
Plugin manifest validation
Plugin registration
Slot rendering
Hook execution order
Event listener cleanup
Permission checks
Payment method registration
Receipt rendering
Plugin disable/uninstall cleanup
```

Important tests:

```js
it('removes all slot entries when plugin is disabled', () => {});
it('runs hooks in correct order', () => {});
it('blocks plugin from accessing service without permission', () => {});
it('renders payment methods from registry', () => {});
```

---

# 25. Final Recommended Structure

Use this as the final target structure:

```txt
pos-app/
├── electron/
│   ├── main/
│   │   ├── main.js
│   │   ├── windowManager.js
│   │   ├── ipcHandlers.js
│   │   ├── pluginMainLoader.js
│   │   ├── nativeServiceRegistry.js
│   │   └── security.js
│   │
│   ├── preload/
│   │   └── preload.js
│   │
│   └── services/
│       ├── printerService.js
│       ├── barcodeService.js
│       ├── cctvService.js
│       ├── databaseService.js
│       └── autoUpdaterService.js
│
├── src/
│   ├── core/
│   │   ├── app/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── registries/
│   │   ├── slots/
│   │   ├── hooks/
│   │   ├── events/
│   │   ├── services/
│   │   ├── stores/
│   │   ├── utils/
│   │   ├── constants/
│   │   ├── styles/
│   │   ├── permissions/
│   │   ├── types/
│   │   └── config/
│   │
│   ├── plugins/
│   │   ├── loyalty/
│   │   ├── gift-card/
│   │   ├── split-payment/
│   │   ├── cctv-overlay/
│   │   ├── customer-display/
│   │   ├── custom-receipt/
│   │   └── analytics/
│   │
│   ├── main.jsx
│   ├── bootstrap.js
│   ├── pluginLoader.js
│   └── routes.jsx
│
├── installed-plugins/
├── public/
├── docs/
├── package.json
└── vite.config.js
```

---

# 26. Final Decision

The best modularity approach for this POS system is:

```txt
Core + Plugin architecture
with Registry + Slot + Hook + Event systems
and CSS Modules + CSS Variables for styling.
```

This gives the best balance of:

- Speed
- Maintainability
- Plugin safety
- Runtime extensibility
- Clean uninstall
- Precise POS UI control
- Long-term scalability

The most important implementation rule is:

```txt
The core owns the platform.
Plugins only register extensions through official APIs.
```

