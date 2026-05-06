# POS System — Architecture Decisions & Approach Guide

This document explains the key technical decisions made in the POS frontend in plain language. It covers how state is managed, how products are loaded, how real-time syncing works, and the trade-offs of each approach. Intended for developers, team leads, or anyone reviewing the system design.

---

## 1. State Management Approach

### What is state management?

"State" is any data the app needs to remember while it is running — like the list of products, items in the cart, which screen is visible, and the current order. "State management" is just the system that keeps all of this organised and makes sure every part of the UI always shows the correct, up-to-date information.

### What we use — Zustand

We use a library called **Zustand** as our single global store. Think of it like a shared whiteboard that every screen and component in the app can read from and write to. Any time something changes on that whiteboard, only the parts of the app that care about that change will redraw themselves.

### How it works in our app

All important data lives in one place — `posStore.js`. When the app starts:

```
App opens
  → init() runs
    → loadAllProducts() fills the whiteboard with all products
    → Every screen reads from the whiteboard as needed
    → Cart updates, screen changes — all written to the whiteboard
    → React automatically re-renders only affected UI parts
```

### ✅ Advantages of this approach

| Advantage | Why it matters |
|---|---|
| **Single source of truth** | Every screen always sees the same data. No risk of two screens showing different cart totals or product lists. |
| **Simple to use** | Any component can read or update state with one line. No complex wiring needed. |
| **No unnecessary re-renders** | Zustand only re-renders the parts of the UI that actually depend on the changed data. The product grid does not re-render when someone adds to cart. |
| **Lightweight** | Zustand adds almost no overhead. It is one of the smallest and fastest state libraries available. |
| **Easy to debug** | All state is in one file. If something is wrong, there is only one place to look. |
| **Works great for search & filter** | Since all 60k products are already in memory, search and category filter are instant — no waiting, no network call, no database query. |

### ❌ Disadvantages of this approach

| Disadvantage | Why it matters |
|---|---|
| **Memory usage** | Keeping 60,000 products in RAM uses roughly 50–150 MB of memory depending on product data size. On low-end machines this could be noticeable. |
| **State is lost on close** | If the app crashes or closes, everything in the store is gone. There is no automatic save-to-disk. |
| **Large initial load** | The app must download all products before the grid becomes usable. On a slow network this means a longer wait at startup. |
| **Not designed for huge data sets** | Zustand is a UI state tool, not a database. Storing 60k records in it is unconventional, though it works well in practice for this use case. |

### Full workflow

```
1. App launches
2. init() calls loadAllProducts()
3. All products fetched from Backend API → stored in allProducts[] in Zustand
4. _recomputePage() slices first 50 → stored in products[] → grid renders
5. User searches → searchQuery updated in store → _recomputePage() filters in JS → grid re-renders instantly
6. User picks category → selectedCategory updated → _recomputePage() filters in JS → instant
7. User adds product to cart → cartItems[] updated → Cart component re-renders
8. User checks out → processPayment() runs → currentOrder + completedPayment set → screen switches to receipt
9. New sale → clearCart() → everything resets
```

---

## 2. Initial Product Load Approach

### The question

When the app starts, it needs to load all ~60,000 products. There are two ways to do this:

- **Option A — Load into React memory (what we do now)**
- **Option B — Store in SQLite and query from there**

### Option A — Load all products into React memory ✅ (current approach)

The app fetches all products from the Backend API when it starts, maps them into a simple list, and keeps that list in memory (Zustand store). All search, filter, and pagination happen in JavaScript without any database.

#### How it works

```
App starts
  → fetchProducts(page 1, limit 500) via IPC
    → Node.js (main process) calls Backend API — no CORS issues
      → First 500 products returned + total count
  → Calculate total pages needed (e.g. 60,000 ÷ 500 = 120 pages)
  → Fetch next 10 pages in parallel, then next 10, and so on
  → All products mapped and stored in allProducts[] in memory
  → Categories derived automatically from the loaded data
  → First 50 products sliced and shown in the grid
  → Done — all future search/filter is instant JS
```

#### ✅ Advantages

| Advantage | Why it matters |
|---|---|
| **Search is instant** | Filtering 60k items in a JavaScript array takes under 5 milliseconds. The user sees results as they type. |
| **No database needed for products** | Removes an entire layer of complexity. No SQL queries, no schema migrations, no index tuning. |
| **Simple code** | The entire product loading logic is about 30 lines of JavaScript. Easy to understand and change. |
| **Always fresh data** | Every app launch fetches directly from the Backend. Products are never stale. |
| **No extra backend needed** | Products come directly from the Backend API. No additional server is involved. |

#### ❌ Disadvantages

| Disadvantage | Why it matters |
|---|---|
| **Startup wait time** | Fetching 60k products takes time. On a good network this is 3–8 seconds. On a slow network it could be 15–30 seconds. The grid is empty until loading completes. |
| **Uses RAM** | All product data sits in memory. On older or low-spec machines this may cause the OS to use swap memory, slowing things down. |
| **No offline capability** | If the Backend server is unreachable at startup, no products load. There is no local fallback. |
| **Data lost on app close** | All loaded products are gone when the app closes. Next launch re-fetches everything from scratch. |

---

### Option B — Store products in SQLite and query from there

In this approach, a background process syncs products from the Backend API into a local SQLite database on disk. The app then queries SQLite each time the user searches or changes category.

#### How it would work

```
Background sync (runs on startup or on schedule)
  → Fetch products from Backend API
  → Write all products into SQLite on disk (takes 30–60 seconds for 60k rows)

User opens app
  → Grid shows first 50 products (fast — read from local disk)
  → User searches → SQL query runs against SQLite → results returned
  → Repeat for every keystroke or filter change
```

#### ✅ Advantages

| Advantage | Why it matters |
|---|---|
| **Works offline** | Products are on disk. Even without a network, the app functions normally. |
| **Low memory usage** | Only the current page (50 rows) is loaded into memory at a time. RAM usage stays low. |
| **Instant startup** | The grid can show products immediately from local disk, before any network call completes. |

#### ❌ Disadvantages

| Disadvantage | Why it matters |
|---|---|
| **Slower search** | Every keystroke fires a SQL query against a 60k-row database. See Section 4 for a full breakdown of why this is problematic. |
| **Sync complexity** | You need to manage sync schedules, handle partial sync failures, detect deleted/updated products, and keep the local DB in sync with the Backend. This is a lot of moving parts. |
| **Stale data risk** | If the sync fails silently, the app runs on outdated product info without the user knowing. |
| **More code** | Database schemas, migrations, upsert logic, FTS indexes, sync status tracking — all of this needs to be built and maintained. |

### Which approach is better for our use case?

**React memory is the right choice for this app** because:
- The POS machine is always on the same local network as the Backend server. Network is reliable.
- The cashier experience requires instant search as they type. SQLite queries introduce noticeable lag.
- Simplicity matters — fewer moving parts means fewer things break.

SQLite would be the better choice only if the app needed to work fully offline for extended periods.

---

## 3. Real-Time Product Syncing Approach

### What is real-time syncing?

