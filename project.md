# Syncing & Writes — Architecture Blueprint

## 1. Core Architecture — Hybrid SQLite + React Memory

SQLite = on-disk source of truth. `allProducts[]` = fast runtime copy. **SQLite written first — memory only updates after SQLite succeeds.**

| Problem | React Only | SQLite Only | Hybrid |
|---|---|---|---|
| Cold start | ❌ 10–30s | ✅ Instant | ✅ Instant |
| Search speed | ✅ 2–5ms | ❌ 50–200ms | ✅ 2–5ms |
| Offline | ❌ | ✅ | ✅ |
| Data freshness | ✅ Always | ❌ Depends | ✅ After bg sync |
| RAM usage | ❌ All in memory | ✅ Low | ❌ Same as React |

---

## 2. SQLite Tables

| Table | Purpose |
|---|---|
| `cache_products` | Main product catalogue (60k rows) |
| `cache_products_temp` | Used only during full catalogue swap — never queried by UI |
| `cache_barcodes` | Alternate barcodes per product |
| `cache_categories` | Category tree for filter buttons |
| `cache_taxes` | Tax rates — queried at checkout |
| `cache_pricelists` | Pricelist rules per customer segment |
| `cache_payment_methods` | Available payment options per terminal |
| `cache_customers` | Customer records for linking to sales |
| `cache_pos_config` | Terminal config (key/value) |
| `cache_users_permissions` | Cashier roles and permissions |
| `sync_state` | Last revision + sync status per entity type |
| `app_settings` | Global flags: `catalogue_ready`, `schema_version`, counts |
| `cart_draft` | Auto-saved cart snapshots for crash recovery |
| `offline_order_queue` | Completed sales waiting to sync to backend |
| `payment_state` | Current payment step — survives crashes |
| `schema_migrations` | Which migration versions have run |

**Key columns on `cache_products`:**
`product_id`, `name`, `barcode`, `list_price`, `category_id`, `tax_ids` (JSON), `active` (1/0 soft-delete), `write_date`, `raw_json`

---

## 3. Startup PRAGMAs

Run on every database open:

```sql
PRAGMA journal_mode = WAL;       -- reads and writes don't block each other
PRAGMA synchronous = NORMAL;     -- faster bulk writes
PRAGMA foreign_keys = ON;        -- enforce referential integrity
PRAGMA busy_timeout = 5000;      -- wait 5s on lock before erroring
```

On clean shutdown: `PRAGMA wal_checkpoint(TRUNCATE)`

---

## 4. Phase 1 — First Launch

Runs once when `catalogue_ready ≠ true`.

1. Set `catalogue_ready = false`, show loading screen
2. Fetch all product pages in parallel batches (e.g. 10 × 500)
3. Write each batch into `cache_products_temp` using a transaction
4. Checkpoint progress after each chunk (resumable on crash)
5. Validate `actual_count == expected_count`
6. Atomic swap: rename `cache_products_temp` → `cache_products`, set `catalogue_ready = true`
7. Load `allProducts[]` from SQLite, show grid

If interrupted, the next launch resumes from the last saved chunk — not from scratch.

---

## 5. Phase 2 — Normal Launch

Every launch after the first:

1. **Run health checks** (Section 16)
2. **Run pending migrations** (Section 18)
3. **Load from SQLite** → `allProducts[]` → grid visible in under 1 second
4. **Background delta sync** (non-blocking, after grid is shown):
   - Fetch `GET /sync/products?after_revision=N`
   - Write only changed rows — unchanged products are skipped
   - Save new revision in the same transaction as the data write

---

## 6. Phase 3 — Search (Runtime)

SQLite is **never touched** during search or filter. All filtering runs against `allProducts[]` in memory — 2–5ms for 60k items.

Barcode scan uses an in-memory `_barcodeMap` (O(1)). Only falls back to SQLite if the barcode is not in the map.

---

## 7. Phase 4 — Real-Time WebSocket Updates

Order of operations is fixed — never reversed:

1. Validate: revision > last applied, payload has required fields
2. Write to SQLite (transactionally, with revision update in same transaction)
3. If step 2 failed → stop. Memory is not touched.
4. Patch `allProducts[]` in memory → re-render grid

If many updates arrive in quick succession, batch memory patches and re-render once.

---

