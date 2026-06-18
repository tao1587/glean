import { create } from 'zustand'
import { isAxiosError } from 'axios'
import type { User, UserSettings } from '@glean/types'
import { authService } from '@glean/api-client'

function isAuthError(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 401
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  setUser: (user: User | null) => void
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
  loadUser: () => Promise<void>
  updateSettings: (settings: UserSettings) => Promise<void>
  updateSettingsSilently: (settings: UserSettings) => Promise<void>
  clearError: () => void
}

/**
 * Authentication state store.
 *
 * Manages user authentication state, login/logout actions,
 * and token persistence.
 */
// Tracks an in-flight loadUser() call so concurrent callers (e.g. React
// StrictMode double-invoking effects, or App.tsx + ProtectedRoute both calling
// loadUser on mount) all await the same promise instead of one of them
// returning synchronously before authentication has been resolved.
let loadUserPromise: Promise<void> | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const response = await authService.login({ email, password })
      await authService.saveTokens(response.tokens)
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  register: async (email, password, name) => {
    set({ isLoading: true, error: null })
    try {
      const response = await authService.register({ email, password, name })
      await authService.saveTokens(response.tokens)
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      let message = 'Registration failed'
      if (isAxiosError(error) && error.response?.data?.detail) {
        message = error.response.data.detail
      } else if (error instanceof Error) {
        message = error.message
      }
      set({ error: message, isLoading: false })
      throw error
    }
  },

  logout: async () => {
    set({ isLoading: true, error: null })
    try {
      await authService.logout()
      await authService.clearTokens()
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Logout failed'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  loadUser: async () => {
    // De-duplicate concurrent callers by sharing a single in-flight promise.
    // Returning early (as the previous `if (isLoading) return` did) caused a
    // race with React StrictMode's double-invoked effect: the second call
    // resolved synchronously, flipping `isInitialized` in App.tsx before the
    // real auth check finished, so ProtectedRoute saw the default
    // `isAuthenticated: false` state and redirected to /login on refresh.
    if (loadUserPromise) return loadUserPromise

    set({ isLoading: true, error: null })

    loadUserPromise = (async () => {
      try {
        const isAuthenticated = await authService.isAuthenticated()
        if (!isAuthenticated) {
          set({ isAuthenticated: false, user: null, isLoading: false })
          return
        }

        try {
          const user = await authService.getCurrentUser()
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          // Only clear tokens on explicit auth rejection (401).
          // Network errors and timeouts mean the server is slow — do not log the user out.
          if (isAuthError(error)) {
            await authService.clearTokens()
            set({ user: null, isAuthenticated: false, isLoading: false, error: 'Session expired' })
          } else {
            set({ isLoading: false, error: 'Failed to load user' })
          }
        }
      } finally {
        loadUserPromise = null
      }
    })()

    return loadUserPromise
  },

  updateSettings: async (settings) => {
    set({ isLoading: true, error: null })
    try {
      const currentSettings = get().user?.settings ?? {}
      const user = await authService.updateUser({ settings: { ...currentSettings, ...settings } })
      set({
        user,
        isLoading: false,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update settings'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  updateSettingsSilently: async (settings) => {
    try {
      const currentSettings = get().user?.settings ?? {}
      const user = await authService.updateUser({ settings: { ...currentSettings, ...settings } })
      set({ user })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update settings'
      set({ error: message })
      throw error
    }
  },

  clearError: () => set({ error: null }),
}))
