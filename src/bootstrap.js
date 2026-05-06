/**
 * bootstrap.js — Front-end plugin bootstrap
 *
 * Called once during app startup (from PluginBootstrap.jsx) after core
 * services are ready. Plugins are code-split via dynamic import() so they
 * are only loaded at startup, not at module parse time.
 *
 * To add a plugin:
 *   1. Add its plugin.json import below.
 *   2. Add an await loadPlugin(...) call in bootstrapPlugins().
 *   3. Set "enabled": true in the plugin.json.
 */

import { loadPlugin } from './pluginAPI';
import { featureFlags } from './core/config/featureFlags';

// ── Plugin manifests ─────────────────────────────────────────────────────────
import orderNotesMeta  from './plugins/order-notes/plugin.json';
import loyaltyMeta     from './plugins/loyalty/plugin.json';
// import giftCardMeta    from './plugins/gift-card/plugin.json';
// import splitPayMeta    from './plugins/split-payment/plugin.json';
// import cctvMeta        from './plugins/cctv-overlay/plugin.json';
// import custDispMeta    from './plugins/customer-display/plugin.json';
// import receiptMeta     from './plugins/custom-receipt/plugin.json';
// import analyticsMeta   from './plugins/analytics/plugin.json';

/**
 * Discover and load all enabled built-in plugins.
 * Called once at app startup from PluginBootstrap.jsx.
 */
export async function bootstrapPlugins() {
  // Order Notes plugin — injects a note field into the cart footer
  if (featureFlags.enableOrderNotes) {
    await loadPlugin(orderNotesMeta, () => import('./plugins/order-notes/frontend.js'));
  }

  // Loyalty Points plugin — awards points on every paid order
  if (featureFlags.enableLoyalty) {
    await loadPlugin(loyaltyMeta, () => import('./plugins/loyalty'));
  }

  // Uncomment as each plugin is implemented:
  // if (featureFlags.enableGiftCard)        await loadPlugin(giftCardMeta,    () => import('./plugins/gift-card'));
  // if (featureFlags.enableSplitPayment)    await loadPlugin(splitPayMeta,    () => import('./plugins/split-payment'));
  // if (featureFlags.enableCCTV)            await loadPlugin(cctvMeta,        () => import('./plugins/cctv-overlay'));
  // if (featureFlags.enableCustomerDisplay) await loadPlugin(custDispMeta,    () => import('./plugins/customer-display'));
  // if (featureFlags.enableCustomReceipt)   await loadPlugin(receiptMeta,     () => import('./plugins/custom-receipt'));
  // if (featureFlags.enableAnalytics)       await loadPlugin(analyticsMeta,   () => import('./plugins/analytics'));

  console.info('[Bootstrap] Plugin bootstrap complete');
}
