/**
 * bootstrap.js — Front-end plugin bootstrap
 *
 * Called once during app startup (from src/core/app/App.jsx or Startup.jsx)
 * after core services are ready.
 *
 * Add each built-in plugin here. The dynamic import() keeps them code-split
 * so they only load when the app starts, not at module parse time.
 */

import { loadPlugin } from './pluginAPI';

// ── Built-in plugin manifests ────────────────────────────────────────────────
// Import plugin.json for each built-in plugin.
// When a plugin is fully implemented, uncomment its line.

// import orderNotesMeta  from './plugins/order-notes/plugin.json'   assert { type: 'json' };
// import loyaltyMeta     from './plugins/loyalty/plugin.json'        assert { type: 'json' };
// import giftCardMeta    from './plugins/gift-card/plugin.json'      assert { type: 'json' };
// import splitPayMeta    from './plugins/split-payment/plugin.json'  assert { type: 'json' };
// import cctvMeta        from './plugins/cctv-overlay/plugin.json'   assert { type: 'json' };
// import custDispMeta    from './plugins/customer-display/plugin.json' assert { type: 'json' };
// import receiptMeta     from './plugins/custom-receipt/plugin.json' assert { type: 'json' };
// import analyticsMeta   from './plugins/analytics/plugin.json'      assert { type: 'json' };

/**
 * Discover and load all enabled built-in plugins.
 * Called once at app startup.
 */
export async function bootstrapPlugins() {
  // Uncomment each plugin as it is implemented:

  // await loadPlugin(orderNotesMeta,  () => import('./plugins/order-notes'));
  // await loadPlugin(loyaltyMeta,     () => import('./plugins/loyalty'));
  // await loadPlugin(giftCardMeta,    () => import('./plugins/gift-card'));
  // await loadPlugin(splitPayMeta,    () => import('./plugins/split-payment'));
  // await loadPlugin(cctvMeta,        () => import('./plugins/cctv-overlay'));
  // await loadPlugin(custDispMeta,    () => import('./plugins/customer-display'));
  // await loadPlugin(receiptMeta,     () => import('./plugins/custom-receipt'));
  // await loadPlugin(analyticsMeta,   () => import('./plugins/analytics'));

  console.info('[Bootstrap] Plugin bootstrap complete');
}
