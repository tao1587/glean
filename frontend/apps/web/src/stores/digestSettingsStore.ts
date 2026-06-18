import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SearchScope = 'all' | 'date' | 'week'

interface DigestSettingsState {
  /** Auto-mark an article as read when it is opened from the digest view */
  autoMarkRead: boolean
  setAutoMarkRead: (value: boolean) => void
  /** Persisted search scope selection for the cmd-k modal */
  searchScope: SearchScope
  setSearchScope: (scope: SearchScope) => void
}

export const useDigestSettingsStore = create<DigestSettingsState>()(
  persist(
    (set) => ({
      autoMarkRead: false,
      setAutoMarkRead: (value) => set({ autoMarkRead: value }),
      searchScope: 'all' as SearchScope,
      setSearchScope: (scope) => set({ searchScope: scope }),
    }),
    { name: 'glean-digest-settings' }
  )
)