After the initial load, products in the Backend can change — prices updated, new products added, old ones deactivated. Real-time syncing means the POS app picks up these changes without a full restart.

### The two approaches

#### Option A — Update React state directly (push updates into memory)

When a product changes in the Backend, a WebSocket message is pushed to the POS app. The app finds that product in the `allProducts[]` array and updates just that one entry. No database involved.

```
Backend product changes
  → WebSocket message arrives at POS
  → Find product index in allProducts[] using O(1) lookup map
  → Replace just that one product object
  → _recomputePage() re-slices the visible grid
  → User sees updated product price immediately
```

#### ✅ Advantages of React state approach

| Advantage | Why it matters |
|---|---|
| **Instant update** | Change appears on screen in milliseconds. |
| **No disk write** | No database query, no file I/O. Just a single array slot replacement. |
| **Simple** | One function, about 5 lines of code. |
| **No stale read risk** | What is in memory is always what is shown. No cache invalidation needed. |

#### ❌ Disadvantages of React state approach

| Disadvantage | Why it matters |
|---|---|
| **Updates lost on restart** | If the app closes and restarts before a full re-fetch, any in-memory updates are gone. The next startup re-loads everything fresh anyway, so this is rarely a problem. |
| **Requires WebSocket connection** | If the WebSocket drops, real-time updates stop until reconnected. |

---

#### Option B — Write updates to SQLite, then re-query

When a product changes, write the updated product to SQLite. The UI then queries SQLite to show the latest data.

```
Backend product changes
  → WebSocket message arrives
  → Write updated product to SQLite (disk write)
  → UI re-queries SQLite for current page
  → Grid updates
```

#### ✅ Advantages

| Advantage | Why it matters |
|---|---|
| **Persistent** | Updates survive app restarts. If you close and reopen, the change is still there. |

#### ❌ Disadvantages

| Disadvantage | Why it matters |
|---|---|
| **Slower** | Every update involves a disk write + a SQL read. Noticeably slower than a memory update. |
| **More complex** | You need to handle write conflicts, ensure the SQLite schema matches the API shape, and manage re-query triggers. |
| **Still needs the WebSocket** | The connection requirement is the same. SQLite does not solve the connectivity problem. |

### Which approach is better?

**React state wins for real-time syncing.** In a POS environment, the app is always running and always connected. The speed advantage of keeping everything in memory is significant, and the only downside (updates lost on restart) does not matter because the app does a fresh full load from the Backend on every startup anyway.

---

## 4. Why Using SQLite for Every Product Search Query is a Bad Idea

### How search works currently (React memory)

When a cashier types in the search box:
```
User types "app"
  → JavaScript filters allProducts[] array in memory
  → Takes ~2–5 milliseconds for 60,000 items
  → Results appear instantly as the user types
```

### How search would work with SQLite

When a cashier types in the search box:
```
User types "app"
  → JavaScript calls ipcRenderer.invoke('db:search-products', 'app')
  → Message travels: renderer → IPC bridge → main process
  → SQLite runs: SELECT * FROM products WHERE name LIKE '%app%' LIMIT 200
  → Result rows travel: main process → IPC bridge → renderer
  → React re-renders with results
```

### Why this causes problems

#### ❌ Problem 1 — Every keystroke is a round trip

A user typing "apple juice" fires 11 separate database queries — one for each character. Each query has to cross the IPC bridge (renderer to main process and back), hit the disk, and return results. Even if each query takes only 50ms, typing feels sluggish and unresponsive.

With React memory, all 11 filter operations happen inside the same process, in the same millisecond.

#### ❌ Problem 2 — `LIKE '%text%'` queries cannot use indexes

SQL indexes work like a book's alphabetical index — they help you find things that *start* with a value quickly. But when you search for `%apple%` (contains "apple"), SQL cannot use that index. It has to read **every single row** in the table and check each one. On 60,000 rows, this is called a full table scan and it is slow.

The only way around this is to use a special "Full Text Search" (FTS) index, which adds significant complexity to the database setup and still does not match the speed of an in-memory JavaScript filter.

#### ❌ Problem 3 — Disk I/O is unpredictable

A solid-state drive might return results in 10ms. A worn-out spinning hard drive on an old POS machine might take 200ms or more. JavaScript array operations always run in CPU cache — they are fast and consistent regardless of the machine's disk speed.

#### ❌ Problem 4 — IPC overhead adds up

The IPC bridge (the communication channel between the UI and the main process) was designed for occasional messages, not rapid-fire search queries. Sending 5–10 messages per second during a fast search session can cause message queuing, dropped frames, and a generally janky feel.

### Side-by-side comparison

| | React Memory Search | SQLite Search |
|---|---|---|
| **Speed per query** | 2–5 ms | 30–200 ms |
| **Works as user types** | ✅ Yes — instant | ❌ Feels laggy |
| **Consistent on all hardware** | ✅ Yes | ❌ Depends on disk speed |
| **Code complexity** | Low | High (needs FTS index, IPC handler, schema) |
| **Works offline** | ✅ After initial load | ✅ Yes |
| **Result quality** | Identical | Identical |

### Conclusion

For a POS app where cashiers type product names quickly under customer pressure, search must feel instantaneous. React memory search delivers that. SQLite search introduces enough latency to make the experience feel broken, especially on budget hardware that POS machines often run on.

SQLite is an excellent tool — but for product search in this app, keeping everything in JavaScript memory is the correct and clearly better approach.

---

# Review Comments by ChatGPT

> These are additive review comments only. The original document content above has not been rewritten or removed.

## ChatGPT Comment 1 — Zustand is good for UI state, but not enough for durable POS state

The document correctly explains why Zustand is fast and simple for UI state. However, a POS also has business-critical state that must survive crashes, restarts, updates, and power loss.

**Suggested split:**

| State type | Recommended location |
|---|---|
| Search query, current screen, visible modal | Zustand only |
| Product catalogue in runtime | Zustand / memory |
| Product catalogue persistence | SQLite |
| Current active cart | SQLite draft + Zustand mirror |
| Payment attempt | SQLite first, then UI state |
| Completed order waiting to sync | SQLite queue |
| Audit event | SQLite queue |
| Session open/close state | SQLite + backend/Odoo |

Zustand should be the UI mirror, not the only storage layer for sale-critical data.

### ✅ Final Conclusion — Comment 1

The comment is correct. Zustand is the right choice for this app and there is no better alternative for UI and runtime state at this scale. Its selector-based subscription system prevents unnecessary re-renders across 60k products, its direct `set()` mutations keep the code simple, and it has no meaningful competition for this specific use case — Redux adds boilerplate with no benefit, Jotai fragments state that needs to stay interconnected, React Query does not map well to IPC-based Electron architecture, and Context API causes performance issues at this data volume.

The gap the comment correctly identifies is that cart, payment, order queue, and session state must not stay memory-only. These are business-critical events that must survive crashes, power loss, and unexpected restarts.

**The decided approach — hybrid Zustand + SQLite — covers this correctly:**

