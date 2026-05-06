import React from 'react';
import { ErrorBoundary } from '../../app/ErrorBoundary';
import { Slot } from '../../slots/Slot';
import { SLOT_NAMES } from '../../slots/slotNames';

/**
 * POSLayout — Main two-column POS screen layout.
 *
 * Left: product area (scrollable grid)
 * Right: cart panel (fixed width)
 *
 * Plugins can inject UI into the slots provided here.
 */
export function POSLayout({ productArea, cartArea }) {
  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Product Area ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <ErrorBoundary>
          {productArea}
        </ErrorBoundary>
      </div>

      {/* ── Cart Panel ──────────────────────────────────────── */}
      <div className="w-80 xl:w-96 flex-shrink-0 border-l border-pos-border flex flex-col overflow-hidden">
        <ErrorBoundary>
          {cartArea}
        </ErrorBoundary>
      </div>
    </div>
  );
}
