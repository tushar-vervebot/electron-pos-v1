# PLUGIN_AUTHOR_GUIDE.md - Plugin Author Guide

This guide is only for people building or editing plugins.

---

## 1. Plugin Model

Plugins in this project can have two parts.

### Main-process side

Used for:

- filesystem work
- IPC handlers
- Electron window control
- desktop integration
- long-running or background logic

Common file:

```text
src/plugins/<plugin>/main.js
```

Format:

- CommonJS
- loaded by `src/pluginLoader.js`
- must work with `require()`

### Frontend side

Used for:

- slot injection
- frontend hooks and events
- payment method registration
- receipt template registration
- theme/settings/component registration

Common file:

```text
src/plugins/<plugin>/frontend.js
```

Format:

- ESM
- loaded by `src/bootstrap.js`
- must work with `import()`

Important rule:

Do not point `plugin.json -> entry` at an ESM frontend file.

`entry` is for the main-process plugin loader.

---

## 2. Recommended Plugin Folder

```text
src/plugins/
└── my-plugin/
    ├── plugin.json
    ├── main.js
    ├── frontend.js
    ├── slots/
    ├── services/
    └── components/
```

You only need the files your plugin actually uses.

---

## 3. plugin.json

Example:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "entry": "main.js",
  "enabled": false,
  "description": "What this plugin does."
}
```

Rules:

1. `id` must be lowercase and unique
2. `entry` is the main-process entry file
3. `enabled` controls auto-loading for the main-process loader
4. add `permissions` if your plugin uses guarded services/features

---

## 4. Main-Process Plugin Example

```js
'use strict';

module.exports = {
  activate(api) {
    api.logger.info('My plugin activated');

    api.ipc.handle('do-something', async (_event, payload) => {
      return { ok: true, payload };
    });

    api.hooks.on('cart:checkout', (data) => {
      api.logger.info('Checkout received', data);
    });
  },

  deactivate() {},
};
```

Use main-process plugins for:

- IPC
- local files
- printer/OS integration
- secondary windows
- long-lived data storage

---

## 5. Frontend Plugin Example

```js
import { MyPluginRow } from './slots/MyPluginRow';

export default function register(pluginAPI) {
  pluginAPI.registerSlot('pos.cart.footer', {
    id: 'my-plugin-row',
    component: MyPluginRow,
    order: 20,
  });
}
```

Use frontend plugins for:

- slots
- screens
- hooks
- events
- settings panels
- themes
- components
- services
- payment methods
- receipt templates

---

## 6. How To Load A Frontend Plugin

Edit:

```text
src/bootstrap.js
```

Steps:

1. import the plugin manifest
2. add a `loadPlugin(...)` call
3. optionally gate it behind a flag in `src/core/config/featureFlags.js`

Pattern:

```js
import myPluginMeta from './plugins/my-plugin/plugin.json';

