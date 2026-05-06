'use strict';

/**
 * cctv-overlay/main.js — Main-process stub for the CCTV Overlay plugin.
 *
 * TO IMPLEMENT:
 *   - Create a frameless, always-on-top BrowserWindow positioned over the CCTV
 *     feed monitor showing cart items, totals, and cashier ID.
 *   - Update the overlay window on every 'state:updated' hook.
 *   - Expose IPC handler: set-overlay-monitor to choose which display to use.
 */

module.exports = {
  activate(api) {
    api.logger.info('CCTV Overlay plugin activated (stub — not yet implemented).');
  },
  deactivate() {},
};
