'use strict';

/**
 * gift-card/main.js — Main-process stub for the Gift Cards plugin.
 *
 * TO IMPLEMENT:
 *   - Register a custom payment method via IPC so the renderer payment registry
 *     can include "Gift Card" as an option.
 *   - Handle gift card validation / balance lookup against an API or local store.
 *   - Expose IPC handlers: check-balance, redeem, issue-card.
 */

module.exports = {
  activate(api) {
    api.logger.info('Gift Card plugin activated (stub — not yet implemented).');
  },
  deactivate() {},
};
