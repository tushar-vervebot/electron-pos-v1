/**
 * LoyaltyCartFooter.jsx — Way 2: Slot injection
 *
 * Injected into the POS_CART_FOOTER slot in Cart.jsx.
 * Appears below the checkout button — the cart has no idea it's there.
 * When the plugin is unloaded the slot is empty and this renders nothing.
 */
import React from 'react';
import usePOSStore from '../../core/stores/posStore';
import { getLoyaltyPointsForCart, getStoredPoints } from './loyaltyUtils';

export function LoyaltyCartFooter() {
  const { cartItems } = usePOSStore();
  const earned = getLoyaltyPointsForCart(cartItems);
  const stored = getStoredPoints();

  if (cartItems.length === 0) return null;

  return (
    <div className="mt-1 rounded-lg border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs">
      <div className="flex items-center justify-between text-amber-300">
        <span className="flex items-center gap-1">⭐ Loyalty balance</span>
        <span className="font-bold">{stored.toLocaleString()} pts</span>
      </div>
      <div className="flex items-center justify-between text-amber-400/70 mt-0.5">
        <span>This order earns</span>
        <span>+{earned} pts</span>
      </div>
    </div>
  );
}
