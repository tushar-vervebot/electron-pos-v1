// ═══════════════════════════════════════════════════════════════════════════════
// LOAD TESTING ONLY — TEMPORARY FILE
// ═══════════════════════════════════════════════════════════════════════════════
//
// Purpose:
//   Connects to the remote Odoo WebSocket server, subscribes to product
//   channels, and applies product.created / product.updated / product.deleted
//   events directly into the local SQLite cache (pos-local.db).
//
//   The React UI reads from SQLite as normal — so all product changes made by
//   the k6 load test will appear on screen in real time.
//
// Two "connections" inside this file:
//   1. WebSocket → remote Odoo server  (ws://vfmh-reg5:8068/…)
//   2. SQLite    → LocalDB cache       (better-sqlite3 instance from index.js)
//
// HOW TO ACTIVATE:
//   In src/main/index.js, uncomment the two lines marked [LOAD TEST].
//
// HOW TO REVERT:
//   Comment those same two lines back out. No other code is touched.
//
// Protocol flow:
//   Connect → Subscribe → wait for server "ack" → receive notification
//   → send ack "received" + "open" + "action_done" (all immediate)
//   → DB write (sequential queue)
// ═══════════════════════════════════════════════════════════════════════════════

// Node.js (Electron main process) has no built-in WebSocket — use the 'ws' package
import WebSocket from 'ws'

const DEVICE_ID      = 'msi-reg'
const REMOTE_WS_URL = `ws://vfmh-reg5:8068/api/company/ws?user_id=2&device_id=${DEVICE_ID}`
// const REMOTE_WS_URL  = `ws://192.168.68.120:8068/api/company/ws?user_id=2&device_id=${DEVICE_ID}`
const ODOO_HTTP_BASE = 'http://vfmh-reg5:8068'  // used to build product image URLs
// const ODOO_HTTP_BASE = 'http://192.168.68.120:8068'  // used to build product image URLs
const RECONNECT_MS   = 5000  // wait 5s before reconnecting after disconnect

let ws             = null
let reconnectTimer = null
let _db            = null  // better-sqlite3 instance, injected at startup
let _mainWindow    = null  // BrowserWindow ref, for sending events to renderer
let _subscribed    = false // true after server confirms our subscribe request
let _notifCount    = 0     // total notification cycles completed

// ── Notification queue ─────────────────────────────────────────────────────────────
// DRAIN_BATCH_SIZE: writes per SQLite transaction per event-loop tick.
// 300 is the sweet spot — drains 60k items in ~200 ticks while keeping each tick
// well under 10ms so the main process stays responsive.
const DRAIN_BATCH_SIZE = 300

// Map-based queue: key = `channel:productId`
// Automatically deduplicates repeated updates for the same product — if Odoo sends
// the same product.updated twice, only the latest value is written. Iteration order
// is insertion order, so processing sequence is preserved.
const _queueMap = new Map()
let _draining   = false
let _queueSeq   = 0   // fallback key counter for messages without an id

function enqueue(channel, message) {
  const id  = message?.id ?? null
  const key = id != null ? `${channel}:${id}` : `${channel}:seq${_queueSeq++}`
  _queueMap.delete(key)   // remove old entry so new one lands at the tail (preserves order)
  _queueMap.set(key, { channel, message })
  if (!_draining) _drain()
}

// Surgical threshold: if changed products fit within this count, send full objects
// over IPC so the renderer can update cards in-place with zero SQLite reads.
// Above this threshold, send only IDs — the renderer intersects with visible
// products and fetches only those (max ~200) from SQLite instead.
// 5000 full objects × ~400 bytes = ~2MB — well within Electron IPC limits.
const SURGICAL_THRESHOLD = 5000

