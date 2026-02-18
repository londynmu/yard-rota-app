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

/** Check for newer deploy before first paint (web/PWA only). If newer, reload and do not render. */
/* global __BUILD_TIMESTAMP__ */
async function ensureLatestVersion() {
  if (Capacitor.getPlatform() !== 'web') return
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json()
    if (data.version && data.version !== __BUILD_TIMESTAMP__) {
      location.reload()
      return
    }
  } catch {
    // Offline or network error – render current bundle
  }
}

;(async function init() {
  await ensureLatestVersion()
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </StrictMode>,
  )
})()

// --- PWA Auto-Update (fixes iOS Safari caching) ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    // Check for SW updates every 5 minutes (align with version.json poll)
    setInterval(() => {
      registration.update()
    }, 5 * 60 * 1000)

    // Check when user returns to app (iOS background resume, tab switch)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update()
      }
    })

    // Also check on window focus (covers more browser scenarios)
    window.addEventListener('focus', () => {
      registration.update()
    })

    // Check when coming back online (e.g. after mobile data / WiFi reconnect)
    window.addEventListener('online', () => {
      registration.update()
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