| State type | Where it lives |
|---|---|
| Search query, current screen, visible modal | Zustand only |
| Product catalogue at runtime | Zustand memory (`allProducts[]`) |
| Product catalogue persistence | SQLite (`cache_products`) |
| Current active cart | Zustand (mirror) + SQLite (draft) |
| Payment attempt | SQLite first, then Zustand UI state |
| Completed order waiting to sync | SQLite queue |
| Audit events | SQLite queue |
| Session open/close state | SQLite + backend/Odoo |

**Implementation note:** Use Zustand's `subscribeWithSelector` middleware to auto-persist cart state to SQLite reactively on every change, without manually adding SQLite calls inside every cart action:

```js
cartStore.subscribe(
  (state) => state.cartItems,
  (cartItems) => {
    window.api.invoke('db:save-cart-draft', { cartItems, updatedAt: Date.now() });
  }
);
```

This keeps the Zustand actions clean and ensures SQLite stays in sync automatically.

**Alternatives considered for UI state management:**

| Alternative | Why ruled out |
|---|---|
| Redux Toolkit | Same result as Zustand with significantly more boilerplate — actions, reducers, slices. No real benefit here. |
| MobX | Heavier, uses implicit reactive proxies that are harder to debug. Overkill for this use case. |
| Jotai | Atom-based, naturally fragments state. Poor fit when 60k products, cart, and session all need to stay interconnected. |
| Valtio | Comparable to Zustand but smaller community, no meaningful advantage. |
| React Query | Designed for HTTP server state. Does not map to IPC-based Electron architecture where the renderer never talks directly to a server. |
| Context API + useReducer | Built-in but causes excessive re-renders — any context value change re-renders all consumers. A performance problem at 60k products. |
| XState | Excellent for complex state machines (payment flow, session flow) but overkill as the main store. Useful only for specific sub-flows. |

## ChatGPT Comment 2 — Current cart should not remain memory-only

The document says state is lost when the app closes. For normal UI state this is fine, but for POS cart/payment state this is a serious risk.

**Risk:** if the app crashes while a cashier has an active cart or while payment is in progress, the order may disappear.

**Suggested action:** persist the active cart after every mutation:

```text
cart_draft
- draft_uuid
- cashier_id
- session_id
- terminal_id
- cart_json
- updated_at
- status
```

On startup, show recovery options:

```text
Previous unsaved cart found.
Restore / Discard / Mark Cancelled
```

### ✅ Final Conclusion — Comment 2

---

#### What is this concept?

When a React + Zustand app runs, all state lives in memory — the cart items, the customer linked to the order, any discounts applied, the running total. That memory exists only as long as the app is running. The moment the app closes, crashes, or the computer loses power, everything in memory is gone. There is no record that the cashier was halfway through an order.

For most state in a normal app — which tab is selected, whether a dropdown is open — this is completely fine. Nobody cares if a menu was open when the app crashed.

For a POS cart, this is a financial risk. Consider this scenario:

- Cashier scans 12 items, applies a discount code, links a loyalty customer
- App crashes (Windows update, memory error, power cut)
- App restarts — blank cart, no trace of those 12 items
- Cashier has to rebuild the cart from memory
- Items may be missed, discount may not be remembered, order is delayed

This is not a theoretical edge case — Electron apps crash, power is unpredictable, and a busy POS terminal gets restarted or force-closed regularly. The solution is **cart draft persistence**: every time the cart changes, the current state is written to SQLite. On startup, if a draft exists, the cashier is shown a recovery option. The cart never truly disappears — it is always backed by a durable local record.

---

#### Why is it suggested here and why is it the best fit?

The pre-check-2 document describes Zustand for all state management. Zustand is an excellent runtime state tool but it is, by design, in-memory only. The comment correctly identifies that the cart is not "just state" — it is a work-in-progress financial transaction that must survive anything that can happen to the process.

SQLite is the right persistence layer for this because writes are atomic and durable. If the app crashes mid-write, SQLite either completes the write or rolls it back — it never leaves a half-written record that would corrupt the recovered cart.

**The schema the comment suggests:**

```sql
cart_draft (
  draft_uuid   TEXT PRIMARY KEY,   -- unique ID for this draft
  cashier_id   INTEGER,             -- which cashier owns it
  session_id   INTEGER,             -- which POS session it belongs to
  terminal_id  TEXT,                -- which terminal created it
  cart_json    TEXT,                -- full snapshot of the cart state
  updated_at   INTEGER,             -- Unix timestamp of the last save
  status       TEXT                 -- active / converted / abandoned / recovered
)
```

**What each field does:**

`draft_uuid` — a unique ID generated when the draft is created. This lets the recovery query identify exactly which draft belongs to the current session.

`cashier_id` and `session_id` — used to filter drafts on startup. The recovery screen should only show drafts from the current cashier's active session. Drafts from yesterday's session or a different cashier should not appear.

`terminal_id` — in a multi-terminal setup, each terminal recovers only its own drafts. Terminal A should never show Terminal B's interrupted cart.

`cart_json` — a full JSON snapshot of everything in the cart at the moment of the last save: all line items, quantities, prices, any discount codes applied, the linked customer, any price overrides, and the running subtotal and total. Storing only product IDs is not enough — recovering an incomplete cart that is missing its discount or customer is nearly as bad as losing the cart entirely.

`updated_at` — the timestamp of the last save. Used in the recovery UI to show how old the draft is (explained below).

`status` — the lifecycle state of the draft:

| Status | Meaning |
|---|---|
| `active` | Currently being worked on — show in recovery if found on startup |
| `converted` | Became a completed order — skip this draft entirely on recovery |
| `abandoned` | Cashier explicitly discarded it — skip on recovery |
| `recovered` | Was restored after a crash — keeps audit trail |

**How the auto-persist works:**

The cart must not be saved manually inside every cart action — that creates a maintenance problem where a new cart action that forgets to call `save` silently breaks persistence. Instead, use Zustand's `subscribeWithSelector` to watch the cart state and persist automatically whenever it changes. A 200ms debounce prevents SQLite writes on every individual keystroke during rapid barcode scanning — the write happens 200ms after the last change:

```js
cartStore.subscribe(
  (state) => state.cartItems,
  debounce((cartItems) => {
    window.api.invoke('db:save-cart-draft', {
      cartItems,
      discounts: cartStore.getState().discounts,
      customer: cartStore.getState().customer,
      updatedAt: Date.now()
    });
  }, 200)
);
```

This means the developer writes the cart action, the persist happens automatically — there is nothing to forget.

**The recovery UI on startup:**

When the app starts, it queries `cart_draft WHERE status = 'active' AND terminal_id = ? AND session_id = ?`. If a draft is found, a recovery dialog is shown before the cashier reaches the main screen. The dialog must show:

- How many items were in the cart (so the cashier can recognise it as theirs)
- The cart total (to confirm the value at risk)
- How old the draft is using `updated_at` — a cart saved 3 minutes ago is almost certainly worth restoring; a cart from 48 hours ago from a previous shift is probably stale

The cashier is given three options: **Restore** (mark as `recovered`, load into Zustand), **Discard** (mark as `abandoned`, clear), or **Mark Cancelled** (mark as `abandoned` with a reason, useful for manager audit).

---

#### Additional improvements

**Write the draft and mark it `converted` in the same SQLite transaction as the completed order:**

