import React, { useEffect } from 'react'
import usePOSStore from '../stores/posStore'
import Header from '../components/Header'
import ProductScreen from '../pages/POSPage'
import PaymentScreen from '../pages/PaymentPage'
import ReceiptScreen from '../pages/ReceiptPage'
import TicketScreen  from '../pages/TicketPage'
import { getAllScreens } from '../registries/screenRegistry'

const BASE_SCREENS = {
  products: ProductScreen,
  payment:  PaymentScreen,
  receipt:  ReceiptScreen,
  tickets:  TicketScreen
}

export default function App() {
  const { currentScreen, init } = usePOSStore()

  // Boot: connect WS, load products, check health
  useEffect(() => { init() }, [])

  // Way 4: screen registry — plugin screens merge with base screens
  const pluginScreenMap = Object.fromEntries(
    getAllScreens().map(s => [s.id, s.component])
  )
  const allScreens = { ...BASE_SCREENS, ...pluginScreenMap }
  const Screen = allScreens[currentScreen] ?? ProductScreen

  return (
    <div className="flex flex-col h-screen bg-pos-bg overflow-hidden">
      <Header />
      <main className="flex-1 overflow-hidden">
        <Screen />
      </main>
    </div>
  )
}
