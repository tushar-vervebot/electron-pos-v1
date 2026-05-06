# src/plugins/loyalty

**Loyalty Program** plugin – adds loyalty points, tier discounts, and customer rewards.

## Files to create

```
loyalty/
├── plugin.json
├── index.js
├── components/
│   ├── LoyaltyButton/
│   ├── LoyaltyBadge/
│   └── LoyaltyPopup/
├── pages/
│   └── LoyaltyDashboard.jsx
├── hooks/
│   ├── applyLoyaltyDiscount.js
│   └── calculateLoyaltyPoints.js
├── services/
│   ├── loyaltyService.js
│   └── loyaltyApi.js
├── slots/
│   ├── LoyaltyCartFooter.jsx      → registers to pos.cart.footer
│   └── LoyaltyCustomerBadge.jsx   → registers to pos.customer.badge
├── events/
│   └── loyaltyEventListeners.js   → listens to order.paid
├── styles/
│   └── loyaltyTheme.css
└── assets/
    └── loyalty-icon.svg
```

## Permissions required

```json
["customers:read", "customers:update", "orders:read", "orders:update"]
```

## Hooks registered

- `cart.afterTotalCalculate` – applies loyalty tier discount
- `payment.afterSuccess` – credits earned points

## Slots registered

- `pos.cart.footer` – shows points balance and redemption input
- `pos.customer.badge` – shows customer tier badge
