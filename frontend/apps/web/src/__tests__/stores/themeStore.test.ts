import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useThemeStore, initializeTheme } from '@/stores/themeStore'

describe('themeStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // Reset store to defaults
    useThemeStore.setState({ theme: 'system', resolvedTheme: 'dark' })
    // Reset document state
    document.documentElement.removeAttribute('data-theme')
    document.body.classList.remove('theme-transitioning')
  })

  it('should have correct initial state', () => {
    const state = useThemeStore.getState()
    expect(state.theme).toBe('system')
    // In jsdom, matchMedia returns false by default (set in setup), so system theme = light
    // But we reset to 'dark' in beforeEach
    expect(state.resolvedTheme).toBe('dark')
  })

  describe('setTheme', () => {
    it('should set theme to dark', () => {
      useThemeStore.getState().setTheme('dark')

      const state = useThemeStore.getState()
      expect(state.theme).toBe('dark')
      expect(state.resolvedTheme).toBe('dark')
    })

    it('should set theme to light and apply data-theme attribute', () => {
      useThemeStore.getState().setTheme('light')

      const state = useThemeStore.getState()
      expect(state.theme).toBe('light')
      expect(state.resolvedTheme).toBe('light')
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('should set theme to system', () => {
      useThemeStore.getState().setTheme('system')

      const state = useThemeStore.getState()
      expect(state.theme).toBe('system')
      // In jsdom with our mock, matchMedia returns false for prefers-color-scheme: dark
      expect(state.resolvedTheme).toBe('light')
    })

    it('should remove data-theme for dark theme', () => {
      useThemeStore.getState().setTheme('light')
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')

      useThemeStore.getState().setTheme('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBeNull()
    })

    it('should add theme-transitioning class during animation', () => {
      useThemeStore.getState().setTheme('light')
      expect(document.body.classList.contains('theme-transitioning')).toBe(true)
    })
  })

  describe('toggleTheme', () => {
    it('should cycle dark -> light -> system -> dark', () => {
      useThemeStore.setState({ theme: 'dark', resolvedTheme: 'dark' })

      useThemeStore.getState().toggleTheme()
      expect(useThemeStore.getState().theme).toBe('light')

      useThemeStore.getState().toggleTheme()
      expect(useThemeStore.getState().theme).toBe('system')

      useThemeStore.getState().toggleTheme()
      expect(useThemeStore.getState().theme).toBe('dark')
    })
  })

  describe('persist middleware', () => {
    it('should persist theme to localStorage', () => {
      useThemeStore.getState().setTheme('light')

      const stored = localStorage.getItem('glean-theme')
      expect(stored).toBeTruthy()
      const parsed = JSON.parse(stored!)
      expect(parsed.state.theme).toBe('light')
    })
  })

  describe('initializeTheme', () => {
    it('should read theme from localStorage', () => {
      localStorage.setItem('glean-theme', JSON.stringify({ state: { theme: 'light' } }))

      initializeTheme()

      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('should default to system when no stored theme', () => {
      initializeTheme()

      // System theme with our mock matchMedia (returns false for dark) = light
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('should handle corrupt localStorage gracefully', () => {
      localStorage.setItem('glean-theme', 'invalid-json')

      // Should not throw
      expect(() => initializeTheme()).not.toThrow()
    })

    it('should handle missing theme in parsed JSON', () => {
      localStorage.setItem('glean-theme', JSON.stringify({ state: {} }))

      // Should not throw, falls back to system
      expect(() => initializeTheme()).not.toThrow()
    })
  })
})
