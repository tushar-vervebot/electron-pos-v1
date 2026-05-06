# POS System — Hybrid Approach: React Memory + SQLite Persistence

This document describes the hybrid architecture that combines the best of both the **React in-memory approach** and the **SQLite approach**. It eliminates the major weaknesses of each while keeping all of their strengths.

---

## Core Principle

> **React memory handles everything that needs to be fast. SQLite handles everything that needs to survive a restart.**

- **React / Zustand** → search, filter, pagination, real-time updates, cart, UI state
- **SQLite** → persistence only — a local cache on disk so the app is never empty on startup and can work fully offline

SQLite is **never queried for search or filtering**. Its only job is to store product data to disk and serve it back at startup.

---

## How It Works — Full Flow

### First Ever Launch (cold start, no local cache)

```
App opens — SQLite is empty
  → Show loading screen
  → Fetch all products from Backend API in parallel batches
  → Load each batch into Zustand allProducts[] (grid shows as data arrives)
  → In the background — write all products into SQLite (fire-and-forget)
  → First launch complete
```

The user experience on first launch is identical to the current approach. Products load from the network and appear progressively. While the user is working, SQLite is quietly filling up in the background.

---

### Every Subsequent Launch (warm start, cache exists)

```
App opens — SQLite has cached products
  → Read all products from SQLite into Zustand allProducts[] (disk read, very fast)
  → Grid is visible and usable within 1–2 seconds — no network wait
  → In the background — silently fetch fresh data from Backend API
      → If new/updated products found → patch allProducts[] in memory
      → Write changes back to SQLite cache
  → User never sees a loading screen after first launch
```

This is the biggest improvement over the current approach. After the first run the app **starts instantly** with cached data, then quietly refreshes in the background.

---

### Real-Time WebSocket Updates

```
Backend product changes
  → WebSocket message arrives at POS
  → Find product index in allProducts[] using O(1) lookup map
  → Replace that one product object in memory (instant — ~1ms)
  → _recomputePage() re-slices the visible grid
  → User sees updated price immediately
  → In the background — write the updated product to SQLite (disk write, ~5ms)
  → Cache on disk is now also up to date
```

The UI update is never blocked by the SQLite write. The disk write is queued and happens after the screen has already updated.

---

### Search and Filter (unchanged)

```
User types "app"
  → JavaScript filters allProducts[] array in memory
  → Takes ~2–5 milliseconds for 60,000 items
  → Results appear instantly as the user types
  → SQLite is never touched
```

Search remains 100% in-memory JavaScript. SQLite plays no role here.

---

### Offline Mode (new capability)

```
App opens — network unreachable
  → SQLite cache loaded into memory as normal
  → Grid is fully usable — products visible, search works, cart works
  → App shows a small indicator: "Offline — showing cached products"
  → When network comes back → background sync runs automatically
  → Cache refreshed, indicator disappears
```

This is a capability the current approach completely lacks. With the hybrid, a network outage at startup does not break the app.

---

## Comparison: All Three Approaches

| Feature | React Memory Only (current) | SQLite Only | Hybrid (proposed) |
|---|---|---|---|
| **Search speed** | ✅ 2–5 ms (instant) | ❌ 30–200 ms (laggy) | ✅ 2–5 ms (instant) |
| **Startup on 2nd+ launch** | ❌ 3–30 sec network wait | ✅ Instant from disk | ✅ Instant from disk |
| **Offline capability** | ❌ App shows nothing | ✅ Full offline | ✅ Full offline |
| **Memory usage** | Same (~50–150 MB) | Low (only current page) | Same (~50–150 MB) |
| **Real-time update speed** | ✅ ~1 ms | ❌ Disk write + re-query | ✅ ~1 ms (disk write async) |
| **Data freshness** | ✅ Always fresh on load | ❌ Depends on sync schedule | ✅ Fresh in background |
| **Code complexity** | Low | High | Medium |
| **Works on slow network** | ❌ Very slow startup | ✅ Instant startup | ✅ Instant startup |
| **Works on old hardware** | ✅ Consistent (no disk I/O for search) | ❌ Slow disk = slow search | ✅ Consistent (no disk I/O for search) |
| **Stale data risk** | ❌ None (always fresh) | ❌ Possible (sync failures) | ✅ Minimal (background refresh) |

