import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Local DB — Offline queue ──────────────────────────────────────────────
  savePendingOrder:           (data)           => ipcRenderer.invoke('db:save-pending-order', data),
  savePendingPayment:         (data)           => ipcRenderer.invoke('db:save-pending-payment', data),
  getPendingOrders:           ()               => ipcRenderer.invoke('db:get-pending-orders'),
  getPendingPayments:         ()               => ipcRenderer.invoke('db:get-pending-payments'),
  markOrderSynced:            (id)             => ipcRenderer.invoke('db:mark-order-synced', id),
  markPaymentSynced:          (id)             => ipcRenderer.invoke('db:mark-payment-synced', id),
  getPaymentsForPendingOrder: (pendingOrderId) => ipcRenderer.invoke('db:get-payments-for-order', pendingOrderId),

  // ── Local DB — Product cache ──────────────────────────────────────────────
  getProductsPage:      (opts)  => ipcRenderer.invoke('db:get-products-page', opts),
  searchProducts:       (opts)  => ipcRenderer.invoke('db:search-products', opts),
  getProductCategories: ()      => ipcRenderer.invoke('db:get-product-categories'),
  countProducts:        ()      => ipcRenderer.invoke('db:count-products'),
  getProductsByIds:     (ids)   => ipcRenderer.invoke('db:get-products-by-ids', ids),
  upsertProductsBatch:  (items) => ipcRenderer.invoke('db:upsert-products-batch', items),
  cacheProducts:        (items) => ipcRenderer.invoke('db:cache-products', items),
  getCachedProducts:    ()      => ipcRenderer.invoke('db:get-cached-products'),

  // ── Product sync progress events (main → renderer) ────────────────────────
  onProductSyncStatus:  (cb) => ipcRenderer.on('product-sync-status', (_evt, data) => cb(data)),
  offProductSyncStatus: (cb) => ipcRenderer.removeListener('product-sync-status', cb),

  // ── App ───────────────────────────────────────────────────────────────────
  openDevTools: () => ipcRenderer.invoke('app:open-devtools'),
  print:        () => ipcRenderer.invoke('app:print')
})
