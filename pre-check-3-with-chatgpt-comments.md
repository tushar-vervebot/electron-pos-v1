# Hybrid SQLite + React State Approach

## Phase 1 — Very First Launch (No SQLite data yet)

This only happens once — the very first time the app is ever opened on a machine.

```
App opens for the first time
  → Check SQLite: is cache_products table empty?
  → YES — show a loading screen "Setting up product catalogue..."

  → Start fetching from Backend API
    → Page 1  (500 products) ──┐
    → Page 2  (500 products)   │  All fetched in parallel batches
    → Page 3  (500 products) ──┘

  → As each batch arrives:
    → Map products to frontend shape
    → Write batch into SQLite  (INSERT 500 rows)
    → Add batch to allProducts[] in React memory
    → Update loading progress: "Loading... 1500 / 60000"

  → All pages done:
    → SQLite now has all 60,000 products on disk
    → allProducts[] has all 60,000 in memory
    → Save "last_synced_at" timestamp in SQLite
    → Hide loading screen
    → Show product grid — fully ready
```

**This takes 10–30 seconds. It only ever happens once.** Every launch after this is fast.

---

## Phase 2 — Normal Launch (SQLite already has data)

Every subsequent app launch follows this flow:

```
App opens
  │
  ├─► STEP 1: Load from SQLite (takes ~500ms)
  │     → Read all rows from cache_products table
  │     → Map into allProducts[] in React memory
  │     → _recomputePage() slices first 50
  │     → GRID IS VISIBLE AND USABLE
  │     (user can already start working)
  │
  └─► STEP 2: Background sync (runs silently, non-blocking)
        → Fetch all pages from Backend API in background
        → For each product received from Backend:
            → Compare with the matching row in SQLite
            → If changed (price, name, stock, etc.):
                → UPDATE that row in SQLite
                → Patch the matching item in allProducts[] in memory
                → Grid silently reflects the change
        → If Backend has more products than SQLite:
            → INSERT the new products into SQLite
            → Add them to allProducts[] in memory
        → If SQLite has products no longer in Backend:
            → DELETE those rows from SQLite
            → Remove from allProducts[] in memory
        → Save updated "last_synced_at" timestamp in SQLite
```

**The key point:** The user sees the grid in under 1 second. The sync happens quietly behind the scenes. The user is never blocked. Only changed products are written — unchanged products are skipped entirely.

---

## Phase 3 — Search and Filter (Runtime)

After both phases are done, search works exactly the same as pure React memory — because the data is already in memory.

```
User types "apple" in search box
  → JavaScript filters allProducts[] in memory
  → Takes 2–5ms for 60,000 items
  → Results appear instantly
  → SQLite is NOT touched during search
```

SQLite is only read at startup (Phase 2, Step 1) and written during sync. It is never involved in search, filter, or pagination.

---

## Phase 4 — Real-Time Updates (While App is Running)

When a product changes in the Backend while the app is already open:

```
Backend sends WebSocket message:
  { type: "product_updated", id: 4521, list_price: 149.99, name: "Apple Juice 1L" }

Main process receives it
  │
  ├─► Write to SQLite:
  │     UPDATE cache_products SET price=149.99, name="Apple Juice 1L" WHERE id=4521
  │
  └─► Send IPC to renderer:
        → Find product index using _allProductsIndexMap (O(1) lookup)
        → allProducts[index] = updatedProduct
        → _recomputePage() re-slices visible page
        → Grid re-renders with new price
        → Takes ~10ms total
```

**Both SQLite and React memory are updated together.** This means:
- The user sees the change instantly (React memory)
- If they close and reopen the app, the change is still there (SQLite)

---

## Phase 5 — Offline (No Network Available)

```
App opens, no internet/network
  │
  ├─► STEP 1: Load from SQLite — works perfectly
  │     → allProducts[] filled from local disk
  │     → Grid shows last known products
  │
  └─► STEP 2: Background sync attempt — fails silently
        → Try to reach Backend API → connection refused
        → Catch the error quietly
        → Show subtle badge: "Offline — showing data from last sync"
        → App continues working normally
        → When network returns: sync runs automatically
```

The cashier can still search, add to cart, and process payments. They just cannot get product updates until the network comes back.

---

## What Lives Where — Summary

| Data | Where stored | Why |
|---|---|---|
| All 60k products | React memory (`allProducts[]`) | Fast search & filter |
| Same 60k products | SQLite (`cache_products`) | Fast startup & offline fallback |
| Last sync timestamp | SQLite (`app_settings`) | Track when data was last refreshed |
| Current cart | React memory only | Temporary, session-specific |
| Current screen | React memory only | UI state, no need to persist |

---

## The Full Picture in One Diagram

```
┌─────────────────────────────────────────────────────────┐
│                        APP LAUNCH                       │
└─────────────────────────────────────────────────────────┘
              │                          │
              ▼ (instant)                ▼ (background)
   ┌──────────────────┐       ┌─────────────────────────┐
   │  Read SQLite     │       │  Fetch Backend API      │
   │  → allProducts[] │       │  → compare each product │
   │  → Show grid     │       │  → write only changes   │
   └──────────────────┘       └─────────────────────────┘
              │                          │
              ▼                          ▼
   Grid usable in <1s         Grid silently refreshes
                                with latest data


┌─────────────────────────────────────────────────────────┐
│                     DURING USE                          │
└─────────────────────────────────────────────────────────┘

   User searches/filters
         │
         ▼
   allProducts[] in memory   ← NEVER touches SQLite
         │
         ▼
   Results in 2–5ms

   WS product update arrives
         │
         ├──► SQLite updated (for next restart)
         └──► allProducts[] patched (for right now)
```

---

## Why This Is Better Than Both Pure Approaches

| Problem | React Only | SQLite Only | Hybrid |
|---|---|---|---|
| Slow cold start | ❌ 10–30s wait | ✅ Instant | ✅ Instant |
| Search speed | ✅ 2–5ms | ❌ 50–200ms | ✅ 2–5ms |
| Offline capability | ❌ Nothing loads | ✅ Full | ✅ Full |
| Data freshness | ✅ Always fresh | ❌ Depends on sync | ✅ Fresh after background sync |
| Code complexity | ✅ Simple | ❌ Complex | 🟡 Moderate |
| RAM usage | ❌ All in memory | ✅ Low (page by page) | ❌ Same as React only |

The hybrid keeps all the **speed advantages of React memory** while gaining the **resilience advantages of SQLite**. The only thing it does not improve is RAM usage — all 60k products still need to be in memory for instant search.

---

# Review Comments by ChatGPT

> These are additive review comments only. The original document content above has not been rewritten or removed.

## ChatGPT Comment 1 — Hybrid approach is the strongest option

The hybrid SQLite + React memory approach is the best direction for this POS because it gives:

- fast startup after first launch
- offline product availability
- fast in-memory search
- durable local cache
- background freshness updates

This is better than React-only and better than SQLite-only for cashier workflow.

### ✅ Final Conclusion — Comment 1

Agreed. The hybrid approach is the confirmed architecture for this app. This comment validates the decision already made in pre-check-3.md and no further R&D is needed.

The five reasons the comment gives are all correct and already covered by the existing design:

| Benefit | How it is achieved |
|---|---|
| Fast startup after first launch | Phase 2 loads from SQLite — grid is usable in under 1 second |
| Offline product availability | Phase 5 reads from SQLite even when backend is unreachable |
| Fast in-memory search | Phase 3 filters `allProducts[]` in JavaScript — 2–5ms at 60k products |
| Durable local cache | SQLite persists all products to disk — survives crashes and restarts |
| Background freshness updates | Phase 2 Step 2 syncs silently after the grid is already visible |

No changes to the existing architecture. This comment is a confirmation, not a correction.

## ChatGPT Comment 2 — First launch needs incomplete-sync protection

The first-launch flow writes batches into SQLite as they arrive. That is fine, but the app must know whether the catalogue is complete.

**Risk:** power loss or network failure during first sync may leave SQLite with only part of the product catalogue.

**Suggested action:** add a snapshot/sync table:

```text
catalog_snapshot
- snapshot_id
- started_at
- completed_at
- backend_revision
- expected_count
- actual_count
- status: pending | complete | failed
```

Only mark the catalogue usable after the snapshot is complete and validated.

### ✅ Final Conclusion — Comment 2

#### The Problem

In Phase 1 (first launch), the app fetches 60,000 products in batches and writes each batch into SQLite as it arrives. This takes 10–30 seconds. Two things can go wrong during this:

**Power cut or crash mid-sync:** The app was at batch 60 of 120. SQLite now has 30,000 products. The other 30,000 are missing. The app restarts, sees products in SQLite, assumes the catalogue is ready, and shows the grid. The cashier works with half a catalogue and has no idea.

**Network drop mid-sync:** Same result — partial data in SQLite, no flag anywhere saying it is incomplete. The grid looks normal but is silently wrong.

At 60,000 products, a partial sync is not immediately obvious. If 3,000 products from one category are missing, a cashier may not notice until a customer asks for something that cannot be found. By then, the app has been running on bad data for an unknown amount of time.

The fix: the app must never trust SQLite data unless it can verify that the last sync completed successfully and the catalogue is whole.

---

#### Chosen Approach — Atomic temp table swap + status flag

The strongest solution combines two things:

**1. Atomic temp table swap (Comment 3 also covers this):**
Write the entire new catalogue into a `cache_products_temp` table first. Only once it is fully populated and validated, swap it into `cache_products` in a single SQLite transaction. Until the swap happens, the live `cache_products` table is completely untouched.

This makes a partial catalogue structurally impossible — not just detectable. Either the old complete catalogue is there, or the new complete catalogue is there. Never half-and-half.

**2. Status flag in `app_settings` for launch-time trust check:**
```
app_settings:
  catalogue_ready    →  true / false
  expected_count     →  60000
  actual_count       →  60000
  last_sync_revision →  184924
```

Set `catalogue_ready = false` before sync starts. Set it to `true` only after the temp table swap succeeds and counts match. On every launch, check this flag before loading from SQLite. If `false`, do not show the grid — restart the sync or show a manager-level error.

---

#### Alternatives Considered

**Snapshot table (what the comment originally suggests):**

A dedicated `catalog_snapshot` table that tracks every sync attempt with `started_at`, `completed_at`, `expected_count`, `actual_count`, and a `status` field (`pending | complete | failed`).

**Pros:** Full history of sync attempts — useful for field debugging. Can tell if the last 5 syncs all failed. More information than a single flag.  
**Cons:** No structural protection — `cache_products` can still be in a partial state between batches. Detection only happens at the end. Valid as a logging/diagnostic layer on top of the chosen approach.

---

**Single status flag only (simplest):**

Just two rows in `app_settings` — `catalogue_ready` and `expected_count`. No snapshot history.

**Pros:** Dead simple, no new table, uses existing infrastructure.  
**Cons:** No history. Cannot diagnose repeated failures in the field. Fine for the core protection but insufficient alone for production diagnostics.

---

**Checksum validation instead of count matching:**

Backend exposes a checksum (hash) of all product IDs. After sync, the frontend computes the same checksum on what it wrote and compares.

**Pros:** Catches not just missing products but corrupted writes — if a row was written wrongly, count matches but checksum fails.  
**Cons:** Requires a backend endpoint change to expose the checksum. More backend work for marginal benefit given the temp table swap already prevents partial writes.

## ChatGPT Comment 3 — Use temporary tables for full catalogue refresh

During full sync, avoid replacing live cache data row-by-row if the user is actively selling.

Safer flow:

```text
1. Download products into cache_products_temp
2. Validate count/checksum/revision
3. Start SQLite transaction
4. Swap temp data into cache_products
5. Mark snapshot complete
6. Notify renderer to refresh memory
```

This avoids the user seeing a half-updated catalogue.

### ✅ Final Conclusion — Comment 3

#### The Problem

The current Phase 2 background sync updates `cache_products` row by row while the app is running and the cashier is actively selling. For incremental updates (a few hundred changed products), this is fine. But for a **full catalogue refresh** — replacing all 60,000 products — this creates a serious inconsistency window.

During a full sync, products A through M may have new prices while N through Z still have old prices. Both are visible in the same grid simultaneously. At 60,000 products, this inconsistency window lasts 30–60 seconds. If the sync fails midway, the table is left in a partially updated state with no clean way to recover.

Full catalogue refreshes are needed when:
- The local cache is detected as too stale
- A manager triggers a forced resync
- Phase 1 first-launch sync needs to restart after a failure
- A major backend migration occurred

---

#### Chosen Approach — Temp table swap + chunked checkpointing

**Temp table swap (core protection):**

Write the entire new catalogue into `cache_products_temp` first. The live `cache_products` table is completely untouched during the entire download. The cashier continues working on the old, complete, consistent catalogue with no disruption.

Once the temp table is fully populated and validated, swap it in a single atomic SQLite transaction:

```
1. Download all products into cache_products_temp
   (cashier works normally on live cache_products — unaffected)

2. Validate:
   - actual_count == expected_count from backend
   - revision number matches
   - no corruption

3. SQLite transaction (near-instant):
   - DROP TABLE cache_products
   - ALTER TABLE cache_products_temp RENAME TO cache_products
   - COMMIT

4. Mark catalogue_ready = true in app_settings

5. Notify renderer via IPC → reload allProducts[] → grid refreshes silently
```

The swap itself is near-instant at the SQLite level. The cashier never sees an inconsistent state.

**Chunked checkpointing (resilience layer):**