## 8. Phase 5 — Offline Mode

- SQLite load works normally — grid shows last known data
- Background sync fails silently — caught, logged to `sync_state`
- Status badge updates (Section 21)
- Retry backoff begins (Section 19)
- Sync resumes automatically when network returns

Cashier can: search, scan, add to cart, take cash payments.
Cashier cannot: get price updates until reconnected.

---

## 9. Write Rules

| Situation | Rule |
|---|---|
| Bulk insert (500+ products) | Wrap in `db.transaction()` — one disk flush instead of 500 |
| Data + revision update | Always in the same transaction — never separate |
| All writes | Route through a single `SQLiteWriteQueue` — explicit ordering |
| Cart save | Reactive auto-save (debounced 200ms) via Zustand subscriber — never call manually |

---

## 10. Full Catalogue Swap (Temp Table Pattern)

Used for: Phase 1, forced resync, major backend migration. **Not used for incremental delta sync.**

1. Download all products → `cache_products_temp` (live table untouched)
2. Validate count + revision
3. Atomic transaction: rename temp → `cache_products`, set `catalogue_ready = true`
4. Reload `allProducts[]` via IPC

The cashier never sees a partial catalogue. Either the old complete one or the new complete one is active — never both at once.

---

## 11. Revision Numbers (not timestamps)

Timestamps miss records when the POS clock drifts from the server. Revision numbers are server-assigned integers — no clocks involved.

Each entity has its own revision counter in `sync_state` — products, taxes, customers, etc. sync independently on different schedules.

Revision must be saved in the same transaction as the data it describes.

---

## 12. Cart Draft Persistence

Every cart change auto-saves a snapshot to `cart_draft`. On crash, the cashier sees a recovery prompt with item count, total, and age before restoring.

**Status values:** `active` → `converted` / `abandoned` / `recovered`

Cart is only reset after the order insert + `PAYMENT_APPROVED_LOCAL` both succeed in the same transaction.

---

## 13. Offline Order Queue

`local_order_uuid` is the idempotency key — sent on every retry. The backend uses it to deduplicate.

`payload_json` must be a full sale-time snapshot (product name, unit price, tax amount, discount, subtotal). Never store only a product ID and resolve prices later.

**Status values:** `pending` → `syncing` → `synced` / `failed`

After the retry cap (e.g. 24 hours), set `sync_status = 'failed'` and surface in manager review.

---

## 14. Payment State Machine

Each step writes its state to SQLite before proceeding. On startup, if an unresolved payment state is found, show a recovery screen before the cashier screen loads.

| State | Recovery action |
|---|---|
| `PAYMENT_STARTED` | Ask cashier to retry or cancel |
| `PAYMENT_APPROVED_LOCAL` | Confirm order is in queue, show "order saved" |
| `PAYMENT_FAILED` | Cart intact — cashier retries |
| `PAYMENT_CANCELLED` | Cart intact — no action |
| `PAYMENT_REVERSED` | Sync reversal to backend |

The order insert and `PAYMENT_APPROVED_LOCAL` write must be in the same SQLite transaction.

---

## 15. Soft Deletion

Products are **never hard-deleted**. They are marked `active = 0`.

This is mandatory because deleted products may still be referenced by: past receipts, refunds, offline orders in the queue, and active carts. Hard deletion breaks all of these.

If a product in the active cart is soft-deleted mid-session, show a warning and ask the cashier to remove it before proceeding.

Retention: maintenance job hard-deletes `active = 0` rows after 90 days if no pending orders reference them.

---

## 16. Startup Health Checks

Run in this order (cheapest first) before loading anything:

1. Database opens without error
2. `schema_version` meets minimum required version
3. `catalogue_ready = true` in `app_settings`
4. `COUNT(*) WHERE active=1` in `cache_products` exceeds minimum threshold
5. Required indexes all exist in `sqlite_master`
6. `PRAGMA quick_check` returns `ok`

| Failure | Recovery |
|---|---|
| DB open fails | Phase 1 resync if online; manager screen if offline |
| Schema too old | Run migrations |
| Catalogue not ready | Show "connect to finish setup" |
| Count too low | Phase 1 resync if online |
| Missing indexes | Rebuild silently, continue |
| Integrity failed | Show "database corrupted" + manager PIN |

---

## 17. SQLite Indexes

