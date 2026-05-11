import React, { useEffect, useRef } from 'react'
import usePOSStore from '../stores/posStore'
import ProductCard from '../components/ProductCard'
import Cart from '../components/Cart'
import { getWrapped } from '../registries/wrapperRegistry'

// Way 3 (Option B): wrap ProductCard in the parent so ProductCard.jsx stays untouched.
// If no plugin registered a wrapper, WrappedProductCard === ProductCard.
const WrappedProductCard = getWrapped('ProductCard', ProductCard)

export default function ProductScreen() {
  const {
    products, categories, selectedCategory, searchQuery, productsLoading,
    productPage, productTotal, productPageSize,
    isSyncing, syncProgress, syncTotal, syncStatus,
    setSelectedCategory, setSearchQuery, setProductPage, fetchProducts,
    addToCart, setScreen
  } = usePOSStore()

  const debounceRef = useRef(null)
  const handleSearch = (value) => {
    clearTimeout(debounceRef.current)
    usePOSStore.setState({ searchQuery: value })
    debounceRef.current = setTimeout(() => fetchProducts(), 300)
  }

  useEffect(() => { fetchProducts() }, [])

  const syncPct = syncTotal > 0 ? Math.round((syncProgress / syncTotal) * 100) : 0
  const totalPages = Math.ceil(productTotal / productPageSize) || 1
  const statusText = searchQuery
    ? `${products.length} result${products.length !== 1 ? 's' : ''} for "${searchQuery}" — searched all products`
    : `Showing first 200 · page ${productPage} of ${totalPages} · search to find any product`

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {isSyncing && (
          <div className="flex-shrink-0 bg-pos-surface border-b border-pos-border px-4 py-2">
            <div className="flex items-center justify-between text-xs text-pos-muted mb-1">
              <span>⬇ Syncing product catalogue…</span>
              <span>{syncProgress.toLocaleString()} / {syncTotal.toLocaleString()} ({syncPct}%)</span>
            </div>
            <div className="h-1 bg-pos-border rounded-full overflow-hidden">
              <div className="h-full bg-pos-blue rounded-full transition-all duration-300" style={{ width: `${syncPct}%` }} />
            </div>
          </div>
        )}
        {syncStatus === 'done' && !isSyncing && (
          <div className="flex-shrink-0 bg-green-900/20 border-b border-green-800/30 px-4 py-1.5 text-xs text-green-400">
            ✓ Product catalogue synced — {syncProgress.toLocaleString()} products available
          </div>
        )}

        <div className="flex-shrink-0 px-4 py-3 bg-pos-surface border-b border-pos-border">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-pos-muted text-sm">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search by name or barcode…"
              className="w-full bg-pos-card border border-pos-border rounded-lg pl-9 pr-4 py-2 text-sm text-pos-text placeholder-pos-muted focus:outline-none focus:border-pos-blue"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); fetchProducts() }} className="absolute right-3 top-1/2 -translate-y-1/2 text-pos-muted hover:text-white text-xs">✕</button>
            )}
          </div>
          {categories.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {categories.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${selectedCategory === cat ? 'bg-pos-blue text-white' : 'bg-pos-card text-pos-muted hover:text-white hover:bg-pos-border'}`}>
                  {cat === 'all' ? 'All' : `Cat ${cat}`}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {productsLoading ? (
            <LoadingGrid />
          ) : products.length === 0 ? (
            <EmptyState query={searchQuery} isSyncing={isSyncing} />
          ) : (
            <>
              <p className="text-xs text-pos-muted mb-3">{statusText}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {products.map(product => (
                  <WrappedProductCard key={product.id} product={product} onAdd={addToCart} />
                ))}
              </div>

              {/* Pagination — hidden when searching */}
              {!searchQuery && totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    onClick={() => setProductPage(Math.max(1, productPage - 1))}
                    disabled={productPage === 1}
                    className="px-3 py-1.5 rounded-lg bg-pos-card text-pos-muted text-xs hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  >← Prev</button>

                  {buildPageRange(productPage, totalPages).map((p, i) =>
                    p === '…'
                      ? <span key={`el-${i}`} className="text-pos-muted text-xs px-1">…</span>
                      : <button
                          key={p}
                          onClick={() => setProductPage(p)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                            p === productPage ? 'bg-pos-blue text-white' : 'bg-pos-card text-pos-muted hover:text-white'
                          }`}
                        >{p}</button>
                  )}

                  <button
                    onClick={() => setProductPage(Math.min(totalPages, productPage + 1))}
                    disabled={productPage === totalPages}
                    className="px-3 py-1.5 rounded-lg bg-pos-card text-pos-muted text-xs hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  >Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="w-80 xl:w-96 flex-shrink-0 bg-pos-surface border-l border-pos-border overflow-hidden flex flex-col">
        <Cart onCheckout={() => setScreen('payment')} />
      </div>
    </div>
  )
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="bg-pos-card rounded-xl aspect-square animate-pulse opacity-40" />
      ))}
    </div>
  )
}

function EmptyState({ query, isSyncing }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-pos-muted">
      <span className="text-5xl mb-4">{isSyncing ? '⬇' : '🔍'}</span>
      <p className="text-sm">
        {isSyncing ? 'Downloading product catalogue…' : query ? `No results for "${query}"` : 'No products found'}
      </p>
    </div>
  )
}

function buildPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, 2, current - 1, current, current + 1, total - 1, total])
  const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
  const result = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…')
    result.push(sorted[i])
  }
  return result
}
