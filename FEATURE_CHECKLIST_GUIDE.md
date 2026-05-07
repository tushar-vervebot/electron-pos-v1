# FEATURE_CHECKLIST_GUIDE.md - Feature Checklists

Use this guide when you are adding a common feature type.

It is intentionally short.

---

## 1. Product Feature Checklist

Use this when adding product-related work such as product list changes, category behavior, pricing display, or search/filter updates.

### Files to check

- `src/core/pages/POSPage.jsx`
- `src/core/components/ProductCard.jsx`
- `src/core/stores/posStore.js`
- `src/core/services/api/apiClient.js`
- `src/core/services/storage/indexedDbService.js`

### Checklist

1. Add or update the product source in API or local storage
2. Make sure `posStore` fetches and stores the field you need
3. Update product list UI if a new field must be shown
4. Update cart logic if pricing behavior changed
5. Verify search/category/filter still works
6. Build the renderer and run the app

---

## 2. Payment Feature Checklist

Use this when adding cash/card methods, gift card flows, split payment, tender validation, or payment summary behavior.

### Files to check

- `src/core/pages/PaymentPage.jsx`
- `src/core/stores/posStore.js`
- `src/core/registries/paymentRegistry.js`
- `src/core/hooks/hookNames.js`
- `src/core/events/eventNames.js`

### Checklist

1. Decide whether this is built-in payment logic or plugin payment logic
2. Register the payment method if it is plugin-driven
3. Update checkout/store behavior in `posStore.js`
4. Emit or listen to the right payment/order events if other systems depend on them
5. Confirm totals, change, and receipt values still match
6. Build and test a full checkout flow

---

## 3. Receipt Feature Checklist

Use this when adding receipt text, totals, loyalty rows, footer content, print behavior, or custom templates.

### Files to check

- `src/core/pages/ReceiptPage.jsx`
- `src/core/registries/receiptRegistry.js`
- `src/core/slots/slotNames.js`
- `electron/preload/preload.js`
- `electron/main/main.js`

### Checklist

1. Update `ReceiptPage.jsx` if the built-in receipt UI changes
2. Use receipt slots if the change should be extendable by plugins
3. Use `receiptRegistry` if the whole template can be replaced
4. Check print behavior if the receipt change affects printer output
5. Verify totals, payment method, and footer details are correct
6. Test both screen rendering and printing path

---

## 4. Report Feature Checklist

Use this when adding sales summaries, dashboards, filters, exports, or manager reporting screens.

### Files to check

- `src/core/pages/` for the report page
- `src/core/services/api/apiClient.js`
- `src/core/stores/posStore.js` or a page-local state flow
- `src/core/components/` for reusable report cards/tables

### Checklist

1. Add the API method for the report data
2. Decide whether report state is global or page-local
3. Create the report page/component
4. Add the screen to app navigation or register it via plugin
5. Handle loading, empty, and error states
6. Build and test with realistic data

---

## 5. Final Check For Any Feature

Before finishing any feature:

1. Make sure imports point to real files
2. Confirm the feature uses the current React app, not the legacy renderer, unless intended
3. Confirm shared state changes are in `posStore.js` when appropriate
4. Confirm plugin-related behavior is wired on both the host and plugin sides
5. Run:

```bash
npm run renderer:build
npm start
```