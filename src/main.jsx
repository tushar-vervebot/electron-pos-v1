import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { loadRendererPlugins } from './core/app/rendererPluginLoader'
import './core/styles/global.css'

/**
 * Bootstrap sequence:
 *  1. Load all renderer plugins — populates registries (slots, components, wrappers, screens)
 *  2. Dynamically import App so all component modules (POSPage, Cart, etc.) are evaluated
 *     AFTER plugins have registered — module-level getWrapped/getComponent calls resolve correctly
 *  3. Render
 */
async function start() {
  await loadRendererPlugins()

  // Dynamic import ensures POSPage.jsx (and its module-level getWrapped call) is evaluated
  // after the loyalty plugin (or any wrapper plugin) has already called wrapComponent()
  const { default: App } = await import('./core/app/App')

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1E293B',
            color: '#F8FAFC',
            border: '1px solid #475569'
          },
          success: { iconTheme: { primary: '#10B981', secondary: '#F8FAFC' } },
          error:   { iconTheme: { primary: '#EF4444', secondary: '#F8FAFC' } }
        }}
      />
    </React.StrictMode>
  )
}

start()
