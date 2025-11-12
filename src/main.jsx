import React from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import 'react-datepicker/dist/react-datepicker.css'
import App from './App.jsx'
import { ToastProvider } from './components/ui/ToastContext'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

// Configure native Status Bar on mobile (Android/iOS)
if (Capacitor.getPlatform() !== 'web') {
  (async () => {
    try {
      // Do not draw under the status bar; system provides safe area
      await StatusBar.setOverlaysWebView({ overlay: false })
      // Dark icons for light backgrounds
      await StatusBar.setStyle({ style: Style.Dark })
      // Match light UI background
      await StatusBar.setBackgroundColor({ color: '#ffffff' })
    } catch (err) {
      // no-op
    }
  })()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
