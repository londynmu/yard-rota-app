import React, { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    // PWA działa tylko w przeglądarce web, nie w native app
    if (Capacitor.getPlatform() !== 'web') {
      return
    }

    // Sprawdź czy użytkownik już odmówił instalacji
    const userDeclined = localStorage.getItem('pwa-install-declined')
    if (userDeclined === 'true') {
      return
    }

    // Sprawdź czy aplikacja jest już zainstalowana
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const isIOSStandalone = window.navigator.standalone === true
    
    if (isStandalone || isIOSStandalone) {
      // Aplikacja już zainstalowana
      return
    }

    // Nasłuchuj na event beforeinstallprompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      
      // Pokaż prompt po krótkiej chwili (daj użytkownikowi czas na załadowanie strony)
      setTimeout(() => {
        setShowPrompt(true)
      }, 3000)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return
    }

    // Pokaż natywny prompt instalacji
    deferredPrompt.prompt()

    // Czekaj na wybór użytkownika
    const { outcome } = await deferredPrompt.userChoice
    
    if (outcome === 'accepted') {
      console.log('PWA zainstalowana')
    }

    // Wyczyść prompt
    setDeferredPrompt(null)
    setShowPrompt(false)
  }

  const handleDecline = () => {
    // Zapisz w localStorage że użytkownik odmówił
    localStorage.setItem('pwa-install-declined', 'true')
    setShowPrompt(false)
    setDeferredPrompt(null)
  }

  if (!showPrompt) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div 
        className="bg-white rounded-lg shadow-xl border border-gray-200 max-w-md w-full p-6 space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
      >
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-offwhite rounded-full flex items-center justify-center">
            <svg 
              className="w-8 h-8 text-charcoal" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" 
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 
          id="pwa-install-title" 
          className="text-xl font-bold text-charcoal text-center"
        >
          Install Yard Rota App
        </h2>

        {/* Description */}
        <p className="text-gray-600 text-center">
          Install the app on your device for faster access and a better user 
          experience. The app will work like a native mobile application.
        </p>

        {/* Benefits */}
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start">
            <svg 
              className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M5 13l4 4L19 7" 
              />
            </svg>
            <span>Quick access from home screen</span>
          </li>
          <li className="flex items-start">
            <svg 
              className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M5 13l4 4L19 7" 
              />
            </svg>
            <span>Works offline after first load</span>
          </li>
          <li className="flex items-start">
            <svg 
              className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M5 13l4 4L19 7" 
              />
            </svg>
            <span>Takes less space than traditional apps</span>
          </li>
        </ul>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={handleDecline}
            className="flex-1 px-4 py-3 text-charcoal hover:bg-gray-100 rounded-lg font-medium transition-colors border border-gray-300"
          >
            Not now
          </button>
          <button
            onClick={handleInstall}
            className="flex-1 px-4 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            Install
          </button>
        </div>

        {/* Note */}
        <p className="text-xs text-gray-500 text-center mt-2">
          After clicking &quot;Not now&quot; this message won&apos;t appear again
        </p>
      </div>
    </div>
  )
}

