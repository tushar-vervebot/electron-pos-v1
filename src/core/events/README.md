# src/core/events

**Event bus** – decoupled communication between core and plugins.

## What goes here

| File | Purpose |
|---|---|
| `eventBus.js` | `on`, `off`, `emit` implementation |
| `eventNames.js` | Centralised list of all event name constants |
| `emitters.js` | Core-side helper functions that emit events |
| `listeners.js` | Core-side default event listeners |

## Defined event names

```
app.started             plugin.enabled         plugin.disabled
cart.itemAdded          cart.itemRemoved        cart.cleared
order.created           order.saved             order.paid
payment.started         payment.success         payment.failed
receipt.printed         customer.selected       sync.completed
hardware.barcodeScanned hardware.printerError
```

## Hooks vs Events

| Type | Can modify data? | Use for |
|---|---|---|
| Hook | Yes | Discounts, validation, total calculation, receipt modification |
| Event | No | Analytics, logs, sync, CCTV overlay, customer display updates |

## Rules

- Events are **fire-and-forget** – plugins observe but do not block the flow.
- Always return the unsubscribe function from `on()` and call it on cleanup.
- Never emit events synchronously inside another event handler.