async function _drain() {
  _draining = true
  let written = 0
  const changedProducts = []  // accumulate { action, id, product? } across all batches

  while (_queueMap.size > 0) {
    // Take up to DRAIN_BATCH_SIZE entries from the front of the Map
    const batch = []
    const keys  = []
    for (const [key, item] of _queueMap) {
      batch.push(item)
      keys.push(key)
      if (batch.length >= DRAIN_BATCH_SIZE) break
    }
    for (const key of keys) _queueMap.delete(key)

    // Write the whole batch in ONE SQLite transaction (~40× faster than individual writes)
    _db.transaction(() => {
      for (const { channel, message } of batch) {
        try {
          const change = _applyToDb(channel, message)
          if (change) changedProducts.push(change)
        }
        catch (err) { console.error(`[RemoteWS] ERROR applying ${channel}: ${err.message}`) }
      }
    })()

    written += batch.length
    // Periodic progress log during large syncs (every 3000 items)
    if (_queueMap.size > 0 && written % 3000 === 0) {
      console.log(`[RemoteWS] Sync in progress: ${written} written, ${_queueMap.size} queued…`)
    }

    // Yield to the event loop — renderer IPC, window paint, etc. all run here
    await new Promise(r => setImmediate(r))
  }

  console.log(`[RemoteWS] Sync complete — ${written} item(s) written to LocalDB`)

  if (changedProducts.length <= SURGICAL_THRESHOLD) {
    // Small batch: send full product objects — renderer swaps cards in-place, zero SQLite reads.
    _mainWindow?.webContents.send('product-sync-status', {
      status: 'remote_update',
      changes: changedProducts
    })
  } else {
    // Large batch: sending full objects would be too large (~MB). Send only IDs instead.
    // Renderer intersects with visible products, fetches only matched ones from SQLite.
    // 60k IDs × ~4 bytes = ~240KB — always safe for IPC regardless of product count.
    _mainWindow?.webContents.send('product-sync-status', {
      status: 'remote_update',
      changes: null,
      changedIds: changedProducts.map(c => c.id)
    })
  }
  _draining = false
}

// ── SQLite helpers ─────────────────────────────────────────────────────────────
// Pre-compiled statements — prepared once in _prepareStatements() when DB is
// injected. Re-preparing on every write is expensive; this gives ~10× throughput.
let _stmtUpsert    = null
let _stmtFtsDelete = null
let _stmtFtsInsert = null
let _stmtCpDelete  = null

function _prepareStatements() {
  _stmtUpsert = _db.prepare(`
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
  _stmtFtsDelete = _db.prepare('DELETE FROM products_fts WHERE rowid = ?')
  _stmtFtsInsert = _db.prepare('INSERT INTO products_fts(rowid, name, barcode) VALUES (?, ?, ?)')
  _stmtCpDelete  = _db.prepare('DELETE FROM cache_products WHERE id = ?')
}

/**
 * Maps an Odoo product message object to the shape expected by cache_products.
 * Handles both snake_case and camelCase field names defensively.
 */
function mapToLocalShape(msg) {
  const id       = msg.id
  const name     = msg.name            ?? ''
  const barcode  = msg.barcode         ?? msg.default_code ?? ''
  const price    = msg.list_price      ?? msg.price        ?? 0
  const stdPrice = msg.standard_price  ?? 0
  const category = msg.pos_category_id != null ? String(msg.pos_category_id) : ''
  const imageUrl = msg.image ?? msg.image_url ?? `${ODOO_HTTP_BASE}/api/product/${id}/image`
  const desc     = msg.description     ?? ''
  const sku      = msg.default_code    ?? msg.sku          ?? ''
  const inPOS    = msg.available_in_pos ? 1 : 0
  const catId    = msg.pos_category_id ?? 0
  // Odoo sends "active" (not "is_active") — false means deactivated/deleted
  const isActive = msg.active === false ? 0 : 1

  // Full JSON blob stored in the data column — used by cart/receipt
  const data = JSON.stringify({
    id, name, barcode, price,
    standard_price:  stdPrice,
    category,
    image_url:       imageUrl,
    description:     desc,
    sku,
    stock:           9999,
    is_active:       isActive === 1,
    available_in_pos: !!msg.available_in_pos,
    pos_category_id: catId
  })

  return { id, name, barcode, price, category, is_active: isActive, available_in_pos: inPOS, data }
}

/** INSERT or UPDATE a product in cache_products + keep FTS index in sync. */
function upsertToLocalDB(p) {
  _stmtUpsert.run(p.id, p.name, p.barcode, p.price, p.category, p.is_active, p.available_in_pos, p.data)
  _stmtFtsDelete.run(p.id)
  _stmtFtsInsert.run(p.id, p.name, p.barcode)
}

/** Hard-delete a product from cache_products and the FTS index. */
function deleteFromLocalDB(id) {
  _stmtCpDelete.run(id)
  _stmtFtsDelete.run(id)
}

// ── Product event handler (DB only — called inside a transaction) ─────────────
// Returns IPC event payload; actual send happens after the transaction commits.

function _applyToDb(channel, message) {
  switch (channel) {
    case 'product.created':
    case 'product.updated': {
      const p = mapToLocalShape(message)
      upsertToLocalDB(p)
      // Return full product object so the renderer can update the card in-place
      // without an extra SQLite read.
      return { action: channel === 'product.created' ? 'created' : 'updated', id: p.id, product: JSON.parse(p.data) }
    }
    case 'product.deleted': {
      const id = message?.id
      if (id != null) deleteFromLocalDB(id)
      return { action: 'deleted', id }
    }
    default:
      console.warn(`[RemoteWS] unhandled channel: ${channel}`)
      return null
  }
}

// ── Ack sender ─────────────────────────────────────────────────────────────────

function sendAck(notificationId, status) {
  if (ws?.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({
    action:          'ack',
    notification_id: notificationId,
    device_id:       DEVICE_ID,
    status
  }))
}

// ── Incoming message router ─────────────────────────────────────────────────────

function handleMessage(raw) {
  let msg
  try { msg = JSON.parse(raw) } catch { return }

  // type: "ack" — server sends this for EVERY message we send it:
  //   - once for our subscribe request  → subscription confirmed
  //   - once for every received/open/action_done ack we send → silently ignore
  if (msg.type === 'ack') {
    if (!_subscribed) {
      _subscribed = true
      console.log('[RemoteWS] Subscription confirmed — listening for product events')
    }
    return
  }

  // type: "notification" — an actual product event from the server
  if (msg.type === 'notification') {
    const { notification_id, requires_ack, payload } = msg
    const channel = payload?.channel
    // Server wraps product in payload.message.message — unwrap one level
    const message = payload?.message?.message ?? payload?.message
    const fromDevice = msg.device_id ?? payload?.device_id ?? payload?.message?.device_id ?? 'unknown'
    _notifCount++
    // Individual update (small queue): show full per-notification detail.
    // Bulk update (large queue): suppress 240,000 log lines — show a throttled counter instead.
    if (_queueMap.size <= 20) {
      console.log(`[RemoteWS] ── Notification #${_notifCount} ── channel=${channel}  from_device=${fromDevice}  id=${notification_id}`)
      if (requires_ack) { sendAck(notification_id, 'received');    console.log(`[RemoteWS]   [1/3] ack sent → received`) }
      if (requires_ack) { sendAck(notification_id, 'open');        console.log(`[RemoteWS]   [2/3] ack sent → open`) }
      if (requires_ack) { sendAck(notification_id, 'action_done'); console.log(`[RemoteWS]   [3/3] ack sent → action_done`) }
    } else {
      if (requires_ack) sendAck(notification_id, 'received')
      if (requires_ack) sendAck(notification_id, 'open')
      if (requires_ack) sendAck(notification_id, 'action_done')
      if (_notifCount % 1000 === 0) {
        console.log(`[RemoteWS] Bulk sync: #${_notifCount} notifications received, ${_queueMap.size} queued…`)
      }
    }
    enqueue(channel, message)
  }
}

