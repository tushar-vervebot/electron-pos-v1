/**
 * loyalty/index.jsx — Loyalty Plugin Entry Point
 *
 * Demonstrates all four JSX modularity patterns from POS_MODULARITY_JSX.md:
 *
 *   Way 1 — Component Registry:
 *     Replaces the cart's DefaultDiscountRow with LoyaltyDiscountRow.
 *     While this plugin is active, the cart shows loyalty-aware discount logic.
 *
 *   Way 2 — Slot System:
 *     Injects LoyaltyCartFooter into the POS_CART_FOOTER slot.
 *     Adds a "You earned X pts this order" summary below the checkout button.
 *
 *   Way 3 — Component Wrapper:
 *     Wraps ProductCard with LoyaltyProductCardWrapper.
 *     Every product card gets a "+N pts" badge layered on top — ProductCard.jsx untouched.
 *
 *   Way 4 — Route/Screen Registration:
 *     Registers the 'loyalty' screen so it appears in the header nav automatically.
 *
 * To install:  uncomment its line in rendererPluginLoader.js
 * To uninstall: remove that line — every change listed above reverses automatically
 */

import { LoyaltyDiscountRow }        from './LoyaltyDiscountRow.jsx';
import { LoyaltyCartFooter }          from './LoyaltyCartFooter.jsx';
import { LoyaltyProductCardWrapper }  from './LoyaltyProductCardWrapper.jsx';
import { LoyaltyScreen }              from './LoyaltyScreen.jsx';

export default async function register(api) {
  api.logger.info('Loyalty plugin activated');

  // ── Way 1: Component Registry ────────────────────────────────────────────
  // Replace the default flat-discount row with a loyalty-aware version
  api.registerComponent('cart.DiscountRow', LoyaltyDiscountRow);

  // ── Way 2: Slot System ───────────────────────────────────────────────────
  // Inject a loyalty points summary below the checkout button
  api.registerSlot('pos.cart.footer', {
    id: 'loyalty.cart-footer',
    component: LoyaltyCartFooter,
    order: 10,
  });

  // ── Way 3: Component Wrapper ─────────────────────────────────────────────
  // Layer a "+N pts" badge on every ProductCard without touching ProductCard.jsx
  api.wrapComponent('ProductCard', LoyaltyProductCardWrapper);

  // ── Way 4: Screen Registration ───────────────────────────────────────────
  // Add a "Loyalty" screen accessible from the header nav
  api.registerScreen('loyalty', {
    label: 'Loyalty',
    icon: '⭐',
    component: LoyaltyScreen,
  });
}
