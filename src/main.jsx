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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
