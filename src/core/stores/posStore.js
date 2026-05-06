import { create } from 'zustand'
import toast from 'react-hot-toast'
import { productAPI, orderAPI, paymentAPI, healthAPI } from '../services/api/apiClient'
import localDB from '../services/storage/indexedDbService'
import { syncService } from '../services/sync/syncService'
import { wsService } from '../services/websocket/socketService'

// ── Helpers ───────────────────────────────────────────────────────────────────
// Debounce timer for remote_update → fetchProducts.
// remoteWsClient sends ONE event per drain session, but two consecutive bulk syncs
// could fire back-to-back. Debouncing ensures only one re-fetch runs.
let _rfDebounce = null

const calcTotals = (items) => {
  const subTotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
  const tax      = subTotal * 0.10
  const total    = subTotal + tax
  return { subTotal, tax, total }
}

// ── Store ─────────────────────────────────────────────────────────────────────
const usePOSStore = create((set, get) => ({

  // ── Connection status ──────────────────────────────────────────
  isOnline:     true,
  wsConnected:  false,

  // ── Products ───────────────────────────────────────────────────
  products:         [],       // current page of products shown in the grid
  categories:       [],
  selectedCategory: 'all',
  searchQuery:      '',
  productsLoading:  false,
  productPage:      1,
  productPageSize:  50,
  productTotal:     0,
  // Sync progress
  isSyncing:        false,
  syncProgress:     0,
  syncTotal:        0,
  syncStatus:       'idle',   // 'idle' | 'starting' | 'syncing' | 'done' | 'error' | 'already_cached'

  // ── Cart ───────────────────────────────────────────────────────
  cartItems:  [],   // { product, quantity, unitPrice, total }
  subTotal:   0,
  tax:        0,
  total:      0,
  discount:   0,
  notes:      '',
  customerName: '',

  // ── Screens ────────────────────────────────────────────────────
  // 'products' | 'payment' | 'receipt' | 'tickets'
  currentScreen:   'products',
  previousScreen:  'products',

  // ── Orders / Tickets ───────────────────────────────────────────
  openOrders:      [],
  currentOrder:    null,      // order just completed (for receipt)
  completedPayment: null,     // payment response (for receipt)  offlineSyncedAt:  null,     // bumped after offline queue flush — TicketScreen watches this
  // ═══════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════
  init: async () => {
    // Check backend connectivity
    try {
      await healthAPI.check()
      set({ isOnline: true })
    } catch {
      set({ isOnline: false })
    }

    // Load products from LocalDB (instant — no network needed)
    await get().fetchProducts()

    // Load categories from LocalDB
    try {
      const cats = await localDB.getProductCategories()
      set({ categories: ['all', ...cats] })
    } catch { /* ignore */ }

    // Listen for background sync progress from main process
    localDB.onProductSyncStatus((data) => {
      if (data.status === 'starting') {
        set({ isSyncing: true, syncStatus: 'starting', syncProgress: 0 })
      } else if (data.status === 'syncing') {
        set({ isSyncing: true, syncStatus: 'syncing', syncProgress: data.synced, syncTotal: data.total })
      } else if (data.status === 'done') {
        set({ isSyncing: false, syncStatus: 'done', syncProgress: data.synced, syncTotal: data.total })
        // Refresh current view after sync completes
        get().fetchProducts()
        localDB.getProductCategories().then(cats => set({ categories: ['all', ...cats] })).catch(() => {})
      } else if (data.status === 'already_cached') {
        set({ isSyncing: false, syncStatus: 'idle' })
      } else if (data.status === 'error') {
        set({ isSyncing: false, syncStatus: 'error' })
      } else if (data.status === 'remote_update') {
        if (data.changes !== null && data.changes !== undefined) {
          // ── Surgical path (≤ 5000 changes): full product objects in IPC payload.
          // Swap only the cards that are currently visible. Zero SQLite reads.
          const { products } = get()
          let newProducts = products
          let changed = false
          for (const change of data.changes) {
            if (change.action === 'deleted') {
              const idx = newProducts.findIndex(p => p.id === change.id)
              if (idx !== -1) {
                if (!changed) newProducts = [...newProducts]
                newProducts.splice(idx, 1)
                changed = true
              }
            } else {
              const idx = newProducts.findIndex(p => p.id === change.id)
              if (idx !== -1) {
                if (!changed) newProducts = [...newProducts]
                newProducts[idx] = change.product
                changed = true
              }
            }
          }
          if (changed) set({ products: newProducts })

        } else if (Array.isArray(data.changedIds) && data.changedIds.length > 0) {
          // ── ID-only path (> 5000 changes): only IDs sent over IPC.
          // Intersect with visible products — fetch only the matched ones from SQLite.
          // For a 60k bulk sync, this might match 0-50 visible cards.
          // If nothing visible changed, the renderer does zero work.
          const { products } = get()
          const changedIdSet = new Set(data.changedIds)
          const visibleChangedIds = products
            .filter(p => changedIdSet.has(p.id))
            .map(p => p.id)

          if (visibleChangedIds.length > 0) {
            localDB.getProductsByIds(visibleChangedIds).then(freshProducts => {
              const { products: current } = get()
              const freshMap = new Map(freshProducts.map(p => [p.id, p]))
              let updated = current
              let changed = false
              for (let i = 0; i < updated.length; i++) {
                const fresh = freshMap.get(updated[i].id)
                if (fresh) {
                  if (!changed) updated = [...updated]
                  updated[i] = fresh
                  changed = true
                }
              }
              if (changed) set({ products: updated })
            }).catch(() => {})
          }
          // If visibleChangedIds.length === 0: nothing on screen changed — zero work done.

        } else {
          // ── Fallback: no change data at all — do a silent page re-read.
          clearTimeout(_rfDebounce)
          _rfDebounce = setTimeout(() => get().fetchProducts({ silent: true }), 300)
        }
      }
    })

    // Load open orders for tickets screen
    await get().fetchOpenOrders()

    // Start sync service — bridge WebSocket/polling events into the store
    syncService.start((eventType, payload) => {
      const store = get()
      switch (eventType) {
        case 'order_created':
          set(s => ({ openOrders: [payload, ...s.openOrders] }))
          break
        case 'order_updated':
          set(s => ({
            openOrders: s.openOrders.map(o => o.id === payload.id ? payload : o)
          }))
          break
        case 'order_deleted':
          set(s => ({ openOrders: s.openOrders.filter(o => o.id !== payload.id) }))
          break
        case 'payment_processed':
          set(s => ({
            openOrders: s.openOrders.filter(o => o.id !== payload.order?.id)
          }))
          break
        case 'poll_orders':
          set({ openOrders: payload })
          break
        case 'offline_sync_complete':
          // Bump timestamp — TicketScreen watches this and re-fetches all orders
          set({ offlineSyncedAt: Date.now() })
          get().fetchOpenOrders()
          break
        default:
          break
      }
      void store // silence lint
    })

    // Subscribe to WS status changes
    wsService.onStatusChange((status) => {
      const connected = status === 'connected'
      set({ wsConnected: connected })
      if (!connected) {
        // Re-check HTTP too before marking fully offline
        healthAPI.check()
          .then(() => set({ isOnline: true }))
          .catch(() => set({ isOnline: false }))
        toast.error('Connection lost — working offline', { id: 'ws-status' })
      } else {
        set({ isOnline: true })
        toast.success('Connection restored', { id: 'ws-status' })
      }
    })
  },

  // ═══════════════════════════════════════════════════════════════
  // PRODUCTS  — served entirely from LocalDB (SQLite)
  // ═══════════════════════════════════════════════════════════════
  fetchProducts: async ({ silent = false } = {}) => {
    const { searchQuery, selectedCategory, productPage, productPageSize } = get()
    const BROWSE_LIMIT = 200  // max products shown while browsing; search queries all 60k
    const SEARCH_LIMIT = 200  // max results returned by a search
    // silent=true: background WS refresh — skip loading skeleton so the grid never flickers
    // silent=false: user-triggered navigation — show skeleton so stale data doesn't flash
    if (!silent) set({ productsLoading: true })
    try {
      let result
      if (searchQuery.trim().length > 0) {
        // Search mode: FTS5 + LIKE across all 60k LocalDB products
        result = await localDB.searchProducts({ query: searchQuery, limit: SEARCH_LIMIT, category: selectedCategory })
        set({ products: result.products, productTotal: result.total, productPage: 1 })
      } else {
        // Browse mode: paginated 50/page, capped at first 200 products
        result = await localDB.getProductsPage({ page: productPage, limit: productPageSize, category: selectedCategory })
        set({ products: result.products, productTotal: Math.min(result.total, BROWSE_LIMIT) })
      }
    } catch (err) {
      toast.error('Could not load products')
      console.error(err)
    } finally {
      if (!silent) set({ productsLoading: false })
    }
  },

  setSelectedCategory: (cat) => {
    set({ selectedCategory: cat, productPage: 1 })
    get().fetchProducts()
  },

  setSearchQuery: (q) => {
    set({ searchQuery: q, productPage: 1 })
    get().fetchProducts()
  },

  setProductPage: (page) => {
    set({ productPage: page })
    get().fetchProducts()
  },

  // ═══════════════════════════════════════════════════════════════
  // CART
  // ═══════════════════════════════════════════════════════════════
  addToCart: (product) => {
    const items = get().cartItems
    const existing = items.find(i => i.product.id === product.id)
    let updated

    if (existing) {
      updated = items.map(i =>
        i.product.id === product.id
          ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unitPrice }
          : i
      )
    } else {
      updated = [...items, {
        product,
        quantity:  1,
        unitPrice: product.price,
        total:     product.price
      }]
    }

    const totals = calcTotals(updated)
    set({ cartItems: updated, ...totals })
  },

  removeFromCart: (productId) => {
    const updated = get().cartItems.filter(i => i.product.id !== productId)
    set({ cartItems: updated, ...calcTotals(updated) })
  },

  updateQuantity: (productId, qty) => {
    if (qty <= 0) { get().removeFromCart(productId); return }
    const updated = get().cartItems.map(i =>
      i.product.id === productId
        ? { ...i, quantity: qty, total: qty * i.unitPrice }
        : i
    )
    set({ cartItems: updated, ...calcTotals(updated) })
  },

  setDiscount: (discount) => {
    const { subTotal, tax } = get()
    set({ discount, total: subTotal + tax - discount })
  },

  setNotes:        (notes)        => set({ notes }),
  setCustomerName: (customerName) => set({ customerName }),

  clearCart: () => set({
    cartItems: [], subTotal: 0, tax: 0, total: 0, discount: 0,
    notes: '', customerName: ''
  }),

  // ═══════════════════════════════════════════════════════════════
  // ORDERS
  // ═══════════════════════════════════════════════════════════════
  fetchOpenOrders: async () => {
    try {
      const res = await orderAPI.getAll({ status: 'open' })
      set({ openOrders: res.data.orders ?? [] })
    } catch {
      // offline — keep whatever is cached
    }
  },

  loadTicket: (order) => {
    // Reconstruct the cart from an existing open order
    const cartItems = (order.items ?? []).map(item => ({
      product:   item.product,
      quantity:  item.quantity,
      unitPrice: item.unit_price,
      total:     item.total
    }))
    const totals = calcTotals(cartItems)
    set({
      cartItems,
      ...totals,
      currentOrder: order,
      notes:        order.notes ?? '',
      customerName: order.customer_name ?? '',
      currentScreen: 'products'
    })
  },

  // ═══════════════════════════════════════════════════════════════
  // PAYMENT
  // ═══════════════════════════════════════════════════════════════
  processPayment: async ({ method, cashReceived, notes: payNotes }) => {
    const { cartItems, total, currentOrder, notes, customerName, isOnline } = get()

    if (!isOnline) {
      // Queue the whole operation locally, then show receipt as if online
      try {
        const orderData = {
          customer_name: customerName,
          notes,
          items: cartItems.map(i => ({ product_id: i.product.id, quantity: i.quantity }))
        }
        const { id: localOrderId } = await localDB.savePendingOrder(orderData)
        await localDB.savePendingPayment({ pending_order_id: localOrderId, method, cash_received: cashReceived, notes: payNotes })

        // Build synthetic receipt objects so the receipt screen works offline
        const syntheticOrder = {
          order_number: `OFFLINE-${localOrderId}`,
          customer_name: customerName,
          notes,
          items: cartItems.map(i => ({
            product:    i.product,
            quantity:   i.quantity,
            unit_price: i.unitPrice,
            total:      i.total
          })),
          sub_total: get().subTotal,
          tax:       get().tax,
          total,
          discount:  get().discount
        }
        const syntheticPayment = {
          payment: {
            method,
            cash_received: cashReceived,
            created_at:    new Date().toISOString()
          },
          change: method === 'cash' ? Math.max(0, cashReceived - total) : 0
        }

        get().clearCart()
        set({
          currentOrder:     syntheticOrder,
          completedPayment: syntheticPayment,
          currentScreen:    'receipt'
        })
        toast('Payment saved — will sync when back online', { icon: '💾' })
      } catch (err) {
        toast.error('Failed to save offline: ' + err.message)
      }
      return
    }

    try {
      let orderId = currentOrder?.id

      // Create order if we don't have one yet (fresh cart)
      if (!orderId) {
        const orderRes = await orderAPI.create({
          customer_name: customerName,
          notes,
          items: cartItems.map(i => ({
            product_id: i.product.id,
            quantity:   i.quantity
          }))
        })
        orderId = orderRes.data.id
      }

      const payRes = await paymentAPI.process({
        order_id:      orderId,
        method,
        amount:        total,
        cash_received: cashReceived,
        notes:         payNotes
      })

      set({
        currentOrder:     payRes.data.order,
        completedPayment: payRes.data,
        currentScreen:    'receipt'
      })

      // Remove from open orders list
      set(s => ({ openOrders: s.openOrders.filter(o => o.id !== orderId) }))
      get().clearCart()
      toast.success('Payment processed!')
    } catch (err) {
      // Network error (backend went down mid-session) — fall back to offline queue
      const isNetworkError = !err.response
      if (isNetworkError) {
        set({ isOnline: false })
        try {
          const orderData = {
            customer_name: customerName,
            notes,
            items: cartItems.map(i => ({ product_id: i.product.id, quantity: i.quantity }))
          }
          const { id: localOrderId } = await localDB.savePendingOrder(orderData)
          await localDB.savePendingPayment({ pending_order_id: localOrderId, method, cash_received: cashReceived, notes: payNotes })

          // Build synthetic receipt objects so the receipt screen works offline
          const syntheticOrder = {
            order_number: `OFFLINE-${localOrderId}`,
            customer_name: customerName,
            notes,
            items: cartItems.map(i => ({
              product:    i.product,
              quantity:   i.quantity,
              unit_price: i.unitPrice,
              total:      i.total
            })),
            sub_total: get().subTotal,
            tax:       get().tax,
            total,
            discount:  get().discount
          }
          const syntheticPayment = {
            payment: {
              method,
              cash_received: cashReceived,
              created_at:    new Date().toISOString()
            },
            change: method === 'cash' ? Math.max(0, cashReceived - total) : 0
          }

          get().clearCart()
          set({
            currentOrder:     syntheticOrder,
            completedPayment: syntheticPayment,
            currentScreen:    'receipt'
          })
          toast('Payment saved — will sync when back online', { icon: '💾' })
        } catch (dbErr) {
          toast.error('Failed to save offline: ' + dbErr.message)
        }
      } else {
        toast.error(err.response?.data?.error ?? 'Payment failed')
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════════════════════════════
  setScreen: (screen) => {
    set(s => ({ previousScreen: s.currentScreen, currentScreen: screen }))
  },

  goBack: () => {
    set(s => ({ currentScreen: s.previousScreen }))
  },

  newSale: () => {
    get().clearCart()
    set({ currentOrder: null, completedPayment: null, currentScreen: 'products' })
  }
}))

export default usePOSStore
