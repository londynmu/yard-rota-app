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

// Configure native Status Bar on mobile (Android/iOS) - ALWAYS LIGHT MODE
if (Capacitor.getPlatform() !== 'web') {
  const setupStatusBar = async () => {
    try {
      // Force light mode always - white background with dark text/icons
      await StatusBar.setOverlaysWebView({ overlay: false })
      await StatusBar.setStyle({ style: Style.Dark })
      await StatusBar.setBackgroundColor({ color: '#FFFFFF' })
      
      // Force light theme
      document.documentElement.setAttribute('data-theme', 'light')
      document.documentElement.style.colorScheme = 'light'
    } catch (err) {
      console.error('StatusBar setup error:', err)
    }
  }
  
  // Setup on app start
  setupStatusBar()
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

// --- PWA Auto-Update (fixes iOS Safari caching) ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    // Safety-net: check for SW updates once per day
    setInterval(() => {
      registration.update()
    }, 24 * 60 * 60 * 1000)

    // Main mechanism: check when user returns to app (iOS background resume)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update()
      }
    })
  })

  // Auto-reload when new SW takes control (works with skipWaiting + clientsClaim)
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })
}
