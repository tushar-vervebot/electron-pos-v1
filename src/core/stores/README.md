# src/core/stores

Global **state stores** (Zustand recommended for POS).

## What goes here

| File | Purpose |
|---|---|
| `posStore.js` | Main POS store: products, cart, orders, screen state, sync status |
| `cartStore.js` | Isolated cart state if split from posStore |
| `orderStore.js` | Open orders and order history |
| `authStore.js` | Authenticated user, roles, session token |
| `productStore.js` | Product list, categories, pagination |
| `customerStore.js` | Selected customer, customer search |
| `settingsStore.js` | App settings and plugin configuration |
| `pluginStore.js` | Enabled plugins list, plugin metadata |
| `index.js` | Re-exports all stores |

## Rules

- Plugins must **not directly mutate** core stores.
- Expose safe action functions (e.g. `addCartItem`, `setDiscount`) and let plugins call those.
- Alternatively plugins use the **hook system** to intercept data before it hits the store.
