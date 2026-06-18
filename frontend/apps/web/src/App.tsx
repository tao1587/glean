import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Rss } from 'lucide-react'
import { useAuthStore } from './stores/authStore'
import { useTranslation } from '@glean/i18n'

// Lazy load pages
import { lazy, Suspense, useEffect, useState } from 'react'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const ReaderRoute = lazy(() => import('./pages/reader/ReaderRoute'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage'))
const BookmarksPage = lazy(() => import('./pages/BookmarksPage'))
// Auth callback
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'))

/**
 * Loading spinner component with branding
 */
function LoadingSpinner() {
  const { t } = useTranslation('common')

  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="bg-primary/30 absolute inset-0 animate-ping rounded-xl" />
          <div className="from-primary-500 to-primary-600 relative flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br">
            <Rss className="text-primary-foreground h-8 w-8" />
          </div>
        </div>
        <div className="text-muted-foreground text-sm font-medium">{t('actions.loading')}</div>
      </div>
    </div>
  )
}

/**
 * Root application component.
 *
 * Defines the main routing structure for the web application.
 */
function App() {
  const { loadUser } = useAuthStore()
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    // Initialize authentication state on app startup
    loadUser().finally(() => {
      setIsInitialized(true)
    })
  }, [loadUser])

  useEffect(() => {
    if (!isInitialized) return

    const preload = () => {
      void import('./pages/BookmarksPage')
      void import('./pages/SettingsPage')
    }

    const win = window as Window & {
      requestIdleCallback?: (
        callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
        options?: { timeout: number }
      ) => number
      cancelIdleCallback?: (handle: number) => void
    }

    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(preload, { timeout: 1500 })
      return () => win.cancelIdleCallback?.(id)
    }

    const timer = window.setTimeout(preload, 300)
    return () => window.clearTimeout(timer)
  }, [isInitialized])

  // Show loading spinner while initializing authentication
  if (!isInitialized) {
    return <LoadingSpinner />
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/reader?tab=unread" replace />} />
          <Route path="reader" element={<ReaderRoute />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
          <Route path="bookmarks" element={<BookmarksPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* 404 fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
