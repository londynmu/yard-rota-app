import { useState, useEffect, useRef, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'

/* global __BUILD_TIMESTAMP__ */

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const CURRENT_VERSION = __BUILD_TIMESTAMP__

const AUTO_RELOAD_DELAY_MS = 2500 // 2.5 s – auto-reload without user action

/**
 * Hook that polls /version.json to detect when a new build is deployed.
 * Independent of the service worker update mechanism - acts as a safety net.
 * When a new version is detected, triggers an automatic reload after a short
 * delay (no user click required).
 *
 * Returns { updateAvailable: boolean, triggerUpdate: () => Promise<void> }
 *
 * - Skipped entirely on Capacitor (native app updates via app stores)
 * - Fetches with cache-busting query param to bypass browser HTTP cache
 * - Also checks on visibilitychange (user returns to tab / reopens PWA)
 * - Silent on fetch errors (offline, timeout) – never shows false positives
 */
export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const intervalRef = useRef(null)
  const isNative = Capacitor.getPlatform() !== 'web'

  const checkVersion = useCallback(async () => {
    // Skip on native platforms
    if (isNative) return

    try {
      const res = await fetch(`/version.json?_t=${Date.now()}`, {
        cache: 'no-store',
      })

      if (!res.ok) return

      const data = await res.json()

      if (data.version && data.version !== CURRENT_VERSION) {
        setUpdateAvailable(true)
      }
    } catch {
      // Silently ignore – user might be offline or network hiccup
    }
  }, [isNative])

  // Intelligent reload: SW update → clear caches → hard reload
  const triggerUpdate = useCallback(async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration()

        if (registration) {
          // Ask the browser to re-fetch the SW script and check for a new version
          await registration.update()

          // Give the new SW 2 seconds to install + activate (skipWaiting)
          // If controllerchange fires, main.jsx auto-reloads before timeout ends
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }

        // Still here? controllerchange didn't fire – clear all SW caches manually
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map((name) => caches.delete(name)))
      }
    } catch (err) {
      console.warn('[useVersionCheck] Error during update:', err)
    }

    // Final fallback: hard reload (caches are already cleared)
    window.location.reload()
  }, [])

  // When new version is detected, auto-reload after short delay (no user action)
  useEffect(() => {
    if (!updateAvailable || isNative) return
    const t = setTimeout(() => triggerUpdate(), AUTO_RELOAD_DELAY_MS)
    return () => clearTimeout(t)
  }, [updateAvailable, isNative, triggerUpdate])

  useEffect(() => {
    if (isNative) return

    // Initial check after short delay (let the app settle first)
    const initialTimeout = setTimeout(checkVersion, 5000)

    // Poll every 5 minutes
    intervalRef.current = setInterval(checkVersion, POLL_INTERVAL_MS)

    // Check when user returns to the tab / reopens PWA
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isNative, checkVersion])

  return { updateAvailable, triggerUpdate }
}
