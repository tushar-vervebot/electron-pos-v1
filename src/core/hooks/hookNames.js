export const HOOK_NAMES = {
  // Cart
  CART_BEFORE_ADD_ITEM:           'cart.beforeAddItem',
  CART_AFTER_ADD_ITEM:            'cart.afterAddItem',
  CART_BEFORE_REMOVE_ITEM:        'cart.beforeRemoveItem',
  CART_AFTER_REMOVE_ITEM:         'cart.afterRemoveItem',
  CART_BEFORE_TOTAL_CALCULATE:    'cart.beforeTotalCalculate',
  CART_AFTER_TOTAL_CALCULATE:     'cart.afterTotalCalculate',

  // Orders
  ORDER_BEFORE_CREATE:            'order.beforeCreate',
  ORDER_AFTER_CREATE:             'order.afterCreate',
  ORDER_BEFORE_SAVE:              'order.beforeSave',
  ORDER_AFTER_SAVE:               'order.afterSave',

  // Payments
  PAYMENT_BEFORE_START:           'payment.beforeStart',
  PAYMENT_AFTER_SUCCESS:          'payment.afterSuccess',
  PAYMENT_AFTER_FAILURE:          'payment.afterFailure',

  // Receipt
  RECEIPT_BEFORE_RENDER:          'receipt.beforeRender',
  RECEIPT_AFTER_RENDER:           'receipt.afterRender',
  RECEIPT_BEFORE_PRINT:           'receipt.beforePrint',
  RECEIPT_AFTER_PRINT:            'receipt.afterPrint',

  // Sync
  SYNC_BEFORE_UPLOAD:             'sync.beforeUpload',
  SYNC_AFTER_UPLOAD:              'sync.afterUpload',
};
