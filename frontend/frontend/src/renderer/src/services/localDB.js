/**
 * Local DB Service (renderer side)
 *
 * Thin wrapper around window.electronAPI IPC calls.
 * Falls back gracefully when running outside of Electron.
 */

const api  = window.electronAPI ?? null
const noop = async () => ({ success: false, reason: 'Not running in Electron' })

const localDB = {
  // ─ Offline queue ──────────────────────────────────────────────────────────
  savePendingOrder:             api?.savePendingOrder             ?? noop,
  savePendingPayment:           api?.savePendingPayment           ?? noop,
  getPendingOrders:             api?.getPendingOrders             ?? (async () => []),
  getPendingPayments:           api?.getPendingPayments           ?? (async () => []),
  markOrderSynced:              api?.markOrderSynced              ?? noop,
  markPaymentSynced:            api?.markPaymentSynced            ?? noop,
  getPaymentsForPendingOrder:   api?.getPaymentsForPendingOrder   ?? (async () => []),

  // ─ Product cache ───────────────────────────────────────────────────────
  getProductsPage:              api?.getProductsPage              ?? (async () => ({ products: [], total: 0 })),
  searchProducts:               api?.searchProducts               ?? (async () => ({ products: [], total: 0 })),
  getProductCategories:         api?.getProductCategories         ?? (async () => []),
  countProducts:                api?.countProducts                ?? (async () => 0),
  getProductsByIds:             api?.getProductsByIds             ?? (async () => []),
  upsertProductsBatch:          api?.upsertProductsBatch          ?? noop,
  cacheProducts:                api?.cacheProducts                ?? noop,
  getCachedProducts:            api?.getCachedProducts            ?? (async () => []),

  // ─ Sync events ─────────────────────────────────────────────────────────
  onProductSyncStatus:          api?.onProductSyncStatus          ?? (() => {}),
  offProductSyncStatus:         api?.offProductSyncStatus         ?? (() => {}),

  // ─ App ────────────────────────────────────────────────────────────────
  print:                        api?.print                        ?? noop
}

export default localDB