Write the download into `cache_products_temp` in chunks of 5,000 products, checkpointing progress after each chunk. If the download fails at chunk 8 of 12, the next attempt resumes from chunk 8 instead of starting over from scratch. This is especially important on slow networks or machines where a full restart wastes significant time.

This does not affect the swap guarantee — `cache_products` is still untouched until the temp table is complete.

**Important:** this pattern applies to full catalogue refreshes only. Incremental updates (WebSocket patches, normal background sync of a few changed products) continue to use the row-by-row approach — the temp table overhead is unnecessary for small changes.

---

#### Alternatives Considered

**Single large SQLite transaction (no temp table):**

Wrap the entire 60k write in one transaction. If it fails, SQLite rolls back automatically.

**Pros:** No second table needed. Simpler code. Automatic rollback on failure.  
**Cons:** Holds the entire 60k product write in SQLite's WAL until the transaction commits — can temporarily grow the WAL file to several hundred MB on low-disk machines. No progress visibility for the cashier during the write.

---

**Blue-green tables (two permanent tables, swap the pointer):**

Maintain `cache_products_a` and `cache_products_b` permanently. A setting in `app_settings` says which is active. Write into the inactive one, validate, flip the pointer.

**Pros:** Instant swap — just one row update. Old table stays as instant rollback.  
**Cons:** Permanently uses double disk space. Every query must check which table is active. Overkill for this use case.

---

**Chunked transactions without temp table:**

Write in chunks directly into `cache_products`, checkpointing after each chunk.

**Pros:** Resumable sync. Works well on slow machines.  
**Cons:** Does not solve the inconsistency problem — the live table is still partially updated during sync. Solves crash recovery but not the core issue this comment is about.

## ChatGPT Comment 4 — SQLite should use WAL mode and migration control

The document describes reading and writing SQLite but does not mention SQLite runtime settings or migrations.

Suggested startup PRAGMAs:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

Also add:

```text
schema_version table
startup migration lock
backup before migration
integrity check
rebuild-from-server option
WAL checkpoint policy
```

### ✅ Final Conclusion — Comment 4

This comment covers two separate topics. Both are accepted and necessary for production.

---

#### Part 1 — WAL mode and SQLite PRAGMAs

**What is a PRAGMA?**
A PRAGMA is a configuration instruction you send to SQLite at startup. It controls how SQLite behaves — how it writes to disk, how it handles locks, whether it enforces rules. Think of it like settings you apply when you open the database each time.

**What is WAL mode?**
By default, when SQLite writes anything — even one row — it locks the entire database file. Nothing else can read or write until the lock is released. In your app this means: background sync is writing 500 products → the startup grid load tries to read → it has to wait for the sync write to finish. They block each other.

WAL (Write-Ahead Log) mode changes this. Writes go into a separate log file first. Reads continue from the main database file unblocked. Writers and readers no longer block each other — they work simultaneously.

**The four settings to apply on every startup:**

```sql
PRAGMA journal_mode = WAL;
```
Enables WAL mode. Reads and writes no longer block each other.

```sql
PRAGMA synchronous = NORMAL;
```
By default SQLite waits for every write to be physically confirmed on disk before continuing — very safe but slow. `NORMAL` only syncs at transaction boundaries. Faster for bulk writes and safe enough for a machine that has any form of power protection.

```sql
PRAGMA foreign_keys = ON;
```
SQLite does not enforce foreign key rules by default. This turns enforcement on — for example, you cannot delete a product that is still referenced by a cart draft row.

```sql
PRAGMA busy_timeout = 5000;
```
If SQLite is briefly locked and another operation tries to access it, by default it immediately throws an error. With `busy_timeout = 5000`, it waits up to 5 seconds before giving up — prevents spurious lock errors when two operations overlap by milliseconds.

These four settings are the standard baseline for every production Electron + SQLite app. No alternatives needed — just apply them.

---

#### Part 2 — Migration control

**What is a database migration?**
Your app stores data in SQLite with a specific structure — specific tables, specific columns. When you ship version 1.5 and you need to add a `session_id` column to the `cart_draft` table, the SQLite file already installed on every POS machine still has the old structure without that column. The new code expects it to exist — it will crash or behave wrongly.

A migration is a script that upgrades the existing database to the new structure:
```sql
ALTER TABLE cart_draft ADD COLUMN session_id TEXT;
```

Without a migration system, every schema change in a new app version breaks every existing POS machine. With one, the app detects that migration 002 has not been applied yet and runs it automatically on startup before doing anything else.

**Chosen approach — custom migration runner:**

A simple array of versioned scripts. On every startup, the app checks which version the database is currently at and runs any scripts it has not applied yet, in order:

```js
const migrations = [
  { version: 1, sql: `CREATE TABLE cache_products (...)` },
  { version: 2, sql: `ALTER TABLE cart_draft ADD COLUMN session_id TEXT` },
  { version: 3, sql: `CREATE INDEX idx_cart_draft_session ON cart_draft(session_id)` },
]
// On startup: read schema_migrations table, run anything with version > current, record each one as done
```

No third-party library needed — a custom runner is about 30–40 lines of code and gives full control.

**Backup before migration:**

Before running any migration, back up the database using `better-sqlite3`'s `.backup()` method — not a plain file copy. A file copy while the database is open in WAL mode can capture an inconsistent state. The `.backup()` API handles this correctly. If the migration fails halfway, the backup is restored.

**Integrity check on startup:**

`PRAGMA quick_check` verifies the database is not corrupted. It is fast — run it on every startup. The full `PRAGMA integrity_check` is more thorough but significantly slower — run it only when something suspicious is detected (unexpected error, count mismatch). Running a full check on a 60k product database on every startup adds unnecessary time.

**WAL checkpoint on clean shutdown:**

Over time the WAL log file grows. SQLite auto-checkpoints every 1,000 pages normally. Also run a manual checkpoint when the app closes cleanly to keep the WAL file from growing large between sessions:

```js
app.on('before-quit', () => {
  db.pragma('wal_checkpoint(TRUNCATE)')
})
```

**Rebuild-from-server option:**

A manager-accessible button that wipes the local SQLite database and triggers a full Phase 1 resync from the backend. Used when the database is corrupted or completely unrecoverable.

---

#### Summary of all decisions

| Concern | Decision |
|---|---|
| WAL mode | Enabled — reads and writes no longer block each other |
| synchronous | NORMAL — faster bulk writes, safe on protected hardware |
| foreign_keys | ON — referential integrity enforced |
| busy_timeout | 5000ms — waits on lock instead of immediately erroring |
| Migration system | Custom runner — versioned scripts, no extra dependency |
| Backup method | SQLite `.backup()` API before every migration |
| Integrity check | `quick_check` every startup, full check on suspicion only |
| WAL checkpoint | Auto (1000 pages) + manual TRUNCATE on clean shutdown |
| Rebuild option | Manager-accessible, triggers full Phase 1 resync |

## ChatGPT Comment 5 — Sync writes must be serialized

SQLite allows many readers but only one writer at a time. Product sync, real-time updates, cart draft writes, audit writes, and offline order writes should not all write randomly.

**Suggested action:** create a local write queue:

```text
sqliteWriteQueue.enqueue(() => updateProduct(...))
sqliteWriteQueue.enqueue(() => saveCartDraft(...))
sqliteWriteQueue.enqueue(() => insertOfflineOrder(...))
```

This reduces lock errors and inconsistent writes.

---

### ✅ Final Conclusion — Comment 5

This comment is accepted, but the solution is not just a write queue — there is a more impactful fix specific to this app that must be combined with it.

---

#### The problem

Your app has several independent parts that all write to the same SQLite file at their own timing:

- **Background sync** — runs every few seconds, writes updated products to `cache_products`
- **WebSocket real-time updates** — a price change arrives, immediately writes to `cache_products`
- **Cart draft auto-save** — every time the cashier touches the cart, a debounced write fires to `cart_draft`
- **Offline order queue** — when payment is taken offline, the order is written to `offline_order_queue`
- **Audit/log writes** — action logs being written

These all run independently with no awareness of each other. SQLite only allows one write at a time. When two of these try to write simultaneously, one of them has to wait — and if it waits too long it throws a `SQLITE_BUSY` error. Without coordination, writes pile up randomly, some get delayed, and ordering becomes unpredictable.

---

#### An important nuance about better-sqlite3

`better-sqlite3` is a synchronous library — unlike most database drivers it does not use async/await. Every write blocks the Node.js thread until it completes. Since Node.js is single-threaded, two writes literally cannot run at exactly the same moment in the same process. Node.js already serializes them through the event loop.

So the lock contention problem is less severe than in multi-threaded environments. But there is still a real problem: **bulk sync writes block the event loop for too long.**

If background sync writes 500 products like this:
```js
// BAD — 500 individual writes
for (const product of products) {
  db.prepare('INSERT OR REPLACE INTO cache_products ...').run(product)
}
```

Each write is synchronous and the loop never yields. The cart draft save, the WebSocket update, and anything else waiting in the event queue are all blocked for 1–2 seconds until the loop finishes. The app feels frozen.

---

#### Why the write queue alone is not enough

The write queue solves ordering — it makes sure two writes do not compete with each other. But it does not make writes faster. The queue still runs each write one at a time, in the same way the loop did before. A 500-product sync still fires 500 individual write operations through the queue, one after another. The total time taken is the same — still 1–2 seconds of the event loop being blocked.

So the queue fixes the "who writes first" problem but leaves the "why is it so slow" problem completely untouched. That is why the queue alone is not the right answer.

---

#### The real fix: wrap bulk writes in a single SQLite transaction

To understand this, you need to know what SQLite actually does when it writes.

Every time you write one row to SQLite, SQLite does three things: it writes the data, it flushes it to disk, and it marks the write as complete. That disk flush is the slow part — it takes real time because your operating system has to physically confirm the data reached storage. When you write 500 products individually, SQLite does that disk flush 500 times.

A **transaction** groups many writes together and does the disk flush only once at the very end. All 500 products are written to memory first, then committed in a single flush. The result is 500 writes in roughly the same time as 1 write — typically a few milliseconds instead of 1–2 seconds.

```js
// WITHOUT transaction — SQLite flushes to disk 500 times
for (const product of products) {
  db.prepare('INSERT OR REPLACE INTO cache_products ...').run(product)
  // ↑ disk flush happens here, every single time
}

// WITH transaction — SQLite flushes to disk exactly once
const insertMany = db.transaction((products) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO cache_products ...')
  for (const product of products) stmt.run(product)
  // all 500 are written to memory first
  // single disk flush happens here when the transaction closes
})
insertMany(products)
```

The entire 500-product sync batch goes from 1–2 seconds down to a few milliseconds. The event loop is freed almost immediately. The cart draft save and WebSocket update that were waiting in the queue are no longer blocked for a noticeable amount of time.

---

#### The write queue — still worth adding

Even though better-sqlite3 gives natural serialization, a write queue is still good practice:

```js
class SQLiteWriteQueue {
  #chain = Promise.resolve()

  enqueue(fn) {
    this.#chain = this.#chain.then(() => fn())
    return this.#chain
  }
}

const writeQueue = new SQLiteWriteQueue()

writeQueue.enqueue(() => insertMany(products))     // from sync
writeQueue.enqueue(() => saveCartDraft(cart))      // from cart
writeQueue.enqueue(() => insertOfflineOrder(order)) // from payment
```

It makes the intent explicit and documented — every write goes through one place. If worker threads are ever added in the future, the queue becomes mandatory for correctness rather than optional.

---

#### Alternatives considered

| Option | Why not chosen |
|---|---|
| No queue, rely on better-sqlite3 natural serialization only | Works, but no explicit ordering guarantee and becomes wrong if worker threads are added |
| Queue only, no transaction batching | Solves ordering but bulk sync writes still block the event loop for 1–2 seconds |
| WAL mode busy_timeout only | Reduces errors but does not fix bulk write slowness or ordering |

---

#### Summary of decisions

| Concern | Decision |
|---|---|
| Bulk sync writes (500+ products) | Wrap in `db.transaction()` — 20–50x faster, frees event loop quickly |
| All SQLite writes | Route through a single `SQLiteWriteQueue` — explicit ordering, future-safe |
| SQLITE_BUSY errors | Eliminated — transaction batching reduces write time, queue prevents overlap |

## ChatGPT Comment 6 — Product sync should use revision numbers, not only timestamps

The document saves `last_synced_at`. That is useful, but not enough for reliable sync.

**Suggested action:** track server revisions:

```text
last_product_revision
last_price_revision
last_tax_revision
last_customer_revision
```

Then sync with:

```text
GET /sync/products?after_revision=184923
```

This prevents missed updates caused by clock drift or timestamp precision issues.

---

### ✅ Final Conclusion — Comment 6

---

#### What is this concept?

When the POS syncs with the backend, it needs to ask one question: "What has changed since I last synced?" The simplest answer is to use a timestamp — save the last sync time and ask the backend for everything updated after that point.

The problem is that the backend server has its own clock and the POS machine has its own clock, and these two clocks are never perfectly in sync. This is called **clock drift**. If the POS clock is a few minutes behind the server clock, the POS asks `updated_after=10:30:00` but the server has records updated at 10:28 that the POS will never see — because the POS already thinks it is past that point. No error is thrown. The POS just silently misses those changes and runs on stale data.

A **revision number** solves this completely. It is a plain integer counter on the backend that increments by 1 every time any data changes:

