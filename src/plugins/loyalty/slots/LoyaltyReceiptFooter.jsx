import React, { useState, useEffect } from 'react';
import { loyaltyService } from '../services/loyaltyService';
import usePOSStore from '../../../core/stores/posStore';

/**
 * LoyaltyReceiptFooter — injected into the receipt.footer slot.
 * Shows earned points and running balance after a completed order.
 */
export function LoyaltyReceiptFooter({ order, payment }) {
  const customerName = order?.customer_name;
  const total = order?.total ?? 0;
  const earned = loyaltyService.calcEarned(total);
  const balance = loyaltyService.getPoints(customerName);

  if (!earned) return null;

  return (
    <div style={{
      marginTop: 8,
      padding: '8px 12px',
      background: '#f0fdf4',
      border: '1px solid #bbf7d0',
      borderRadius: 6,
      textAlign: 'center',
      fontSize: 12,
      color: '#166534',
    }}>
      <p style={{ fontWeight: 700, marginBottom: 2 }}>⭐ Loyalty Points Earned</p>
      <p>+{earned} points this order</p>
      {customerName && <p style={{ marginTop: 2, opacity: 0.8 }}>Balance: {balance} pts</p>}
    </div>
  );
}
