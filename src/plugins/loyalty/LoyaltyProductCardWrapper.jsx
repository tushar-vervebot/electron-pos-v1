/**
 * LoyaltyProductCardWrapper.jsx — Way 3: Component Wrapper
 *
 * Wraps ProductCard via wrapperRegistry.
 * The original ProductCard renders inside exactly as always — this plugin
 * layers a "+N pts" badge on top without touching ProductCard.jsx at all.
 *
 * Receives:
 *   WrappedComponent — the original ProductCard (passed by getWrapped())
 *   product          — the product object (forwarded from POSPage)
 *   ...rest          — all other props forwarded to ProductCard unchanged
 */
import React from 'react';
import { getPointsForProduct } from './loyaltyUtils';

export function LoyaltyProductCardWrapper({ WrappedComponent, product, ...rest }) {
  const pts = getPointsForProduct(product);

  return (
    <div className="relative">
      {/* Original ProductCard — completely unchanged */}
      <WrappedComponent product={product} {...rest} />

      {/* Loyalty badge layered on top — ProductCard has no idea */}
      {pts > 0 && (
        <span
          className="
            absolute top-1.5 left-1.5 z-10
            bg-amber-500 text-amber-950 text-[10px] font-bold
            px-1.5 py-0.5 rounded-full shadow
            pointer-events-none
          "
        >
          +{pts} pts
        </span>
      )}
    </div>
  );
}