```
Product "Apple Juice" price changes  → backend assigns revision 184923
Product "Mango Drink" gets added     → backend assigns revision 184924
Tax "GST 18%" is updated             → backend assigns revision 184925
```

The counter always goes up, is assigned only by the server, and has no relationship to time or clocks. When the POS asks `after_revision=184923`, the backend returns every record with a revision number greater than 184923. This is a simple integer comparison — nothing can drift, nothing can be missed.

---

#### Why is it suggested here?

The document currently saves `last_synced_at` — a timestamp — as the only sync marker. On every sync the POS uses that timestamp to ask "what changed after this time." As explained above, this approach silently misses records whenever the two clocks diverge.

This app runs on physical POS machines in stores. These machines may not have perfectly synced clocks, may not always be connected to NTP servers, and may run for months without a time resync. Clock drift of a few minutes is realistic. For a POS that is processing live sales with real prices, silently showing stale product prices is a real business risk.

The same decision was already made in pre-check-2 Comment 4 for the same reason. This comment is reinforcing that decision in the context of the pre-check-3 hybrid SQLite architecture.

---

#### Why is it the best fit for this case?

Two reasons specific to this app make revision numbers particularly clean here:

**1. Custom backend means native support from day one.**
This app does not use Odoo or any third-party backend that might not support revision numbers. The backend is fully custom, so revision counters can be built in from the start — no workarounds, no fallbacks.

**2. Each data type has its own independent revision counter.**
Products, taxes, pricelists, and customers all track their own revision number separately in SQLite `app_settings`:

```
SQLite app_settings on POS:
  key                     | value
  last_product_revision   | 184924
  last_tax_revision       | 447
  last_customer_revision  | 11304
```

This means each data type can be synced on its own schedule — products every 30 seconds, customers every 2 minutes, taxes only at startup — without any coupling between them.

**3. The revision update must be in the same SQLite transaction as the data write.**
This is the rule specific to the pre-check-3 hybrid architecture. If 500 products are written to `cache_products` and then the revision number is updated separately in `app_settings`, there is a gap between those two operations. A crash in that gap leaves the database in an inconsistent state — products written but revision not updated, or revision updated but some products missing.

Wrapping both in one transaction guarantees they either both succeed or both roll back together:

```js
db.transaction(() => {
  insertMany(products)                                           // write all 500 products
  db.prepare('UPDATE app_settings SET value=? WHERE key=?')
    .run(184930, 'last_product_revision')                       // save the revision
})()
// if anything fails — both roll back, no in-between state possible
```

The revision numbers must also be stored in SQLite — not in Zustand memory or `localStorage`. Memory is lost on every crash. SQLite survives crashes. Storing the revision in memory means the app loses its sync position every time it restarts unexpectedly.

---

#### Is there a better alternative?

No — for this specific app, revision numbers are the strongest option. The alternatives are all weaker:

| Alternative | Why it does not fit |
|---|---|
| Timestamps only | Clock drift silently misses records — the core problem this approach solves |
| Timestamp + safety margin | Re-fetches already-processed records on every sync — unnecessary extra load |
| Single global revision for all types | Forces all data types to sync together on one schedule — no independence |
| Revision stored in Zustand/localStorage | Lost on crash — app loses sync position after every unexpected restart |

## ChatGPT Comment 7 — Background sync should visibly report stale data

The offline phase says sync fails silently and shows a subtle badge. That is good. Also include how stale the data is.

Suggested badge states:

```text
Online — synced 2 minutes ago
Syncing catalogue...
Offline — showing data from Apr 28, 2026 10:15 AM
Sync failed — retrying
Catalogue incomplete — manager action required
```

This helps cashiers and managers understand risk.

---

### ✅ Final Conclusion — Comment 7

---

#### What is this concept?

When the app is running and the background sync has not completed recently — or has failed entirely — the cashier is working with data that may be outdated. The question this comment raises is: should the app silently show whatever data it has, or should it clearly communicate how old that data is?

The current document says sync fails silently and shows a "subtle badge." That is a start, but it is not enough. A subtle badge only tells the cashier that something is wrong — it does not tell them *how* wrong it is. There is a significant difference between "data is 5 minutes old" and "data is from 3 days ago." Both show the same subtle badge. The cashier has no way to judge the risk.

**Stale data in a POS has real business consequences.** It is not just a UX issue:
- A product's price changed on the backend 2 hours ago, but the POS still shows the old price — customer is charged the wrong amount
- A product was discontinued on the backend, but it still appears in the catalogue — cashier tries to sell something that no longer exists in the system
- A promotion started this morning, but the POS has not synced since yesterday — cashier charges full price while the promotion is active

The cashier needs to know the risk level of the data they are currently working with so they can decide whether to proceed normally, be cautious, or call a manager.

---

#### Why is it suggested here and why is it the best fit?

The suggested badge states cover the complete range of sync situations the app can be in:

```
Online — synced 2 minutes ago          → normal operation, low risk, green
Syncing catalogue...                   → sync is running right now
Offline — showing data from Apr 28, 2026 10:15 AM  → network down, exact timestamp shown
Sync failed — retrying                 → something went wrong, auto-retry in progress
Catalogue incomplete — manager action required  → critical, human intervention needed
```

The most important badge is the offline one. Showing the exact timestamp — "data from Apr 28, 2026 10:15 AM" — gives the cashier and manager concrete information. They can immediately judge: "that was 20 minutes ago, we are probably fine" versus "that was yesterday evening, we should not trust these prices."

This is the best fit for this app because the data it is showing is directly tied to financial transactions. A cashier ringing up 100 orders on stale prices has a real monetary impact on the business. They must be informed.

The data needed to show these badges already exists in SQLite `app_settings` — `last_synced_at`, `last_product_revision`, `catalogue_ready`. No new infrastructure is needed. The sync engine already knows which state it is in. This is purely a matter of surfacing that state visibly in the UI.

---

#### Additional improvements

**Staleness thresholds with color coding:**

Not all staleness is equal. A simple color system tied to how long ago the last sync completed helps cashiers understand risk at a glance without reading text:

```
< 5 minutes old   → green  — normal, safe to operate
5–30 minutes old  → yellow — caution, prices may have minor changes
> 30 minutes old  → orange — warning, manager should investigate
> 4 hours old     → red    — critical, sync has been broken for a long time
```

**Manual retry button for the cashier:**

The "Sync failed — retrying" state should include a tap-to-retry button so the cashier can force a sync attempt without waiting for the automatic retry interval. On the manager screen this button should also show the last error message so the cause can be diagnosed.

**Per-phase staleness where relevant:**

Products, taxes, and pricelists can each have their own `last_synced_at`. If product data is fresh but tax data is 6 hours old, the staleness indicator should reflect the most critical one — not just a single generic timestamp.

---

#### Is there a better alternative?

No real alternative offers more value here. The options differ only in how much information is shown:

| Option | Why it does not fit |
|---|---|
| Silent failure, no badge | Cashier has zero awareness — worst possible option for a financial system |
| Simple online/offline dot | Better than nothing but gives no staleness information — "offline" could mean 5 minutes or 5 days |
| Generic "data may be stale" message | Vague — does not tell the cashier or manager anything actionable |
| Suggested approach — exact timestamp + state label | Cashier sees exactly when data was last confirmed fresh and can judge the risk themselves |

The suggested approach is accepted as-is, with the staleness thresholds and manual retry button added as improvements.

## ChatGPT Comment 8 — Current cart should be moved out of memory-only storage

The summary says current cart lives in React memory only. For production POS, that is risky.

**Suggested action:** save a cart draft to SQLite after every cart mutation.

Suggested table:

```text
cart_draft
- draft_uuid
- store_id
- terminal_id
- cashier_id
- session_id
- cart_json
- updated_at
- status
```

At app startup, recover unfinished cart drafts before starting a new sale.

---

### ✅ Final Conclusion — Comment 8

This decision was already fully resolved in pre-check-2 Comment 2. This conclusion covers the concept and summarises the key decisions so the reasoning is clear here without needing to cross-reference.

---

#### What is this concept?

When a cashier is in the middle of building an order — 10 products scanned, a discount applied, a customer linked — all of that exists only in Zustand's memory. Memory is volatile. It exists only as long as the process is running. If any of these happen, the entire cart is gone with no recovery:

- The app crashes (Electron process killed unexpectedly)
- The machine loses power mid-sale
- The cashier accidentally closes the window
- A Windows update forces a restart

The cashier now has to rebuild the cart from scratch — asking the customer what they had, re-scanning every item. For a cart with 20–30 products, this is several minutes of disruption at the till. In a busy store during peak hours, this has a direct impact on the queue and the customer experience.

**Cart draft persistence** solves this. After every change the cashier makes to the cart, a snapshot of the full cart is written to SQLite. If the app restarts for any reason, it reads the last saved snapshot and restores the cart exactly as it was — the cashier continues from where they left off.

---

#### Why is it suggested here and why is it the best fit?

The pre-check-3 document describes the hybrid architecture where SQLite is already present and running on every POS machine. Cart draft persistence is the natural extension of the same pattern — any data that must survive a crash goes to SQLite.

The suggested `cart_draft` table is correct. The schema fields each serve a specific purpose:

- `draft_uuid` — unique identifier so multiple drafts can coexist (e.g. held orders)
- `store_id`, `terminal_id` — ensure that on recovery, only drafts belonging to this specific POS terminal are shown. A draft from terminal 3 should never appear on terminal 1.
- `cashier_id`, `session_id` — a draft from a previous shift or a different cashier should not auto-restore without confirmation
- `cart_json` — the full snapshot of the cart: all line items, applied discounts, linked customer, any price overrides. Storing only item IDs is not enough — discounts and overrides are lost.
- `updated_at` — tells the recovery UI how old the draft is, so the cashier can judge whether it is worth restoring
- `status` — tracks the lifecycle of the draft so the recovery query only surfaces relevant ones:

| Status | Meaning |
|---|---|
| `active` | Currently being worked on |
| `converted` | Cart became a completed order — skip on recovery |
| `abandoned` | Cashier explicitly discarded it |
| `recovered` | Was previously restored after a crash |

---

#### Additional improvements

**Reactive auto-persist, not manual calls:**

Do not call a save function manually inside every cart action. Every time a new action is added, the developer must remember to add the save call — this will inevitably be missed. Instead, use Zustand's `subscribeWithSelector` to watch the cart state and auto-persist on any change, with a 200ms debounce to avoid rapid-fire writes during fast barcode scanning:

```js
cartStore.subscribe(
  (state) => state.cartItems,
  debounce((cartItems) => {
    window.api.invoke('db:save-cart-draft', {
      cartItems,
      discounts: cartStore.getState().discounts,
      customer: cartStore.getState().customer,
      updatedAt: Date.now()
    })
  }, 200)
)
```

Every cart mutation — no matter where in the codebase it happens — is automatically persisted without any extra code.

**Recovery UI must show context before restoring:**

On startup, if an `active` draft is found for this terminal and session, do not silently restore it. Show a brief recovery prompt:

```
Unfinished cart found — 8 items, ₹1,240.00 — saved 4 minutes ago
[Continue this cart]  [Start a new sale]
```

This lets the cashier confirm it is the right order before anything is restored.

---

#### Is there a better alternative?

No — SQLite cart draft is the correct solution for this app. The alternatives are all weaker:

| Alternative | Why it does not fit |
|---|---|
| `localStorage` | Survives soft app closes but not process kills or power cuts — not truly durable |
| Normalized `cart_draft_lines` table (one row per item) | More queryable but a cart is always restored atomically as a whole — JSON blob is simpler with no real downside |
| Event sourcing (record every cart action, replay on restore) | Overcomplicated for this use case — restoring a cart does not need a full event log |
| Auto-save to a flat file | No atomic writes — a crash mid-write can produce a corrupted file with no recovery |

## ChatGPT Comment 9 — Offline sales need a separate durable queue

The document says the cashier can add to cart and process payments offline, but it does not define order queue storage.

Add an offline order queue:

```text
offline_order_queue
- local_order_uuid
- store_id
- terminal_id
- session_id
- cashier_id
- order_number
- payload_json
- payload_hash
- payment_status
- sync_status
- retry_count
- last_error
- created_at
- synced_at
```

Use idempotency keys when syncing to backend/Odoo to avoid duplicate orders.

---

### ✅ Final Conclusion — Comment 9

---

#### What is this concept?

When a cashier completes a payment while the POS is offline, that order cannot be sent to the backend immediately. It has to be stored somewhere locally and sent later when the network comes back. This is what an **offline order queue** is — a durable list of completed orders that are waiting to be synced to the backend.

The key word is *durable*. The order queue cannot live in memory. If the app crashes or the machine restarts after the cashier has taken payment but before the sync happens, the order must still exist. If it is lost, the store has taken money from the customer but has no record of the sale. This is a financial data loss scenario.

This is a fundamentally different concern from the cart draft (Comment 8). The cart draft is a safety net for an *in-progress* sale — the cashier has not finished yet. The offline order queue is for *completed* sales — the cashier has taken payment, the transaction is done, and the store is now responsible for getting that order to the backend.

**What is an idempotency key?**

When the network comes back and the POS tries to sync an offline order to the backend, something can go wrong mid-sync. The network drops again after the backend receives the order but before it sends back a success response. The POS does not know whether the order was saved. If it retries, the backend may create a duplicate order — the same sale recorded twice.

An idempotency key prevents this. It is a unique identifier attached to the order that the backend uses to recognise "I have already processed this exact order." If the same order is sent again with the same key, the backend returns the same success response as before without creating a duplicate. The POS can safely retry as many times as needed.

