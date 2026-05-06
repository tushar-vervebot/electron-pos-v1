import React from 'react'
import usePOSStore from '../stores/posStore'

export default function Cart({ onCheckout }) {
  const {
    cartItems, subTotal, tax, total, discount,
    notes, customerName,
    removeFromCart, updateQuantity, clearCart,
    setNotes, setCustomerName, setDiscount
  } = usePOSStore()

  const isEmpty = cartItems.length === 0

  return (
    <div className="flex flex-col h-full">
      {/* Cart header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-pos-border flex-shrink-0">
        <h2 className="font-bold text-pos-text text-sm uppercase tracking-wider">
          🛒 Current Order
        </h2>
        {!isEmpty && (
          <button
            onClick={clearCart}
            className="text-xs text-pos-red hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Customer name input */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <input
          type="text"
          value={customerName}
          onChange={e => setCustomerName(e.target.value)}
          placeholder="Customer name (optional)"
          className="w-full bg-pos-surface border border-pos-border rounded-lg px-3 py-1.5 text-sm text-pos-text placeholder-pos-muted focus:outline-none focus:border-pos-blue"
        />
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-0">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-pos-muted py-12">
            <span className="text-5xl mb-3">🛒</span>
            <p className="text-sm">Cart is empty</p>
            <p className="text-xs mt-1">Tap a product to add it</p>
          </div>
        ) : (
          cartItems.map(item => (
            <CartItem
              key={item.product.id}
              item={item}
              onRemove={() => removeFromCart(item.product.id)}
              onQtyChange={(qty) => updateQuantity(item.product.id, qty)}
            />
          ))
        )}
      </div>

      {/* Totals & actions */}
      {!isEmpty && (
        <div className="border-t border-pos-border px-4 py-3 flex-shrink-0 space-y-2">
          {/* Discount row */}
          <div className="flex items-center justify-between text-xs text-pos-muted">
            <span>Discount ($)</span>
            <input
              type="number"
              min="0"
              max={subTotal}
              value={discount || ''}
              onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-20 text-right bg-pos-surface border border-pos-border rounded px-2 py-0.5 text-pos-text text-xs focus:outline-none focus:border-pos-blue"
            />
          </div>

          {/* Summary */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-pos-muted">
              <span>Subtotal</span>
              <span>${subTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-pos-muted">
              <span>Tax (10%)</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-pos-green">
                <span>Discount</span>
                <span>-${discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg text-pos-text border-t border-pos-border pt-2 mt-1">
              <span>Total</span>
              <span className="text-pos-green">${total.toFixed(2)}</span>
            </div>
          </div>

          {/* Notes */}
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Order notes…"
            rows={2}
            className="w-full bg-pos-surface border border-pos-border rounded-lg px-3 py-1.5 text-xs text-pos-text placeholder-pos-muted resize-none focus:outline-none focus:border-pos-blue"
          />

          {/* Checkout button */}
          <button
            onClick={onCheckout}
            className="w-full bg-pos-blue hover:bg-blue-600 active:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors text-sm tracking-wide"
          >
            Proceed to Payment → ${total.toFixed(2)}
          </button>
        </div>
      )}
    </div>
  )
}

function CartItem({ item, onRemove, onQtyChange }) {
  return (
    <div className="flex items-center gap-2 bg-pos-surface rounded-lg px-3 py-2">
      {/* Product info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-pos-text truncate">{item.product.name}</p>
        <p className="text-xs text-pos-muted">${item.unitPrice.toFixed(2)} each</p>
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onQtyChange(item.quantity - 1)}
          className="w-6 h-6 bg-pos-card hover:bg-pos-border rounded text-pos-text text-xs flex items-center justify-center transition-colors"
        >
          −
        </button>
        <span className="w-7 text-center text-sm font-medium text-pos-text">
          {item.quantity}
        </span>
        <button
          onClick={() => onQtyChange(item.quantity + 1)}
          className="w-6 h-6 bg-pos-card hover:bg-pos-border rounded text-pos-text text-xs flex items-center justify-center transition-colors"
        >
          +
        </button>
      </div>

      {/* Line total */}
      <span className="text-sm font-semibold text-pos-green w-16 text-right flex-shrink-0">
        ${(item.unitPrice * item.quantity).toFixed(2)}
      </span>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="text-pos-muted hover:text-pos-red transition-colors ml-1 flex-shrink-0"
        title="Remove item"
      >
        ✕
      </button>
    </div>
  )
}
