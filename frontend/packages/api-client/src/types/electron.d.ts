/**
 * Type declarations for Electron IPC API.
 *
 * These types define the electronAPI interface that's exposed
 * via Electron's contextBridge in the preload script.
 */

interface ElectronAPI {
  /**
   * Get the configured API URL from Electron settings
   */
  getApiUrl(): Promise<string>

  /**
   * Get access token from secure storage
   */
  getAccessToken(): Promise<string | null>

  /**
   * Get refresh token from secure storage
   */
  getRefreshToken(): Promise<string | null>

  /**
   * Save access token to secure storage
   */
  setAccessToken(token: string | null): Promise<void>

  /**
   * Save refresh token to secure storage
   */
  setRefreshToken(token: string | null): Promise<void>

  /**
   * Clear all tokens from secure storage
   */
  clearTokens(): Promise<void>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