When a sale completes, two things must happen atomically: the order is written to the orders table, and the draft's status is set to `converted`. If these happen separately, a crash between them could leave a draft marked `active` even though the order completed — causing a false recovery prompt on the next startup.

```js
db.transaction(() => {
  db.prepare(`INSERT INTO orders ...`).run(orderData);
  db.prepare(`UPDATE cart_draft SET status = 'converted' WHERE draft_uuid = ?`).run(draftUuid);
})();
```

**Clean up old drafts periodically:**

Drafts with status `converted`, `abandoned`, or `recovered` from more than 90 days ago can be hard-deleted during the daily maintenance window. Keeping them longer than needed adds unnecessary bulk to the database.

---

#### Is there a better alternative?

No — SQLite with reactive auto-persist is the only approach that is both durable and low-friction for the development team:

| Alternative | Why it does not fit |
|---|---|
| Memory-only Zustand state (no persistence) | Lost on every crash, power cut, or force-close — the original problem |
| `localStorage` via Electron | Survives soft closes but not process kills or hard power cuts — not truly durable |
| Autosave to a flat file (JSON file on disk) | File writes are not atomic — a crash mid-write produces a corrupted or truncated file; no transactional safety |
| Normalized `cart_draft_lines` table (one row per item) | More queryable in theory but the only operation ever performed is "save the whole cart" and "restore the whole cart" — a JSON blob does both in one read/write with no downside |
| Event sourcing (store every cart action, replay on restore) | Correct in principle but massively overengineered for a cart that the cashier clears every 2–5 minutes; recovery latency from replaying hundreds of events is unacceptable at the start of a shift |
| SQLite `cart_draft` with reactive Zustand subscription (chosen) | Atomic writes, crash-safe, zero footprint in cart action code, single read to restore |


## ChatGPT Comment 3 — Product load should include more than products

The document focuses on 60,000 products, which is important. But an Odoo 15 POS needs more local data to calculate checkout correctly.

Add cache/sync plans for:

- product variants
- alternate barcodes
- units of measure
- taxes
- fiscal positions
- pricelists
- promotions/discounts
- customers
- payment methods
- POS config
- POS session
- cash rounding
- user roles/permissions

If only products are cached, offline sale totals may not match Odoo totals.

### ✅ Final Conclusion — Comment 3

Plans exist for handling the additional data types mentioned in this comment (variants, taxes, pricelists, promotions, customers, payment methods, POS config, session, etc.) but they have not been documented yet. The conclusion for this comment will be written once those plans are finalized. This comment is acknowledged as valid and will be fully addressed at that point.

## ChatGPT Comment 4 — Avoid timestamp-only sync

The document mentions freshness and full reloads. For production sync, avoid depending only on `last_synced_at` because device clocks can drift and records can be missed.

**Suggested action:** use backend-issued revision numbers:

```text
product_revision = 184923
price_revision = 99831
tax_revision = 447
customer_revision = 11304
```

The client then requests:

```text
GET /sync/products?after_revision=184923
```

This is safer than relying only on timestamps.

### ✅ Final Conclusion — Comment 4

The comment is correct. Timestamp-based sync must be replaced with backend-issued revision numbers. This is the best solution and there is no better alternative.

**What backend-issued revision numbers are:**

A revision number is a single global counter on the backend that increments every time any piece of data changes. It has nothing to do with time — it is just an integer that always goes up, assigned by the server, never by the client.

```
Product "Apple Juice" price changes  → backend assigns revision 184923
Product "Mango Drink" added          → backend assigns revision 184924
Tax "GST 18%" updated                → backend assigns revision 184925
```

Every change to any piece of data gets a unique, sequential revision number. The counter never resets and never goes backwards.

**Why timestamps fail:**

If the POS machine's clock drifts even a few minutes behind the backend server's clock, the sync query `updated_after=<timestamp>` will miss records that were updated in that gap — silently, with no error. The POS runs on stale data without knowing it.

Revision numbers have no clock involved. The query `after_revision=184923` asks for all records with a revision number greater than 184923 — this is a simple integer comparison on the server and cannot miss anything.

**How it works in this app:**

The custom backend has a `revision_counter` table. Every time a sync-relevant record changes, the backend increments the counter and assigns the new value to that record. Each data type tracks its own counter independently:

```
SQLite app_settings on POS:
  key               | value
  product_revision  | 184924
  tax_revision      | 184925
  customer_revision | 11304
```

On every sync, the POS sends its last known revision:

```
GET /sync/products?after_revision=184924
→ Backend returns only products with revision > 184924
→ POS saves the highest revision number received
→ Next sync continues from there
```

**Separate counters per data type** are the right design. Products, taxes, customers, and other data types each track their own revision independently so they can be synced on different schedules without coupling.

Since this app has a fully custom backend, revision counters are implemented natively from day one — no workarounds or fallbacks needed.

**Alternatives considered:**

| Alternative | Why ruled out |
|---|---|
| Timestamp-only sync | Clock drift between POS and server silently misses records. Already ruled out as the primary approach. |
| Timestamp + safety margin (re-fetch last N minutes) | Avoids drift but re-processes already-seen records on every sync. Acceptable as a fallback only. |
| ETag / content hash per record | Requires sending all 60k hashes on every sync just to detect what changed. Extremely bandwidth-heavy. |
| Full reload every sync | Simple but defeats the entire purpose of incremental sync. Wastes bandwidth and server load. |
| Event sourcing / CDC | Correct and powerful but massive infrastructure complexity for this use case. Overkill. |

## ChatGPT Comment 5 — Startup should not depend on all products loading successfully

The React-only approach says every app launch fetches everything fresh. That is simple, but it can block checkout if the backend is down or slow.

**Suggested action:** use the hybrid approach described in the third file:

```text
1. Load last known catalogue from SQLite immediately.
2. Show product grid quickly.
3. Sync fresh changes in the background.
4. Show a subtle stale/offline indicator if sync fails.
```

This protects cashier workflow.

### ✅ Final Conclusion — Comment 5

Already resolved. The hybrid approach described in pre-check-3.md directly implements exactly what this comment suggests. On every launch, SQLite is read first and the product grid is shown immediately — the cashier can start working without waiting for any network call. The background sync then runs silently. If the backend is unreachable, the app continues working on the last known catalogue and shows a subtle offline indicator. Startup does not depend on the backend being available.

## ChatGPT Comment 6 — In-memory search is correct, but add indexing maps

The document says JavaScript filtering over 60k products is fast. That is reasonable. To keep it reliable as the catalogue grows, add precomputed indexes/maps.

Suggested memory structures:

```js
allProducts = []
productById = new Map()
productByBarcode = new Map()
productsByCategory = new Map()
normalizedSearchTextById = new Map()
```

This helps barcode lookup and category filtering stay fast without scanning everything each time.

### ✅ Final Conclusion — Comment 6

The comment is correct. The five suggested indexing Maps must be added alongside `allProducts[]`. There is no better alternative — `Map` is the correct JavaScript data structure for O(1) key-based lookup and nothing else fits this use case better.

**What `allProducts[]` and `Map()` are and why both are needed:**