In this app, `local_order_uuid` serves as the idempotency key. It is generated by the POS at the moment the order is created, never changes, and is sent to the backend with every sync attempt for that order.

---

#### Why is it suggested here and why is it the best fit?

The pre-check-3 document says the cashier can process payments offline but does not define where those orders are stored. This is a critical gap — without a defined storage mechanism, offline payments are effectively lost on a crash.

The suggested `offline_order_queue` table with SQLite is the correct solution. Each field in the schema serves a specific purpose:

- `local_order_uuid` — the idempotency key, generated by the POS at sale time, sent to the backend on every retry
- `store_id`, `terminal_id`, `session_id`, `cashier_id` — identifies exactly which terminal, session, and cashier created the order — needed for the backend to attribute the sale correctly
- `order_number` — a human-readable number shown on the receipt, assigned locally at sale time so the cashier can reference it immediately
- `payload_json` — the complete order snapshot: all line items, prices, taxes, discounts, payment method, customer. Everything needed for the backend to reconstruct the sale exactly as it happened
- `payload_hash` — a hash of `payload_json`. Used to detect if the payload was accidentally modified between creation and sync — should never change after the order is created
- `payment_status` — the local payment outcome (`APPROVED`, `FAILED`, `CANCELLED`). Only `APPROVED` orders should be in the sync queue
- `sync_status` — tracks where the order is in its sync lifecycle:

| Status | Meaning |
|---|---|
| `pending` | Waiting for network to sync |
| `syncing` | Sync attempt currently in progress |
| `synced` | Successfully confirmed by the backend |
| `failed` | All retry attempts exhausted, needs manager review |

- `retry_count` — how many sync attempts have been made. Used to apply backoff timing and to stop retrying after a threshold
- `last_error` — the last error message from a failed sync attempt. Shown in the support diagnostics screen so a manager can understand why an order is stuck
- `created_at` — when the order was placed. Used for display and for auditing
- `synced_at` — when the backend confirmed the order. Used to clean up old synced orders after a retention period

---

#### Additional improvements

**Retry with backoff, not aggressive polling:**

When sync fails, do not retry every second. Use the same backoff pattern as the general sync retry (covered in Comment 18):

```
1st retry: 5 seconds after failure
2nd retry: 15 seconds
3rd retry: 30 seconds
Then: every 2 minutes until synced or retry limit reached
```

After a configurable number of retries (e.g. 10), set `sync_status = 'failed'` and surface it in the support diagnostics screen. Do not keep retrying indefinitely — if something is structurally wrong with the order, endless retries are wasteful and mask the real problem.

**Sync queue runs as soon as network returns:**

Do not wait for the next scheduled sync interval when the network comes back. The sync engine should watch the network status and immediately attempt to flush the pending queue the moment connectivity is restored.

**Manager review screen for failed orders:**

Orders stuck at `sync_status = 'failed'` must be visible to a manager, showing `order_number`, `created_at`, `retry_count`, and `last_error`. The manager should be able to manually trigger one more retry or escalate to support. A failed order that is invisible to staff is a financial liability.

---

#### Is there a better alternative?

No — SQLite with idempotency keys is the correct and only production-grade approach for this use case:

| Alternative | Why it does not fit |
|---|---|
| Memory only (Zustand) | Lost on any crash or restart — financial data loss, unacceptable |
| `localStorage` | Not process-kill safe — a hard crash or power loss can corrupt or lose the data |
| Flat file per order | No atomic writes, no query capability, complex to manage retries and status tracking |
| Send directly to backend, no local queue | Fails entirely when offline — the whole point of offline mode is removed |
| Single retry on reconnect, no queue | One shot with no backoff — if that retry fails, the order is silently lost |

## ChatGPT Comment 10 — Payment state must be persisted before completing checkout

If offline payment is allowed, payment attempts must be written before and after each payment step.

Suggested states:

```text
PAYMENT_STARTED
PAYMENT_APPROVED_LOCAL
PAYMENT_FAILED
PAYMENT_CANCELLED
PAYMENT_REVERSED
```

Important recovery case:

```text
payment approved -> app crashes -> app restarts -> order must still exist and sync
```

---

### ✅ Final Conclusion — Comment 10

---

#### What is this concept?

Checkout is not a single instant action — it is a sequence of steps that happen one after another. For a typical offline payment flow it looks something like this:

```
1. Cashier clicks "Charge"
2. Payment amount is calculated and confirmed
3. Payment terminal / cash drawer interaction happens
4. Payment is approved
5. Receipt is printed
6. Order is written to the offline queue
7. Screen resets to a new sale
```

The problem is that the app can crash or lose power at any point in this sequence. And the consequences of a crash are completely different depending on *where* in the sequence it happens:

- Crash at step 2 → Payment never started. Cart draft is still there. Cashier resumes the sale normally. No problem.
- Crash at step 4 → Payment was approved (money was taken) but the order was never saved to the offline queue. App restarts and has no record of the sale. The store has the customer's money but no order.
- Crash at step 6 → Order was written to the queue but the receipt was never printed. The sale is saved, but the cashier does not know whether it succeeded.

Without payment state persistence, the app has no way to distinguish between these scenarios on restart. It cannot tell the cashier "a payment was in progress when the app crashed — here is what happened." Without that information, the cashier either assumes the sale failed and starts over (double-charging the customer) or assumes it succeeded and moves on (potentially losing the order).

**Payment state persistence** means: before and after every step in the payment flow, write the current state to SQLite. If the app restarts at any point, it reads the last known payment state and knows exactly what happened and what to do next.

---

#### Why is it suggested here and why is it the best fit?

This comment specifically targets the crash-mid-payment scenario, which is the most dangerous gap in the pre-check-3 document. The document says payments can be taken offline but does not define how partial payment states are handled if the app crashes between steps.

The suggested payment states map directly to the recovery decisions the app needs to make on restart:

| State | What it means | Recovery action on restart |
|---|---|---|
| `PAYMENT_STARTED` | Cashier clicked Charge, nothing confirmed yet | Show "payment was interrupted" — cashier decides to retry or cancel |
| `PAYMENT_APPROVED_LOCAL` | Payment confirmed locally (cash received or terminal approved) | Order exists, must be in offline queue — verify it is there, sync when online |
| `PAYMENT_FAILED` | Payment was attempted but declined or errored | Cart draft still intact — cashier can retry |
| `PAYMENT_CANCELLED` | Cashier cancelled before approval | Cart draft still intact — no action needed |
| `PAYMENT_REVERSED` | Approved payment was subsequently voided | Must sync the reversal to backend, receipt may need reprinting |

The critical state is `PAYMENT_APPROVED_LOCAL`. This is the one that represents "money has been taken." On any restart where this state is found without a corresponding synced order, the app must surface this immediately to the cashier and manager — it cannot be silently ignored.

This state must be written to SQLite in the **same transaction** as the order being inserted into `offline_order_queue`. If the payment approval state is written but the order insertion fails (or vice versa), the app will be in an inconsistent state on restart — it knows a payment was approved but cannot find the order, or finds an order without knowing whether payment succeeded.

```js
db.transaction(() => {
  // write the order to the offline queue
  db.prepare('INSERT INTO offline_order_queue ...').run(orderPayload)
  // write the payment state in the same transaction
  db.prepare('UPDATE payment_state SET status = ? WHERE session_id = ?')
    .run('PAYMENT_APPROVED_LOCAL', sessionId)
})()
// if either write fails — both roll back, no inconsistent state
```

---

#### Additional improvements

**Payment state as its own SQLite table, not just a field:**

The payment state needs to be queryable and auditable — not just a single field in `app_settings`. A dedicated `payment_state` table allows the app to store the full context of each payment attempt: which order it belonged to, the amount, the method, the timestamp of each state transition, and the terminal response if available.

**On startup — active payment state check before anything else:**

Before the cashier screen loads, the app should check whether a `PAYMENT_APPROVED_LOCAL` or `PAYMENT_STARTED` state exists from the previous session. If one is found, do not proceed to the normal cashier screen. Show a dedicated recovery screen:

```
A payment was in progress when the app last closed.
  Order #POS-00142 — ₹1,840.00 — Cash
  Status: Payment approved, order not yet synced

  [Order is saved — continue]   [Something went wrong — contact manager]
```

This gives the cashier clear information and prevents them from accidentally starting a new sale over an unresolved transaction.

**Never reset the cart until payment state reaches a terminal state:**

The cart draft should only be cleared — and the screen reset to a new sale — after the payment state has been written as `PAYMENT_APPROVED_LOCAL` and the order has been inserted into `offline_order_queue`. Resetting before this creates a window where the cart is gone but the order does not exist yet.

---

#### Is there a better alternative?

No — writing payment state to SQLite before and after each step is the only approach that guarantees crash recovery without financial data loss:

| Alternative | Why it does not fit |
|---|---|
| Memory only | Any crash between payment approval and order write loses the sale — money taken, no record |
| Write order first, then confirm payment | Race condition — if the order write fails, a payment was already approved but no order exists |
| Single atomic write at the very end | If anything goes wrong during payment interaction, there is no state to recover from |
| SQLite state per step (chosen) | Every transition is recorded — the app always knows exactly where it was and what to do on restart |

## ChatGPT Comment 11 — Real-time updates should update memory only after SQLite write succeeds

The document updates SQLite and React memory together. Decide the exact order.

Recommended safer rule:

```text
1. Receive WebSocket update
2. Validate revision and payload
3. Write to SQLite transactionally
4. Update in-memory allProducts[]
5. Save last applied revision
```

If SQLite write fails but memory updates, the app may show a price that disappears after restart.

---

### ✅ Final Conclusion — Comment 11

---

#### What is this concept?

The pre-check-3 document says that when a WebSocket update arrives — for example a product price change — both SQLite and `allProducts[]` in memory are updated together. That is correct in principle, but the document does not define the *order* in which they are updated. That order matters enormously.

Your app has two stores of the same data: SQLite on disk (the source of truth that survives crashes) and `allProducts[]` in memory (the fast runtime copy that drives the UI). The entire hybrid architecture works because these two are kept in sync. But they are two separate write operations — and if the app crashes or an error occurs between them, one will be updated and the other will not.

There are two possible orderings:

**Option A — Update memory first, then write to SQLite:**
```
WebSocket update arrives → allProducts[] updated → grid shows new price ✅
                                                  → SQLite write fails ❌
App restarts → SQLite still has old price → allProducts[] loaded from SQLite → old price shown
```
The cashier saw the new price for the duration of that session, but after the restart it disappeared. The cashier has no idea why the price changed back. If they processed a sale at the new price in between, the receipted price no longer matches what the backend records show.

**Option B — Write to SQLite first, then update memory (correct):**
```
WebSocket update arrives → SQLite write succeeds ✅ → allProducts[] updated → grid shows new price ✅
                        → SQLite write fails ❌ → memory NOT updated → grid still shows old price
```
If the SQLite write fails, nothing changes — the grid stays at the old price. The app is consistent. The cashier never sees a price that cannot be backed by the persistent store. When the app restarts, SQLite and memory are identical because memory was only updated after SQLite confirmed.

The rule is simple: **SQLite is the gate. Memory only updates if SQLite succeeds.**

---

#### Why is it suggested here and why is it the best fit?

The pre-check-3 document describes Phase 4 (real-time WebSocket updates) but does not specify the write order. This is a silent consistency bug that will only surface in production when an SQLite write fails and the cashier sees a price that disappears on restart — or worse, processes a sale at a price that was never actually confirmed to disk.

The five-step sequence the comment recommends is the correct rule for this app:

```
1. Receive WebSocket update
   → message arrives from backend via IPC to renderer

2. Validate revision and payload
   → check the revision number is greater than the last applied revision
   → check the payload has the expected fields (id, price, name, etc.)
   → if invalid — discard silently, do not touch SQLite or memory

3. Write to SQLite transactionally
   → UPDATE cache_products SET price=?, name=? WHERE id=?
   → if this fails — stop here, memory is NOT touched

4. Update in-memory allProducts[]
   → only reached if step 3 succeeded
   → find the product by index using _allProductsIndexMap (O(1))
   → patch allProducts[index] with the new data
   → _recomputePage() re-slices the visible grid page
   → grid re-renders with the new price

5. Save last applied revision
   → UPDATE app_settings SET value=? WHERE key='last_product_revision'
   → done in the same transaction as step 3 so they cannot be out of sync
```

Step 2 — validation — is worth highlighting separately. If a malformed or out-of-order WebSocket message arrives and is applied directly without validation, it can corrupt both SQLite and memory simultaneously. Checking that the revision is higher than the last applied one prevents stale or replayed messages from overwriting newer data.

---

#### Additional improvements

**Validate the revision before writing — discard out-of-order messages:**

WebSocket messages are not guaranteed to arrive in order. A message with revision 184920 could arrive after revision 184925 has already been applied. Applying the older message would overwrite a newer update with stale data:

```js
const lastApplied = db.prepare('SELECT value FROM app_settings WHERE key=?')
  .get('last_product_revision')?.value ?? 0

if (update.revision <= lastApplied) {
  return  // discard — already have a newer version of this data
}
```

**Do not update the grid on every single WebSocket message if multiple arrive in quick succession:**

If 20 product updates arrive in 500ms (e.g. a bulk price change), triggering `_recomputePage()` 20 times in a row is wasteful. Batch the memory updates and trigger a single re-render after all writes are done. SQLite writes still happen immediately for each one, but the UI update is debounced.

