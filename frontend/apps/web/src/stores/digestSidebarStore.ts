import { create } from 'zustand'

export type DigestSidebarPanel = 'feeds' | 'saved' | 'settings' | null

interface DigestSidebarState {
  activePanel: DigestSidebarPanel
  setActivePanel: (panel: DigestSidebarPanel) => void
  togglePanel: (panel: Exclude<DigestSidebarPanel, null>) => void
}

export const useDigestSidebarStore = create<DigestSidebarState>((set, get) => ({
  activePanel: null,

  setActivePanel: (panel) => set({ activePanel: panel }),

  togglePanel: (panel) => {
    const current = get().activePanel
    set({ activePanel: current === panel ? null : panel })
  },
}))