`allProducts[]` is a flat array of all 60,000 products. Every product sits at some index position. To find a product by barcode or ID in this array, JavaScript has to scan item by item until it finds a match — in the worst case all 60,000 items. This is fine for text search (you need to check all items anyway to find all matches) but wasteful for exact lookups where you already know the exact key.

A `Map` is a key-value store. You put a product in with a key (like its barcode), and you retrieve it by that exact key in a single step — no scanning, no looping, regardless of how many items are in the Map. This is called O(1) lookup. It takes the same time whether the Map has 10 items or 10 million.

**The five structures and what each one solves:**

```js
allProducts = []                        // full flat array — used for text search (scan is needed here)
productById = new Map()                 // key: product.id    → instant lookup on WebSocket updates
productByBarcode = new Map()            // key: product.barcode → instant lookup on every barcode scan
productsByCategory = new Map()          // key: category name  → pre-filtered list, no scan on category click
normalizedSearchTextById = new Map()    // key: product.id    → pre-lowercased string, avoids toLowerCase() on 60k items per keystroke
```

**One additional Map the comment missed — `_allProductsIndexMap`:**

Without this, patching `allProducts[]` on a WebSocket update still requires a `findIndex` scan through the array. With it, the array patch is also O(1):

```js
_allProductsIndexMap = new Map()   // key: product.id → value: index position in allProducts[]
```

**All six structures are built in a single pass at startup:**

```js
function buildIndexes(products) {
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    productById.set(p.id, p);
    productByBarcode.set(p.barcode, p);
    _allProductsIndexMap.set(p.id, i);
    normalizedSearchTextById.set(p.id, `${p.name} ${p.barcode}`.toLowerCase());

    if (!productsByCategory.has(p.category)) productsByCategory.set(p.category, []);
    productsByCategory.get(p.category).push(p);
  }
}
```

One pass, done once after products load. After this, all lookup operations are O(1).

**Critical rule — always update `allProducts[]` and all Maps together:**

Every time a product changes (WebSocket update, sync patch, product deleted), both the array and the relevant Maps must be updated in the same function. Never update them separately — if they drift out of sync, map lookups return stale data while the array has the correct version:

```js
function _patchProduct(updatedProduct) {
  const index = _allProductsIndexMap.get(updatedProduct.id);
  if (index !== undefined) allProducts[index] = updatedProduct;

  productById.set(updatedProduct.id, updatedProduct);
  productByBarcode.set(updatedProduct.barcode, updatedProduct);
  normalizedSearchTextById.set(
    updatedProduct.id,
    `${updatedProduct.name} ${updatedProduct.barcode}`.toLowerCase()
  );
  // rebuild productsByCategory entry if the product's category changed
}
```

**Alternatives considered:**

| Alternative | Why ruled out |
|---|---|
| Plain object `{}` instead of `Map` | Works, but `Map` is faster for frequent `.get()` / `.set()` operations and handles non-string keys cleanly. |
| SQLite indexes | For disk-based queries, not in-memory lookup. Wrong layer entirely. |
| Binary search on a sorted array | Only works for exact ID match on a pre-sorted array. More complex to maintain than a Map with no real advantage. |
| `WeakMap` | Keys must be objects, not primitives. Cannot use a product ID (number/string) as a key. |
| Third-party search library (e.g. Fuse.js) | Adds dependency and overhead for fuzzy search. Plain `.includes()` on 60k pre-normalized strings is already fast enough. |

## ChatGPT Comment 7 — Debounce search input but keep barcode instant

For manual typing, use a small debounce to avoid unnecessary recompute on every keypress. For barcode scans, do not debounce the lookup because cashier flow expects instant response.

Suggested rule:

```text
Manual text search: 80–150 ms debounce
Barcode scan: immediate lookup by barcode map
Category click: immediate or very small debounce
```

### ✅ Final Conclusion — Comment 7

The comment is correct. The three input types must be handled differently, and the timing-based approach is the best solution for barcode detection — no alternatives are better for a general POS that may use different scanners on different machines.

**Debounce for manual text search:**

Every keystroke triggers `_recomputePage()`. Without debounce, typing "apple juice" runs the filter 11 times. With a 150ms debounce, it runs once after the user pauses. The delay is imperceptible to the user but eliminates wasted computation. 150ms is the correct value — below 80ms saves little, above 200ms feels laggy.

```js
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const handleSearch = debounce((query) => _recomputePage(query), 150);
```

**Instant barcode lookup — timing-based detection:**

A barcode scanner fires all characters in under 50ms total. A human cannot type that fast. By measuring the time gap between consecutive keystrokes, the app distinguishes the two sources on a single input box — no hardware configuration, no separate input field, works with any scanner out of the box.

When consecutive keys arrive faster than 50ms apart, characters are collected into a `barcodeBuffer`. When Enter arrives, the full buffer is looked up instantly via `productByBarcode.get()` — a direct Map lookup, zero scanning, ~1ms regardless of catalogue size.

The 50ms threshold should be a configurable setting to handle rare slow scanners without a code change.

**Category click:**

A single click event — no debounce needed. The `productsByCategory` Map (built in Comment 6) returns the pre-filtered category list directly, so the operation is already O(1).

**The three rules in summary:**

| Input type | Handling |
|---|---|
| Manual text search | 150ms debounce → `_recomputePage()` filter on `allProducts[]` |
| Barcode scan | Timing detection (< 50ms gap) → `productByBarcode.get()` on Enter |
| Category click | Immediate → `productsByCategory.get(category)` |

**Alternatives considered for barcode detection:**

| Alternative | Why ruled out |
|---|---|
| Separate dedicated input field for scanner | Requires scanner to be hardware-configured to send Tab prefix/suffix. Fragile — if focus is on the wrong element, scans are missed entirely. |
| Scanner SDK / USB HID direct access via Node.js | Works for a single known scanner model in a controlled environment. Overkill for a general POS that may use different scanners on different machines. |
| Prefix/suffix character detection | Scanner must be configured to prepend a special character before every barcode. Requires reconfiguring every scanner and breaks on factory reset. |
| Barcode length threshold (detect by string length) | Unreliable — product names can be short and numeric, barcodes can be alphanumeric. High false positive and false negative rate. |

## ChatGPT Comment 8 — WebSocket product updates need missed-message recovery

The document explains real-time product syncing through WebSocket. This is good, but WebSockets can disconnect.

**Suggested action:** every WebSocket update should carry a revision number. On reconnect, the app should ask for all changes after the last applied revision.

Example:

```json
{
  "type": "product_updated",
  "revision": 184924,
  "id": 4521,
  "list_price": 149.99
}
```

On reconnect:

```text
GET /sync/products?after_revision=184923
```

This prevents missing price updates during temporary disconnects.

### ✅ Final Conclusion — Comment 8

The comment is correct. The revision number approach is the best solution for WebSocket missed-message recovery and there is no better alternative.

**Why WebSocket alone is not enough:**

WebSocket connections drop — network hiccup, server restart, machine sleep/wake. During a disconnect, product updates (price changes, new products, deactivations) are sent by the backend but the POS never receives them. When the connection restores, the POS has no way to know what it missed unless there is an explicit catch-up mechanism.

