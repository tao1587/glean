import { describe, it, expect, vi, beforeEach } from 'vitest'

// We need to test the TokenStorage class, but it's instantiated as a singleton.
// Reset modules each time to get a fresh instance.
describe('tokenStorage', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    // Ensure no electronAPI on window
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).electronAPI
  })

  describe('web mode (no Electron)', () => {
    it('should detect web mode when electronAPI is not available', async () => {
      const { tokenStorage } = await import('../tokenStorage')
      // No electronAPI, so should use localStorage
      expect(await tokenStorage.getAccessToken()).toBeNull()
    })

    it('should store and retrieve access token', async () => {
      const { tokenStorage } = await import('../tokenStorage')
      await tokenStorage.setAccessToken('test-access-token')
      expect(await tokenStorage.getAccessToken()).toBe('test-access-token')
      expect(localStorage.getItem('access_token')).toBe('test-access-token')
    })

    it('should store and retrieve refresh token', async () => {
      const { tokenStorage } = await import('../tokenStorage')
      await tokenStorage.setRefreshToken('test-refresh-token')
      expect(await tokenStorage.getRefreshToken()).toBe('test-refresh-token')
      expect(localStorage.getItem('refresh_token')).toBe('test-refresh-token')
    })

    it('should remove access token when set to null', async () => {
      const { tokenStorage } = await import('../tokenStorage')
      await tokenStorage.setAccessToken('test-token')
      expect(await tokenStorage.getAccessToken()).toBe('test-token')

      await tokenStorage.setAccessToken(null)
      expect(await tokenStorage.getAccessToken()).toBeNull()
      expect(localStorage.getItem('access_token')).toBeNull()
    })

    it('should remove refresh token when set to null', async () => {
      const { tokenStorage } = await import('../tokenStorage')
      await tokenStorage.setRefreshToken('test-token')
      await tokenStorage.setRefreshToken(null)
      expect(await tokenStorage.getRefreshToken()).toBeNull()
    })

    it('should clear all tokens', async () => {
      const { tokenStorage } = await import('../tokenStorage')
      await tokenStorage.setAccessToken('access')
      await tokenStorage.setRefreshToken('refresh')

      await tokenStorage.clearTokens()

      expect(await tokenStorage.getAccessToken()).toBeNull()
      expect(await tokenStorage.getRefreshToken()).toBeNull()
    })

    it('should report authenticated when access token exists', async () => {
      const { tokenStorage } = await import('../tokenStorage')
      await tokenStorage.setAccessToken('some-token')
      expect(await tokenStorage.isAuthenticated()).toBe(true)
    })

    it('should report not authenticated when no access token', async () => {
      const { tokenStorage } = await import('../tokenStorage')
      expect(await tokenStorage.isAuthenticated()).toBe(false)
    })

    it('should report not authenticated after clearing tokens', async () => {
      const { tokenStorage } = await import('../tokenStorage')
      await tokenStorage.setAccessToken('token')
      await tokenStorage.clearTokens()
      expect(await tokenStorage.isAuthenticated()).toBe(false)
    })
  })

  describe('Electron mode', () => {
    it('should use electronAPI when available', async () => {
      const mockElectronAPI = {
        getAccessToken: vi.fn().mockResolvedValue('electron-access'),
        getRefreshToken: vi.fn().mockResolvedValue('electron-refresh'),
        setAccessToken: vi.fn().mockResolvedValue(undefined),
        setRefreshToken: vi.fn().mockResolvedValue(undefined),
        clearTokens: vi.fn().mockResolvedValue(undefined),
        getApiUrl: vi.fn().mockResolvedValue('http://localhost:8000'),
        setApiUrl: vi.fn().mockResolvedValue(undefined),
        getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
        checkForUpdates: vi.fn().mockResolvedValue(undefined),
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).electronAPI = mockElectronAPI

      const { tokenStorage } = await import('../tokenStorage')
      expect(await tokenStorage.getAccessToken()).toBe('electron-access')
      expect(mockElectronAPI.getAccessToken).toHaveBeenCalled()
    })

    it('should call electronAPI.clearTokens in Electron mode', async () => {
      const mockElectronAPI = {
        getAccessToken: vi.fn().mockResolvedValue(null),
        getRefreshToken: vi.fn().mockResolvedValue(null),
        setAccessToken: vi.fn().mockResolvedValue(undefined),
        setRefreshToken: vi.fn().mockResolvedValue(undefined),
        clearTokens: vi.fn().mockResolvedValue(undefined),
        getApiUrl: vi.fn().mockResolvedValue('http://localhost:8000'),
        setApiUrl: vi.fn().mockResolvedValue(undefined),
        getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
        checkForUpdates: vi.fn().mockResolvedValue(undefined),
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).electronAPI = mockElectronAPI

      const { tokenStorage } = await import('../tokenStorage')
      await tokenStorage.clearTokens()
      expect(mockElectronAPI.clearTokens).toHaveBeenCalled()
    })
  })
})
