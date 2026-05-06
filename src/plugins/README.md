# src/plugins

**Built-in plugins** – bundled with the app and compiled at build time.

## Plugin folder structure

Every plugin follows this layout:

```
plugin-name/
├── plugin.json          Required – metadata, version, permissions, entry
├── index.js             Required – default export: register(pluginAPI)
├── components/          Optional – plugin-specific UI components
├── pages/               Optional – full screens added by this plugin
├── hooks/               Optional – business logic hook handlers
├── services/            Optional – plugin-specific API / business logic
├── slots/               Optional – components injected into core UI slots
├── events/              Optional – event listeners
├── styles/              Optional – CSS Modules and theme variable overrides
├── assets/              Optional – icons / images used only by this plugin
├── permissions.js       Optional – plugin-specific access rules
└── README.md            Recommended – developer documentation
```

## Plugins in this folder

| Plugin | Purpose |
|---|---|
| `order-notes/` | Add order notes and special instructions to cart items |
| `test-plugin/` | Developer sandbox plugin for testing the plugin API |
| `loyalty/` | Loyalty points, tier discounts, and customer rewards |
| `gift-card/` | Gift card balance check and payment method |
| `split-payment/` | Split a single order across multiple payment methods |
| `cctv-overlay/` | Overlay cart/order data on CCTV feed |
| `customer-display/` | Second-screen customer-facing display |
| `custom-receipt/` | Custom receipt templates and thermal print layouts |
| `analytics/` | Sales analytics dashboard and reporting |

## Rules

- Plugins register through `pluginAPI` only – never edit core files.
- Every registry entry must include `pluginId` for clean uninstall.
- Plugin CSS must stay inside the plugin's own `styles/` folder.