**Why revision numbers are the right solution:**

Every WebSocket message carries a revision number. The POS tracks the highest revision it successfully processed. On reconnect, it uses the same revision-based sync endpoint already built for Comment 4:

```
WebSocket disconnects
  → POS tracks last applied revision (e.g. 184923)

WebSocket reconnects
  → GET /sync/products?after_revision=184923
  → Backend returns only the changes that were missed
  → POS patches allProducts[] and all Maps
  → Back in sync — no full reload needed
```

This is not new infrastructure. It reuses the revision counter system already decided in Comment 4. The only addition is that each WebSocket message must include its revision number, and the POS must save the highest one it processes.

**Alternatives considered:**

| Approach | Why it was ruled out |
|---|---|
| Full re-sync on every reconnect | Works but wasteful — re-fetches all 60k products for what may be 2–3 changed records. Causes 3–8 second grid reload on every disconnect |
| Timestamp-based catch-up | Already ruled out in Comment 4 — clock drift can silently miss records |
| Ignore missed messages, wait for next scheduled sync | Acceptable as a safety net only — a deactivated product could still be sold for up to 15 minutes |
| Server-Sent Events (SSE) with built-in Last-Event-ID | Has native reconnect + catch-up, but adding SSE alongside WebSocket means two connection types. Not worth the complexity since WebSocket + revision numbers achieves the same result |

**The three-layer safety net:**

No single mechanism covers every failure scenario. These three layers work together:

| Layer | What it covers |
|---|---|
| WebSocket with revision catch-up | Real-time updates while connected; catches missed messages on reconnect |
| Periodic background sync (every 5–15 min) | Safety net — catches anything that slipped through regardless of WebSocket state |
| Full re-sync on app launch | Guarantees a clean state at every startup |

With all three layers active, there is no realistic scenario where the POS runs on stale data for more than 15 minutes, and for most changes it will be current within seconds.

## ChatGPT Comment 9 — Price/tax calculation should be backend-compatible

A POS cannot only show fast UI results; it must calculate totals exactly the same way as the backend/Odoo.

**Suggested action:** define where the source of truth lives for:

- tax rounding
- price rounding
- discounts
- promotions
- loyalty points
- EBT or special payment eligibility
- cash rounding
- unit/weight price calculation

If frontend and backend calculations differ by even a few cents, reconciliation will become difficult.

### Final Conclusion — Comment 9

#### The Problem

When a cashier rings up an order, two things happen at the same time:

1. The **POS frontend calculates the total** — this is what the cashier sees on screen, what the customer is told to pay, what gets printed on the receipt.
2. The **backend also calculates the total** — this is what goes into accounting, financial records, and end-of-day reconciliation.

If these two numbers differ by even ₹0.01, you get a reconciliation mismatch. Multiply that across 500 transactions a day on 10 terminals and you have unexplained gaps in your books every single day.

The tricky part is: **even if both sides are using the same formula, they can still produce different numbers.** Here is why.

**Rounding order changes the result.** Tax calculation involves decimals. At some point you round. If you round per line item first and then sum, you get a different number than if you sum first and then round. Both are mathematically correct — but if the frontend does one and the backend does the other, every multi-item order will mismatch.

**Tax-inclusive vs tax-exclusive is per product.** Some products have the tax already inside their shelf price (you extract the tax from the price). Others have tax added on top. If the frontend does not know which model a specific product uses and just assumes one globally, every product with a different model is calculated wrong.

**Discount order changes tax.** If a 10% discount is applied before tax, the tax is calculated on the reduced price. If it is applied after tax, the result is the same final number but the tax component on the receipt is different. Backend and frontend must apply discounts at the same stage.

**Promotions are complex.** "Buy 2 get 1 free" or "10% off if cart total exceeds ₹500" — if the frontend tries to calculate these independently and gets slightly different eligibility logic than the backend, the totals will diverge.

---

#### How to Handle It

The answer is not to make the frontend smarter. The answer is to make sure **the frontend only ever uses rules it received from the backend** — and then submit both the cart and the frontend's calculated total to the backend, which re-calculates independently and compares.

**Step 1 — Sync all calculation rules from the backend at startup.**

Tax rules are not hardcoded on the frontend. They are records in the backend database, synced to SQLite alongside products using the same revision-based sync already built. Each product row carries a `tax_ids` field pointing to the tax records that apply to it. Each tax record carries: rate, whether it is inclusive or exclusive, and the rounding method.

This means if a product's GST rate changes from 12% to 18%, the frontend learns about it automatically through the next sync — same as a price change.

The following tables need to be part of the sync pipeline alongside products:

- `taxes` — rate, inclusive/exclusive flag, rounding method, revision
- `discounts` — type, value, applies before or after tax, revision
- `promotions` — conditions, reward, active status, revision
- `pos_config` — cash rounding rule, loyalty enabled, terminal-level settings

**Step 2 — Define one rounding rule and document it.**

Decide once: round per line item first, then sum. Write it down. Both frontend and backend follow this exact rule. It is never changed without changing both sides at the same time.

**Step 3 — Frontend calculates locally, backend confirms on submission.**

The frontend calculates the total immediately using the synced rules — this is what the cashier and customer see on screen, and it works fully offline.

When the cashier confirms payment, the frontend submits the full cart plus its calculated total to the backend. The backend independently re-calculates. If the two totals differ by more than a small configurable threshold (e.g., ₹0.01), the transaction is **flagged for review** — it is not rejected and it does not block the cashier. It is logged so the reconciliation team can investigate.

This is the industry-standard pattern for production POS systems: **local speed for the user, backend verification for financial accuracy.**

**Step 4 — Keep complex logic on the backend only.**

Not everything should be calculated locally:

- **Complex promotions** (stacked discounts, cross-category eligibility, spend-threshold triggers) — the frontend applies simple promotions locally. For complex ones, it sends the cart to the backend for a "calculate promotions" call before checkout is finalized. This is one round-trip, only at checkout, not on every keystroke.
- **Loyalty point balance** — always read from the backend. Never cache as authoritative. Frontend shows an estimate; actual award happens only after backend confirmation.
- **Tax authority filing** — the backend owns all financial records. The frontend only ever shows and submits — it never generates the authoritative numbers.

---

#### Why This Matters for This App Specifically

This app has 60,000 products. In India, GST rates vary per product category: groceries at 0%, packaged food at 5%, electronics at 12% or 18%, cosmetics at 28%. A product that looks like a grocery item to the cashier might have a different GST rate than expected.

If the frontend applies a single flat GST rate (even the most common one), every product in a different tax band is calculated wrong — and with 60k products, many will be in different bands.

The revision-based sync architecture already built handles this naturally. Tax records just become another data type tracked with revision numbers. No new sync mechanism needed — just add the tables.

## ChatGPT Comment 10 — Add performance thresholds to the document

The document gives estimated speeds. Add measurable thresholds so future developers know when a change is unacceptable.

Suggested targets:

```text
Cold usable startup from SQLite: < 2 seconds
Manual search response: < 50 ms visible latency
Barcode lookup: < 30 ms
Add-to-cart operation: < 50 ms
Checkout screen transition: < 100 ms
Background sync should not freeze UI
```

