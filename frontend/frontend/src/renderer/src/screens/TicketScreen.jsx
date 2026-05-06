import React, { useEffect, useState } from 'react'
import usePOSStore from '../store/posStore'
import { orderAPI } from '../services/api'
import toast from 'react-hot-toast'

const STATUS_STYLE = {
  open:      'bg-blue-900/40 text-blue-300 border-blue-800',
  pending:   'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  completed: 'bg-green-900/40 text-green-300 border-green-800',
  cancelled: 'bg-red-900/40 text-red-300 border-red-800'
}

export default function TicketScreen() {
  const { openOrders, fetchOpenOrders, loadTicket, setScreen, offlineSyncedAt } = usePOSStore()
  const [filter, setFilter]         = useState('open')
  const [allOrders, setAllOrders]   = useState([])
  const [loading, setLoading]       = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const fetchAll = async (status) => {
    setLoading(true)
    try {
      const res = await orderAPI.getAll(status !== 'all' ? { status } : {})
      setAllOrders(res.data.orders ?? [])
    } catch {
      // fallback to store's open orders
      setAllOrders(openOrders)
      toast.error('Could not refresh orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll(filter)
  }, [filter])

  // Keep in sync with real-time store updates
  useEffect(() => {
    if (filter === 'open') setAllOrders(openOrders)
  }, [openOrders])

  // Re-fetch when offline orders finish syncing to backend
  useEffect(() => {
    if (offlineSyncedAt) fetchAll(filter)
  }, [offlineSyncedAt])

  const handleDelete = async (orderId) => {
    if (!window.confirm('Cancel this order?')) return
    setDeletingId(orderId)
    try {
      await orderAPI.remove(orderId)
      setAllOrders(prev => prev.filter(o => o.id !== orderId))
      fetchOpenOrders()
      toast.success('Order cancelled')
    } catch {
      toast.error('Failed to cancel order')
    } finally {
      setDeletingId(null)
    }
  }

  const handleLoad = (order) => {
    loadTicket(order)
    setScreen('products')
    toast('Order loaded into cart', { icon: '🛒' })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-pos-surface border-b border-pos-border flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-pos-text">🎫 Tickets / Open Orders</h1>
          <button
            onClick={() => fetchAll(filter)}
            className="text-xs text-pos-muted hover:text-pos-text bg-pos-card hover:bg-pos-border px-3 py-1.5 rounded-lg transition-colors"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-2">
          {['open', 'completed', 'all'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors
                ${filter === s ? 'bg-pos-blue text-white' : 'bg-pos-card text-pos-muted hover:text-pos-text'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Orders list */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <LoadingRows />
        ) : allOrders.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {allOrders.map(order => (
              <TicketCard
                key={order.id}
                order={order}
                deleting={deletingId === order.id}
                onLoad={handleLoad}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TicketCard({ order, deleting, onLoad, onDelete }) {
  const statusStyle = STATUS_STYLE[order.status] ?? 'bg-pos-card text-pos-muted'
  const itemCount   = order.items?.length ?? 0
  const createdAt   = new Date(order.created_at).toLocaleString()

  return (
    <div className="bg-pos-surface border border-pos-border rounded-xl p-4 hover:border-pos-blue transition-colors">
      {/* Ticket header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-bold text-pos-text text-sm">{order.order_number}</p>
          {order.customer_name && (
            <p className="text-xs text-pos-muted mt-0.5">{order.customer_name}</p>
          )}
        </div>
        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border capitalize ${statusStyle}`}>
          {order.status}
        </span>
      </div>

      {/* Items preview */}
      <div className="space-y-0.5 mb-3">
        {(order.items ?? []).slice(0, 3).map((item, i) => (
          <div key={i} className="flex justify-between text-xs text-pos-muted">
            <span className="truncate flex-1 pr-2">{item.product?.name ?? 'Item'}</span>
            <span>×{item.quantity}</span>
          </div>
        ))}
        {itemCount > 3 && (
          <p className="text-xs text-pos-muted">+{itemCount - 3} more items…</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-pos-border pt-3">
        <div>
          <p className="text-lg font-bold text-pos-green">${order.total?.toFixed(2)}</p>
          <p className="text-[10px] text-pos-muted">{createdAt}</p>
        </div>

        <div className="flex gap-2">
          {order.status === 'open' && (
            <>
              <button
                onClick={() => onLoad(order)}
                className="bg-pos-blue hover:bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                Load
              </button>
              <button
                onClick={() => onDelete(order.id)}
                disabled={deleting}
                className="bg-pos-card hover:bg-red-900/40 text-pos-muted hover:text-pos-red text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              >
                {deleting ? '…' : 'Cancel'}
              </button>
            </>
          )}
          {order.status === 'completed' && (
            <span className="text-xs text-pos-green">✓ Paid</span>
          )}
        </div>
      </div>
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-pos-surface border border-pos-border rounded-xl p-4 animate-pulse">
          <div className="h-4 bg-pos-card rounded w-2/3 mb-2" />
          <div className="h-3 bg-pos-card rounded w-1/2 mb-4" />
          <div className="h-3 bg-pos-card rounded w-full mb-1" />
          <div className="h-3 bg-pos-card rounded w-3/4" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ filter }) {
  return (
    <div className="flex flex-col items-center justify-center h-52 text-pos-muted">
      <span className="text-5xl mb-3">🎫</span>
      <p className="text-sm">No {filter !== 'all' ? filter : ''} orders found</p>
    </div>
  )
}
