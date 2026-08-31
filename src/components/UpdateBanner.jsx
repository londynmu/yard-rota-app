import React, { useState } from 'react'
import { useVersionCheck } from '../hooks/useVersionCheck'
import ReloadingOverlay from './ReloadingOverlay'

/**
 * Full-screen overlay when a new version is detected. Auto-reload runs after a
 * short delay; the "Reload now" button is there for users who do not want to wait.
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
    <ReloadingOverlay
      showReloadButton
      onReloadNow={handleReloadNow}
      isReloading={isUpdating}
    />
  )
}
