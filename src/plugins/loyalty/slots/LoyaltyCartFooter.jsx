import React from 'react';

/**
 * LoyaltyCartFooter — injected into the pos.cart.footer slot.
 * Shows how many points the customer will earn on this order.
 */
export function LoyaltyCartFooter({ cartItems, total, customerName }) {
  const earned = Math.floor(total || 0);
  if (!earned) return null;

  return (
    <div style={{
      background: '#1c2a1c',
      border: '1px solid #2d4a2d',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
      color: '#4ade80',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <span>⭐</span>
      <span>
        {customerName
          ? `${customerName} will earn ${earned} loyalty point${earned !== 1 ? 's' : ''}`
          : `Complete this order to earn ${earned} loyalty point${earned !== 1 ? 's' : ''}`}
      </span>
    </div>
  );
}