// ── WebSocket lifecycle ─────────────────────────────────────────────────────────

function connect() {
  _subscribed = false
  console.log(`\n[RemoteWS]  Connecting...`)
  console.log(`[RemoteWS]    ${REMOTE_WS_URL}`)
  ws = new WebSocket(REMOTE_WS_URL)

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({
      action:   'subscribe',
      channels: ['product.created', 'product.updated', 'product.deleted']
    }))
    console.log('[RemoteWS] Connected — subscribing to product events')
  })

  ws.addEventListener('message', (event) => {
    handleMessage(event.data)
  })

  ws.addEventListener('close', (event) => {
    console.log(`[RemoteWS] Disconnected (code=${event.code}) — reconnecting in ${RECONNECT_MS / 1000}s`)
    scheduleReconnect()
  })

  ws.addEventListener('error', (err) => {
    console.error(`[RemoteWS]  Error: ${err.message ?? String(err)}`)
    // 'close' fires after 'error' — reconnect is handled there
  })
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(connect, RECONNECT_MS)
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Start the remote WS client.
 * Call this from index.js after the window loads:
 *
 *   import { startRemoteWsClient } from './remoteWsClient.js'
 *   startRemoteWsClient(db, mainWindow)
 *
 * @param {import('better-sqlite3').Database} dbInstance  The open SQLite DB
 * @param {Electron.BrowserWindow}            mainWin     The main window ref
 */
export function startRemoteWsClient(dbInstance, mainWin) {
  _db         = dbInstance
  _mainWindow = mainWin
  _prepareStatements()  // compile all SQLite statements once up-front
  connect()
}

/**
 * Stop the remote WS client (cleanup on app quit or test end).
 */
export function stopRemoteWsClient() {
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  ws?.close()
  ws = null
  console.log('[RemoteWS] Client stopped')
}
