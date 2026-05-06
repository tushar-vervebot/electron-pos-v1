import React, { useState } from 'react';
import usePOSStore from '../../../core/stores/posStore';

/**
 * OrderNoteInput — injected into pos.cart.footer slot.
 * Provides a simple text input for attaching a note to the current order.
 * The note is stored in the POS store's `notes` field.
 */
export function OrderNoteInput() {
  const { notes, setNotes } = usePOSStore();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        📝 Order Note
      </label>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Add a note to this order…"
        rows={2}
        style={{
          width: '100%',
          background: '#1e293b',
          border: '1px solid #475569',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 12,
          color: '#f8fafc',
          resize: 'none',
          outline: 'none',
        }}
      />
    </div>
  );
}
