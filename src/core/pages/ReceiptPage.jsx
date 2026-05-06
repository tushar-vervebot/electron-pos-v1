import React from 'react'
import usePOSStore from '../stores/posStore'
import localDB from '../services/localDB'
import { Slot } from '../slots/Slot'
import { SLOT_NAMES } from '../slots/slotNames'

const STORE_NAME = 'My POS Store'
const STORE_ADDRESS = '123 Main Street, City, State 00000'
const STORE_PHONE = '+1 (555) 123-4567'

export default function ReceiptScreen() {
  const { currentOrder, completedPayment, newSale } = usePOSStore()

  if (!currentOrder || !completedPayment) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-pos-muted">
        <span className="text-5xl mb-4">🧾</span>
        <p>No receipt available</p>
        <button onClick={newSale} className="mt-4 text-pos-blue text-sm hover:underline">
          Start a new sale →
        </button>
      </div>
    )
  }

  const order   = currentOrder
  const payment = completedPayment.payment ?? completedPayment
  const change  = completedPayment.change ?? 0
  const paidAt  = new Date(payment.created_at ?? Date.now())

  const handlePrint = () => localDB.print()

  return (
    <div className="flex flex-col items-center justify-center h-full overflow-y-auto py-8 px-4 bg-pos-bg">

      {/* Receipt card */}
      <div id="receipt" className="w-full max-w-sm bg-white text-gray-900 rounded-2xl shadow-2xl overflow-hidden print-receipt">
        {/* Store header */}
        <div className="bg-gray-900 text-white px-6 py-5 text-center">
          {/* Slot: plugins can replace or extend the receipt header */}
          <Slot name={SLOT_NAMES.RECEIPT_HEADER} props={{ order, payment }} />
          <h1 className="text-xl font-bold tracking-wide">{STORE_NAME}</h1>
          <p className="text-xs text-gray-400 mt-1">{STORE_ADDRESS}</p>
          <p className="text-xs text-gray-400">{STORE_PHONE}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Meta */}
          <div className="flex justify-between text-xs text-gray-500">
            <span>Order: <strong className="text-gray-800">#{order.order_number}</strong></span>
            <span>{paidAt.toLocaleString()}</span>
          </div>

          {order.customer_name && (
            <p className="text-xs text-gray-600">Customer: <strong>{order.customer_name}</strong></p>
          )}

          {/* Divider */}
          <DashedDivider />

          {/* Items */}
          <div className="space-y-2">
            {(order.items ?? []).map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <div className="flex-1 min-w-0 pr-2">
                  <p className="font-medium text-gray-800 truncate">{item.product?.name ?? `Item #${idx + 1}`}</p>
                  <p className="text-xs text-gray-500">
                    {item.quantity} × ${item.unit_price?.toFixed(2)}
                  </p>
                </div>
                <span className="font-semibold text-gray-800 flex-shrink-0">
                  ${item.total?.toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <DashedDivider />

          {/* Totals */}
          <div className="space-y-1 text-sm">
            <TotalRow label="Subtotal"  value={`$${order.sub_total?.toFixed(2)}`} />
            <TotalRow label="Tax (10%)" value={`$${order.tax?.toFixed(2)}`} />
            {order.discount > 0 && (
              <TotalRow label="Discount" value={`-$${order.discount?.toFixed(2)}`} />
            )}
            <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
              <span>Total</span>
              <span>${order.total?.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment details */}
          <DashedDivider />
          <div className="text-xs text-gray-600 space-y-1">
            <TotalRow label="Payment Method" value={payment.method?.toUpperCase()} />
            {payment.method === 'cash' && (
              <>
                <TotalRow label="Cash Received" value={`$${payment.cash_received?.toFixed(2)}`} />
                <TotalRow label="Change"        value={`$${change.toFixed(2)}`} />
              </>
            )}
          </div>

          {/* Thank-you message */}
          <DashedDivider />
          <div className="text-center text-xs text-gray-500 pb-2">
            <p className="font-semibold text-gray-800 mb-1">Thank you for your purchase! 🎉</p>
            <p>Please come again</p>
          </div>

          {/* Slot: plugins inject content at the bottom of the receipt (loyalty points earned, QR codes…) */}
          <Slot name={SLOT_NAMES.RECEIPT_FOOTER} props={{ order, payment }} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mt-6 no-print">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 bg-pos-card hover:bg-pos-border text-pos-text px-5 py-2.5 rounded-xl text-sm font-medium transition-colors border border-pos-border"
        >
          🖨️ Print Receipt
        </button>
        <button
          onClick={newSale}
          className="flex items-center gap-2 bg-pos-blue hover:bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-colors"
        >
          ＋ New Sale
        </button>
      </div>
    </div>
  )
}

function DashedDivider() {
  return <hr className="border-dashed border-gray-300 my-0" />
}

function TotalRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  )
}
