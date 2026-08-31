/**
 * Drops every service worker cache and the registration itself.
 *
 * Needed when a lazy chunk 404s after a deploy: a plain reload would be served
 * the same stale precache and fail again. main.jsx registers the worker again on
 * the next load, so unregistering here is self-healing.
 */
export async function clearAppCachesAndSw() {
  if (typeof window === 'undefined') return

  try {
    if ('caches' in window) {
      const names = await caches.keys()
      await Promise.all(names.map((name) => caches.delete(name)))
    }
  } catch (err) {
    console.warn('[appRecovery] Could not clear caches:', err)
  }

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration) await registration.unregister()
    }
  } catch (err) {
    console.warn('[appRecovery] Could not unregister service worker:', err)
  }
}
