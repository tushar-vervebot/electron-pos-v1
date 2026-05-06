# src/plugins/split-payment

**Split Payment** plugin – split a single order across multiple payment methods.

## Files to create

```
split-payment/
├── plugin.json
├── index.js
├── components/
│   └── SplitPaymentPanel/
├── services/
│   └── splitPaymentService.js
├── slots/
│   └── SplitPaymentMethod.jsx    → registers to payment.methods
└── styles/
    └── splitPayment.module.css
```

## Permissions required

```json
["payments:create", "orders:read", "orders:update"]
```

## Slots registered

- `payment.methods` – adds split payment option in the payment screen
