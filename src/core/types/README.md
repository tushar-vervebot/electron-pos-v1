# src/core/types

Shared **type definitions** (TypeScript types or JSDoc `@typedef`).

## What goes here

| File | Purpose |
|---|---|
| `plugin.types.ts` | `PluginMeta`, `PluginAPI`, `SlotItem`, `HookHandler` |
| `order.types.ts` | `Order`, `OrderItem`, `OrderStatus` |
| `payment.types.ts` | `PaymentMethod`, `PaymentRequest`, `PaymentResult` |
| `receipt.types.ts` | `ReceiptTemplate`, `ReceiptLine` |
| `customer.types.ts` | `Customer`, `LoyaltyTier` |
| `product.types.ts` | `Product`, `Category`, `ProductPage` |

## Rules

- Even in a JavaScript project, define types with **JSDoc `@typedef`** as a minimum.
- Migrate to TypeScript types (`.ts` / `.d.ts`) when the project is ready.
- Import types across the codebase using `/** @type {import('./types/order.types').Order} */`.
