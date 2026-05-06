# src/plugins/analytics

**Analytics** plugin – sales dashboard, reports, and data export.

## Files to create

```
analytics/
├── plugin.json
├── index.js
├── pages/
│   ├── AnalyticsDashboard.jsx
│   └── SalesReportPage.jsx
├── components/
│   ├── SalesChart/
│   ├── TopProductsTable/
│   └── RevenueCard/
├── services/
│   └── analyticsService.js        → aggregates data from order history
├── events/
│   └── analyticsListeners.js      → listens to order.paid for real-time stats
└── styles/
    └── analytics.module.css
```

## Permissions required

```json
["orders:read", "reports:view"]
```

## Slots registered

- `settings.menu` – adds "Analytics" link to settings navigation