All created inside migration scripts, not ad-hoc.

| Index | Column(s) | Used by |
|---|---|---|
| `idx_cache_products_product_id` | `product_id` | WebSocket lookups, offline order resolution |
| `idx_cache_products_barcode` | `barcode` | Barcode scanner (most time-sensitive query) |
| `idx_cache_products_write_date` | `write_date` | Delta sync filter |
| `idx_cache_products_active` | `active` | Startup load, health check count |
| `idx_cache_products_active_only` | `product_id WHERE active=1` | Partial index — active-only queries |
| `idx_offline_order_sync_status` | `sync_status` | Sync worker pending/failed query |
| `idx_cart_draft_terminal_session` | `terminal_id, session_id, status` | Recovery query on startup |
| `idx_payment_state_session` | `session_id` | Payment recovery lookup |

---

## 18. Migration System

Custom runner — no library needed. On startup: read max version from `schema_migrations`, run any unrun scripts in order.

Before each migration: backup via `better-sqlite3`'s `.backup()` API (not a file copy — file copy is unsafe with WAL).

Each migration runs inside a transaction and records its version in `schema_migrations` on success.

---

## 19. Retry and Backoff

| Attempt | Delay |
|---|---|
| 1st | 5 seconds |
| 2nd | 15 seconds |
| 3rd | 30 seconds |
| 4th+ | 1–5 minutes (random jitter) |

Only retry on transient errors (`ECONNRESET`, `ETIMEDOUT`, 503, 429). Never retry on 400, 401, 403, 404.

| Operation | Max attempts |
|---|---|
| Delta sync | Infinite |
| Offline order submission | ~50 / 24hr cap → manager review |
| Payment state sync | 3 → recovery screen |

Manager screen has a manual "Retry Now" button that resets the backoff counter.

---

## 20. Offline Order Conflict Handling

If the backend detects a price mismatch when an offline order is submitted:

1. **Order is accepted as submitted** — backend records sale-time prices, does not recalculate
2. **Conflict is flagged** — goes to manager reconciliation queue, not silently resolved
3. **Threshold:** differences below ₹1 or 1% are auto-approved

The backend must return a structured JSON conflict response (not a generic HTTP error) so the POS can route it correctly.

---

## 21. Sync Status Badge

| State | Color |
|---|---|
| Synced < 5 min ago | Green |
| Synced 5–30 min ago | Yellow |
| Synced 30 min – 4 hrs ago | Orange |
| Synced > 4 hrs ago / offline | Red |
| Syncing now | Blue (spinner) |
| Catalogue incomplete | Red + manager alert |

Badge reads from `sync_state` in SQLite, not from Zustand. Shows most critical entity. Includes a tap-to-retry button.

---

## 22. What's in Memory vs SQLite-Only

**Always in memory:**
- `cache_products` + `_allProductsIndexMap` + `_barcodeMap`
- `cache_categories` (for filter buttons)
- Active pricelist for current session

**Query from SQLite on demand:**
- `cache_taxes`, `cache_pricelists`, `cache_payment_methods`, `cache_pos_config`, `cache_users_permissions`

**Sync schedules:**

| Table | Schedule |
|---|---|
| Products | Every 30 seconds |
| Taxes | Startup + every 4 hours |
| Pricelists | Startup + every 1 hour |
| Payment methods | Startup only |
| Customers | On-demand search via API |
| POS config | Startup + on config-change WebSocket event |
| Permissions | On login + on permission-change WebSocket event |

---

## 23. Backend Compatibility Contract

The backend must guarantee these — any change is a breaking change:

| Guarantee | Rule |
|---|---|
| Stable product IDs | IDs never reassigned or recycled |
| Monotonic revisions | Revisions only increase, never reset |
| Stable pagination | Cursor-based pagination during full sync |
| Soft deletion markers | Deletions appear in delta sync as `active: false` |
| Idempotent orders | Same `local_order_uuid` → same response, no duplicate |
| Structured conflict response | Documented JSON format, not a generic HTTP error |
| API version header | `X-API-Version: N` on every response |

POS validates the API version at startup before any sync. If the POS is too old for the current backend, a mandatory update screen blocks the cashier.

---

## 24. Support Diagnostics Page

Behind manager PIN. All values read from SQLite, not Zustand.

