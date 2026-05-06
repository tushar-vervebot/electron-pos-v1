# src/plugins/cctv-overlay

**CCTV Overlay** plugin – overlays order/cart data on the CCTV camera feed.

## Files to create

```
cctv-overlay/
├── plugin.json
├── index.js
├── services/
│   └── cctvOverlayService.js    → talks to electron/services/cctvService.js via IPC
├── events/
│   └── cctvEventListeners.js    → listens to cart.itemAdded, order.paid
└── styles/
    └── cctvOverlay.module.css
```

## Permissions required

```json
["hardware:cctv", "orders:read"]
```

## Events listened

- `cart.itemAdded` – pushes item info to overlay
- `order.paid` – pushes transaction summary to overlay
