import React from 'react'
import usePOSStore from '../stores/posStore'
import { getAllScreens } from '../registries/screenRegistry'
import { Slot } from '../slots/Slot'
import { SLOT_NAMES } from '../slots/slotNames'

const BASE_NAV_ITEMS = [
  { id: 'products', label: 'Products', icon: '🛒' },
  { id: 'tickets',  label: 'Tickets',  icon: '🎫' }
]

export default function Header() {
  const { currentScreen, setScreen, wsConnected, isOnline, openOrders } = usePOSStore()

  // Way 4: screen registry — plugin screens become nav links automatically
  const pluginNavItems = getAllScreens().map(s => ({
    id: s.id,
    label: s.label ?? s.id,
    icon: s.icon ?? '🔌',
  }))
  const navItems = [...BASE_NAV_ITEMS, ...pluginNavItems]

  const status = !isOnline
    ? { label: 'Offline', color: 'bg-red-500', dot: '🔴' }
    : wsConnected
      ? { label: 'Live',    color: 'bg-green-500', dot: '🟢' }
      : { label: 'Polling', color: 'bg-yellow-500', dot: '🟡' }

  return (
    <header className="h-14 bg-pos-surface border-b border-pos-border flex items-center justify-between px-4 flex-shrink-0 z-10">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <span className="text-xl font-bold text-white tracking-wide">⚡ POS</span>
        <span className="text-pos-muted text-sm hidden sm:block">Point of Sale</span>
        {/* Way 2: slot — plugins can inject content beside the brand */}
        <Slot name={SLOT_NAMES.APP_HEADER_LEFT} />
      </div>

      {/* Navigation */}
      <nav className="flex items-center gap-1">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setScreen(item.id)}
            className={`
              flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors
              ${currentScreen === item.id
                ? 'bg-pos-blue text-white'
                : 'text-pos-muted hover:text-white hover:bg-pos-card'}
            `}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {item.id === 'tickets' && openOrders.length > 0 && (
              <span className="ml-1 bg-pos-yellow text-pos-bg text-xs font-bold px-1.5 py-0.5 rounded-full">
                {openOrders.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Status + right-side slot */}
      <div className="flex items-center gap-2">
        {/* Way 2: slot — plugins can inject controls into the header right side */}
        <Slot name={SLOT_NAMES.APP_HEADER_RIGHT} />
        <span className="text-xs text-pos-muted">{status.dot} {status.label}</span>
      </div>
    </header>
  )
}