Displays: product count, last sync time, last revision, last sync error, pending offline orders, failed orders, cart drafts, SQLite DB size, WAL file size, schema version, API version.

Buttons: Force Full Resync (behind extra confirmation), Rebuild Indexes, Export Logs.

---

## 25. What Lives Where — Summary

| Data | Location | Why |
|---|---|---|
| 60k products | Memory + SQLite | Memory for search; SQLite for offline + startup |
| Product index map | Memory only | O(1) ID lookup |
| Barcode map | Memory only | O(1) scan lookup |
| Categories | Memory + SQLite | Filter buttons |
| Taxes, pricelists, config | SQLite only | Small, accessed only at checkout |
| Sync revision | SQLite (`sync_state`) | Survives crashes |
| Catalogue health flag | SQLite (`app_settings`) | Checked every startup |
| Current cart | Memory + SQLite auto-save | Memory for speed; SQLite for crash recovery |
| Offline orders | SQLite only | Financial data — must survive any crash |
| Payment state | SQLite only | Must survive crash mid-payment |
| Sync badge data | SQLite only | Source of truth |
| Migration history | SQLite only | Schema version control |



# Complete State Management Architecture

--- 
## Part 2 -- State Manegement 

### 2.1 — The Two-Layer Model

**Cardinal rule: SQLite written first. Memory updated only after SQLite succeeds.**

| Layer | Where | Survives crash | Used for |
|---|---|---|---|
| Zustand | RAM (renderer) | ❌ No | UI, live search, cart UI mirror |
| SQLite (WAL) | Disk (`pos.db`) | ✅ Yes | Cart recovery, orders, payment, catalogue |

Exception: pure UI state (search query, screen name, modals) is Zustand-only — losing it on close is acceptable.

---

### 2.2 — State Inventory

#### Group A — UI State (Zustand only)

`currentScreen` · `searchQuery` · `selectedCategory` · `currentPage` · `isLoadingProducts` · `isSyncing` · `modalOpen` · `toastMessage` · `managerOverridePending`

#### Group B — Runtime Catalogue (Zustand memory / SQLite source of truth)

| Slice | Type | Purpose |
|---|---|---|
| `allProducts` | `Product[]` | Full 60k product array |
| `products` | `Product[]` | Current 50-item page slice |
| `productById` | `Map<id, Product>` | O(1) lookup by ID |
| `productByBarcode` | `Map<barcode, Product>` | O(1) barcode scan lookup |
| `productsByCategory` | `Map<category, Product[]>` | Pre-filtered per category |
| `normalizedSearchText` | `Map<id, string>` | Pre-lowercased for fast filter |
| `_indexMap` | `Map<id, number>` | Array index for O(1) patch |
| `taxes` / `pricelists` / `promotions` / `paymentMethods` | Maps/arrays | Checkout data, rebuilt from SQLite |

#### Group C — Session & Identity (Zustand + SQLite `pos_sessions`)

```js
sessionState = {
  storeId, terminalId, posConfigId,
  localSessionId,   // UUID generated immediately at open — used before backend confirms
  odooSessionId,    // set after backend confirms
  cashierId, sessionStatus, openedAt, openingBalance
}
```
`permissions` is a `Set<string>` loaded from `cache_users_permissions`.

#### Group D — Active Cart (Zustand mirror + `cart_draft` auto-synced)

`cartItems` · `cartCustomer` · `cartDiscounts` · `cartDraftUuid` · computed: `cartSubtotal`, `cartTaxTotal`, `cartTotal`

Cart auto-persists via `subscribeWithSelector` — never call save manually:

```js
cartStore.subscribe(
  (state) => state.cartItems,
  debounce((cartItems) => {
    const { cartDiscounts, cartCustomer, cartDraftUuid, sessionState } = cartStore.getState()
    window.electronAPI.invoke('db:save-cart-draft', {
      draft_uuid: cartDraftUuid, session_id: sessionState.localSessionId,
      terminal_id: sessionState.terminalId, cashier_id: sessionState.cashierId,
      cart_json: JSON.stringify({ cartItems, cartDiscounts, cartCustomer }),
      updated_at: new Date().toISOString(), status: 'active',
    })
  }, 200),
  { equalityFn: shallow }
)
```

**CartItem must be a full snapshot** — store `productName`, `unitPrice`, `taxIds` at add-time. If the product is later deleted or repriced, the receipt still reflects what the customer agreed to pay.

