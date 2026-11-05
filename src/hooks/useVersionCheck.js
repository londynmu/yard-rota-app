import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import {
  clearDeferredServerVersion,
  deferServerVersion,
  isPrecheckPath,
  reloadForServerVersion,
  willAutoReload,
} from '../lib/reloadGuard'

const POLL_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes (first load already checked pre-render)
const CURRENT_VERSION = __BUILD_TIMESTAMP__

const AUTO_RELOAD_DELAY_MS = 2500 // 2.5 s – auto-reload without user action

/**
 * Hook that polls /version.json to detect when a new build is deployed.
 * Independent of the service worker update mechanism - acts as a safety net.
 * When a new version is detected off the pre-check page, shows the reload
 * screen once. On /precheck the reload waits until the user leaves.
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
  const pendingVersionRef = useRef(null)
  const location = useLocation()
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
      const serverVersion = data?.version

      if (!serverVersion || serverVersion === CURRENT_VERSION) {
        pendingVersionRef.current = null
        clearDeferredServerVersion()
        setUpdateAvailable(false)
        return
      }

      // Finish the vehicle check first. The next page can take the update.
      if (isPrecheckPath(window.location.pathname)) {
        pendingVersionRef.current = serverVersion
        deferServerVersion(serverVersion)
        setUpdateAvailable(false)
        return
      }

      if (!willAutoReload({ serverVersion, currentVersion: CURRENT_VERSION })) {
        pendingVersionRef.current = null
        setUpdateAvailable(false)
        return
      }

      pendingVersionRef.current = serverVersion
      setUpdateAvailable(true)
    } catch {
      // Silently ignore – user might be offline or network hiccup
    }
  }, [isNative])

  // Clear caches, then one guarded reload. Hide the screen if the reload does not run.
  const triggerUpdate = useCallback(async () => {
    const didReload = await reloadForServerVersion(
      pendingVersionRef.current,
      CURRENT_VERSION,
      'useVersionCheck.triggerUpdate',
    )
    if (!didReload) setUpdateAvailable(false)
  }, [])

  // When new version is detected, auto-reload after short delay (no user action)
  useEffect(() => {
    if (!updateAvailable || isNative) return
    if (isPrecheckPath(location.pathname)) return
    const t = setTimeout(() => triggerUpdate(), AUTO_RELOAD_DELAY_MS)
    return () => clearTimeout(t)
  }, [updateAvailable, isNative, triggerUpdate, location.pathname])

  useEffect(() => {
    if (isNative) return

    // Initial check after 5 s (catch short sessions; pre-render already checked on first load)
    const initialTimeout = setTimeout(checkVersion, 5000)

    // Poll every 2 minutes
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

  // Leaving pre-check is when a deferred update is allowed to run.
  useEffect(() => {
    if (isNative) return
    checkVersion()
  }, [isNative, checkVersion, location.pathname])

  return { updateAvailable, triggerUpdate }
}
