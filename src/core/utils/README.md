# src/core/utils

**Pure helper functions** – no React state, no side effects, no plugin logic.

## What goes here

| File | Purpose |
|---|---|
| `currency.js` | Format currency values, parse amounts |
| `tax.js` | Tax calculation helpers |
| `date.js` | Date formatting and parsing |
| `uuid.js` | UUID / ID generation |
| `debounce.js` | Debounce and throttle utilities |
| `validation.js` | Input validation helpers |
| `receiptFormatter.js` | Formats order data into receipt-ready structure |
| `objectUtils.js` | Deep clone, merge, pick, omit helpers |

## Rules

- Every function must be **pure** (same input → same output, no side effects).
- No imports from React, stores, registries, or services.
- Easy to unit-test in isolation.
