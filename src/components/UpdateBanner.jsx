import React, { useState } from 'react'
import { useVersionCheck } from '../hooks/useVersionCheck'

/**
 * Fixed banner at the top of the screen that appears when a new version
 * of the app is deployed. Completely hidden when the app is up to date.
 *
 * Placed in App.jsx outside AuthProvider so it's visible even during
 * loading or on the login screen.
 */
export default function UpdateBanner() {
  const { updateAvailable, triggerUpdate } = useVersionCheck()
  const [isUpdating, setIsUpdating] = useState(false)

  if (!updateAvailable) return null

  const handleUpdate = async () => {
    setIsUpdating(true)
    await triggerUpdate()
    // triggerUpdate ends with window.location.reload() so we won't reach here,
    // but just in case:
    setIsUpdating(false)
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[99999] bg-blue-600 text-white px-4 py-2.5 flex items-center justify-between gap-3 shadow-lg"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.625rem)' }}
      role="alert"
    >
      <div className="flex items-center gap-2 min-w-0">
        <svg
          className="w-5 h-5 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        <span className="text-sm font-medium truncate">
          A new version is available
        </span>
      </div>

      <button
        onClick={handleUpdate}
        disabled={isUpdating}
        className="flex-shrink-0 px-3 py-1 bg-white text-blue-600 text-sm font-semibold rounded-md hover:bg-blue-50 transition-colors disabled:opacity-70"
      >
        {isUpdating ? 'Updating...' : 'Update Now'}
      </button>
    </div>
  )
}
