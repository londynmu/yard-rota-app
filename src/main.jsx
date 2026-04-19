import React from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { ToastProvider } from './components/ui/ToastContext'
import { registerSW } from 'virtual:pwa-register'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { safeAutoReload } from './lib/reloadGuard'

const isSystemDarkMode = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

const getStatusBarStyleForSystemTheme = () =>
  isSystemDarkMode() ? Style.Dark : Style.Light

// Configure native Status Bar on mobile (Android/iOS)
if (Capacitor.getPlatform() !== 'web') {
  const setupStatusBar = async () => {
    try {
      await StatusBar.setOverlaysWebView({ overlay: false })
      await StatusBar.setStyle({ style: getStatusBarStyleForSystemTheme() })
      await StatusBar.setBackgroundColor({ color: '#FFFFFF' })
    } catch (err) {
      console.error('StatusBar setup error:', err)
    }
  }
  
  // Setup on app start
  setupStatusBar()

  if (typeof window !== 'undefined' && window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleThemeChange = () => {
      StatusBar.setStyle({ style: getStatusBarStyleForSystemTheme() }).catch((err) => {
        console.error('StatusBar theme update error:', err)
      })
    }
    mediaQuery.addEventListener('change', handleThemeChange)
  }
}

/** Check for newer deploy (web/PWA only). If newer, reload. Deferred so it does not block first paint / LCP. */
/* global __BUILD_TIMESTAMP__ */
async function ensureLatestVersion() {
  if (Capacitor.getPlatform() !== 'web') return
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json()
    if (data.version && data.version !== __BUILD_TIMESTAMP__) {
      safeAutoReload('main.ensureLatestVersion')
      return
    }
  } catch {
    // Offline or network error – render current bundle
  }
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

if (Capacitor.getPlatform() === 'web') {
  const scheduleVersionCheck = () => void ensureLatestVersion()
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(scheduleVersionCheck, { timeout: 3000 })
  } else {
    setTimeout(scheduleVersionCheck, 0)
  }
  // Defer registration until after load — pairs with injectRegister: null in vite.config.js
  registerSW({ immediate: false })
}

// --- PWA Auto-Update (fixes iOS Safari caching) ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    let lastUpdateCheck = 0
    const MIN_SW_UPDATE_INTERVAL_MS = 30 * 1000
    const requestSwUpdate = () => {
      const now = Date.now()
      if (now - lastUpdateCheck < MIN_SW_UPDATE_INTERVAL_MS) return
      lastUpdateCheck = now
      registration.update().catch((err) => {
        console.warn('[main] Service worker update check failed:', err)
      })
    }

    // First check after 5 s so even ~1 min sessions get one update check (users who only jump between pages, no tab switch)
    setTimeout(requestSwUpdate, 5000);
    // Check for SW updates every 2 minutes (align with version.json poll; catch 2–3 min sessions)
    setInterval(() => {
      requestSwUpdate()
    }, 2 * 60 * 1000)

    // Check when user returns to app (iOS background resume, tab switch)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        requestSwUpdate()
      }
    })

    // Also check on window focus (covers more browser scenarios)
    window.addEventListener('focus', () => {
      requestSwUpdate()
    })

    // Check when coming back online (e.g. after mobile data / WiFi reconnect)
    window.addEventListener('online', () => {
      requestSwUpdate()
    })
  })

  // Auto-reload when new SW takes control (works with skipWaiting + clientsClaim)
  // Show full-screen "Reloading…" overlay before reload to avoid jarring jump
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'alert')
    overlay.setAttribute('aria-live', 'polite')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;background:var(--app-bg,#f8fafc);color:var(--app-fg,#1e293b);font-family:system-ui,sans-serif;'
    overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:1rem;text-align:center;padding:1.5rem;">
        <svg style="width:3rem;height:3rem;animation:spin 1s linear infinite;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle style="opacity:.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path style="opacity:.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
        </svg>
        <p style="margin:0;font-size:1rem;font-weight:500;color:#475569;">Reloading app…</p>
        <p style="margin:0;font-size:0.875rem;color:#94a3b8;">A new version is loading.</p>
      </div>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `
    document.body.appendChild(overlay)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const didReload = safeAutoReload('main.controllerChange')
        if (!didReload) {
          overlay.remove()
        }
      })
    })
  })
}