### Final Conclusion — Comment 10

Accepted. These thresholds are adopted for this app. Any future change to product loading, search, cart, or sync must be validated against them:

| Operation | Threshold |
|---|---|
| Cold usable startup from SQLite | < 2 seconds |
| Manual search response (visible latency) | < 50 ms |
| Barcode lookup | < 30 ms |
| Add-to-cart operation | < 50 ms |
| Checkout screen transition | < 100 ms |
| Background sync | Must not block or visibly freeze the UI |

## ChatGPT Comment 11 — Memory usage should be monitored in production

The document estimates 50–150 MB for product data. In production, memory may grow due to images, product metadata, promotions, and duplicated normalized search fields.

**Suggested action:** log runtime memory usage periodically:

```text
renderer_memory_mb
main_process_memory_mb
product_count
cart_line_count
catalog_revision
```

This will help catch memory leaks before they become field issues.

### Final Conclusion — Comment 11

Accepted. These metrics will be logged periodically in production to catch memory leaks early:

| Metric | Purpose |
|---|---|
| `renderer_memory_mb` | Tracks UI process memory — catches leaks in Zustand state or React component trees |
| `main_process_memory_mb` | Tracks Electron main process — catches leaks in IPC handlers or SQLite connections |
| `product_count` | Correlates memory with catalogue size |
| `cart_line_count` | Correlates memory with active cart size |
| `catalog_revision` | Identifies which sync version is loaded at time of log |

## ChatGPT Comment 12 — Do not treat SQLite search as always bad; use it for admin/reporting cases

The document correctly argues against SQLite for every cashier search keystroke. But SQLite can still be useful for non-cashier flows.

Good SQLite use cases:

- offline order queue
- audit trail
- cart recovery
- completed local transaction history
- support diagnostics
- admin product lookup if memory index is unavailable
- reconciliation export

So the recommendation should be: avoid SQLite for live product-grid keystroke search, but use SQLite for durable POS data.

### Final Conclusion — Comment 12

The comment is correct. SQLite was ruled out for live cashier search because querying disk on every keystroke at 60k products is too slow — that decision stands. But that does not mean SQLite is bad. It means SQLite is being used at the wrong layer for search.

For everything else — data that must survive a crash, a restart, or an offline period — SQLite is exactly the right tool. Zustand is RAM only; it loses everything the moment the process closes. SQLite is durable by design.

**The simple rule:**

| Situation | Use |
|---|---|
| Cashier typing in the search box (live, repeated, every keystroke) | In-memory — `allProducts[]` + Maps |
| Anything that must survive a crash or app restart | SQLite |
| Anything written once, read rarely | SQLite |
| Anything that needs to be queried while the backend is offline | SQLite |

**All seven use cases from the comment are accepted:**

- **Offline order queue** — completed orders when the backend is unreachable must be stored locally and submitted once connectivity returns. SQLite is the only correct choice; Zustand dies with the process.
- **Audit trail** — append-only log of cashier actions (items added, voids, payment methods). Must survive restarts. SQLite is correct.
- **Cart recovery** — already decided in Comment 2. Confirmed SQLite use case.
- **Completed local transaction history** — looking up a receipt from earlier in the shift. Low-frequency query on a small dataset. SQLite with an index on `created_at` handles this easily.
- **Support diagnostics** — queryable local log for field support when the backend is unreachable. SQLite lets you run a simple query without needing the backend up.
- **Admin product lookup if memory index is unavailable** — fallback for the brief window at startup before products finish loading into memory. One-off admin action, not a cashier keystroke flow.
- **Reconciliation export** — end-of-day data must be exportable even if the backend is down. SQLite is the local source for this.

None of these require any new mechanism. The SQLite database is already in place from the hybrid architecture. These are just additional tables in the same database.

## ChatGPT Comment 13 — Product images should have a separate cache strategy

If product images are added later, do not store large image blobs in Zustand or frequently rewrite them in SQLite.

Suggested approach:

```text
- Store image metadata in SQLite
- Store image files under ProgramData cache folder
- Use content hash/version for invalidation
- Lazy-load images only when visible
- Keep fallback placeholder image
```

This prevents memory growth and slow startup.

### Final Conclusion — Comment 13

#### The Problem

When product images are added, two obvious places to store them seem natural — Zustand (already holds all product data) or SQLite (already holds all product data). Both are wrong for images.

**Why not Zustand:** Zustand lives in RAM. Even a small 10KB thumbnail per product across 60k products = 600MB of RAM just for images. A medium 50KB image = 3GB — the app crashes. Even with lazy loading, Zustand has no eviction mechanism. Once an image loads into the store, it stays there until the app restarts. Over a cashier shift, RAM grows continuously.

**Why not SQLite blobs:** SQLite can store binary data but it is optimized for structured rows, not large binary files. Storing image blobs makes the database file massive, slows down all queries, and makes backups impractical. On startup, when all 60k products are loaded into memory, you absolutely do not want image blobs coming along — that defeats fast startup entirely.

**The right approach — Filesystem Cache** This correct pattern, used by every major desktop app (Chrome, VS Code, Electron apps, Windows Store)
Images are binary assets, not product data. They live on disk in a dedicated cache folder. SQLite stores only the metadata (path, hash). The UI loads images lazily from disk only when visible on screen.

---

#### How It Works

