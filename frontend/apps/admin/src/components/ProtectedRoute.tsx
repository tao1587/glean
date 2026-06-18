import { Navigate } from 'react-router-dom'
import { useIsAuthenticated } from '../stores/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
}

/**
 * Protected route wrapper.
 *
 * Redirects to login if not authenticated.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useIsAuthenticated()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
