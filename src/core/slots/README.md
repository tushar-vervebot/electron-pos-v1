# src/core/slots

**UI slot system** – fixed extension points where plugins inject components.

## What goes here

| File | Purpose |
|---|---|
| `Slot.jsx` | Renders all components registered to a named slot |
| `SlotProvider.jsx` | React context provider for the slot registry |
| `slotRenderer.js` | Low-level slot item rendering logic |
| `slotNames.js` | Centralised list of all slot name constants |
| `slotTypes.js` | Type definitions for slot item shape |

## Defined slot names

```
app.header.left            app.header.right
app.sidebar.top            app.sidebar.bottom
pos.product.card.badge     pos.cart.header
pos.cart.item.afterName    pos.cart.footer
pos.cart.actions           payment.methods
payment.summary.afterTotal receipt.header
receipt.footer             settings.menu
settings.panel             order.actions
customer.display.footer
```

## Rules

- Use a slot when a plugin needs to add **visible UI** inside an existing page.
- Slots render nothing if no plugin has registered for them.
- Slot components receive a `props` object passed by the host page.
