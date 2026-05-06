# src/core/registries

**Plugin registries** – the backbone of the modular plugin system.

## What goes here

| File | Purpose |
|---|---|
| `pluginRegistry.js` | Tracks installed and enabled plugins |
| `screenRegistry.js` | Stores plugin-provided screens / pages |
| `componentRegistry.js` | Stores replaceable UI component overrides |
| `slotRegistry.js` | Stores UI components injected into slot areas |
| `hookRegistry.js` | Stores ordered business lifecycle hook handlers |
| `eventRegistry.js` | Stores event listener registrations |
| `serviceRegistry.js` | Stores services provided by core or plugins |
| `paymentRegistry.js` | Stores available payment methods |
| `receiptRegistry.js` | Stores receipt templates and print renderers |
| `themeRegistry.js` | Stores CSS variable theme overrides |
| `settingsRegistry.js` | Stores plugin settings panels |
| `permissionRegistry.js` | Stores plugin permission declarations |
| `index.js` | Re-exports all registries for convenience |

## Rules

- Every registry entry must store the `pluginId` that registered it.
- Registries must support `removeByPluginId(id)` for clean plugin disable/uninstall.
- Core must not depend on any specific plugin's registry entry at startup.
