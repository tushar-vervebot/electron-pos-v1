'use strict';

/**
 * split-payment/main.js — Main-process stub for the Split Payment plugin.
 *
 * TO IMPLEMENT:
 *   - Listen to a custom IPC channel from the renderer to receive partial
 *     payment submissions and track running balance.
 *   - Emit 'cart:checkout' only when all split amounts cover the total.
 *   - Expose IPC handlers: init-split, add-payment, cancel-split.
 */

module.exports = {
  activate(api) {
    api.logger.info('Split Payment plugin activated (stub — not yet implemented).');
  },
  deactivate() {},
};