---

## What SQLite Stores (and Only This)

SQLite in the hybrid approach is used **exclusively as a product cache**. It holds:

| Table | Purpose |
|---|---|
| `products` | All product records (id, name, price, category, barcode, active flag, etc.) |
| `sync_meta` | Last successful full sync timestamp, total product count |

SQLite does **not** store:
- Cart data (lives in memory / resets per session)
- Orders (sent to Backend API)
- UI state (not persistent)
- Session data

---

## SQLite Write Strategy — Non-Blocking

A critical rule: **SQLite writes never block the UI thread.**

All writes go through a background write queue:

```
Product update received (WebSocket or background sync)
  → Memory patched FIRST → UI updates immediately
  → Write task added to queue
  → Queue processes writes one at a time on a non-UI thread
  → If app closes before queue drains → next startup re-fetches those items anyway
```

This ensures that even on slow disks, the POS UI never freezes or lags during a write operation.

---

## Background Sync Strategy

To keep the SQLite cache fresh after startup, the app runs a background sync:

| Trigger | Action |
|---|---|
| App startup (after cache load) | Fetch full product list from API, diff against cache, apply updates |
| WebSocket product update | Patch single product in memory + write to SQLite |
| WebSocket reconnect after drop | Re-fetch any products that may have changed during disconnect |
| Periodic (every 30 min, configurable) | Light sync — fetch only recently modified products if API supports it |

---

## Handling the First Launch Loading Screen

On first launch (empty cache), the app still needs to load from the API. To make this feel better:

- Show a progress bar: "Loading products… 12,450 / 60,000"
- Products are shown in the grid as soon as the first batch arrives — user does not wait for all 60k
- After first launch this screen is never seen again (cache exists)

---

## Advantages of the Hybrid Approach

| Advantage | Detail |
|---|---|
| **Instant startup** | After first run, products load from local SQLite in under 2 seconds |
| **Instant search** | All filtering is still in-memory JavaScript — never touches SQLite |
| **Offline resilience** | App is fully usable even when the Backend server is down |
| **Data stays fresh** | Background sync keeps SQLite and memory current without user action |
| **Real-time updates still instant** | WebSocket patches memory first, SQLite write is async |
| **No schema complexity for search** | No FTS index needed — SQLite is just a key-value cache, not a query engine |
| **Graceful degradation** | Network down → use cache. Cache empty → fetch from network. Both paths work. |

---

## Disadvantages and Trade-offs

| Disadvantage | Detail |
|---|---|
| **More code than pure memory** | Need to write SQLite read/write logic, sync queue, and cache invalidation |
| **Disk space used** | 60k product rows will use roughly 20–50 MB on disk depending on data shape |
| **First launch still slow** | Cold start with no cache is the same as today — network dependent |
| **Cache can go stale if sync fails repeatedly** | Mitigated by showing "last synced X minutes ago" indicator and always trying background refresh |
| **Slightly more complex startup flow** | Need to handle: cache exists → load it, cache missing → show loader, cache corrupt → delete and reload |

---

## Implementation Checklist (High Level)

- [ ] Add `better-sqlite3` (or `sqlite3`) as a dependency in the main process
- [ ] Create `db.js` in main process — handles open, schema creation, read all, upsert batch, upsert single
- [ ] On app start: check if `products` table has rows → if yes, read all into memory
- [ ] After memory load: trigger background API sync in `setImmediate` or `setTimeout(0)`
- [ ] In `posStore.js`: add `loadProductsFromCache(rows)` action alongside existing `loadAllProducts()`
- [ ] In WebSocket handler: after patching memory, call `db.upsertProduct(updatedProduct)` via IPC
- [ ] Write queue: simple async queue in main process to serialize all SQLite writes
- [ ] `sync_meta` table: update `last_synced_at` after every successful full sync
- [ ] Startup logic: if SQLite load fails for any reason, fall back to full API fetch silently

---

---

## React State Loading — Its Own Hybrid Approach

