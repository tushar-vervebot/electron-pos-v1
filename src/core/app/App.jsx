import React, { useEffect, useState } from 'react'
import usePOSStore from '../stores/posStore'
import Header from '../components/Header'
import ProductScreen from '../pages/POSPage'
import PaymentScreen from '../pages/PaymentPage'
import ReceiptScreen from '../pages/ReceiptPage'
import TicketScreen  from '../pages/TicketPage'
import { AppProviders } from './AppProviders'
import { PluginBootstrap } from './PluginBootstrap'
import { ErrorBoundary } from './ErrorBoundary'

// Core screens registered by key.
// Plugins can add additional screens through screenRegistry.
const CORE_SCREENS = {
  products: ProductScreen,
  payment:  PaymentScreen,
  receipt:  ReceiptScreen,
  tickets:  TicketScreen,
}

function POSApp() {
  const { currentScreen, init } = usePOSStore()
  const [pluginsReady, setPluginsReady] = useState(false)

  // Boot: connect WS, load products, check health
  useEffect(() => { init() }, [])

  const Screen = CORE_SCREENS[currentScreen] ?? ProductScreen

  return (
    <>
      {/* Load plugins after core is mounted */}
      <PluginBootstrap onReady={() => setPluginsReady(true)} />

      <div className="flex flex-col h-screen bg-pos-bg overflow-hidden">
        <ErrorBoundary>
          <Header />
        </ErrorBoundary>
        <main className="flex-1 overflow-hidden">
          <ErrorBoundary>
            <Screen />
          </ErrorBoundary>
        </main>
      </div>
    </>
  )
}

export default function App() {
  return (
    <AppProviders>
      <POSApp />
    </AppProviders>
  )
}
