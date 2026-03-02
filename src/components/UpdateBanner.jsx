import React, { useState } from 'react'
import { useVersionCheck } from '../hooks/useVersionCheck'

/**
 * Full-screen overlay when a new version is detected. Shows a centered spinner
 * and "Reloading app…" so the reload feels intentional and there is no layout jump.
 * Auto-reload runs after a short delay; optional "Reload now" for the user.
 *
 * Placed in App.jsx outside AuthProvider so it's visible even during
 * loading or on the login screen.
 */
export default function UpdateBanner() {
  const { updateAvailable, triggerUpdate } = useVersionCheck()
  const [isUpdating, setIsUpdating] = useState(false)

  if (!updateAvailable) return null

  const handleReloadNow = async () => {
    setIsUpdating(true)
    await triggerUpdate()
    // triggerUpdate ends with window.location.reload() so we won't reach here
    setIsUpdating(false)
  }

  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center gap-4 bg-[var(--app-bg)] text-[var(--app-fg)]"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="alert"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <div className="relative">
          <svg
            className="h-12 w-12 animate-spin text-slate-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <p className="text-base font-medium text-slate-700 dark:text-slate-300">
          Reloading app…
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          A new version is loading. This will only take a moment.
        </p>
        <button
          type="button"
          onClick={handleReloadNow}
          disabled={isUpdating}
          className="mt-2 text-sm font-medium text-slate-600 underline hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-60"
        >
          {isUpdating ? 'Reloading…' : 'Reload now'}
        </button>
      </div>
    </div>
  )
}