#### Group E — Payment State Machine (Zustand + SQLite — write-first)

Each transition writes to SQLite before the UI changes. On startup, any non-`IDLE` state triggers a recovery screen before the cashier sees the POS.

```
IDLE → PAYMENT_STARTED → PAYMENT_PROCESSING → PAYMENT_APPROVED_LOCAL → PAYMENT_SYNCING → PAYMENT_COMPLETE
                                             ↘ PAYMENT_FAILED → (cashier retries or) PAYMENT_CANCELLED
```

`PAYMENT_APPROVED_LOCAL` writes order to `offline_order_queue` + marks `cart_draft` as `converted` in **one atomic transaction**.

#### Group F — Offline Order Queue (SQLite only)

`offline_order_queue` stores completed orders pending backend sync. Key fields: `local_order_uuid` (idempotency key), `payload_json` (full sale snapshot — never just IDs), `status` (`pending` → `syncing` → `synced` / `failed`).

Retry: immediate → 30s → 2min → 10min → 30min → 1hr → after 24hr: manager alert.

#### Group G — Audit Log (SQLite append-only)

```sql
audit_log (event_type, actor_id, actor_role, session_id, terminal_id,
           target_entity, target_id, before_value, after_value, metadata_json, created_at)
```

Required events: `CART_ITEM_ADDED/REMOVED` · `CART_DISCOUNT_APPLIED` · `CART_PRICE_OVERRIDDEN` · `CART_VOIDED` · `PAYMENT_STARTED/FAILED/COMPLETED` · `REFUND_CREATED` · `SESSION_OPENED/CLOSED` · `MANAGER_OVERRIDE_APPROVED/DENIED`

---

### 2.3 — Startup Sequence

```
[Main process]
  1. Open SQLite → PRAGMAs (WAL, synchronous=NORMAL, foreign_keys ON, busy_timeout 5000)
  2. Run schema migrations → health checks
  3. Check payment_state — flag renderer if recovery needed
  4. Check cart_draft — pass active draft metadata to renderer

[Renderer — init()]
  5. Load posConfig, currentUser, permissions (IPC)
  6. Check session state for this terminal
  7. If payment recovery → show PaymentRecoveryScreen (blocks cashier)
  8. loadCatalogueFromSQLite() → buildIndexes() → _recomputePage()
     ← GRID VISIBLE < 1 second
  9. If cart_draft found → show CartRecoveryDialog
  10. Start background sync (non-blocking) + WebSocket listener + cart subscriber
```

---

### 2.4 — Core Actions

**Index building — O(n) single pass, called once after SQLite load:**

```js
buildIndexes: (products) => {
  const maps = { productById: new Map(), productByBarcode: new Map(),
                 productsByCategory: new Map(), normalizedSearchText: new Map(), _indexMap: new Map() }
  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    maps.productById.set(p.id, p)
    if (p.barcode) maps.productByBarcode.set(p.barcode, p)
    maps.normalizedSearchText.set(p.id, `${p.name} ${p.barcode ?? ''}`.toLowerCase().trim())
    maps._indexMap.set(p.id, i)
    if (!maps.productsByCategory.has(p.category)) maps.productsByCategory.set(p.category, [])
    maps.productsByCategory.get(p.category).push(p)
  }
  set({ ...maps, categories: [...maps.productsByCategory.keys()].sort() })
}
```

**Search recompute — never touches SQLite:**

```js
_recomputePage: () => {
  let base = selectedCategory ? (productsByCategory.get(selectedCategory) ?? []) : allProducts
  if (searchQuery) base = base.filter(p => normalizedSearchText.get(p.id)?.includes(searchQuery.toLowerCase()))
  set({ products: base.slice(currentPage * 50, currentPage * 50 + 50), totalFiltered: base.length })
}
```

**WebSocket patch — SQLite first:**

```js
patchProduct: async (updated) => {
  const ok = await window.electronAPI.invoke('db:patch-product', updated)
  if (!ok) return
  const index = _indexMap.get(updated.id)
  // update allProducts[index], productById, productByBarcode, normalizedSearchText
  // rebuild productsByCategory entry if category changed
  set({ allProducts: [...allProducts], ...updatedMaps })
  get()._recomputePage()
}
```

