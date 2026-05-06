/**
 * WebSocket Service
 *
 * Manages the persistent WebSocket connection to the Go backend.
 * - Auto-reconnects with exponential back-off (up to 30 s).
 * - Notifies subscribers of every incoming event.
 * - Exposes connection status so the store can switch to polling fallback.
 */

const WS_URL = 'ws://localhost:8080/ws'
const MAX_RECONNECT_DELAY = 30_000 // 30 s

class WebSocketService {
  constructor() {
    this.ws               = null
    this.reconnectDelay   = 1000
    this.reconnectTimer   = null
    this.listeners        = new Map()   // eventType → Set<handler>
    this.statusListeners  = new Set()   // (status: 'connected'|'disconnected') => void
    this.isConnected      = false
    this.shouldReconnect  = true
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  connect() {
    this.shouldReconnect = true
    this._connect()
  }

  disconnect() {
    this.shouldReconnect = false
    clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  /** Subscribe to a specific event type broadcast by the server. */
  on(eventType, handler) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType).add(handler)
    return () => this.listeners.get(eventType)?.delete(handler) // unsubscribe fn
  }

  /** Subscribe to connection status changes. */
  onStatusChange(handler) {
    this.statusListeners.add(handler)
    return () => this.statusListeners.delete(handler)
  }

  /** Send an arbitrary message to the server (fire-and-forget). */
  send(type, payload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }))
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  _connect() {
    try {
      this.ws = new WebSocket(WS_URL)

      this.ws.onopen = () => {
        console.log('[WS] Connected')
        this.isConnected    = true
        this.reconnectDelay = 1000
        this._notifyStatus('connected')
      }

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const handlers = this.listeners.get(msg.type)
          handlers?.forEach(h => h(msg.payload))
          // Also fire wildcard listeners
          this.listeners.get('*')?.forEach(h => h(msg))
        } catch {
          console.warn('[WS] Failed to parse message:', event.data)
        }
      }

      this.ws.onerror = (err) => {
        console.warn('[WS] Error:', err)
      }

      this.ws.onclose = () => {
        this.isConnected = false
        this._notifyStatus('disconnected')
        console.log(`[WS] Disconnected. Reconnecting in ${this.reconnectDelay}ms…`)
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY)
            this._connect()
          }, this.reconnectDelay)
        }
      }
    } catch (err) {
      console.error('[WS] Failed to create connection:', err)
    }
  }

  _notifyStatus(status) {
    this.statusListeners.forEach(h => h(status))
  }
}

// Singleton instance shared across the renderer
export const wsService = new WebSocketService()
