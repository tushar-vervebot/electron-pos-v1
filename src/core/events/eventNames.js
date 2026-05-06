export const EVENT_NAMES = {
  // App lifecycle
  APP_STARTED:               'app.started',
  PLUGIN_ENABLED:            'plugin.enabled',
  PLUGIN_DISABLED:           'plugin.disabled',

  // Cart
  CART_ITEM_ADDED:           'cart.itemAdded',
  CART_ITEM_REMOVED:         'cart.itemRemoved',
  CART_CLEARED:              'cart.cleared',

  // Orders
  ORDER_CREATED:             'order.created',
  ORDER_SAVED:               'order.saved',
  ORDER_PAID:                'order.paid',

  // Payments
  PAYMENT_STARTED:           'payment.started',
  PAYMENT_SUCCESS:           'payment.success',
  PAYMENT_FAILED:            'payment.failed',

  // Receipt
  RECEIPT_PRINTED:           'receipt.printed',

  // Customer
  CUSTOMER_SELECTED:         'customer.selected',

  // Sync
  SYNC_COMPLETED:            'sync.completed',

  // Hardware
  HARDWARE_BARCODE_SCANNED:  'hardware.barcodeScanned',
  HARDWARE_PRINTER_ERROR:    'hardware.printerError',
};