**Permission guard — wraps all sensitive cart/payment actions:**

```js
const guardedAction = (permission, action) => (...args) => {
  if (!sessionState || sessionState.sessionStatus !== 'open')
    return set({ toastMessage: { type: 'error', text: 'No active session' } })
  if (!permissions.has(permission))
    return set({ managerOverridePending: { permission, action, args } })
  window.electronAPI.invoke('db:audit-log', { event_type: permission, actor_id: currentUser.id, ... })
  action(...args)
}
// Usage: addToCart: guardedAction('cart.addItem', (product) => { ... })
```

**clearCart — marks draft abandoned in SQLite before wiping memory:**

```js
clearCart: () => {
  if (cartDraftUuid) window.electronAPI.invoke('db:update-cart-draft-status', { uuid: cartDraftUuid, status: 'abandoned' })
  set({ cartItems: [], cartCustomer: null, cartDiscounts: [], cartDraftUuid: null, paymentState: 'IDLE' })
}
```

---

### 2.5 — Background Sync

Runs after grid is visible. Never blocks UI. Uses revision numbers — no timestamps.

```js
async function runBackgroundSync(db, entityType) {
  const lastRevision = db.prepare('SELECT last_revision FROM sync_state WHERE entity = ?').get(entityType)?.last_revision ?? 0
  const { records, highestRevision } = await fetchFromBackend(`/sync/${entityType}?after_revision=${lastRevision}`).then(r => r.json())
  db.transaction(() => {
    records.forEach(r => db.prepare(`INSERT OR REPLACE INTO cache_${entityType} ...`).run(r))
    db.prepare('UPDATE sync_state SET last_revision = ?, last_synced_at = ? WHERE entity = ?').run(highestRevision, new Date().toISOString(), entityType)
  })()
  mainWindow.webContents.send('sync:patch-products', records)
}
```

| Entity | Frequency | Entity | Frequency |
|---|---|---|---|
| Products | 10 min + WebSocket | Promotions | 15 min |
| Pricelists | 30 min | Customers | 30 min |
| Taxes | 60 min | Payment methods / POS config | Session open only |

---

### 2.6 — Input Handling

| Input | Strategy |
|---|---|
| Manual typing | 150ms debounce → `_recomputePage()` |
| Barcode scan | Timing detect (< 50ms gap) → buffer → on Enter: `productByBarcode.get()` (O(1)) |
| Category click | Immediate → `productsByCategory.get()` (O(1)) |

---

### 2.7 — Tax Calculation

One canonical function used at add-to-cart and checkout. Backend re-validates on submit; mismatch > ₹0.05 flagged for review (cashier not blocked).

```js
function calculateLineTotal(product, quantity, discountPct, taxes) {
  const tax = taxes.get(product.tax_ids[0])
  const afterDiscount = product.list_price * quantity * (1 - discountPct / 100)
  if (!tax) return { taxAmount: 0, lineSubtotal: afterDiscount }
  const taxAmount = tax.price_include
    ? afterDiscount - afterDiscount / (1 + tax.amount / 100)   // extract from price
    : afterDiscount * (tax.amount / 100)                        // add on top
  return {
    taxAmount:    Math.round(taxAmount * 100) / 100,
    lineSubtotal: Math.round((tax.price_include ? afterDiscount : afterDiscount + taxAmount) * 100) / 100
  }
}
```

Rounding rule: **round per line, then sum** — matches Odoo default. Must not change without updating the backend simultaneously.

---

### 2.8 — Performance Thresholds (Non-negotiable)

| Operation | Threshold | Operation | Threshold |
|---|---|---|---|
| Cold startup (grid visible) | < 1.5 s | Add-to-cart | < 50 ms |
| Manual search response | < 50 ms | Checkout screen transition | < 100 ms |
| Barcode lookup | < 30 ms | Background sync cycle | < 5 s, no UI freeze |
| Cart draft SQLite write | < 50 ms | WebSocket product patch | < 100 ms |
| Payment state write | < 20 ms | First launch (one-time) | < 30 s |

Memory alerts: `renderer_memory_mb > 400` or `main_process_memory_mb > 300` → log `MEMORY_ALERT`, notify admin. Log snapshot every 5 minutes including `product_count`, `cart_line_count`, `catalog_revision`.

---





