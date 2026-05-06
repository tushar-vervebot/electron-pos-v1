# src/plugins/customer-display

**Customer Display** plugin – second-screen customer-facing display window.

## Files to create

```
customer-display/
├── plugin.json
├── index.js
├── pages/
│   └── CustomerDisplayPage.jsx    → full-screen React page for the second monitor
├── services/
│   └── customerDisplayService.js  → IPC bridge to open/control the display window
├── slots/
│   └── CustomerDisplayFooter.jsx  → registers to customer.display.footer
├── events/
│   └── customerDisplayListeners.js → listens to cart.itemAdded, cart.cleared, order.paid
└── styles/
    └── customerDisplay.module.css
```

## Permissions required

```json
["orders:read"]
```

## Events listened

- `cart.itemAdded` / `cart.itemRemoved` / `cart.cleared` – updates the displayed cart
- `order.paid` – shows thank-you screen
