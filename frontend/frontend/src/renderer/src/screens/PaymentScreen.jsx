import React, { useState } from 'react'
import usePOSStore from '../store/posStore'

const PAYMENT_METHODS = [
  { id: 'cash',   label: 'Cash',        icon: '💵' },
  { id: 'card',   label: 'Credit/Debit', icon: '💳' },
  { id: 'online', label: 'Online / QR',  icon: '📱' }
]

// Quick cash presets (multiples of 10/20/50)
function buildCashPresets(total) {
  const rounded = Math.ceil(total / 10) * 10
  return [...new Set([rounded, rounded + 10, rounded + 20, rounded + 50])].slice(0, 4)
}

export default function PaymentScreen() {
  const { cartItems, subTotal, tax, discount, total, notes, customerName, setScreen, processPayment } = usePOSStore()
  const [method, setMethod]           = useState('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [processing, setProcessing]   = useState(false)

  const cashVal   = parseFloat(cashReceived) || 0
  const change    = method === 'cash' ? Math.max(0, cashVal - total) : 0
  const canPay    = method !== 'cash' || cashVal >= total
  const presets   = buildCashPresets(total)

  const handlePay = async () => {
    setProcessing(true)
    await processPayment({
      method,
      cashReceived: cashVal,
      notes: ''
    })
    setProcessing(false)
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Order Summary (left) ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto border-r border-pos-border">
        <div className="p-6 max-w-lg mx-auto">
          <h2 className="text-lg font-bold text-pos-text mb-4">Order Summary</h2>

          {customerName && (
            <p className="text-sm text-pos-muted mb-4">
              Customer: <span className="text-pos-text font-medium">{customerName}</span>
            </p>
          )}

          {/* Items */}
          <div className="space-y-2 mb-6">
            {cartItems.map(item => (
              <div key={item.product.id} className="flex items-center bg-pos-card rounded-lg px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-pos-text truncate">{item.product.name}</p>
                  <p className="text-xs text-pos-muted">${item.unitPrice.toFixed(2)} × {item.quantity}</p>
                </div>
                <span className="text-sm font-semibold text-pos-green">${item.total.toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="bg-pos-card rounded-xl p-4 space-y-2 text-sm">
            <Row label="Subtotal"  value={`$${subTotal.toFixed(2)}`} />
            <Row label="Tax (10%)" value={`$${tax.toFixed(2)}`} />
            {discount > 0 && (
              <Row label="Discount" value={`-$${discount.toFixed(2)}`} valueClass="text-pos-green" />
            )}
            {notes && (
              <p className="text-xs text-pos-muted pt-1 border-t border-pos-border">Note: {notes}</p>
            )}
            <div className="flex justify-between font-bold text-base border-t border-pos-border pt-2">
              <span className="text-pos-text">Total Due</span>
              <span className="text-pos-green">${total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Payment Panel (right) ──────────────────────────── */}
      <div className="w-80 xl:w-96 flex-shrink-0 flex flex-col bg-pos-surface overflow-y-auto">
        <div className="p-5 flex flex-col gap-5 h-full">
          <h2 className="text-base font-bold text-pos-text">Select Payment Method</h2>

          {/* Method picker */}
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map(m => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`
                  flex flex-col items-center gap-1 py-3 px-2 rounded-xl border text-xs font-medium transition-colors
                  ${method === m.id
                    ? 'border-pos-blue bg-blue-900/30 text-pos-blue'
                    : 'border-pos-border text-pos-muted hover:border-pos-blue hover:text-pos-text'}
                `}
              >
                <span className="text-2xl">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>

          {/* Cash input */}
          {method === 'cash' && (
            <div className="space-y-3">
              <label className="text-xs text-pos-muted uppercase tracking-wider">Cash Received</label>
              <input
                type="number"
                value={cashReceived}
                onChange={e => setCashReceived(e.target.value)}
                placeholder="0.00"
                min={total}
                step="0.01"
                className="w-full bg-pos-bg border border-pos-border rounded-xl px-4 py-3 text-2xl font-bold text-pos-green text-center focus:outline-none focus:border-pos-blue"
              />

              {/* Quick presets */}
              <div className="grid grid-cols-4 gap-1.5">
                {presets.map(p => (
                  <button
                    key={p}
                    onClick={() => setCashReceived(String(p))}
                    className="bg-pos-card hover:bg-pos-border text-pos-text text-xs font-medium py-1.5 rounded-lg transition-colors"
                  >
                    ${p}
                  </button>
                ))}
                <button
                  onClick={() => setCashReceived(String(total.toFixed(2)))}
                  className="col-span-4 bg-pos-card hover:bg-pos-border text-pos-muted text-xs py-1.5 rounded-lg transition-colors"
                >
                  Exact (${total.toFixed(2)})
                </button>
              </div>

              {/* Change */}
              {cashVal > 0 && (
                <div className={`rounded-xl p-3 text-center slide-up ${
                  cashVal >= total ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'
                }`}>
                  {cashVal >= total ? (
                    <>
                      <p className="text-xs text-pos-muted">Change to give</p>
                      <p className="text-2xl font-bold text-pos-green">${change.toFixed(2)}</p>
                    </>
                  ) : (
                    <p className="text-sm text-pos-red font-medium">
                      Still need ${(total - cashVal).toFixed(2)} more
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Card / Online message */}
          {method !== 'cash' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-pos-muted">
                <span className="text-5xl block mb-3">{method === 'card' ? '💳' : '📱'}</span>
                <p className="text-sm">
                  {method === 'card' ? 'Swipe / insert card on terminal' : 'Show QR code to customer'}
                </p>
              </div>
            </div>
          )}

          <div className="mt-auto space-y-2">
            <button
              onClick={handlePay}
              disabled={!canPay || processing}
              className="w-full bg-pos-green hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-colors text-base tracking-wide"
            >
              {processing ? 'Processing…' : `✓ Confirm Payment  $${total.toFixed(2)}`}
            </button>
            <button
              onClick={() => setScreen('products')}
              className="w-full bg-pos-card hover:bg-pos-border text-pos-muted text-sm py-2.5 rounded-xl transition-colors"
            >
              ← Back to Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, valueClass = 'text-pos-muted' }) {
  return (
    <div className="flex justify-between">
      <span className="text-pos-muted">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  )
}
