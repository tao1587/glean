import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserSettings } from '@glean/types'
import { TranslationTab } from '@/components/tabs/TranslationTab'

const state = vi.hoisted(() => ({
  settings: {} as UserSettings,
  saved: {} as Partial<UserSettings>,
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { settings: state.settings },
    isLoading: false,
    updateSettings: async (settings: Partial<UserSettings>) => {
      state.saved = settings
    },
  }),
}))

describe('TranslationTab provider preference', () => {
  beforeEach(() => {
    state.settings = {}
    state.saved = {}
  })

  afterEach(() => cleanup())

  it('shows Automatic for an unset provider preference', () => {
    render(<TranslationTab />)

    expect(screen.getByRole('button', { name: /Automatic/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: /Google Translate/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('preserves an explicitly chosen provider when changing another setting', async () => {
    state.settings = { translation_provider: 'mtran', translation_base_url: 'http://mtran.local' }
    render(<TranslationTab />)

    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: /Save/i }))

    await waitFor(() => expect(state.saved.translation_provider).toBe('mtran'))
    expect(state.saved.translation_base_url).toBe('http://mtran.local')
    expect(state.saved.translation_model).toBe('')
  })

  it('keeps the automatic preference when saving another setting', async () => {
    render(<TranslationTab />)

    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: /Save/i }))

    await waitFor(() => expect(state.saved.translation_provider).toBeNull())
    expect(state.saved.translation_model).toBe('')
    expect(state.saved.translation_base_url).toBe('')
    expect(state.saved.translation_api_key).toBe('')
  })

  it('returns to the server default by saving a null preference', async () => {
    state.settings = { translation_provider: 'google' }
    render(<TranslationTab />)

    fireEvent.click(screen.getByRole('button', { name: /Automatic/i }))
    fireEvent.click(screen.getByRole('button', { name: /Save/i }))

    await waitFor(() => expect(state.saved.translation_provider).toBeNull())
  })
})
