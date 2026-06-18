import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'

const LoginPage = React.lazy(() => import('./pages/LoginPage'))
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'))
const UsersPage = React.lazy(() => import('./pages/UsersPage'))
const FeedsPage = React.lazy(() => import('./pages/FeedsPage'))
const EntriesPage = React.lazy(() => import('./pages/EntriesPage'))
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'))
const RegistrationSettingsPage = React.lazy(() => import('./pages/RegistrationSettingsPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function PageSpinner() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageSpinner />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="feeds" element={<FeedsPage />} />
              <Route path="entries" element={<EntriesPage />} />
              <Route path="embeddings" element={<SettingsPage />} />
              <Route path="system" element={<RegistrationSettingsPage />} />
              <Route path="settings" element={<Navigate to="/embeddings" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
