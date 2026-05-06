/**
 * featureFlags.js — Feature flags for controlled rollout.
 *
 * Set flags here to enable/disable features without code changes.
 * Plugins check flags before registering functionality.
 */

export const featureFlags = {
  /** Enable the loyalty points plugin */
  enableLoyalty: true,

  /** Enable the split payment plugin */
  enableSplitPayment: false,

  /** Enable the CCTV overlay plugin */
  enableCCTV: false,

  /** Enable the customer display plugin */
  enableCustomerDisplay: false,

  /** Enable the gift card plugin */
  enableGiftCard: false,

  /** Enable the custom receipt plugin */
  enableCustomReceipt: false,

  /** Enable the analytics plugin */
  enableAnalytics: false,

  /** Enable the order notes plugin */
  enableOrderNotes: true,

  /** Enable dark mode toggle in settings */
  enableDarkModeToggle: true,

  /** Enable offline mode queue */
  enableOfflineQueue: true,
};