The previous sections describe when data comes from (SQLite vs API). This section describes **how that data lives inside Zustand** once it arrives — and how to reduce the disadvantages of holding 60k products in memory without giving up instant search.

### The problem with the current state shape

Right now every product object stored in `allProducts[]` contains every field the API returns — name, price, barcode, category, description, image URL, stock count, tax class, unit, supplier ID, and more. For 60,000 products that is a lot of data sitting in RAM for fields that the grid never even displays.

That is where most of the 50–150 MB memory cost comes from.

---

### The Two-Tier Memory Model

Instead of one flat `allProducts[]` array holding full objects for all 60k products, split Zustand into two tiers:

```
Zustand store
├── searchIndex[]       → 60,000 slim objects  (id, name, barcode, category, price only)
│                          ~15–25 MB total — always in memory
│
└── fullProductCache{}  → Map of id → full product object
                           Only loaded for the current category or search result set
                           ~2,000–5,000 entries at a time — ~5–15 MB
                           Older entries evicted when category changes
```

#### Tier 1 — Search Index (always in memory, all 60k)

Each entry is a stripped-down object with only the fields needed to search and display a grid card:

```js
// Slim object — ~400 bytes each × 60,000 = ~24 MB
{
  id: "prod_123",
  name: "Apple Juice 1L",
  barcode: "5012345678901",
  category: "Beverages",
  price: 1.99
}
```

This replaces the current `allProducts[]`. Search and category filter run against this slim array — still instant JavaScript in under 5ms, but using ~24 MB instead of ~100 MB+.

#### Tier 2 — Full Product Cache (on demand, current context only)

When the user opens a category or clicks a product, the full object for those products is loaded from SQLite into `fullProductCache{}`:

```js
// Full object — loaded only when needed
{
  id: "prod_123",
  name: "Apple Juice 1L",
  barcode: "5012345678901",
  category: "Beverages",
  price: 1.99,
  tax_class: "standard",
  unit: "bottle",
  stock: 240,
  supplier_id: "sup_88",
  description: "...",
  image_url: "..."
}
```

When the user switches to a different category, the old category's full objects are evicted from `fullProductCache{}`. Only the new category's full objects are loaded in. The slim search index stays intact.

---

### How the two tiers work together

#### On startup

```
SQLite → read slim fields only for all 60k products
  → populate searchIndex[] in Zustand
  → Grid renders from searchIndex[] immediately
  → No full objects loaded yet — startup is faster and uses less RAM
```

#### When user browses a category

```
User taps "Beverages"
  → searchIndex[] filtered instantly (in-memory — same as today)
  → Top 50 product IDs identified
  → fullProductCache{} checked for those IDs
      → Cache hit → render immediately
      → Cache miss → SQLite: SELECT * FROM products WHERE id IN (...)
                    → Load full objects → cache them → render
  → If category changes → evict previous category from fullProductCache{}
```

#### When user searches

```
User types "apple"
  → searchIndex[] filtered in 2–5 ms — results are slim objects
  → Grid renders names, prices, barcodes immediately from slim objects
  → On hover or add-to-cart → full object fetched from fullProductCache{} or SQLite
  → Normal search experience unchanged for the cashier
```

---

### Memory usage comparison

| Approach | Memory Used | How |
|---|---|---|
| **Current (full objects, all 60k)** | 50–150 MB | All fields × 60k products in one array |
| **Two-tier hybrid** | 25–40 MB | Slim index (all 60k) + full cache (current ~2k only) |
| **Saving** | ~50–100 MB reduction | Full objects only exist for the products currently on screen |

---

### Loading time comparison

| Phase | Current | Two-tier hybrid |
|---|---|---|
| **Warm startup (from SQLite)** | Read all full fields × 60k | Read slim fields × 60k — significantly less data |
| **Search / filter** | Instant (filter full objects) | Instant (filter slim objects — same speed) |
| **Grid render** | Immediate (full data in memory) | Immediate (slim data + lazy full load for visible items) |
| **Product detail / add-to-cart** | Immediate (already in memory) | Fast (SQLite lookup — single row by ID, ~1ms) |

---

### Disadvantages of the Two-Tier Model