---

#### Is there a better alternative?

No — write-SQLite-first is the only ordering that keeps the app's two data stores consistent:

| Alternative | Why it does not fit |
|---|---|
| Update memory first, then SQLite | Memory can show a price that SQLite never confirmed — disappears on restart, inconsistent |
| Update both simultaneously | Not possible — they are two separate operations. One will always happen first |
| Update memory only, skip SQLite for real-time updates | The update is lost on restart — the grid shows the new price until the app restarts, then reverts |
| Write-SQLite-first (chosen) | SQLite is the gate — memory is only updated if the write succeeds. Always consistent |

## ChatGPT Comment 12 — Handle deleted products carefully

The document says products no longer in backend are deleted from SQLite and memory. Be careful if deleted products exist in old orders, active cart, offline queue, or audit history.

Suggested behavior:

```text
Product removed from backend -> mark inactive/unavailable, do not hard-delete immediately
```

Hard deletion can break historical receipt view and refunds.

---

### ✅ Final Conclusion — Comment 12

---

#### What is this concept?

The pre-check-3 document describes Phase 2 background sync deleting products from SQLite and `allProducts[]` when they are no longer present in the backend. On the surface this seems correct — if the backend no longer has a product, why should the POS keep it?

The problem is that a product being removed from the backend catalogue does not mean it never existed. It may have been sold hundreds of times. It may currently be in an active cart. It may be sitting in the offline order queue waiting to sync. It may appear on printed receipts that a customer could bring back for a refund.

**Hard deletion** means the row is permanently removed from SQLite with a `DELETE` statement. Once it is gone, anything that references that product by ID — an order, a receipt, a cart line — now points to nothing. The consequences:

- A cashier tries to process a refund for a receipt that contains a deleted product → the app cannot find the product → the refund flow breaks or shows an error
- An offline order in the queue contains a deleted product → when the backend tries to sync it → the backend cannot validate the product ID → the order may be rejected
- A historical receipt view tries to display items from a past order → the product name and price are missing because the row no longer exists
- A product is deleted from the backend but the cashier has already scanned it into an active cart → the sync runs → the product disappears from SQLite and memory mid-session → the cart line now references a product that no longer exists in the app

None of these are recoverable cleanly. The data is gone.

---

#### Why is it suggested here and why is it the best fit?

The fix is **soft deletion** — instead of removing the row, mark it as inactive. The product remains in SQLite with all its data intact, but a flag tells the app not to show it in the catalogue anymore.

This is implemented by adding an `active` column to `cache_products`:

```sql
ALTER TABLE cache_products ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
-- 1 = active, show in catalogue
-- 0 = soft-deleted, hide from catalogue but keep the row
```

When the backend signals that a product has been removed, the sync sets `active = 0` instead of deleting the row:

```js
// WRONG — permanent, breaks references
db.prepare('DELETE FROM cache_products WHERE id = ?').run(productId)

// CORRECT — soft delete, data preserved
db.prepare('UPDATE cache_products SET active = 0 WHERE id = ?').run(productId)
```

The same update is applied to `allProducts[]` in memory — the product is either removed from the array or kept with `active: false` so the grid filter excludes it. The cashier can no longer search for or scan the product, but every reference to it still resolves correctly.

**Where the preserved data matters:**

| Scenario | Why the row must still exist |
|---|---|
| Refund on a past receipt | Product name, price, and tax must be readable to process the refund |
| Historical receipt view | Order detail screen shows all line items — product data must resolve |
| Offline order queue | Order payload contains product ID — backend validation needs the product to have existed |
| Audit log | Action logs reference product IDs — must still resolve for compliance review |
| Active cart at deletion time | Cart line still references the product — must not break mid-session |

---

#### Additional improvements

**Hard deletion after a retention period:**

Soft deletion is not permanent storage — it is a holding state. After a configurable retention period (e.g. 90 days), a maintenance job can hard-delete rows that are `active = 0`, have no pending offline orders referencing them, and are old enough that refund windows have passed. This keeps the database from growing indefinitely with stale product rows.

**Show a warning if a soft-deleted product is in an active cart:**

If a product in the current cart gets soft-deleted by a sync while the cashier is mid-sale, do not silently remove it from the cart. Show a warning:

```
"Apple Juice 1L" is no longer available in the catalogue.
Remove it from the cart before proceeding.
```

The cashier then decides whether to proceed without it or hold the sale.

**Filter `active = 0` products at the grid and search level — not just at load time:**

The catalogue grid and search must always filter by `active = 1`. If a product is soft-deleted during a session, the memory patch should set `active: false` and the grid's filter must exclude it immediately — not on the next restart.

---

#### Is there a better alternative?

No — soft deletion is the standard industry pattern for any system where records are referenced by other records:

| Alternative | Why it does not fit |
|---|---|
| Hard delete immediately | Breaks refunds, receipt history, offline orders, and cart mid-session — unacceptable |
| Keep hard delete but copy data to an archive table first | Complex to query — receipt view must check two tables. Soft delete is simpler |
| Never delete, rely on backend to re-add if needed | Database grows without bound, and re-adding is not guaranteed if the product was permanently discontinued |
| Soft delete with retention period (chosen) | Data preserved as long as needed, cleaned up automatically after safe window |

## ChatGPT Comment 13 — Cache should include tax/pricelist/version metadata

The hybrid cache currently focuses on `cache_products`. For correct POS totals, add related cache tables:

```text
cache_products
cache_barcodes
cache_categories
cache_taxes
cache_pricelists
cache_payment_methods
cache_customers
cache_pos_config
cache_users_permissions
sync_state
```

This is especially important with Odoo 15.

---

### ✅ Final Conclusion — Comment 13

---

#### What is this concept?

The pre-check-3 document focuses exclusively on caching 60,000 products. But a POS does not just look up products — it calculates a checkout total. That calculation depends on several other pieces of data that are not products:

- **Taxes** — what tax rate applies to this product? Is it 5% GST, 18% GST, or exempt? Without a local tax cache, the app cannot calculate the correct total offline
- **Pricelists** — does this customer qualify for a special price? Is there a wholesale pricelist or a VIP customer pricelist active right now? Without it, everyone gets the default price regardless of eligibility
- **Payment methods** — what payment options are available at this terminal? Cash only? UPI? Card? Without a local cache, the payment screen cannot be shown offline
- **Categories** — what category does each product belong to? Without this the category filter buttons in the grid cannot be populated
- **Barcodes** — some products have multiple barcodes (different pack sizes, regional variants). The `cache_barcodes` table holds alternate barcode mappings that point back to a canonical product ID
- **Customers** — the cashier can link a customer to a sale for loyalty, invoice, or credit note purposes. Without a local customer cache, customer lookup fails offline
- **POS config** — the configuration of this specific POS terminal: which pricelists are active, which payment methods are enabled, which cashier permissions apply, the store's rounding settings, receipt header/footer
- **User permissions** — which cashier can apply discounts? Who can void an order? Without a local permissions cache, permission checks fail offline
- **`sync_state`** — a table that tracks the last synced revision and last sync timestamp for each of these data types independently, so the sync engine knows what to fetch for each one

The common thread: **anything the checkout calculation depends on must be available locally.** If any of these are missing when the network is down, the app either shows wrong totals or blocks the cashier entirely.

---

#### Why is it suggested here and why is it the best fit?

The pre-check-3 hybrid architecture already establishes the pattern — critical data lives in SQLite for offline availability and fast startup. Products are cached. The logical extension of that same principle is that every other data type the checkout depends on must also be cached.

Without this, the offline claim of the app is false. The cashier can see products but cannot complete a sale with correct tax, cannot apply a customer's pricelist, cannot select a payment method, and cannot enforce permissions — all because those tables were never added to the local SQLite cache.

Each table follows the same hybrid pattern as `cache_products`:
- Loaded from SQLite at startup into memory
- Refreshed in the background via the sync engine using its own revision counter
- Kept in sync with WebSocket real-time updates where applicable
- Persisted to disk so it survives crashes

The `sync_state` table is the coordination layer — it stores `last_revision` and `last_synced_at` per entity so each data type can be synced on its own schedule independently:

```sql
CREATE TABLE sync_state (
  entity_name     TEXT PRIMARY KEY,   -- 'products', 'taxes', 'pricelists', etc.
  last_revision   INTEGER DEFAULT 0,
  last_synced_at  TEXT,
  sync_status     TEXT DEFAULT 'idle' -- 'idle' | 'syncing' | 'failed'
)
```

---

#### Additional improvements

**Not all tables need to be in memory — only frequently accessed ones:**

`cache_products` must be fully in memory because it is searched 60,000 items at a time. But `cache_taxes`, `cache_pricelists`, and `cache_pos_config` are small (usually under 100 rows each) and are only read at checkout time — they can be queried directly from SQLite at checkout without holding them in memory permanently. This reduces RAM usage while keeping offline capability.

Only these need to be in memory at all times:
- `cache_products` + its Maps — searched constantly during active use
- `cache_categories` — needed to render category filter buttons
- Active pricelist for the current session — looked up per product on add-to-cart

Everything else can be read from SQLite on demand.

**Sync each table on its own schedule:**

| Table | Sync schedule | Reason |
|---|---|---|
| `cache_products` | Every 30 seconds | Prices change frequently |
| `cache_taxes` | On startup + every 4 hours | Tax rates change rarely |
| `cache_pricelists` | On startup + every 1 hour | Pricelist changes are planned in advance |
| `cache_payment_methods` | On startup only | Almost never changes mid-day |
| `cache_customers` | On demand (search) | Too large to sync fully; search via API when online |
| `cache_pos_config` | On startup + on config change WS event | Terminal config rarely changes mid-session |
| `cache_users_permissions` | On login + on permission change WS event | Permissions must be current for each cashier session |

---

#### Is there a better alternative?

No — local caching of all checkout-critical data is the only way to deliver a truly offline-capable POS:

| Alternative | Why it does not fit |
|---|---|
| Fetch taxes/pricelists from backend at checkout | Checkout fails entirely when offline — defeats the point of offline mode |
| Hardcode tax rates in the frontend | Any tax rate change requires an app deployment — operationally unworkable |
| Cache only products, handle rest in memory at login | Memory lost on crash — same fragility problem as memory-only cart |
| Full local cache per table with `sync_state` (chosen) | Offline checkout works correctly, each table syncs independently, revision-tracked |

## ChatGPT Comment 14 — Add conflict handling for local/offline changes

If cashier creates offline orders using product data from an older cache, the backend may later reject or adjust the order because price/tax changed.

Suggested policy:

```text
Offline order uses price/tax snapshot from sale time.
Backend sync preserves sale-time values unless manager/backend rule requires review.
Conflicts go to manual reconciliation queue.
```

Do not silently recalculate offline orders using newer prices during sync.

---

### ✅ Final Conclusion — Comment 14

---

#### What is this concept?

When a cashier takes a sale offline, the prices and taxes used in that order come from whatever is currently cached locally. That cache may be minutes old or hours old depending on how long the POS has been disconnected. When the network comes back and the app tries to sync that order to the backend, a problem can arise: the backend may have newer prices and taxes than what the order was calculated with.

For example:
- Cashier sells "Mango Juice 1L" offline at ₹80 (cached price from 3 hours ago)
- While the POS was offline, the backend updated the price to ₹90
- Network returns, POS syncs the order to backend
- Backend sees an order for ₹80 but its current price for that product is ₹90

What should happen now? There are two very different wrong answers:

**Wrong answer 1 — Backend silently rejects the order:** The POS submitted a valid completed sale, money has already been taken from the customer. The order cannot just disappear. The store has a liability.

**Wrong answer 2 — Backend silently recalculates to ₹90:** The cashier charged ₹80, the customer paid ₹80, and a receipt was issued for ₹80. The backend recording ₹90 creates a discrepancy between the receipt and the backend record — an accounting mismatch that causes problems in reconciliation and potentially in tax filings.

Neither silent outcome is acceptable. The correct answer is: **the offline order is submitted with its original sale-time values, and if those values conflict with current backend data, the conflict is flagged for human review — not silently resolved by the system.**

---

#### Why is it suggested here and why is it the best fit?

This comment addresses a gap in how offline orders are synced. The pre-check-3 document describes storing offline orders in `offline_order_queue` but does not define what happens when the backend disagrees with the order's values.

The policy the comment suggests has three parts, each of which is correct:

**1. Offline order uses the price/tax snapshot from sale time.**

When an order is created offline and written to `offline_order_queue`, the `payload_json` must include a complete snapshot of the prices, taxes, and discounts that were active at the exact moment of the sale — not product IDs that will be looked up later. This is the same principle as a printed receipt: the receipt records what was charged, not a reference to "look up the current price of this product."

```js
// WRONG — store product IDs, resolve prices at sync time
payload_json: {
  lines: [{ product_id: 4521, qty: 2 }]
}

// CORRECT — snapshot everything at sale time
payload_json: {
  lines: [{
    product_id: 4521,
    product_name: "Mango Juice 1L",
    unit_price: 80.00,
    tax_ids: [3],
    tax_amount: 7.20,
    discount: 0,
    subtotal: 160.00
  }],
  order_total: 167.20,
  prices_snapshot_revision: 184920   // revision of the cache at sale time
}
```

Including `prices_snapshot_revision` lets the backend know which version of the pricing data was active when the sale was made. This makes the conflict detectable and auditable.

**2. Backend sync preserves sale-time values unless a manager or backend rule explicitly requires review.**

