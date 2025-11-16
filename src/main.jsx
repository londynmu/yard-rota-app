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

// Configure native Status Bar on mobile (Android/iOS) - Auto adapt to system theme
if (Capacitor.getPlatform() !== 'web') {
  const updateStatusBar = async () => {
    try {
      // Check system color scheme
      const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches
      
      await StatusBar.setOverlaysWebView({ overlay: false })
      
      if (isDarkMode) {
        // Dark mode: black status bar with light icons
        await StatusBar.setStyle({ style: Style.Light })
        await StatusBar.setBackgroundColor({ color: '#000000' })
        document.documentElement.setAttribute('data-theme', 'dark')
      } else {
        // Light mode: white status bar with dark icons
        await StatusBar.setStyle({ style: Style.Dark })
        await StatusBar.setBackgroundColor({ color: '#FFFFFF' })
        document.documentElement.setAttribute('data-theme', 'light')
      }
    } catch (err) {
      console.error('StatusBar setup error:', err)
    }
  }
  
  // Initial setup
  updateStatusBar()
  
  // Listen for system theme changes
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  darkModeQuery.addEventListener('change', updateStatusBar)
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
