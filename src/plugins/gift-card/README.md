# src/plugins/gift-card

**Gift Card** plugin – gift card balance check, redemption, and payment method.

## Files to create

```
gift-card/
├── plugin.json
├── index.js
├── components/
│   └── GiftCardInput/
├── pages/
│   └── GiftCardManagementPage.jsx
├── hooks/
│   └── applyGiftCardPayment.js
├── services/
│   ├── giftCardService.js
│   └── giftCardApi.js
├── slots/
│   └── GiftCardPaymentMethod.jsx   → registers to payment.methods
└── styles/
    └── giftCardTheme.css
```

## Permissions required

```json
["payments:create", "orders:read"]
```

## Slots registered

- `payment.methods` – adds gift card as a selectable payment option
