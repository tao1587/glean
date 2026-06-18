import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Layout } from '@/components/Layout'

vi.mock('@glean/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'feeds:sidebar.todayBoard' || key === 'sidebar.todayBoard') return '今日收录'
      if (key === 'reader:translation.translate') return '翻译'
      if (key === 'reader:translation.hideTranslation') return '隐藏翻译'
      if (key === 'reader:translation.translating') return '翻译中'
      return key
    },
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    prefetchQuery: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', email: 'reader@example.com' },
    logout: vi.fn(),
  }),
}))

vi.mock('@/stores/bookmarkStore', () => ({
  useBookmarkStore: () => ({ reset: vi.fn() }),
}))

vi.mock('@/stores/folderStore', () => ({
  useFolderStore: () => ({
    feedFolders: [],
    bookmarkFolders: [],
    fetchFolders: vi.fn(),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    reset: vi.fn(),
  }),
}))

vi.mock('@/hooks/useSubscriptions', () => ({
  useAllSubscriptions: () => ({ data: [] }),
  useRefreshAllFeeds: () => ({ mutate: vi.fn(), isPending: false }),
  useImportOPML: () => ({ mutate: vi.fn(), isPending: false }),
  useExportOPML: () => ({ mutate: vi.fn(), isPending: false }),
  clearSubscriptionCache: vi.fn(),
}))

vi.mock('@/hooks/useEntries', () => ({
  entryKeys: {
    detail: (id: string) => ['entries', 'detail', id],
  },
  getInfiniteEntriesQueryOptions: vi.fn(),
}))

vi.mock('@glean/api-client', () => ({
  entryService: {
    getEntry: vi.fn(),
  },
}))

vi.mock('@/components/sidebar/SidebarFeedsSection', () => ({
  SidebarFeedsSection: () => <div data-testid="sidebar-feeds" />,
}))

vi.mock('@/components/sidebar/SidebarBookmarksSection', () => ({
  SidebarBookmarksSection: () => <div data-testid="sidebar-bookmarks" />,
}))

vi.mock('@/components/sidebar/SidebarUserSection', () => ({
  SidebarUserSection: () => <div data-testid="sidebar-user" />,
}))

vi.mock('@/components/sidebar/MobileSidebarDrawer', () => ({
  MobileSidebarDrawer: () => null,
}))

vi.mock('@/components/dialogs/AddFeedDialog', () => ({
  AddFeedDialog: () => null,
}))

vi.mock('@/components/dialogs/CreateFolderDialog', () => ({
  CreateFolderDialog: () => null,
}))

vi.mock('@/components/dialogs/LogoutConfirmDialog', () => ({
  LogoutConfirmDialog: () => null,
}))

describe('Layout today-board mobile header', () => {
  afterEach(() => {
    cleanup()
  })

  it('does not duplicate today-board title or list controls in the app header', () => {
    render(
      <MemoryRouter initialEntries={['/reader?view=today-board']}>
        <Layout />
      </MemoryRouter>
    )

    const mobileHeader = screen.getByRole('banner')

    expect(within(mobileHeader).getByText('Glean')).toBeInTheDocument()
    expect(within(mobileHeader).queryByText('今日收录')).not.toBeInTheDocument()
    expect(within(mobileHeader).queryByRole('button', { name: '翻译' })).not.toBeInTheDocument()
  })
})
