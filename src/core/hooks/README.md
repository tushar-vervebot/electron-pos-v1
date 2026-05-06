# src/core/hooks

**Business lifecycle hooks** – let plugins modify data and business flow.

## What goes here

| File | Purpose |
|---|---|
| `lifecycleHooks.js` | Core hook runner (`runHooks`) |
| `useCart.js` | React hook for cart state and actions |
| `useOrders.js` | React hook for order state and actions |
| `usePayments.js` | React hook for payment flow |
| `useProducts.js` | React hook for product list |
| `useCustomers.js` | React hook for customer selection |
| `usePluginHooks.js` | Helper to register plugin hooks from a React component |

## Defined hook names

```
cart.beforeAddItem        cart.afterAddItem
cart.beforeRemoveItem     cart.afterRemoveItem
cart.beforeTotalCalculate cart.afterTotalCalculate
order.beforeCreate        order.afterCreate
order.beforeSave          order.afterSave
payment.beforeStart       payment.afterSuccess
payment.afterFailure      receipt.beforeRender
receipt.afterRender       receipt.beforePrint
receipt.afterPrint        sync.beforeUpload
sync.afterUpload
```

## Rules

- Hooks **can modify data** (unlike events).
- Hook handlers receive the current payload and must return the (possibly modified) payload.
- Hooks run in ascending `order` value (lower = earlier).
- Use hooks for: discounts, validation, total calculation, receipt modification.
