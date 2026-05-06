import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

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