The backend must accept the order as submitted. The sale happened, the money was taken, the receipt was issued. The backend records the order with the submitted values. If the submitted price differs from the current price, the backend flags it as a conflict — but does not reject the order or change the values unilaterally.

**3. Conflicts go to a manual reconciliation queue.**

When the backend detects that an offline order's submitted price differs from the current price by more than an acceptable tolerance (e.g. more than ₹1 or more than 2%), it puts that order into a reconciliation queue. A manager reviews it, sees "Order #POS-00142 was sold at ₹80, current price is ₹90 — approve or escalate?" and makes a human decision. The outcome is recorded for the audit trail.

---

#### Additional improvements

**Define a tolerance threshold for what counts as a conflict:**

Minor rounding differences (e.g. ₹0.01 due to floating point) should not trigger a manual review. Only flag a conflict when the price difference exceeds a meaningful threshold — configurable in `cache_pos_config`, defaulting to something like ₹1 or 1% of the line total.

**Surface pending reconciliation orders visibly:**

If an order is in the reconciliation queue, the manager screen should show a count badge and a dedicated review list. Each entry should show: order number, cashier, sale time, submitted price, current price, and difference. A stuck reconciliation queue means revenue that has not been fully confirmed — it should never be invisible.

**Include the cache revision in every offline order payload:**

`prices_snapshot_revision` should be a mandatory field in `payload_json`. When the backend reviews the order it can look up exactly which pricing data was active at that revision, making the conflict analysis precise rather than approximate.

---

#### Is there a better alternative?

No — snapshot at sale time with manual reconciliation for conflicts is the only approach that is both financially correct and operationally honest:

| Alternative | Why it does not fit |
|---|---|
| Reject orders with stale prices | Money already taken — rejecting the order creates a liability with no resolution |
| Silently recalculate to current prices at sync time | Receipt says one amount, backend records another — accounting mismatch, potential tax error |
| Accept all orders without conflict detection | Price discrepancies accumulate silently — discovered only at month-end reconciliation when damage is done |
| Snapshot at sale time + manual reconciliation for conflicts (chosen) | Sale record is accurate, discrepancies are visible, humans make the final call |

## ChatGPT Comment 15 — Add health checks for local SQLite cache

At startup, before trusting SQLite cache, run checks:

```text
- database opens successfully
- schema version supported
- last completed snapshot exists
- product count > minimum expected count
- integrity check passes
- required indexes exist
```

If checks fail, rebuild cache from backend or show manager-level error.

---

### ✅ Final Conclusion — Comment 15

---

#### What is this concept?

Every time the POS app starts, it loads the product catalogue, taxes, and prices from the local SQLite database instead of downloading everything from the backend. This is one of the core design decisions in pre-check-3 — it is what makes startup fast and what allows the POS to open even when the network is unavailable.

But that local database can be in a bad state for reasons the app did not cause: the OS could have crashed mid-write, the disk could have had a write error, the database file could have been partially truncated, the schema could be from an older version of the app, or the last full sync could have been interrupted before it completed. If the app simply opens SQLite and starts serving data without checking any of this, it may show the cashier products with wrong prices, no prices, or no products at all — and the cashier would have no way of knowing the data is bad.

A health check sequence is a set of fast, automated tests that run at startup before the app marks the cache as trusted. Each test answers one specific "is this data safe to use?" question. If all checks pass, the app proceeds normally. If any check fails, the app knows the local data is not reliable and falls back: either trigger a full re-download from the backend, or show a manager-level error if the network is also unavailable.

---

#### Why is it suggested here and why is it the best fit?

The pre-check-3 document designs a system where startup depends entirely on the local SQLite cache being valid. There is no network call at startup. That means if the cache is corrupt or incomplete and there is no validation, the cashier opens the POS and starts taking orders on bad data — and the system gives no warning.

This comment suggests six specific checks. Each one catches a different type of failure:

**Check 1 — Database opens successfully**

The most basic check: can SQLite open the file at all? A partially written or truncated `.db` file may cause `better-sqlite3` to throw on open. If this throws, every check after it would also fail — so catching it first allows a clean error message rather than a crash.

```js
let db;
try {
  db = new Database(DB_PATH, { readonly: false });
} catch (err) {
  return { healthy: false, reason: 'db_open_failed', detail: err.message };
}
```

**Check 2 — Schema version is supported**

The app stores its current schema version in `app_settings`. When the app updates and the schema changes, it runs a migration. But if an older build wrote data and a newer build opens it without running migration yet, the tables may have columns missing or different types. Checking the stored `schema_version` against the version the current code expects ensures the app never runs against a schema it was not built for.