if (featureFlags.enableMyPlugin) {
  await loadPlugin(myPluginMeta, () => import('./plugins/my-plugin/frontend.js'));
}
```

---

## 7. Plugin API Cheatsheet

Frontend plugin API in `src/pluginAPI.js` supports:

- `registerScreen`
- `registerSlot`
- `registerHook`
- `registerService`
- `registerPaymentMethod`
- `registerReceiptTemplate`
- `registerTheme`
- `registerSettingsPanel`
- `registerComponent`
- `registerPermission`
- `getComponent`
- `getService`
- `events.on/off/emit`

Main-process plugin API from `src/pluginLoader.js` supports:

- `api.ipc.handle(...)`
- `api.hooks.on(...)`
- `api.logger.info/warn/error(...)`

---

## 8. Slots, Hooks, and Events

### Add a slot

1. define it in `src/core/slots/slotNames.js`
2. render `<Slot name={...} />` in the host component
3. register the plugin component into that slot

### Add a hook

1. define the hook name in `src/core/hooks/hookNames.js`
2. call `runHooks(...)` where the workflow happens
3. make sure payload shape is stable

### Add an event

1. define the event name in `src/core/events/eventNames.js`
2. emit it from the app
3. subscribe from the plugin

Use hooks for workflow control.

Use events for notifications.

---

## 9. Common Mistakes

1. Using ESM in the file pointed to by `plugin.json -> entry`
2. Forgetting to add the frontend plugin to `src/bootstrap.js`
3. Registering to a slot that is never rendered in the host app
4. Adding a new hook/event name but never wiring it into the actual workflow
5. Mixing Electron-only behavior into the frontend plugin file

---

## 10. Before You Finish A Plugin

Check all of these:

1. `plugin.json` has the right `entry`
2. CommonJS is used in `main.js`
3. ESM is used in `frontend.js`
4. new slots/hooks/events are wired on both sides
5. frontend plugin is loaded from `src/bootstrap.js` if needed
6. the plugin is enabled only when intended

Run:

```bash
npm run renderer:build
npm start
```

*** Add File: c:\Users\verve\Downloads\Electron\Electron\FEATURE_CHECKLIST_GUIDE.md
# FEATURE_CHECKLIST_GUIDE.md - Feature Checklists

Use this guide when you are adding a common feature type.

It is intentionally short.

---

## 1. Product Feature Checklist

Use this when adding product-related work such as product list changes, category behavior, pricing display, or search/filter updates.

### Files to check

- `src/core/pages/POSPage.jsx`
- `src/core/components/ProductCard.jsx`
- `src/core/stores/posStore.js`
- `src/core/services/api/apiClient.js`
- `src/core/services/storage/indexedDbService.js`

### Checklist

1. Add or update the product source in API or local storage
2. Make sure `posStore` fetches and stores the field you need
3. Update product list UI if a new field must be shown
4. Update cart logic if pricing behavior changed
5. Verify search/category/filter still works
6. Build the renderer and run the app

---

## 2. Payment Feature Checklist

Use this when adding cash/card methods, gift card flows, split payment, tender validation, or payment summary behavior.

### Files to check

- `src/core/pages/PaymentPage.jsx`
- `src/core/stores/posStore.js`
- `src/core/registries/paymentRegistry.js`
- `src/core/hooks/hookNames.js`
- `src/core/events/eventNames.js`

### Checklist

1. Decide whether this is built-in payment logic or plugin payment logic
2. Register the payment method if it is plugin-driven
3. Update checkout/store behavior in `posStore.js`
4. Emit or listen to the right payment/order events if other systems depend on them
5. Confirm totals, change, and receipt values still match
6. Build and test a full checkout flow

---

## 3. Receipt Feature Checklist

Use this when adding receipt text, totals, loyalty rows, footer content, print behavior, or custom templates.

### Files to check

- `src/core/pages/ReceiptPage.jsx`
- `src/core/registries/receiptRegistry.js`
- `src/core/slots/slotNames.js`
- `electron/preload/preload.js`
- `electron/main/main.js`

### Checklist

1. Update `ReceiptPage.jsx` if the built-in receipt UI changes
2. Use receipt slots if the change should be extendable by plugins
3. Use `receiptRegistry` if the whole template can be replaced
4. Check print behavior if the receipt change affects printer output
5. Verify totals, payment method, and footer details are correct
6. Test both screen rendering and printing path

---

## 4. Report Feature Checklist

Use this when adding sales summaries, dashboards, filters, exports, or manager reporting screens.

### Files to check

- `src/core/pages/` for the report page
- `src/core/services/api/apiClient.js`
- `src/core/stores/posStore.js` or a page-local state flow
- `src/core/components/` for reusable report cards/tables

### Checklist

1. Add the API method for the report data
2. Decide whether report state is global or page-local
3. Create the report page/component
4. Add the screen to app navigation or register it via plugin
5. Handle loading, empty, and error states
6. Build and test with realistic data

---

## 5. Final Check For Any Feature

Before finishing any feature:

1. Make sure imports point to real files
2. Confirm the feature uses the current React app, not the legacy renderer, unless intended
3. Confirm shared state changes are in `posStore.js` when appropriate
4. Confirm plugin-related behavior is wired on both the host and plugin sides
5. Run:

```bash
npm run renderer:build
npm start
```