| Disadvantage | Detail |
|---|---|
| **Slightly more complex store shape** | Two data structures instead of one flat array |
| **Full detail has a tiny delay on first view** | First time a product's full data is needed, there is a ~1ms SQLite read. Imperceptible in practice. |
| **Cache eviction logic needed** | Need to decide when to evict from `fullProductCache{}` — by category change, by size limit, or LRU |
| **Slim objects must match API exactly** | Slim extraction must be consistent — if API adds a field needed for search, slim objects must include it |

---

### Zustand store shape change

```js
// Before (current)
{
  allProducts: [],          // 60,000 full objects
  products: [],             // current page (50 items, full objects)
}

// After (two-tier hybrid)
{
  searchIndex: [],          // 60,000 slim objects (always in memory)
  fullProductCache: {},     // Map<id, fullProduct> — current context only
  products: [],             // current page (50 slim objects for grid)
}
```

---

### When to fetch full product data

Not every action needs the full object. Here is the rule:

| Action | Data needed | Source |
|---|---|---|
| Display grid card (name, price, category) | Slim object | `searchIndex[]` — already in memory |
| Search / filter | Slim object | `searchIndex[]` — already in memory |
| Add to cart | Price, id, name, barcode | Slim object is enough |
| Show product detail popup | All fields | `fullProductCache{}` or SQLite by ID |
| Print label | Name, barcode, price, unit | Slim object is enough for most labels |
| Real-time price update | Price field | Patch slim object in `searchIndex[]` only — tiny and instant |

The conclusion: **most POS operations only ever need the slim object.** The full object is only needed when showing a detailed product view — a relatively rare action compared to searching and adding to cart.

---

## Updated Summary

The complete hybrid now has three layers working together:

| Layer | Tool | Role |
|---|---|---|
| **Persistence** | SQLite | Store all product data on disk — warm startup, offline support |
| **Fast search & display** | Zustand `searchIndex[]` | Slim objects for all 60k — instant filter, low RAM |
| **Full detail on demand** | Zustand `fullProductCache{}` + SQLite | Full objects loaded only when actually needed |

- **React / Zustand** drives 100% of the UI — nothing changes for the user
- **SQLite** is still never queried in the search/filter hot path
- **RAM usage drops by ~50–100 MB** without slowing anything down
- **Search stays at 2–5ms** — slim objects filter just as fast as full objects
- **Startup is faster** — reading slim fields from SQLite is significantly less data than reading full fields

---

## Proposed Practical Architecture — SQLite → State → UI with Go Server Background Sync

### Is this the right approach?

**Yes — this is the correct way to build this system.** The flow described below is a well-established pattern used in production POS and offline-first applications. Each part of it is sound.

---

### The Full Flow

#### Step 1 — App starts, SQLite → Zustand → UI renders immediately

```
App opens
  → Main process reads products from SQLite
  → Sends first 200–300 full product objects to renderer via IPC
  → Zustand products[] populated
  → Grid renders instantly — no network wait
  → Also sends all 60k slim objects → searchIndex[] populated
  → Search is ready immediately
```

The user sees a fully working grid within 1–2 seconds, even completely offline.

---

#### Step 2 — Go server background sync runs simultaneously

```
Simultaneously (background — does not block UI)
  → Go server fetched for updated/new/deleted products
  → Changes written to SQLite
  → For each changed product:
      → IPC event fired to renderer: "product:updated", { product }
      → Zustand patches ONLY that product in products[] (if visible)
      → Zustand patches that product in searchIndex[] (always)
  → UI card for that product re-renders — nothing else moves
```

The sync is invisible to the cashier unless a product they are looking at changes price.

---

#### Step 3 — Only what changed updates in the UI

```
Go server reports product X price changed
  → SQLite row for product X updated
  → IPC event: "product:updated" { id: "X", price: 2.49, ... }
  → Zustand finds product X in products[] → patches price in place
  → React re-renders ONLY the card for product X
  → All other 199–299 cards are untouched
  → searchIndex[] entry for X also patched
```

React's reconciler only touches the single card that changed. The rest of the grid does not re-render.

---

### Why each part is correct

