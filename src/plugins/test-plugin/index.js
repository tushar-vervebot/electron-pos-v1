'use strict';

/**
 * test-plugin/index.js
 *
 * Demonstrates the full Plugin API surface:
 *   1. Lifecycle hooks  — cart:item-added, cart:checkout, cart:cleared, state:updated
 *   2. IPC handlers     — ping, get-info, get-cart-total
 *   3. UI panel         — panel.html injected into the #plugin-panels slot
 */

module.exports = {
  activate(api) {
    api.logger.info('Test plugin activated.');

    // ── 1. Lifecycle hooks ──────────────────────────────────────────────────

    api.hooks.on('cart:item-added', (item) => {
      api.logger.info(
        `Item added — "${item?.name}" x${item?.qty} @ $${Number(item?.unitPrice || 0).toFixed(2)}`
      );
    });

    api.hooks.on('cart:checkout', (data) => {
      const count = data?.cart?.length ?? 0;
      const total = Number(data?.total || 0).toFixed(2);
      api.logger.info(`Checkout — ${count} line item(s), grand total $${total}`);
    });

    api.hooks.on('cart:cleared', () => {
      api.logger.info('Cart was cleared.');
    });

    api.hooks.on('state:updated', (state) => {
      // Fires on every setState() call — only log when there is something in the cart
      if ((state?.total ?? 0) > 0) {
        api.logger.info(`State updated — running total $${Number(state.total).toFixed(2)}`);
      }
    });

    // ── 2. IPC handlers (called from the panel buttons) ─────────────────────

    // Channel: plugin:test-plugin:ping
    api.ipc.handle('ping', async (_event, payload) => {
      api.logger.info('Ping received from renderer, payload:', payload);
      return {
        ok: true,
        reply: 'pong',
        echo: payload,
        timestamp: new Date().toISOString(),
      };
    });

    // Channel: plugin:test-plugin:get-info
    api.ipc.handle('get-info', async () => {
      return {
        manifest: api.manifest,
        activatedAt: new Date().toISOString(),
      };
    });

    // Channel: plugin:test-plugin:get-cart-total
    api.ipc.handle('get-cart-total', async () => {
      const state = api.state.get();
      return {
        itemLines: state.cart?.length ?? 0,
        subtotal:  Number(state.subtotal ?? 0).toFixed(2),
        tax:       Number(state.tax      ?? 0).toFixed(2),
        total:     Number(state.total    ?? 0).toFixed(2),
      };
    });

    // ── 3. UI panel ─────────────────────────────────────────────────────────

    api.renderer.addPanel('panel.html');
  },

  deactivate() {
    // Nothing to clean up in this demo plugin.
  },
};