**1. Image files on disk — main process managed**
Images are saved as files in a dedicated cache folder (`%AppData%\<AppName>\image-cache\`). The Electron main process owns this folder — it downloads, saves, and deletes files. The renderer never writes files directly.

**2. SQLite stores metadata only — no blobs**
Three fields are added to the `products` table:
- `image_url` — remote URL to fetch from if not cached
- `image_hash` — used to detect when the cached version is stale
- `image_cached_path` — local file path of the cached image

This is a few strings per product — no bloat in SQLite.

**3. Invalidation via content hash**
When a product's image changes on the backend, `image_hash` changes. The next revision-based sync picks this up. The frontend checks: does the locally cached file match the new hash? If not, delete the old file and download the new one. If yes, use the cached file — no download needed. Same mechanism as browser cache-busting.

**4. Lazy-load — only when visible**
The product grid may show 60k products but only ~20–50 are visible at any moment. Using `IntersectionObserver`, the image `src` is set to a blank placeholder initially and swapped to the real local file path only when the product card scrolls into view. RAM usage stays flat regardless of catalogue size.

**5. Fallback placeholder**
If the cached file is missing or still downloading, a single placeholder image bundled with the app is shown. The cashier never sees a broken image icon.

---

#### What to Add to the Data Model Now

Product images are not in scope yet, but these three nullable fields should be added to the `products` table now — they cost nothing when empty and make images easy to introduce later without a schema migration:

```sql
image_url          TEXT,
image_hash         TEXT,
image_cached_path  TEXT
```

---

**Alternatives considered:**

| Alternative | Why ruled out |
|---|---|
| Electron HTTP session cache (browser-style) | No control over eviction or offline guarantees — acceptable only if images are low-priority and re-downloads on cache clear are fine |
| Cache API / IndexedDB in renderer | Lives inside Chromium's storage layer — hard to inspect, hard to control, shares quota with other browser data |
| SQLite blobs with lazy SELECT per product | Slower than file reads, makes the SQLite file massive, unacceptable at 60k product scale |

## ChatGPT Comment 14 — Add permission-aware state actions

Cart operations, refunds, discounts, price overrides, and manual weight entry should not be simple UI actions only. They need permission checks.

Suggested action names:

```text
cart.addItem
cart.removeLine
cart.applyDiscount
cart.overridePrice
payment.start
refund.create
managerOverride.approve
```

Each action should validate the current user role and active session state.

### Final Conclusion — Comment 14

#### The Problem

Right now, Zustand actions are pure state operations — call `applyDiscount()`, the discount is applied. No questions asked. The comment is saying this is not enough for a production POS.

In a real store, not every cashier should be allowed to do every action. A cashier can add items and accept payment. Only a supervisor can apply a discount. Only a manager can override a price or process a refund. If this enforcement lives only at the UI level (hiding a button), it is weak — a UI bug, a keyboard shortcut, or a different code path can still trigger the action. The state layer has no idea whether the action was legitimate.

**Permission checks must live inside the Zustand action itself, not just in the UI.** The action is the gatekeeper.

When a cashier attempts an action they are not permitted to do, the POS should not silently block them. It should open a **manager override flow** — a PIN entry where a manager authenticates and approves that specific action. The cashier stays at the register. The manager walks over, enters their PIN, and the action proceeds. This is standard behavior in every retail POS.

The state also needs to validate the **active session**, not just the role. Even if permissions pass, if the POS session is closed (shift ended, terminal locked), the action must be blocked until a new session is opened.

**Three layers of enforcement — defense in depth:**
1. UI hides or disables the button (first layer — UX)
2. Zustand action checks permission before executing (second layer — logic)
3. Backend rejects unauthorized submissions (third layer — security)

---

#### Chosen Approach — Middleware wrapper + backend-driven permission table

Two patterns combined give the best result:

**Middleware wrapper (centralized guard):**

Instead of adding a permission check manually inside every action, a single `guardedAction()` wrapper handles it. All sensitive actions are wrapped once. If a new action is added in the future, the wrapper is applied — there is no chance of forgetting.

```js
const guardedAction = (permission, action) => (...args) => {
  const { currentUser } = useStore.getState()
  if (!hasPermission(currentUser, permission)) {
    triggerManagerOverride(permission, () => action(...args))
    return
  }
  action(...args)
}

// Usage in store:
applyDiscount: guardedAction('cart.applyDiscount', (discountId) => {
  set(state => ({ ... }))
})
```

**Backend-driven permission table (no hardcoded roles):**

Permissions are not hardcoded on the frontend. The backend sends a permissions table per role at login, stored in Zustand (and in SQLite for offline use):

```json
{
  "cashier":  ["cart.addItem", "cart.removeLine", "payment.start"],
  "manager":  ["cart.addItem", "cart.removeLine", "cart.applyDiscount", "cart.overridePrice", "refund.create"]
}
```

The `hasPermission()` function is a single lookup against this table. When roles change, the backend updates the table — no frontend code change needed.

---

#### What Each Action Requires

| Action | Minimum role |
|---|---|
| `cart.addItem` | Cashier (all) |
| `cart.removeLine` | Cashier |
| `cart.applyDiscount` | Supervisor / Manager |
| `cart.overridePrice` | Manager only |
| `payment.start` | Cashier |
| `refund.create` | Manager only |
| `managerOverride.approve` | Manager only |

---

#### Alternatives considered

| Alternative | Why ruled out |
|---|---|
| Permission check inside each action individually | Works but requires remembering to add it to every new action — easy to miss |
| UI-only enforcement (hide/disable buttons) | Weak — a code path change or bug bypasses it entirely. Not sufficient for financial actions. |
| Hardcoded roles on the frontend | Works for now but requires a code deploy every time a role changes. Backend-driven table is strictly better. |

## ChatGPT Comment 15 — Add Odoo 15 session awareness to frontend state

The frontend state should know which Odoo/POS session it belongs to.

Suggested fields:

```text
store_id
terminal_id
pos_config_id
local_session_id
odoo_session_id
cashier_id
session_opened_at
```

Every order, draft cart, payment attempt, and audit event should include these identifiers.

### Final Conclusion — Comment 15

#### What is a POS Session and Why Does It Need to Be in State

A POS session is a formal working period on a terminal. It starts when a cashier opens the till at the beginning of a shift and ends when they close it. Everything that happens in between — every sale, every refund, every void — belongs to that session.

This is not just a UI concept. It is a financial concept. The backend uses the session to know which transactions belong to which shift, which terminal processed which orders, which cashier was responsible, and how to reconcile the opening float vs the closing cash count.

Right now, the frontend state holds cart items, products, search queries, screen state — but it does not explicitly store which session it belongs to. The comment is saying every piece of business-critical state must carry identifiers that answer: which store, which terminal, which session, which cashier.

#### What Each Field Does

| Field | Purpose |
|---|---|
| `store_id` | In a multi-branch deployment, identifies which physical store this terminal belongs to. Without it, the backend cannot separate orders from different branches. |
| `terminal_id` | One store can have multiple counters. Each terminal must identify itself so the backend can route session open/close correctly, show per-terminal reports, and surface only that terminal's cart drafts during recovery — not drafts from other counters. |
| `pos_config_id` | Each terminal can have a different configuration — different payment methods allowed, different receipt layout, different cash rounding rule. The frontend needs to know which config it is running under. |
| `local_session_id` | A UUID generated locally the moment the session opens. Exists so that even before the backend confirms the session, every local record (cart draft, audit event) can be tagged. If connectivity is lost at session open time, local records are not orphaned. |
| `session_id` | The authoritative session ID assigned by the backend. This is what the backend uses to associate all transactions with a session for reporting and reconciliation. |
| `cashier_id` | The currently logged-in cashier. This can change mid-session — a supervisor logs in to approve a discount, then the cashier logs back in. Every individual transaction must record who was active at that moment, not just who opened the session. |
| `session_opened_at` | When the session started. Used for filtering cart drafts on recovery (do not restore a draft from last week's shift), audit reports, and session duration tracking. |

#### What Goes Wrong Without This

If cart drafts are saved to SQLite without `session_id` or `terminal_id`, the recovery logic on the next launch cannot answer: does this draft belong to the current session or a closed one from last week? Is it from this terminal or the counter next to it? Without those answers, you either surface every draft ever saved (dangerous) or surface nothing (defeats the purpose of recovery).

If orders in the offline queue are missing `session_id`, when connectivity returns and they are submitted, the backend cannot assign them to the correct session. They get rejected or end up as orphaned records in accounting with no session context.

If `cashier_id` is missing from audit events, the end-of-day report cannot show which cashier performed which actions. If something went wrong during the shift, there is no way to trace it to a specific operator.

The comment is asking: store all these identifiers in Zustand as a session slice, and stamp every record — cart draft, order, payment attempt, audit event — with them before saving to SQLite or submitting to the backend. Approach and implementation will be decided separately.

---

This concludes all 15 ChatGPT review comments for pre-check-2.*