```js
const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'schema_version'`).get();
if (!row || parseInt(row.value) < MINIMUM_SUPPORTED_SCHEMA) {
  return { healthy: false, reason: 'schema_too_old' };
}
```

**Check 3 — Last completed snapshot exists**

The `app_settings` table has a `catalogue_ready` flag that is only set to `true` when a full snapshot sync completes successfully (as discussed in Comment 2). If the database exists but `catalogue_ready` is `false` or absent, it means the initial sync was interrupted and the product data is incomplete. The app should not serve partial data as if it were complete.

```js
const flag = db.prepare(`SELECT value FROM app_settings WHERE key = 'catalogue_ready'`).get();
if (!flag || flag.value !== 'true') {
  return { healthy: false, reason: 'catalogue_not_ready' };
}
```

**Check 4 — Product count above a minimum threshold**

Even if `catalogue_ready` is `true`, a simple row count on `cache_products` provides a sanity check. If the backend catalogue has 1,200 products and the local cache only has 3, something is wrong — possibly a failed swap or a corrupt write. The minimum threshold is configurable in `cache_pos_config` (e.g. `minimum_product_count: 10`). This is a coarse check, not a precise one — it only catches the obviously broken case.

```js
const { count } = db.prepare(`SELECT COUNT(*) as count FROM cache_products WHERE active = 1`).get();
if (count < MIN_EXPECTED_PRODUCT_COUNT) {
  return { healthy: false, reason: 'product_count_too_low', count };
}
```

**Check 5 — Integrity check passes**

SQLite has a built-in `PRAGMA integrity_check` command that scans the database file for structural corruption: malformed B-tree pages, broken cell pointers, and missing overflow pages. On a normally-sized POS database this runs in under 100ms. Using `quick_check` instead of `integrity_check` skips the most thorough scan but is still sufficient for detecting the common disk-write corruption that causes real problems. If `quick_check` returns anything other than `"ok"`, the database file itself is damaged and must be rebuilt.

```js
const result = db.prepare(`PRAGMA quick_check`).get();
if (result['integrity_check'] !== 'ok') {
  return { healthy: false, reason: 'integrity_check_failed' };
}
```

**Check 6 — Required indexes exist**

Indexes can be dropped accidentally — either by a migration bug or by someone running manual SQL. If the `idx_cache_products_barcode` index is missing, barcode lookup at startup falls back to a full table scan. Checking that required indexes exist takes a single query against `sqlite_master` and prevents silent performance degradation on the first transaction of the day.

```js
const indexes = db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all().map(r => r.name);
const required = ['idx_cache_products_barcode', 'idx_cache_products_product_id'];
const missing = required.filter(i => !indexes.includes(i));
if (missing.length > 0) {
  return { healthy: false, reason: 'missing_indexes', missing };
}
```

---

#### Additional improvements

**Run checks in order from cheapest to most expensive:**

Open → schema version → catalogue flag → product count → index check → integrity check. `quick_check` is the slowest of the six and should always run last. If any earlier check fails, skip the rest and immediately trigger the fallback — no need to run an integrity scan on a database that is not even open.

**Show a specific error screen per failure type:**

Do not show the cashier a generic "error" screen. Each failure has a different recovery path:

| Failure | What the cashier sees |
|---|---|
| `db_open_failed` | "Local data is damaged — re-downloading now" (triggers full sync if online, or blocks on manager PIN if offline) |
| `catalogue_not_ready` | "Setup not complete — please connect to the network to finish setup" |
| `product_count_too_low` | "Product list is incomplete — re-downloading now" |
| `integrity_check_failed` | "Local database is corrupted — contacting manager" |
| `missing_indexes` | Silently rebuild indexes and continue — this is recoverable without a re-download |

**Log health check results on every startup:**

Write a health check result record to `app_settings` at each startup: timestamp, pass/fail for each check, and how long the whole sequence took. When support reviews a device, this log shows whether health failures are recurring — which points to a hardware issue (disk) rather than a software bug.

---

#### Is there a better alternative?

No — a structured startup health check sequence is the only way to catch database problems before they affect a sale:

| Alternative | Why it does not fit |
|---|---|
| Trust the cache blindly every startup | Silent failures: cashier takes orders on corrupt or incomplete data, discovered only when sync fails or receipts are wrong |
| Download fresh data on every startup | Defeats the entire purpose of the local cache; startup requires network; not offline-capable |
| Only check if the last shutdown was clean | Misses disk corruption that happened mid-write even during a "clean" session; also misses OS crashes that did not update the shutdown flag |
| Structured startup health checks (chosen) | Fast (all 6 checks complete in under 200ms on typical hardware), offline-safe, specific failure reasons drive specific recovery paths |

## ChatGPT Comment 16 — Add indexes for startup and lookup performance

Even though runtime search uses memory, SQLite still needs indexes for startup, sync, and barcode lookup.

Suggested indexes:

```sql
CREATE INDEX idx_cache_products_product_id ON cache_products(product_id);
CREATE INDEX idx_cache_products_barcode ON cache_products(barcode);
CREATE INDEX idx_cache_products_write_date ON cache_products(write_date);
CREATE INDEX idx_cache_products_active ON cache_products(active);
CREATE INDEX idx_sync_state_entity ON sync_state(entity_name);
```

---

### ✅ Final Conclusion — Comment 16

---

#### What is this concept?

An index in SQLite is a separate internal data structure that SQLite builds and maintains alongside a table. Without an index, any query that looks up a row by a specific column value must scan every row in the table from top to bottom until it finds a match — this is called a full table scan. With an index on that column, SQLite can jump directly to the matching rows in O(log N) time, the same way a book's index lets you jump to a topic without reading every page.

Indexes cost something: each write to a table also updates every index on that table, which adds a small amount of write overhead. But for the operations the POS performs at startup and during barcode scanning — "give me all active products sorted by write_date" or "find the product with barcode 8901234567890" — the read speedup massively outweighs the write cost. A 10,000-product catalogue without a barcode index means every barcode scan triggers a full table scan across 10,000 rows. With the index, it is a single lookup.

This comment is specifically about SQLite-level indexes. It is not about the in-memory `allProducts[]` array in Zustand. Runtime search (as the cashier types into the search bar) uses the in-memory array because it is already loaded and RAM lookups are instantaneous. But SQLite still needs its own indexes for:

- **Startup** — loading all active products into memory in write_date order
- **Delta sync** — fetching only records changed since the last sync (`WHERE write_date > ?`)
- **Barcode lookup** — scanning a barcode when products are not yet in memory, or for a single direct lookup
- **Health check** — counting active products efficiently
- **Soft delete filter** — any query with `WHERE active = 1` benefits from the index on `active`

---

#### Why is it suggested here and why is the best fit?

The pre-check-3 document describes startup loading, delta sync, and barcode scanning as core operations — but does not define any indexes on the tables those operations query. Without indexes, each of these operations degrades as the catalogue grows. A POS with 500 products may never notice the difference. A POS with 5,000 products or a franchise with 50,000 SKUs will have noticeably slow startup and sluggish barcode scans.

Each suggested index serves a specific, named operation:

**`idx_cache_products_product_id`** — used when a single product is fetched by its backend ID during sync, conflict detection, or when the offline order queue resolves a product reference. Without this index, `WHERE product_id = 4521` scans the whole table.

**`idx_cache_products_barcode`** — used for barcode scanner lookups. Every time a barcode is scanned, the query is `SELECT * FROM cache_products WHERE barcode = ? AND active = 1`. This is one of the most time-sensitive queries in the entire POS — the cashier is holding a scanned item and waiting. It must return in under 5ms. This index makes that possible regardless of catalogue size.

**`idx_cache_products_write_date`** — used by delta sync. The sync query is `SELECT * FROM cache_products WHERE write_date > ?` to fetch all rows changed since the last sync. Without this index, every delta sync scans every row in the table. With it, only the changed rows are touched.

**`idx_cache_products_active`** — used by every query that filters `WHERE active = 1`, including the startup load, the health check product count, and search. Since soft deletion leaves `active = 0` rows in the table permanently (90-day retention), the table will accumulate inactive rows over time. Without this index, every query that wants only active products pays the cost of scanning deleted rows too.

**`idx_sync_state_entity`** — the `sync_state` table has one row per entity type (products, taxes, customers, etc.). Any query that looks up sync state for a specific entity — `WHERE entity_name = 'products'` — uses this index. Without it, a scan of 10 rows is not a performance problem today, but it is also not the right foundation for a system that may add more entity types later.

---

#### Additional improvements

**Create indexes inside the migration runner, not as ad-hoc SQL:**

Indexes should be created by the same migration scripts that create the tables — not scattered in application startup code. This way, if a new device sets up for the first time, it runs all migrations in order and gets the correct indexes as part of the schema. If a migration adds a new table or column, the index for that column is added in the same migration.

```sql
-- migration_004.sql
CREATE INDEX IF NOT EXISTS idx_cache_products_barcode ON cache_products(barcode);
CREATE INDEX IF NOT EXISTS idx_cache_products_write_date ON cache_products(write_date);
```

Using `IF NOT EXISTS` means migrations are safe to re-run — they will not error if the index already exists.

**Use `EXPLAIN QUERY PLAN` during development to verify indexes are being used:**

SQLite has a built-in query planner diagnostic. Running `EXPLAIN QUERY PLAN SELECT * FROM cache_products WHERE barcode = ?` will tell you whether SQLite is using the index or falling back to a full scan. This takes 5 seconds to check during development and prevents index misses from shipping silently.

**Consider a partial index for the active-only queries:**

Instead of indexing the `active` column across all rows (including the permanently inactive soft-deleted ones), a partial index indexes only the rows where `active = 1`:

```sql
CREATE INDEX idx_cache_products_active_only ON cache_products(product_id) WHERE active = 1;
```

This index is smaller, faster to scan, and automatically excludes soft-deleted rows. Any query with `WHERE active = 1` will use it — startup load, product count, search — without needing to touch the deleted rows at all.

---

#### Is there a better alternative?

No — SQLite indexes for the specific queries this POS performs are not optional optimizations, they are correctness requirements for a production system:

| Alternative | Why it does not fit |
|---|---|
| No indexes, rely on full table scans | Works on a 200-product catalogue; degrades unacceptably on 5,000+ products; barcode scan latency visible to cashier |
| Index every column | Unnecessary write overhead on every sync write; waste of disk space; indexes on rarely-queried columns provide no benefit |
| Skip SQLite, keep everything in memory only | Memory is lost on crash; startup requires re-download from backend; defeats offline capability |
| Indexes created by migration runner, targeted to actual queries (chosen) | Predictable startup performance regardless of catalogue size; migrations keep schema and indexes in sync; `IF NOT EXISTS` makes them safe to re-run |

## ChatGPT Comment 17 — Add backend compatibility contract

The frontend cache and sync depend on backend API guarantees. Document these guarantees explicitly.

Backend should guarantee:

```text
stable product IDs
monotonic revision numbers
consistent pagination during sync
deleted/inactive product markers
idempotent order ingestion
server-side conflict response format
schema/API version compatibility
```

Without this, the local cache can become inconsistent.

---

### ✅ Final Conclusion — Comment 17

---

#### What is this concept?

The POS frontend and the backend server are two separate systems written and deployed independently. The frontend cache and sync engine are built with certain assumptions about how the backend behaves — assumptions like "a product's ID will never change," "revision numbers will always increase," and "submitting the same order twice will not create a duplicate charge." These assumptions are not automatically enforced anywhere. If the backend team changes something without knowing the frontend depends on it, the frontend can silently break in ways that are very hard to debug after the fact.

A backend compatibility contract is a written agreement between the frontend and backend teams that documents exactly what guarantees the backend must uphold for the frontend to work correctly. It is not code — it is a shared specification. The purpose is to make the implicit assumptions explicit, so that:

- The backend team knows what they cannot change without a coordinated migration
- The frontend team knows what they can rely on and what they must defensively handle
- When something breaks, both teams can check the contract first to see if a guarantee was violated

---

#### Why is it suggested here and why is it the best fit?

The pre-check-3 document describes a sync system that is built on top of backend data. The local cache reflects what the backend says. The delta sync uses backend-provided revision numbers. Orders submitted offline rely on the backend accepting them idempotently. All of this only works if the backend behaves consistently. Without a documented contract, any backend change — even one that seems minor — can silently corrupt the local cache or cause order submission failures.

Each of the seven guarantees the comment lists protects a specific part of the sync system:

**1. Stable product IDs**

The POS stores all cart lines, offline orders, and receipts with the backend `product_id` as the reference. If the backend ever reassigns or reuses a product ID — even for a "replaced" product — the frontend will look up the wrong product for old receipts and offline order payloads. Product IDs must be immutable once assigned. Retirement means setting `active = false`, not recycling the ID.

**2. Monotonic revision numbers**

The entire delta sync strategy depends on the guarantee that if revision N+1 exists, it was created after revision N. If revision numbers can go backwards (e.g. the backend restores from an old backup, or revision counters are reset after a migration), the frontend will believe its cache is up to date when it is actually stale. The contract must state: revision numbers only increase, never reset, never skip backwards. If a backend restoration ever resets revisions, a full re-sync must be forced.

**3. Consistent pagination during sync**

When the frontend fetches a large catalogue in pages (`/products?page=1&page_size=200`), each page must be a stable slice of the same dataset. If the backend is actively receiving product updates while the frontend is paginating, a product could appear on both page 1 and page 2, or be skipped entirely, because rows shifted between pages. The backend must either paginate by a stable cursor (e.g. `after_id=`) or take a snapshot for the duration of a full sync. Without this, a full catalogue refresh can produce a subtly wrong local cache.

**4. Deleted/inactive product markers**

The frontend uses soft deletion (`active = 0`) specifically because it needs to know when products have been deactivated. If the backend hard-deletes products instead of marking them inactive, those products will never appear in a delta sync response, and the frontend will never know to deactivate them locally. The contract must require: products are never hard-deleted; they are only deactivated. The deactivation must appear in the delta sync response as a record with `active = false` and an updated `write_date`.

**5. Idempotent order ingestion**

When an offline order is submitted to the backend after the POS comes back online, the same order may be submitted more than once — the POS may retry because it did not receive a confirmation from the first attempt. The backend must use the `local_order_uuid` to deduplicate: if an order with that UUID already exists, return `200 OK` with the existing order record rather than creating a second order. Without this, a network timeout on the first submission followed by a retry creates a duplicate charge for the customer.

**6. Server-side conflict response format**

When the backend detects a conflict on an offline order (as discussed in Comment 14), it must return a response in a documented format that the frontend can parse and route to the reconciliation queue. If the backend returns a generic 400 error or a human-readable error message, the frontend cannot automatically categorize it. The contract must define the exact response structure:

```json
{
  "status": "conflict",
  "conflict_type": "price_mismatch",
  "order_uuid": "abc-123",
  "lines": [
    {
      "product_id": 4521,
      "submitted_price": 80.00,
      "current_price": 90.00,
      "difference": 10.00
    }
  ]
}
```

**7. Schema/API version compatibility**

When the backend API changes — new required fields, removed fields, changed response shapes — the frontend must know in advance so it can update its sync parser before the backend deploys. The contract must include an API version header (`X-API-Version: 3`) on every response, and the frontend must validate this version at startup. If the version is higher than what the current frontend supports, it must alert the manager: "A POS update is required before syncing."

---

#### Additional improvements

**Write the contract as a shared document in the project repository, not as comments in code:**

The contract should live as a versioned markdown file accessible to both the frontend and backend teams — something like `docs/backend-contract.md`. When either team makes a breaking change, they update the contract and communicate to the other side. This creates an audit trail of what changed and when.

**Add a version negotiation handshake at startup:**

At startup, the POS should call a lightweight `/api/version` endpoint that returns the current API version and minimum supported POS version. If the POS version is too old for the current backend, show a mandatory update screen before allowing any sync. This prevents a deployed POS from silently working with an incompatible backend after a backend update.

```js
// startup version check (runs before any sync)
const { apiVersion, minPosVersion } = await fetch('/api/version').then(r => r.json());
if (semver.lt(CURRENT_POS_VERSION, minPosVersion)) {
  showMandatoryUpdateScreen();
  return;
}
```

---

#### Is there a better alternative?

No — explicit documentation of backend guarantees is the only way to prevent silent contract violations from corrupting the local cache or causing duplicate orders:

| Alternative | Why it does not fit |
|---|---|
| No contract, rely on verbal agreement | Assumptions are invisible; any backend refactor can break the frontend without anyone realizing until a support call comes in from a store |
| Contract in code comments only | Backend team may not read frontend comments; no single source of truth both teams can reference during planning |
| Integration tests only (no written contract) | Tests verify current behavior but do not prevent future changes; a backend developer who does not know the test exists will not know to update it |
| Written contract in shared repo + API version handshake (chosen) | Assumptions are visible and versioned; breaking changes require explicit coordination; the POS detects API mismatches at startup before any data is exchanged |

## ChatGPT Comment 18 — Add retry/backoff strategy

When background sync fails, do not retry aggressively forever.

Suggested retry:

```text
1st retry: 5 seconds
2nd retry: 15 seconds
3rd retry: 30 seconds
Then: every 1–5 minutes until online
```

Also expose manual "Retry Sync" in manager/settings screen.

---

### ✅ Final Conclusion — Comment 18

---

#### What is this concept?

When the POS tries to sync with the backend — fetching updated products, submitting offline orders, pushing a completed sale — the network request can fail. The internet might be down, the backend server might be temporarily unavailable, or the request might time out. The app needs to try again.

The naive approach is to retry immediately and keep retrying as fast as possible. This is wrong for two reasons. First, if the failure is a temporary server overload, hammering the server with rapid retries makes the overload worse — every POS device in every store doing this simultaneously is a self-inflicted denial of service. Second, it wastes the device's battery and CPU doing nothing useful while the network is genuinely down.

An exponential backoff strategy solves this: after the first failure, wait a short time before the next attempt. After the second failure, wait longer. After the third, wait longer still. Eventually settle into a slow polling rhythm — checking every few minutes — until the connection is restored. The waits grow exponentially because most transient failures resolve within seconds; if they do not, the problem is likely structural (the server is down, the network is out) and polling every 5 seconds is not going to help.

Additionally, jitter — a small random variation added to each wait — prevents the "thundering herd" problem: if 50 POS devices all fail at exactly the same moment and all retry at exactly the same interval, they all hit the server at exactly the same time on each retry, creating repeated spikes. Jitter spreads those retries across a window so the server sees a steady trickle instead of synchronized bursts.

---

#### Why is it suggested here and why is it the best fit?

The pre-check-3 document describes background sync as a core ongoing operation — delta syncs for product updates, offline order submission, and cart draft sync all happen in the background without the cashier initiating them. None of these have a retry strategy defined. Without one, a failed sync either silently stops (the data never updates) or retries in a tight loop (burns CPU, floods the backend).

The timing in the comment — 5s, 15s, 30s, then 1–5 min — follows the standard exponential backoff pattern used in production sync systems everywhere. Each step is roughly 3× the previous. The final "every 1–5 minutes" settling rhythm is appropriate for a POS: short enough that when connectivity returns, the cache updates within a few minutes without the cashier noticing; long enough that a prolonged outage does not drain the device or overload the backend.

The retry strategy must be different for different types of sync operations:

**Delta sync (product/price updates):** Low urgency. If the retry fails, the cashier works with slightly stale cached data. Use full exponential backoff. Max staleness before showing a warning badge is governed by the staleness thresholds from Comment 7.

**Offline order submission:** High urgency, but still must use backoff. The order is durable in SQLite — it will not be lost. But the backend needs to receive it eventually. Use backoff with a longer final interval (every 5 minutes), and show a visible count of "pending orders" in the manager screen. A human should be aware if orders have been queued for more than 30 minutes.

**Payment state sync (post-checkout confirmation):** Must retry aggressively but with a cap. After a payment is approved locally, the frontend needs backend confirmation before it can mark the order complete. Retry at 5s, 10s, 20s, then fall into the recovery screen (from Comment 10) if still failing after 3 attempts.

```js
// Exponential backoff with jitter
function getRetryDelay(attempt) {
  const base = [5_000, 15_000, 30_000];         // first 3 attempts: 5s, 15s, 30s
  const delay = base[attempt] ?? 60_000 + Math.random() * 4_000 * 60; // then 1–5 min
  const jitter = Math.random() * 1_000;          // up to 1s of jitter
  return delay + jitter;
}

