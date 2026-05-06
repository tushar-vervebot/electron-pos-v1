'use strict';

/**
 * customer-display/main.js — Main-process stub for the Customer Display plugin.
 *
 * TO IMPLEMENT:
 *   - Open a dedicated BrowserWindow (customer.html) on a secondary monitor.
 *   - Forward 'state:updated' hook data to the customer window via webContents.send().
 *   - Handle window lifecycle (hide on idle, show on cart activity).
 */

module.exports = {
  activate(api) {
    api.logger.info('Customer Display plugin activated (stub — not yet implemented).');

    // Forward every state update to the customer window
    api.hooks.on('state:updated', (state) => {
      // TODO: get customer window ref and send 'app:state' to it
      void state;
    });
  },
  deactivate() {},
};
