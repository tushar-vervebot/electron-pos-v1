# src/core/pages

Core **application pages** (stable, always present).

## What goes here

```
pages/
├── LoginPage.jsx       – Authentication screen
├── POSPage.jsx         – Main billing / product grid screen
├── PaymentPage.jsx     – Payment flow
├── ReceiptPage.jsx     – Receipt preview and print
├── TicketPage.jsx      – Open tickets / orders list
├── InventoryPage.jsx   – Inventory overview
├── ReportsPage.jsx     – Sales reports shell
├── SettingsPage.jsx    – Settings shell (plugin panels inject here)
└── NotFoundPage.jsx    – 404 fallback
```

## Rules

- Core pages are **always present** regardless of plugins.
- Plugins add pages via `screenRegistry`, not by editing this folder.
- Pages should use `<Slot>` components to expose extension points.
- Pages must not contain payment or receipt logic directly – use services.