| Decision | Why it is right |
|---|---|
| **SQLite → state on startup** | UI does not depend on network being up. Works immediately from disk. |
| **Only 200–300 full objects in `products[]`** | Low memory, fast to load from SQLite, fast to patch |
| **All 60k slim objects in `searchIndex[]`** | Search never hits SQLite — stays 2–5ms regardless of network or disk |
| **Go server sync runs in background** | Cashier is never blocked or shown a loading state for sync |
| **Delta push to UI (only changed products)** | React only re-renders what changed — most efficient possible UI update strategy |
| **SQLite as the single source of truth on disk** | If app crashes mid-sync, SQLite still has last known good state — no data loss |

---

### The one requirement this depends on

This approach works correctly **only if the Go server can return a delta** — meaning it can tell the app which products changed since the last sync (by a timestamp, a changelog, or a diff endpoint).

```
Good — Go server supports delta:
  GET /products/changes?since=2026-04-22T10:00:00Z
  → Returns only the 12 products that changed
  → App writes 12 rows to SQLite, patches 12 items in state

Bad — Go server only returns full list:
  GET /products
  → Returns all 60,000 products every time
  → App must diff all 60k against SQLite to find what changed
  → Expensive — defeats the purpose of background sync
```

**If the Go server does not support delta today, the background sync should still work** — it just diffs locally by comparing `updated_at` timestamps between API response and SQLite rows. It is more work but still correct.

---

### Disadvantages of this approach (full list)

| Disadvantage | Severity | Notes |
|---|---|---|
| **Search results may need a SQLite read on cache miss** | Low | When a search result is not in the current 200–300 `products[]`, the full object must be fetched from SQLite by ID. ~1–5ms, barely noticeable. |
| **What goes in the 200–300 `products[]` needs a clear rule** | Medium | Must decide: current category? most recent? popularity order? Rapid category switching causes constant evict-and-reload cycles from SQLite. |
| **Requires Go server to support a delta/changelog API** | High | Without delta support, local diffing of 60k rows on every sync is expensive. Needs to be agreed with the backend team early. |
| **IPC drop can cause SQLite ↔ UI state gap** | Medium | If an IPC event from main process to renderer is dropped, SQLite has the new data but state shows old. Needs a reliable event delivery mechanism. |
| **Both `products[]` and `searchIndex[]` must be patched on every update** | Medium | Two data structures to keep in sync. Easy to patch one and forget the other, causing silent stale data. Must be handled in one atomic action in the store. |
| **Cold start is still network-dependent** | Low | First ever launch with empty SQLite still falls back to full API fetch — same as today. Only affects first run. |
| **Stale UI if background sync is delayed** | Low | If the Go server is slow or the sync interval is long, the grid can show prices that are minutes old. Mitigated by showing "last synced X ago" status. |

---

### Zustand store shape for this approach

```js
{
  // All 60k slim objects — always in memory — used for search and filter only
  searchIndex: [],

  // 200–300 full product objects for the current visible context
  // Replaced when category changes, patched in-place on sync updates
  products: [],

  // Metadata
  lastSyncedAt: null,
  isOffline: false,
}
```

---

### Patch action — must update both structures atomically

```js
// In posStore.js
patchProduct: (updatedProduct) => set((state) => {

  // 1. Patch searchIndex slim object (always)
  const newIndex = state.searchIndex.map(p =>
    p.id === updatedProduct.id
      ? { ...p, name: updatedProduct.name, price: updatedProduct.price,
              barcode: updatedProduct.barcode, category: updatedProduct.category }
      : p
  );

  // 2. Patch products[] full object (only if currently visible)
  const newProducts = state.products.map(p =>
    p.id === updatedProduct.id ? { ...p, ...updatedProduct } : p
  );

  return { searchIndex: newIndex, products: newProducts };
})
```

Both structures are updated in a single `set()` call — one React render cycle, no intermediate inconsistent state.

---

### Final verdict

This is the right approach. It is:
- **Correct** — each tool is used for what it is best at
- **Resilient** — works offline, recovers from network drops
- **Efficient** — UI only re-renders what changed, memory stays low
- **Maintainable** — clear separation of concerns between SQLite (disk), state (memory), and UI (render)

The only risk is the Go server delta API requirement. Confirm that early — everything else in this architecture is straightforward to implement.
