import React, { useEffect } from 'react'
import usePOSStore from './store/posStore'
import Header from './components/Header'
import ProductScreen from './screens/ProductScreen'
import PaymentScreen from './screens/PaymentScreen'
import ReceiptScreen from './screens/ReceiptScreen'
import TicketScreen  from './screens/TicketScreen'

const SCREENS = {
  products: ProductScreen,
  payment:  PaymentScreen,
  receipt:  ReceiptScreen,
  tickets:  TicketScreen
}

export default function App() {
  const { currentScreen, init } = usePOSStore()

  // Boot: connect WS, load products, check health
  useEffect(() => { init() }, [])

  const Screen = SCREENS[currentScreen] ?? ProductScreen

  return (
    <div className="flex flex-col h-screen bg-pos-bg overflow-hidden">
      <Header />
      <main className="flex-1 overflow-hidden">
        <Screen />
      </main>
    </div>
  )
}
