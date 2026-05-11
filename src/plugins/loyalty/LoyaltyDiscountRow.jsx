/**
 * LoyaltyDiscountRow.jsx — Way 1: Component Registry override
 *
 * Replaces the base DefaultDiscountRow in Cart.jsx.
 * Shows loyalty points earned instead of a flat cash discount input.
 * When this plugin is unloaded, DefaultDiscountRow comes back automatically.
 */
import React from 'react';
import usePOSStore from '../../core/stores/posStore';
import { getLoyaltyPointsForCart } from './loyaltyUtils';

export function LoyaltyDiscountRow() {
  const { cartItems, subTotal, discount, setDiscount } = usePOSStore();
  const pointsEarned = getLoyaltyPointsForCart(cartItems);

  return (
    <div className="space-y-1.5">
      {/* Loyalty points earned badge */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-amber-400 font-medium flex items-center gap-1">
          ⭐ Loyalty Points
        </span>
        <span className="text-amber-300 font-bold">+{pointsEarned} pts</span>
      </div>

      {/* Regular discount input still available */}
      <div className="flex items-center justify-between text-xs text-pos-muted">
        <span>Discount ($)</span>
        <input
          type="number"
          min="0"
          max={subTotal}
          value={discount || ''}
          onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
          placeholder="0.00"
          className="w-20 text-right bg-pos-surface border border-amber-700/50 rounded px-2 py-0.5 text-pos-text text-xs focus:outline-none focus:border-amber-500"
        />
      </div>
    </div>
  );
}
