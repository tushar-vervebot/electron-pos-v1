/**
 * LoyaltyScreen.jsx — Way 4: Screen Registration
 *
 * A brand-new screen that doesn't exist in the base app at all.
 * Registered via api.registerScreen('loyalty', { component: LoyaltyScreen }).
 * The header nav link and routing are handled automatically — no changes
 * to App.jsx or Header.jsx were needed beyond the initial one-time wiring.
 */
import React, { useState } from 'react';
import { getStoredPoints, addPoints, resetPoints } from './loyaltyUtils';

export function LoyaltyScreen() {
  const [points, setPoints]     = useState(getStoredPoints());
  const [addAmount, setAddAmount] = useState('');

  function handleAdd() {
    const n = parseInt(addAmount, 10);
    if (!n || n <= 0) return;
    addPoints(n);
    setPoints(getStoredPoints());
    setAddAmount('');
  }

  function handleReset() {
    resetPoints();
    setPoints(0);
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      {/* Balance card */}
      <div className="bg-pos-surface border border-amber-700/40 rounded-2xl p-8 text-center w-full max-w-sm">
        <p className="text-pos-muted text-sm mb-2">Current loyalty balance</p>
        <p className="text-5xl font-bold text-amber-400">{points.toLocaleString()}</p>
        <p className="text-pos-muted text-xs mt-2">points</p>
      </div>

      {/* Add points (demo / manual adjustment) */}
      <div className="bg-pos-surface border border-pos-border rounded-2xl p-6 w-full max-w-sm space-y-3">
        <p className="text-pos-text text-sm font-medium">Manual adjustment</p>
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            value={addAmount}
            onChange={e => setAddAmount(e.target.value)}
            placeholder="Points to add…"
            className="flex-1 bg-pos-card border border-pos-border rounded-lg px-3 py-2 text-sm text-pos-text placeholder-pos-muted focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={handleAdd}
            className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Add
          </button>
        </div>
        <button
          onClick={handleReset}
          className="w-full text-xs text-pos-muted hover:text-pos-red transition-colors py-1"
        >
          Reset balance to 0
        </button>
      </div>

      <p className="text-pos-muted text-xs text-center max-w-xs">
        Points are awarded automatically at checkout based on each product's loyalty rate.
        This screen is registered by the loyalty plugin — remove the plugin and it disappears.
      </p>
    </div>
  );
}
