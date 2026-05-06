import React from 'react'
import { Slot } from '../slots/Slot'
import { SLOT_NAMES } from '../slots/slotNames'

// React.memo: skips re-rendering this card if the product reference and onAdd
// are the same as the previous render. With surgical updates in posStore, only
// changed products get a new object reference — so only their cards re-render.
const ProductCard = React.memo(function ProductCard({ product, onAdd }) {
  // Construct image URL from product ID as fallback — works for all products
  // in LocalDB even if image_url was not stored during an older sync.
  // const imageUrl = product.image_url || `http://192.168.68.120:8068/api/product/${product.id}/image`
  const imageUrl = product.image_url || `http://vfmh-reg5:8068/api/product/${product.id}/image`

  const stockBadge =
    product.stock === 0
      ? { label: 'Out of stock', cls: 'bg-red-900 text-red-300' }
      : product.stock <= 5
        ? { label: `Low: ${product.stock}`, cls: 'bg-yellow-900 text-yellow-300' }
        : null

  return (
    <button
      onClick={() => product.stock !== 0 && onAdd(product)}
      disabled={product.stock === 0}
      className={`
        group relative flex flex-col bg-pos-card rounded-xl overflow-hidden
        border border-pos-border hover:border-pos-blue
        transition-all duration-150 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-900/30
        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
        text-left
      `}
    >
      {/* Product image */}
      <div className="w-full aspect-square bg-pos-surface overflow-hidden">
        <img
          src={imageUrl}
          alt={product.name}
          className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-200"
          loading="lazy"
          onError={e => { e.target.style.display = 'none' }}
        />
      </div>

      {/* Info */}
      <div className="p-2.5 flex flex-col gap-1 flex-1">
        <p className="text-xs text-pos-muted truncate">{product.category}</p>
        <p className="text-sm font-semibold text-pos-text leading-tight line-clamp-2">
          {product.name}
        </p>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-pos-green font-bold text-base">
            ${product.price.toFixed(2)}
          </span>
          {stockBadge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${stockBadge.cls}`}>
              {stockBadge.label}
            </span>
          )}
        </div>
      </div>

      {/* Add overlay */}
      <div className="absolute inset-0 bg-pos-blue/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
        <span className="bg-pos-blue text-white text-xs font-bold px-3 py-1 rounded-full shadow">
          + Add
        </span>
      </div>

      {/* Slot: plugins can inject badges on top of the product card (loyalty points, promo tags…) */}
      <Slot name={SLOT_NAMES.POS_PRODUCT_CARD_BADGE} props={{ product }} />
    </button>
  )
})

export default ProductCard
