import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import Database from 'better-sqlite3'
import https from 'https'
import http from 'http'
// [LOAD TEST] Uncomment the line below to enable the remote WS client
import { startRemoteWsClient, stopRemoteWsClient } from './remoteWsClient.js'

let mainWindow
let db   // better-sqlite3 Database instance (file-backed, synchronous)

// ── SQLite Initialisation ─────────────────────────────────────────────────────
function initLocalDB() {
  const dbPath = join(app.getPath('userData'), 'pos-local.db')
  console.log('[DB] Opening database at:', dbPath)

  function openDB() {
    const instance = new Database(dbPath)
    // Use DELETE journal mode — simpler, avoids WAL file desync on forced kills
    instance.pragma('journal_mode = DELETE')
    // Quick integrity check — catches malformed images from incomplete writes
    try {
      const check = instance.pragma('integrity_check')
      if (check[0]?.integrity_check !== 'ok') throw new Error('integrity_check failed')
    } catch (integrityErr) {
      console.error('[DB] Integrity check failed, recreating DB:', integrityErr.message)
      instance.close()
      // Remove all DB files
      for (const suffix of ['', '-shm', '-wal']) {
        try { unlinkSync(dbPath + suffix) } catch {}
      }
      return new Database(dbPath)
    }
    return instance
  }

  db = openDB()
  db.pragma('journal_mode = DELETE')

  // ── Migration: rebuild cache_products if it has the old schema ──────────────
  // Old schema had only (id, data, updated_at). New schema adds queryable columns.
  // Also drop old content-based FTS5 table if it exists (causes rowid corruption).
  const cpCols = db.prepare('PRAGMA table_info(cache_products)').all()
  const needsRebuild = cpCols.length > 0 && !cpCols.some(c => c.name === 'name')

  // Detect old content-based FTS5 (has 'content' in its creation SQL)
  const ftsInfo = db.prepare("SELECT sql FROM sqlite_master WHERE name='products_fts'").get()
  const hasOldFts = ftsInfo?.sql?.includes('content=')

  if (needsRebuild || hasOldFts) {
    db.exec(`
      DROP TABLE IF EXISTS products_fts;
      DROP TABLE IF EXISTS cache_products;
    `)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_orders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      data       TEXT    NOT NULL,
      created_at TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pending_payments (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      pending_order_id INTEGER,
      data             TEXT    NOT NULL,
      created_at       TEXT    DEFAULT (datetime('now'))
    );

    -- Product cache: queryable columns + full JSON blob
    CREATE TABLE IF NOT EXISTS cache_products (
      id               INTEGER PRIMARY KEY,
      name             TEXT    NOT NULL DEFAULT '',
      barcode          TEXT    NOT NULL DEFAULT '',
      price            REAL    NOT NULL DEFAULT 0,
      category         TEXT    NOT NULL DEFAULT '',
      is_active        INTEGER NOT NULL DEFAULT 1,
      available_in_pos INTEGER NOT NULL DEFAULT 1,
      data             TEXT    NOT NULL,
      synced_at        TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cp_name     ON cache_products(name);
    CREATE INDEX IF NOT EXISTS idx_cp_barcode  ON cache_products(barcode);
    CREATE INDEX IF NOT EXISTS idx_cp_category ON cache_products(category);

    -- FTS5 virtual table for fast full-text search across 60k products
    -- Standalone (no content=) to avoid content-table rowid conflicts
    CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
      name,
      barcode
    );

    -- Key/value store for app metadata (e.g. last_full_sync_at)
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Migration: add pending_order_id to old pending_payments tables
  const pmtCols = db.prepare('PRAGMA table_info(pending_payments)').all()
  if (!pmtCols.some(c => c.name === 'pending_order_id')) {
    db.prepare('ALTER TABLE pending_payments ADD COLUMN pending_order_id INTEGER').run()
  }

  // ── Purge corrupted rows (name='' or NULL) from previous WS nesting bug ────
  // Before the double-nesting fix, remoteWsClient stored products with id=NULL,
  // name='', price=0. Those ghost rows sort before real products ('' < 'A').
  try {
    const purged = db.prepare("DELETE FROM cache_products WHERE name IS NULL OR name = ''").run()
    if (purged.changes > 0) {
      db.prepare("DELETE FROM products_fts WHERE rowid NOT IN (SELECT id FROM cache_products)").run()
      console.log(`[DB] Purged ${purged.changes} corrupted rows (empty name) — will re-sync`)
    }
  } catch (purgeErr) {
    console.warn('[DB] Purge skipped:', purgeErr.message)
  }

  // ── FTS5 integrity check: rebuild index if count doesn't match cache ───────
  // FTS5 can get out-of-sync if the app was killed mid-transaction.
  // Rebuilding is fast even for 60k products (< 5 seconds).
  try {
    const cacheCount = db.prepare('SELECT COUNT(*) as c FROM cache_products').get().c
    const ftsCount   = db.prepare('SELECT COUNT(*) as c FROM products_fts').get().c
    if (cacheCount > 0 && ftsCount !== cacheCount) {
      console.log(`[DB] FTS5 mismatch (cache=${cacheCount}, fts=${ftsCount}) — rebuilding index…`)
      db.exec('DELETE FROM products_fts')
      const rows   = db.prepare('SELECT id, name, barcode FROM cache_products').all()
      const ins    = db.prepare('INSERT INTO products_fts(rowid, name, barcode) VALUES (?, ?, ?)')
      const rebuild = db.transaction(() => { for (const r of rows) ins.run(r.id, r.name, r.barcode) })
      rebuild()
      console.log(`[DB] FTS5 rebuilt — ${rows.length} entries`)
    }
  } catch (ftsErr) {
    console.warn('[DB] FTS5 rebuild skipped:', ftsErr.message)
  }

  console.log('[DB] Database initialized successfully')
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────
function registerIpcHandlers() {

  // ── Pending Orders ─────────────────────────────────────────────────────────
  ipcMain.handle('db:save-pending-order', (_evt, orderData) => {
    const info = db.prepare('INSERT INTO pending_orders (data) VALUES (?)').run(JSON.stringify(orderData))
    return { id: info.lastInsertRowid }
  })

  ipcMain.handle('db:get-pending-orders', () => {
    return db.prepare('SELECT id, data, created_at FROM pending_orders').all()
      .map(row => ({ id: row.id, data: JSON.parse(row.data), created_at: row.created_at }))
  })

  ipcMain.handle('db:mark-order-synced', (_evt, id) => {
    db.prepare('DELETE FROM pending_orders WHERE id = ?').run(id)
    return { success: true }
  })

  // ── Pending Payments ───────────────────────────────────────────────────────
  ipcMain.handle('db:save-pending-payment', (_evt, payload) => {
    const { pending_order_id = null, ...paymentData } = payload
    const info = db.prepare('INSERT INTO pending_payments (pending_order_id, data) VALUES (?, ?)').run(pending_order_id, JSON.stringify(paymentData))
    return { id: info.lastInsertRowid }
  })

  ipcMain.handle('db:get-pending-payments', () => {
    return db.prepare('SELECT id, data, created_at FROM pending_payments').all()
      .map(row => ({ id: row.id, data: JSON.parse(row.data), created_at: row.created_at }))
  })

  ipcMain.handle('db:mark-payment-synced', (_evt, id) => {
    db.prepare('DELETE FROM pending_payments WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('db:get-payments-for-order', (_evt, pendingOrderId) => {
    return db.prepare('SELECT id, data FROM pending_payments WHERE pending_order_id = ?').all(pendingOrderId)
      .map(row => ({ id: row.id, data: JSON.parse(row.data) }))
  })

  // ── Product Cache — paginated browse ───────────────────────────────────────
  ipcMain.handle('db:get-products-page', (_evt, { page = 1, limit = 50, category = '' } = {}) => {
    const offset = (page - 1) * limit
    let rows, total
    if (category && category !== 'all') {
      rows  = db.prepare("SELECT data FROM cache_products WHERE is_active = 1 AND name != '' AND category = ? ORDER BY name ASC, id ASC LIMIT ? OFFSET ?").all(category, limit, offset)
      total = db.prepare("SELECT COUNT(*) as c FROM cache_products WHERE is_active = 1 AND name != '' AND category = ?").get(category).c
    } else {
      rows  = db.prepare("SELECT data FROM cache_products WHERE is_active = 1 AND name != '' ORDER BY name ASC, id ASC LIMIT ? OFFSET ?").all(limit, offset)
      total = db.prepare("SELECT COUNT(*) as c FROM cache_products WHERE is_active = 1 AND name != ''").get().c
    }
    return { products: rows.map(r => JSON.parse(r.data)), total, page, limit }
  })

  // ── Product Cache — search (FTS5 ranked + LIKE comprehensive) ─────────────
  ipcMain.handle('db:search-products', (_evt, { query, limit = 200, category = '' } = {}) => {
    if (!query || query.trim().length === 0) return { products: [], total: 0 }

    // ── Pass 1: FTS5 ranked results (fast prefix matching) ──────────────────
    const term = query.trim().replace(/[^\w\s]/g, '').split(/\s+/).map(t => t + '*').join(' ')
    let ftsRows = []
    try {
      if (category && category !== 'all') {
        ftsRows = db.prepare(`
          SELECT p.data FROM products_fts f
          JOIN cache_products p ON p.id = f.rowid
          WHERE products_fts MATCH ?
            AND p.category = ?
          ORDER BY rank LIMIT ?
        `).all(term, category, limit)
      } else {
        ftsRows = db.prepare(`
          SELECT p.data FROM products_fts f
          JOIN cache_products p ON p.id = f.rowid
          WHERE products_fts MATCH ?
          ORDER BY rank LIMIT ?
        `).all(term, limit)
      }
    } catch { /* ignore FTS5 parse errors (e.g. special chars) */ }

    // ── Pass 2: LIKE scan on cache_products (ALWAYS runs) ──────────────────
    // FTS5 index may be incomplete or out-of-sync.
    // LIKE guarantees every product in cache_products is reachable.
    const like = '%' + query.trim() + '%'
    let likeRows = []
    try {
      if (category && category !== 'all') {
        likeRows = db.prepare('SELECT data FROM cache_products WHERE (name LIKE ? OR barcode LIKE ?) AND category = ? LIMIT ?').all(like, like, category, limit)
      } else {
        likeRows = db.prepare('SELECT data FROM cache_products WHERE (name LIKE ? OR barcode LIKE ?) LIMIT ?').all(like, like, limit)
      }
    } catch { /* ignore */ }

    // ── Merge: FTS5 first (ranked), then LIKE fills gaps, dedup by id ───────
    const seen = new Set()
    const merged = []
    for (const r of [...ftsRows, ...likeRows]) {
      const p = JSON.parse(r.data)
      if (!seen.has(p.id)) {
        seen.add(p.id)
        merged.push(p)
      }
    }
    const result = merged.slice(0, limit)
    return { products: result, total: result.length }
  })

  // ── Product Cache — categories ─────────────────────────────────────────────
  ipcMain.handle('db:get-product-categories', () => {
    return db.prepare("SELECT DISTINCT category FROM cache_products WHERE category != '' ORDER BY category ASC").all()
      .map(r => r.category)
  })

  // ── Product Cache — count (tells frontend if sync is needed) ───────────────
  ipcMain.handle('db:count-products', () => {
    return db.prepare('SELECT COUNT(*) as c FROM cache_products').get().c
  })

  // ── Product Cache — fetch specific products by ID ─────────────────────────
  // Used by surgical update path: renderer intersects changed IDs with visible
  // products, then fetches only the matched ones (never more than ~200 rows).
  ipcMain.handle('db:get-products-by-ids', (_evt, ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    return db.prepare(`SELECT data FROM cache_products WHERE id IN (${placeholders})`)
      .all(...ids)
      .map(r => JSON.parse(r.data))
  })

  // ── Product Cache — bulk upsert (called by background sync) ───────────────
  ipcMain.handle('db:upsert-products-batch', (_evt, products) => {
    const upsert = db.transaction((items) => {
      const stmt = db.prepare(`
        INSERT INTO cache_products (id, name, barcode, price, category, is_active, available_in_pos, data, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          name             = excluded.name,
          barcode          = excluded.barcode,
          price            = excluded.price,
          category         = excluded.category,
          is_active        = excluded.is_active,
          available_in_pos = excluded.available_in_pos,
          data             = excluded.data,
          synced_at        = datetime('now')
      `)
      const ftsDelete = db.prepare('DELETE FROM products_fts WHERE rowid = ?')
      const ftsInsert = db.prepare('INSERT INTO products_fts(rowid, name, barcode) VALUES (?, ?, ?)')

      for (const p of items) {
        stmt.run(p.id, p.name ?? '', p.barcode ?? '', p.price ?? 0, p.category ?? '', p.is_active ? 1 : 0, p.available_in_pos ? 1 : 0, JSON.stringify(p))
        // Keep FTS index in sync
        ftsDelete.run(p.id)
        ftsInsert.run(p.id, p.name ?? '', p.barcode ?? '')
      }
    })
    upsert(products)
    return { success: true, count: products.length }
  })

  // ── Legacy full-cache replace (kept for small datasets / offline fallback) ─
  ipcMain.handle('db:cache-products', (_evt, products) => {
    ipcMain.emit('db:upsert-products-batch', null, products)
    return { success: true }
  })

  ipcMain.handle('db:get-cached-products', () => {
    return db.prepare('SELECT data FROM cache_products ORDER BY name ASC').all()
      .map(row => JSON.parse(row.data))
  })

  // ── App Utilities ──────────────────────────────────────────────────────────
  ipcMain.handle('app:open-devtools', () => { mainWindow?.webContents.openDevTools() })
  ipcMain.handle('app:print',         () => { mainWindow?.webContents.print({ silent: false, printBackground: true }) })
}

// ── Background Product Sync ───────────────────────────────────────────────────
// Fetches all products from the Go backend (which has synced from the real API)
// in batches of 500 and upserts into the local SQLite cache.
// Progress is sent to the renderer via webContents IPC events.
const SYNC_BATCH    = 500
const BACKEND_URL   = 'http://localhost:8080'

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

async function backgroundProductSync() {
  // Wait a moment so the window is ready to receive progress events
  await new Promise(r => setTimeout(r, 2000))

  const cachedCount = db.prepare('SELECT COUNT(*) as c FROM cache_products').get().c
  console.log('[Sync] Cached product count:', cachedCount)

  // Ask the backend how many products it has — skip sync only if counts match
  if (cachedCount > 0) {
    try {
      const check = await httpGet(`${BACKEND_URL}/api/products?page=1&limit=1`)
      const backendTotal = check.total ?? 0
      console.log('[Sync] Backend total:', backendTotal, 'Cached:', cachedCount)
      if (cachedCount >= backendTotal && backendTotal > 0) {
        // Count matches — only skip if last full sync was recent (< 1 hour).
        // Count alone can't detect product name/price changes; the time check
        // ensures we re-sync periodically and catch any missed WS events.
        const lastSyncRaw = db.prepare("SELECT value FROM app_settings WHERE key = 'last_full_sync_at'").get()?.value
        const ageMs = lastSyncRaw ? Date.now() - Number(lastSyncRaw) : Infinity
        const ONE_HOUR = 60 * 60 * 1000
        if (ageMs < ONE_HOUR) {
          console.log(`[Sync] Cache fresh (last sync ${Math.round(ageMs / 60000)} min ago, count=${cachedCount}) — skipping`)
          mainWindow?.webContents.send('product-sync-status', { status: 'already_cached', total: cachedCount })
          return
        }
        console.log(`[Sync] Cache stale (last sync ${Math.round(ageMs / 60000)} min ago) — re-syncing to catch missed updates`)
      } else {
        console.log('[Sync] Count mismatch — clearing cache for re-sync')
      }
      db.exec('DELETE FROM cache_products; DELETE FROM products_fts;')
    } catch {
      // Backend unreachable — serve from cache as-is
      console.log('[Sync] Backend unreachable, serving cached products')
      mainWindow?.webContents.send('product-sync-status', { status: 'already_cached', total: cachedCount })
      return
    }
  }

  console.log('[Sync] Starting product sync from backend...')
  mainWindow?.webContents.send('product-sync-status', { status: 'starting' })

  let page  = 1
  let total = -1
  let synced = 0

  try {
    while (total < 0 || synced < total) {
      const url = `${BACKEND_URL}/api/products?page=${page}&limit=${SYNC_BATCH}`
      console.log('[Sync] Fetching:', url)
      let resp
      try {
        resp = await httpGet(url)
        console.log('[Sync] Got response: total=', resp.total, 'products=', resp.products?.length)
      } catch (fetchErr) {
        console.error('[Sync] Fetch error:', fetchErr.message)
        // Backend not yet ready — wait and retry once
        await new Promise(r => setTimeout(r, 3000))
        try { resp = await httpGet(url) } catch (retryErr) { console.error('[Sync] Retry failed:', retryErr.message); break }
      }

      if (total < 0) total = resp.total ?? 0
      const items = resp.products ?? []
      console.log('[Sync] Page', page, '- items:', items.length, 'total:', total)
      if (items.length === 0) break

      // Map backend fields to LocalDB-friendly shape
      const mapped = items.map(p => ({
        id:              p.external_id ?? p.id,
        name:            p.name ?? '',
        barcode:         p.barcode ?? '',
        price:           p.price ?? 0,
        category:        p.category ?? '',
        is_active:       p.is_active !== false,
        available_in_pos: p.available_in_pos !== false,
        // Full shape for cart/receipt
        image_url:       p.image_url ?? '',
        description:     p.description ?? '',
        sku:             p.sku ?? '',
        stock:           p.stock ?? 9999,
        standard_price:  p.standard_price ?? 0,
        pos_category_id: p.pos_category_id ?? 0
      }))

      // Upsert batch into SQLite
      const upsert = db.transaction((batch) => {
        const stmt = db.prepare(`
          INSERT INTO cache_products (id, name, barcode, price, category, is_active, available_in_pos, data, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            name             = excluded.name,
            barcode          = excluded.barcode,
            price            = excluded.price,
            category         = excluded.category,
            is_active        = excluded.is_active,
            available_in_pos = excluded.available_in_pos,
            data             = excluded.data,
            synced_at        = datetime('now')
        `)
        const ftsDelete = db.prepare('DELETE FROM products_fts WHERE rowid = ?')
        const ftsInsert = db.prepare('INSERT INTO products_fts(rowid, name, barcode) VALUES (?, ?, ?)')
        for (const p of batch) {
          stmt.run(p.id, p.name, p.barcode, p.price, p.category, p.is_active ? 1 : 0, p.available_in_pos ? 1 : 0, JSON.stringify(p))
          ftsDelete.run(p.id)
          ftsInsert.run(p.id, p.name, p.barcode)
        }
      })
      try {
        upsert(mapped)
        console.log('[Sync] Upserted', mapped.length, 'products (page', page, ')')
      } catch (upsertErr) {
        console.error('[Sync] Upsert error on page', page, ':', upsertErr.message)
      }

      synced += items.length
      page++
      mainWindow?.webContents.send('product-sync-status', { status: 'syncing', synced, total })

      // Tiny pause between batches so the main thread isn't starved
      await new Promise(r => setTimeout(r, 50))
    }

    console.log('[Sync] Done! Synced', synced, 'products')
    // Record successful sync time — used to decide if next startup should re-sync
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_full_sync_at', ?)").run(Date.now().toString())
    mainWindow?.webContents.send('product-sync-status', { status: 'done', synced, total })

    // ── Schedule a progressive re-sync ──────────────────────────────────────
    // The Go backend seeds PostgreSQL in a background goroutine that may still
    // be running. Re-check every 3 minutes and pull newly-added products so
    // the local cache eventually reaches the full 60k count.
    if (total > 0) {
      setTimeout(async () => {
        try {
          const check = await httpGet(`${BACKEND_URL}/api/products?page=1&limit=1`)
          const newTotal = check.total ?? 0
          const cached   = db.prepare('SELECT COUNT(*) as c FROM cache_products').get().c
          if (newTotal > cached) {
            console.log(`[Sync] Backend grew to ${newTotal} (cached=${cached}) — re-syncing`)
            backgroundProductSync()
          } else {
            console.log(`[Sync] Re-check: cached=${cached}, backend=${newTotal} — up to date`)
          }
        } catch { /* backend unreachable, ignore */ }
      }, 3 * 60 * 1000) // 3 minutes
    }
  } catch (err) {
    console.error('[Sync] Fatal error:', err.message, err.stack)
    mainWindow?.webContents.send('product-sync-status', { status: 'error', message: err.message })
  }
}

// ── Window Factory ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0F172A',
    frame: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.setMenuBarVisibility(false)

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Start background product sync after renderer is ready
  mainWindow.webContents.once('did-finish-load', () => {
    backgroundProductSync().catch(console.error)
    // [LOAD TEST] Uncomment the line below to connect to the remote Odoo WS server.
    // Comment it back out when load testing is done. Nothing else needs to change.
    startRemoteWsClient(db, mainWindow)
  })
}

// ── App Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  initLocalDB()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    db?.close()
    app.quit()
  }
})
