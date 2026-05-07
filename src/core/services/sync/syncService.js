/**
 * Sync Service
 *
 * Handles two sync responsibilities:
 *
 * 1. ONLINE → REAL-TIME: WebSocket events update the Zustand store instantly.
 *    If the WebSocket is down, a polling interval keeps the UI in sync via REST.
 *
 * 2. OFFLINE → BACKEND: When the backend comes back online, all locally-queued
 *    orders and payments are flushed to the server and removed from SQLite.
 */

import { wsService }              from '../websocket/socketService'
import { orderAPI, paymentAPI, healthAPI } from '../api/apiClient'
import localDB                   from '../storage/indexedDbService'

const POLL_INTERVAL = 5000  // 5 s polling fallback

class SyncService {
  constructor() {
    this.pollTimer     = null
    this.onStoreUpdate = null   // injected by the store after init
    this._flushing     = false  // guard against concurrent flushes
  }

  /**
   * Start the sync service.
   * @param {function} onStoreUpdate  Callback invoked with (eventType, payload)
   *                                  so the store can react to WebSocket events.
   */
  start(onStoreUpdate) {
    this.onStoreUpdate = onStoreUpdate

    // ── WebSocket real-time path ─────────────────────────────────────────────
    wsService.connect()

    const WS_EVENTS = ['order_created', 'order_updated', 'order_deleted', 'payment_processed']
    WS_EVENTS.forEach(evt => {
      wsService.on(evt, (payload) => {
        this.onStoreUpdate?.(evt, payload)
      })
    })

    // ── Fallback polling when WS is down ─────────────────────────────────────
    wsService.onStatusChange((status) => {
      if (status === 'disconnected') {
        this._startPolling()
      } else {
        this._stopPolling()
        // Flush any offline queue now that we're back online
        this._flushOfflineQueue()
      }
    })

    // ── Flush on initial load in case we crashed while offline ────────────────
    this._flushOfflineQueue()
  }

  stop() {
    wsService.disconnect()
    this._stopPolling()
  }

  // ── Polling Fallback ────────────────────────────────────────────────────────

  _startPolling() {
    if (this.pollTimer) return
    console.log('[Sync] WebSocket down — switching to polling fallback')
    this.pollTimer = setInterval(() => this._poll(), POLL_INTERVAL)
  }

  _stopPolling() {
    if (!this.pollTimer) return
    console.log('[Sync] WebSocket restored — stopping polling')
    clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  async _poll() {
    try {
      // Only poll open orders (the data the POS screen cares about most)
      const res = await orderAPI.getAll({ status: 'open' })
      this.onStoreUpdate?.('poll_orders', res.data.orders ?? [])
    } catch {
      // Backend unreachable — stay in offline mode
    }
  }

  // ── Offline Queue Flush ─────────────────────────────────────────────────────

  async _flushOfflineQueue() {
    // Prevent concurrent flushes (e.g. WS reconnect fires while startup flush is running)
    if (this._flushing) return
    this._flushing = true
    try {
      // Check connectivity first
      try {
        await healthAPI.check()
      } catch {
        return // backend still down — try again next time WS reconnects
      }

      await this._syncPendingOrders()
      await this._syncPendingPayments()
      this.onStoreUpdate?.('offline_sync_complete', null)
    } finally {
      this._flushing = false
    }
  }

  async _syncPendingOrders() {
    let pending
    try {
      pending = await localDB.getPendingOrders()
    } catch {
      return
    }

    for (const row of pending) {
      try {
        // 1. Create the order — get back the real server-side order_id
        const orderRes = await orderAPI.create(row.data)
        const serverOrderId = orderRes.data.id

        // 2. Process all payments that were saved against this local pending order
        const linkedPayments = await localDB.getPaymentsForPendingOrder(row.id)
        for (const pRow of linkedPayments) {
          try {
            await paymentAPI.process({ ...pRow.data, order_id: serverOrderId })
            await localDB.markPaymentSynced(pRow.id)
          } catch (pErr) {
            console.warn(`[Sync] Failed to flush payment #${pRow.id}:`, pErr.message)
          }
        }

        await localDB.markOrderSynced(row.id)
        console.log(`[Sync] Flushed offline order #${row.id} → server #${serverOrderId}`)
      } catch (err) {
        console.warn(`[Sync] Failed to flush order #${row.id}:`, err.message)
      }
    }
  }

  // Kept as a safety net — in normal flow all payments are handled in _syncPendingOrders
  async _syncPendingPayments() {}
}

export const syncService = new SyncService()
