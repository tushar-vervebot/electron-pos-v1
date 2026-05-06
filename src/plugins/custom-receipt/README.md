# src/plugins/custom-receipt

**Custom Receipt** plugin – thermal receipt templates, kitchen tickets, and tax invoices.

## Files to create

```
custom-receipt/
├── plugin.json
├── index.js
├── components/
│   └── ReceiptPreview/
├── templates/
│   ├── StandardReceiptTemplate.jsx
│   ├── KitchenTicketTemplate.jsx
│   └── TaxInvoiceTemplate.jsx
├── services/
│   └── receiptPrintService.js      → sends ESC/POS commands via IPC
├── hooks/
│   └── modifyReceiptData.js        → hook: receipt.beforeRender
└── styles/
    └── receipt.module.css
```

## Permissions required

```json
["printer:use", "orders:read"]
```

## Hooks registered

- `receipt.beforeRender` – injects custom fields or modifies receipt data
- `receipt.beforePrint` – selects the right template for the order type
