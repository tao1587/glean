import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'

import './styles/globals.css'
import App from './App'
import { initializeTheme } from './stores/themeStore'
import { useLanguageStore } from './stores/languageStore'
import { initializeLanguage } from '@glean/i18n'

// Initialize theme before rendering to avoid flash of wrong theme
initializeTheme()

// Initialize i18n
// `initializeLanguage` from `@glean/i18n` is synchronous. It performs an initial
// validation of the language detected by i18next. `initFromStorage` then syncs
// the language from localStorage. This order is safe as i18next internally
// queues operations that are performed before its initialization is complete.
initializeLanguage()

// Initialize language from localStorage (call before any components render)
const { initializeLanguage: initFromStorage } = useLanguageStore.getState()
initFromStorage()


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