async function syncWithRetry(syncFn, maxAttempts = Infinity) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      await syncFn();
      return; // success — stop retrying
    } catch (err) {
      attempt++;
      if (attempt >= maxAttempts) throw err;
      const delay = getRetryDelay(attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

The manual "Retry Sync" button on the manager screen is equally important. Backoff means the cashier might wait up to 5 minutes for the next automatic retry. If the manager just restored the network connection or rebooted the router, waiting 5 minutes is unnecessary. The manual button resets the backoff counter and triggers an immediate retry — it is essentially a way to say "I know the problem is fixed, try now."

---

#### Additional improvements

**Distinguish permanent failures from transient ones:**

Not all errors should trigger a retry. A `401 Unauthorized` means the POS credentials are invalid — retrying 50 times will not fix it. A `400 Bad Request` on an order submission means the payload is malformed — retrying with the same payload will always fail. Only retry on errors that are genuinely transient: network timeouts (`ECONNRESET`, `ETIMEDOUT`), `503 Service Unavailable`, and `429 Too Many Requests` (which also includes a `Retry-After` header the client should respect).

```js
function isRetryable(err) {
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') return true;
  if (err.status === 503 || err.status === 429) return true;
  return false; // 400, 401, 403, 404, 422 — do not retry
}
```

**Write the last sync error and retry count to SQLite:**

Every retry attempt and every failure should be written to `sync_state`. This gives the diagnostics page (Comment 19) real data to show: "Last sync error: ETIMEDOUT, attempt 3 of ∞, next retry in 47 seconds." Without persisting this, the manager screen can only show "sync failed" with no actionable detail.

**Cap the total retry window for offline order submission:**

Background delta sync can retry indefinitely — stale product data is a UX problem, not a financial one. But for offline order submission, after a configurable maximum (e.g. 24 hours with no successful submission), the order should move to the manager review queue with a "requires manual action" status. An order that has been failing to sync for 24 hours is not a transient network issue; something is structurally wrong.

---

#### Is there a better alternative?

No — exponential backoff with jitter is the industry-standard solution for exactly this problem, and it is the right fit here:

| Alternative | Why it does not fit |
|---|---|
| Retry immediately and aggressively | Amplifies server load during outages; self-inflicted denial of service when all devices retry simultaneously |
| Fixed interval retries (every 30s always) | Better than aggressive, but still creates synchronized spikes without jitter; does not adapt to recovery time |
| No automatic retry, only manual | Cashier must manually trigger every sync after any network blip; missed retries mean stale data and unsubmitted orders |
| Stop retrying after 3 failures permanently | Offline orders may never reach the backend; cashier has no way to recover without a manual developer intervention |
| Exponential backoff with jitter + manual retry button (chosen) | Server-friendly, adapts to both quick recovery and prolonged outages, non-retryable errors are not retried, manager has a manual override |

## ChatGPT Comment 19 — Add support diagnostics for cache status

Add a settings/support page showing:

```text
product count
last sync time
last completed revision
last sync error
offline order count
cart draft count
SQLite DB size
WAL file size
cache rebuild button
```

This will help debug store issues without opening developer tools.

---

### ✅ Final Conclusion — Comment 19

---

#### What is this concept?


When something goes wrong in a store — products not updating, an order stuck in the queue, the cashier seeing stale prices — someone has to diagnose the problem. In most Electron apps, the only way to inspect the internal state of the app is to open the Chromium DevTools console. That requires a keyboard shortcut, developer knowledge, and access permissions that a store manager or support agent typically does not have.

A support diagnostics page is a screen inside the app — accessible to the manager without any developer tools — that displays the internal state of the system in plain, readable terms. It is not a debug console. It is a purpose-built status dashboard that answers the questions a support conversation always starts with: "How many products are loaded? When did you last sync? Is there anything stuck in the queue? How big is the database?"

The target audience for this page is not developers. It is the store manager and the remote support team. The design goal is: any information a support agent would ask for over the phone should already be visible on this page.

---

#### Why is it suggested here and why is it the best fit?

The pre-check-3 document builds a system with multiple moving parts: background sync, offline order queue, cart draft persistence, payment state recovery, delta revisions. Each of these can silently fail or get stuck. Without a diagnostics page, a support call for "products not updating" requires the support agent to walk the manager through opening DevTools, finding the right tab, running SQL queries — a process that is slow, error-prone, and often impossible with a non-technical manager.

Each item on the list the comment suggests surfaces a specific type of problem:

**Product count** — the first question in any "products look wrong" call. If the count is 3 instead of 1,200, the catalogue sync failed. If it matches but specific products are missing, a delta sync missed some records.

**Last sync time** — tells the support agent whether the POS has synced recently. "Last sync: 6 hours ago" immediately explains stale prices without any further investigation. Combined with the staleness badge from Comment 7, the manager can see this without even opening the diagnostics page.

**Last completed revision** — shows which version of the backend data the local cache reflects. The support agent can compare this against the backend's current revision to calculate exactly how many changes the POS has missed.

**Last sync error** — the exact error message from the most recent failed sync attempt. Without this, the manager can only say "sync isn't working." With it, the support agent sees `ETIMEDOUT` (network issue) vs `401 Unauthorized` (credentials expired) vs `schema_version_mismatch` (POS needs an update) — three completely different actions required.

**Offline order count** — the number of orders currently in `offline_order_queue` that have not yet been submitted to the backend. If this is greater than zero and the store thinks it is connected, something is wrong with order submission. If it is growing, the backend is not accepting orders.

**Cart draft count** — the number of saved cart drafts. Mostly informational, but useful if the cashier reports "my cart is gone" — the support agent can confirm whether a draft was saved.

**SQLite DB size** — the total size of the `.db` file on disk. If this is unexpectedly large (e.g. 800MB on a POS that should have a 50MB catalogue), something is accumulating rows it should not be — perhaps old offline orders that were never cleaned up, or audit logs that were never pruned.

**WAL file** — the size of the Write-Ahead Log file (`.db-wal`). Normally this is small and gets checkpointed automatically. If it is large (e.g. 100MB), it means WAL checkpointing has not been running, which can happen if the database connection was not closed cleanly. A large WAL file slows down all reads.

**Cache rebuild button** — a single button that triggers a full catalogue re-download and temp-table swap (from Comment 2/3). This is the "nuclear option" that fixes any data inconsistency without developer intervention. It should be behind a manager PIN so cashiers cannot accidentally trigger it mid-shift.

---

#### Additional improvements

**Read all diagnostics data from SQLite, not from memory:**

All values on this page should be read directly from SQLite at the moment the page opens — not from Zustand state. Zustand state reflects the current runtime; SQLite reflects the persisted reality. If there is a discrepancy between them, SQLite is the source of truth the support agent needs to see.

```js
function getDiagnostics(db) {
  const productCount  = db.prepare(`SELECT COUNT(*) as n FROM cache_products WHERE active = 1`).get().n;
  const lastSyncTime  = db.prepare(`SELECT value FROM app_settings WHERE key = 'last_sync_time'`).get()?.value;
  const lastRevision  = db.prepare(`SELECT value FROM app_settings WHERE key = 'last_product_revision'`).get()?.value;
  const lastError     = db.prepare(`SELECT value FROM app_settings WHERE key = 'last_sync_error'`).get()?.value;
  const offlineOrders = db.prepare(`SELECT COUNT(*) as n FROM offline_order_queue WHERE status != 'synced'`).get().n;
  const cartDrafts    = db.prepare(`SELECT COUNT(*) as n FROM cart_draft`).get().n;
  const dbStats       = fs.statSync(DB_PATH);
  const walStats      = fs.existsSync(DB_PATH + '-wal') ? fs.statSync(DB_PATH + '-wal') : null;

  return {
    productCount,
    lastSyncTime,
    lastRevision,
    lastError,
    offlineOrders,
    cartDrafts,
    dbSizeBytes: dbStats.size,
    walSizeBytes: walStats?.size ?? 0
  };
}
```

**Add a "copy diagnostics to clipboard" button:**

A manager on a support call should be able to copy all diagnostics values to the clipboard in a single click and paste them into a chat message. This is faster and more accurate than reading numbers out loud over the phone. The clipboard content should be a plain-text report, not JSON.

```text
POS Diagnostics — 2026-05-01 14:32:05
--------------------------------------
Products loaded:     1,248
Last sync:           2026-05-01 14:28:11 (3 min ago)
Last revision:       184,932
Last error:          none
Offline orders:      0
Cart drafts:         1
DB size:             48.2 MB
WAL size:            0.1 MB
```

**Show a health status summary at the top:**

Rather than requiring the manager to interpret raw numbers, show a single status line at the top of the diagnostics page:

- **All systems operational** (green) — all checks pass, sync recent, no pending orders
- **Sync delayed** (yellow) — last sync more than 30 minutes ago
- **Action required** (red) — offline orders pending for more than 30 minutes, sync error present, or WAL file unusually large

This lets the manager know at a glance whether they need to call support or whether everything is fine.

---

#### Is there a better alternative?

No — a purpose-built diagnostics page accessible without developer tools is the only approach that works for non-technical managers and remote support:

| Alternative | Why it does not fit |
|---|---|
| Rely on Chromium DevTools | Requires developer knowledge and keyboard access the manager does not have; not usable on a touchscreen-only POS terminal |
| Log files only | Logs require file system access, grep skills, and context to interpret — not usable by a store manager during a support call |
| Remote debugging via Electron remote DevTools | Requires a network connection to a developer machine; not available during an in-store emergency |
| Built-in diagnostics page with copy-to-clipboard (chosen) | All critical system state visible in one screen; accessible with manager PIN; remote support gets accurate data in seconds |

## ChatGPT Comment 20 — Hybrid cache is right, but treat it as production data infrastructure

The hybrid design should not be treated as a simple performance optimization only. Once the app supports offline sales, SQLite becomes a production-critical local data store.

Therefore it needs:

- migrations
- backups before schema changes
- integrity checks
- write queue
- sync status
- recovery workflow
- audit logs
- order queue idempotency
- support diagnostics

---

### ✅ Final Conclusion — Comment 20

---

#### What is this concept?

This comment is the closing perspective of the entire pre-check-3 review. It is not introducing a new technical feature — it is making a classification decision that changes how the entire system must be thought about and built.

The classification is this: **SQLite on this POS is not a cache. It is a database.**

The word "cache" implies something disposable — a performance shortcut that holds copies of data that can be thrown away and rebuilt at any time with no consequences. That mental model is fine for a browser cache or a Redis query cache. It is wrong for a POS SQLite database that holds:

- The only local copy of the product catalogue (the POS may be offline for hours)
- Completed offline orders that have not yet reached the backend (real money, real customers, real receipts)
- A saved cart draft (a sale in progress that the cashier expects to still be there after a crash)
- Payment state mid-checkout (the customer's card may have already been charged)
- Audit records for compliance

If the cashier takes ₹50,000 of offline orders during a 4-hour network outage and the SQLite database is corrupted before those orders sync, that money is gone unless there are recovery mechanisms in place. A system that lets that happen is not a "cache with a bug" — it is a system that was architected for the wrong threat model.

The moment offline orders are supported, SQLite on this device becomes the store's primary financial record during any offline period. That demands the same engineering rigor applied to any production database.

---

#### Why is it suggested here and why is it the best fit?

Every one of the nine items on the list in this comment has been addressed in the pre-check-3 document across the previous 19 comments. This final comment is the reasoning that explains *why* all those pieces were necessary. It reframes the decisions made earlier — not as individually optional improvements, but as a coherent set of requirements for a production data store.

Here is how each item maps to the work done:

| Requirement | Where it was addressed | Why it matters |
|---|---|---|
| **Migrations** | Comment 4 | Schema changes must be applied safely without wiping data; a migration runner versioning the schema is how production databases evolve |
| **Backups before schema changes** | Comment 4 | Before any destructive migration, `.backup()` creates a point-in-time copy the app can restore if the migration fails |
| **Integrity checks** | Comment 15 | `PRAGMA quick_check` at startup detects disk corruption before it causes wrong data to reach the cashier |
| **Write queue** | Comment 5 | `db.transaction()` serializes concurrent writes and ensures each batch either completes fully or not at all — no partial writes |
| **Sync status** | Comments 7, 13 | `sync_state` table tracks last sync time and revision per entity; staleness badges surface data age to the cashier |
| **Recovery workflow** | Comment 10 | Payment state written to SQLite before and after each checkout step; startup recovery screen for interrupted payment sessions |
| **Audit logs** | Comment 12 | Soft deletion preserves the history of every product change, price change, and order for the 90-day retention window |
| **Order queue idempotency** | Comment 9 | `local_order_uuid` on every offline order; backend deduplicates retries; the same order is never charged twice |
| **Support diagnostics** | Comment 19 | Manager-facing diagnostics page shows all critical system state without developer tools |

None of these were added because they were interesting engineering problems. Each one exists because there is a real, specific failure scenario it prevents — a scenario where a store loses money, a customer is double-charged, a receipt is unrecoverable, or a manager cannot diagnose what went wrong.

---

#### The mental model shift

The practical consequence of treating SQLite as production infrastructure is a change in how development decisions are made going forward:

**Before this mental model:** "The SQLite database is a local cache. If something goes wrong with it, we rebuild it from the backend."

**After this mental model:** "The SQLite database may contain financial records that do not exist anywhere else. Before touching it, ask: what happens if this operation fails halfway through? Is there a recovery path? Is it logged?"

Concretely, this means:

- Every schema change goes through the migration runner — no ad-hoc `ALTER TABLE` in application code
- Every bulk write uses `db.transaction()` — no fire-and-forget individual inserts
- Every startup validates the database before serving data from it — no silent corruption
- Every offline order has an idempotency key — no silent duplicate charges
- Every destructive operation (cache rebuild, schema migration) is logged with a timestamp

---

#### Additional improvements

**The "rebuild from backend" fallback has limits — document them:**

"Rebuild from backend if the cache is corrupt" is a valid recovery path for the product catalogue. It is not a valid recovery path for offline orders, cart drafts, or payment state mid-checkout — those may not exist on the backend yet. The team must be explicit about which tables are recoverable from the backend and which are the sole copy. `cache_products`, `cache_taxes`, and `cache_customers` are recoverable. `offline_order_queue`, `cart_draft`, and `payment_state` are not.

| Table | Recoverable from backend? | Consequence of loss |
|---|---|---|
| `cache_products` | Yes — full re-download | Startup delayed; no financial impact |
| `cache_taxes` | Yes — full re-download | Startup delayed; no financial impact |
| `offline_order_queue` | No | Orders and revenue lost permanently |
| `cart_draft` | No | Sale in progress lost; minor UX impact |
| `payment_state` | No | Incomplete transaction; potential double charge |
| `audit_log` | No | Compliance gap |

This table should be part of the backend compatibility contract (Comment 17) and the team's runbook.

**Treat the WAL file as part of the database:**

The `.db-wal` file is not a temporary file — it contains committed transactions that have not yet been checkpointed into the main database file. If the app is deployed or updated with a script that copies only the `.db` file and leaves behind the `.db-wal`, those transactions are lost. Any backup, deploy, or file operation that touches the SQLite database must always include `.db`, `.db-wal`, and `.db-shm` together.

---

*This concludes all 20 ChatGPT review comments for pre-check-3.*

