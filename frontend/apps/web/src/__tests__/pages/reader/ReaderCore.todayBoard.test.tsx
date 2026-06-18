import { act, cleanup, render, screen } from '@testing-library/react'
import { entryService } from '@glean/api-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EntryWithState } from '@glean/types'
import { ReaderCore } from '@/pages/reader/shared/ReaderCore'

const {
  articleReaderSpy,
  navigateSpy,
  todayBoardSpy,
  useInfiniteEntriesSpy,
  updateEntryStateSpy,
  readerControllerState,
  aiIntegrationState,
} = vi.hoisted(() => ({
  articleReaderSpy: vi.fn((props: { entry: EntryWithState }) => (
    <div data-testid="article-reader">{props.entry.id}</div>
  )),
  navigateSpy: vi.fn(),
  todayBoardSpy: vi.fn(
    (props: {
      entries: Array<{ id: string; is_read?: boolean }>
      onSelectFeed?: (feedId: string) => void
      onCloseDetail?: () => void
    }) => (
      <div data-testid="today-board-probe">{props.entries.map((entry) => entry.id).join(',')}</div>
    )
  ),
  useInfiniteEntriesSpy: vi.fn(),
  updateEntryStateSpy: vi.fn(),
  readerControllerState: {
    entryIdFromUrl: null as string | null,
    selectedEntryId: null as string | null,
    todayBoardDate: '2026-04-10',
    recentTodayBoardDates: [
      { key: '2026-04-10', date: new Date(2026, 3, 10), isToday: true },
      { key: '2026-04-09', date: new Date(2026, 3, 9), isToday: false },
      { key: '2026-04-07', date: new Date(2026, 3, 7), isToday: false },
    ],
    setTodayBoardDate: vi.fn(),
    isLoading: false,
    listTranslationAutoEnabled: false,
    entries: null as EntryWithState[] | null,
  },
  aiIntegrationState: {
    enabled: false,
    userEnabled: false,
    defaultView: 'list' as 'list' | 'ai_summary',
  },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateSpy,
}))

function getLastTodayBoardEntry(entryId: string) {
  const lastCall = todayBoardSpy.mock.calls[todayBoardSpy.mock.calls.length - 1]
  return lastCall?.[0].entries.find((entry) => entry.id === entryId)
}

function makeEntry(overrides: Partial<EntryWithState> = {}): EntryWithState {
  return {
    id: overrides.id ?? 'entry-1',
    feed_id: overrides.feed_id ?? 'feed-1',
    guid: overrides.guid ?? 'guid-1',
    url: overrides.url ?? 'https://example.com/1',
    title: overrides.title ?? 'Entry title',
    author: overrides.author ?? null,
    content: overrides.content ?? null,
    summary: overrides.summary ?? 'Entry summary',
    published_at: overrides.published_at ?? null,
    created_at: overrides.created_at ?? '2026-04-10T02:00:00.000Z',
    is_read: overrides.is_read ?? false,
    read_later: overrides.read_later ?? false,
    is_hidden: overrides.is_hidden ?? false,
    read_later_until: overrides.read_later_until ?? null,
    triage_state: overrides.triage_state,
    defer_until: overrides.defer_until ?? null,
    expires_at: overrides.expires_at ?? null,
    estimated_read_time_sec: overrides.estimated_read_time_sec ?? null,
    content_temporality: overrides.content_temporality,
    read_at: overrides.read_at ?? null,
    ingested_at: overrides.ingested_at ?? overrides.created_at ?? '2026-04-10T02:00:00.000Z',
    is_bookmarked: overrides.is_bookmarked ?? false,
    bookmark_id: overrides.bookmark_id ?? null,
    feed_title: overrides.feed_title ?? 'Feed title',
    feed_icon_url: overrides.feed_icon_url ?? null,
  }
}

vi.mock('@tanstack/react-query', () => ({
  QueryClient: class { setQueryData(){} getQueryData(){} },
  useQueryClient: () => ({
    setQueryData: vi.fn(),
    prefetchQuery: vi.fn().mockResolvedValue(undefined),
    invalidateQueries: vi.fn(),
  }),
}))

vi.mock('@/hooks/useEntries', () => ({
  useInfiniteEntries: (filters: unknown) => {
    useInfiniteEntriesSpy(filters)
    const items = readerControllerState.entries ?? [
      makeEntry({
        id: 'today-entry',
        published_at: '2026-04-09T12:30:00+08:00',
        ingested_at: '2026-04-10T10:00:00.000Z',
        created_at: '2026-04-10T10:00:00.000Z',
      }),
    ]
    return {
      data: {
        pages: [
          {
            items,
          },
        ],
      },
      isLoading: readerControllerState.isLoading,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    }
  },
  useEntry: (entryId: string) => ({
    data: entryId
      ? makeEntry({
          id: entryId,
          is_read: false,
          ingested_at: '2026-04-10T10:00:00+08:00',
          created_at: '2026-04-10T10:00:00+08:00',
        })
      : null,
    isLoading: false,
  }),
  useUpdateEntryState: () => ({ mutateAsync: updateEntryStateSpy }),
  useMarkAllRead: () => ({ mutateAsync: vi.fn() }),
  useSourceAffinity: () => ({ data: undefined, isLoading: false }),
  entryKeys: {
    lists: () => ['entries', 'list'],
    detail: (id: string) => ['entries', 'detail', id],
  },
}))

vi.mock('@/hooks/useSubscriptions', () => ({
  useAllSubscriptions: () => ({
    data: [
      {
        feed_id: 'feed-1',
        feed: { description: 'Feed summary text' },
      },
    ],
  }),
}))

vi.mock('@/hooks/useVectorizationStatus', () => ({
  useVectorizationStatus: () => ({ data: { enabled: false, status: 'idle' } }),
}))

vi.mock('@/hooks/useAIIntegration', () => ({
  useAIIntegrationStatus: () => ({ data: { enabled: aiIntegrationState.enabled } }),
  useAITodaySummary: () => ({ data: null, isLoading: false, error: null }),
}))

vi.mock('@/components/ArticleReader', () => ({
  ArticleReader: articleReaderSpy,
  ArticleReaderSkeleton: () => <div>loading</div>,
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: {
      settings: {
        list_translation_auto_enabled: readerControllerState.listTranslationAutoEnabled,
        ai_integration_enabled: aiIntegrationState.userEnabled,
        today_board_default_view: aiIntegrationState.defaultView,
      },
    },
  }),
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: () => ({ showPreferenceScore: false }),
}))

vi.mock('@glean/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@glean/api-client', () => ({
  entryService: {
    getEntry: vi.fn(),
    translateTexts: vi.fn(),
  },
}))

vi.mock('@/pages/reader/shared/useReaderController', () => ({
  useReaderController: () => ({
    selectedFeedId: undefined,
    selectedFolderId: undefined,
    entryIdFromUrl: readerControllerState.entryIdFromUrl,
    viewParam: 'today-board',
    isSmartView: false,
    isTodayBoardView: true,
    filterType: 'all',
    setFilterType: vi.fn(),
    selectedEntryId: readerControllerState.selectedEntryId,
    selectEntry: vi.fn(),
    clearSelectedEntry: vi.fn(),
    todayBoardDate: readerControllerState.todayBoardDate,
    recentTodayBoardDates: readerControllerState.recentTodayBoardDates,
    setTodayBoardDate: readerControllerState.setTodayBoardDate,
  }),
}))

vi.mock('@/pages/reader/shared/components/ReaderCoreParts', () => ({
  BookOpenIcon: () => null,
  ResizeHandle: () => null,
  EntryListItem: () => null,
  MarkAllReadButton: () => null,
  EntryListItemSkeleton: () => <div>loading</div>,
  ReaderSmartTabs: () => null,
  ReaderFilterTabs: () => null,
}))

vi.mock('@/pages/reader/shared/components/TodayBoard', () => ({
  TodayBoard: todayBoardSpy,
}))

describe('ReaderCore today-board route', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
    updateEntryStateSpy.mockResolvedValue(undefined)
    readerControllerState.entryIdFromUrl = null
    readerControllerState.selectedEntryId = null
    readerControllerState.todayBoardDate = '2026-04-10'
    readerControllerState.isLoading = false
    readerControllerState.listTranslationAutoEnabled = false
    readerControllerState.entries = null
    aiIntegrationState.enabled = false
    aiIntegrationState.userEnabled = false
    aiIntegrationState.defaultView = 'list'
  })

  it('uses the today-board component on mobile so narrow screens do not fall back to the normal entry list', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    render(<ReaderCore isMobile={true} />)

    expect(screen.getByTestId('today-board-probe')).toHaveTextContent('today-entry')
    expect(screen.getByTestId('today-board-probe')).not.toHaveTextContent('older-entry')
    expect(useInfiniteEntriesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        view: 'today-board',
        per_page: 500,
      })
    )
  })

  it('uses the selected today-board date when querying and filtering entries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))
    readerControllerState.todayBoardDate = '2026-04-07'

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    render(<ReaderCore isMobile={true} />)

    expect(useInfiniteEntriesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        view: 'today-board',
        collected_date: '2026-04-07',
      })
    )
    expect(todayBoardSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedDateKey: '2026-04-07',
        recentDates: readerControllerState.recentTodayBoardDates,
        onSelectDate: readerControllerState.setTodayBoardDate,
      }),
      expect.anything()
    )
  })

  it('keeps the today-board header mounted while a selected date is loading', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))
    readerControllerState.todayBoardDate = '2026-04-07'
    readerControllerState.isLoading = true

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    render(<ReaderCore isMobile={true} />)

    expect(todayBoardSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedDateKey: '2026-04-07',
        isLoading: true,
      }),
      expect.anything()
    )
    expect(screen.getByTestId('today-board-probe')).toBeInTheDocument()
  })

  it('keeps desktop selected entries inside the today-board layout so the detail pane can grow', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))
    readerControllerState.entryIdFromUrl = 'today-entry'
    readerControllerState.selectedEntryId = 'today-entry'

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    const { container } = render(<ReaderCore isMobile={false} />)

    expect(container.firstElementChild).toHaveClass('w-full')
    expect(todayBoardSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedEntryId: 'today-entry',
        renderDetail: expect.any(Function),
      }),
      expect.anything()
    )
  })

  it('keeps the mobile today-board mounted behind the article reader so return preserves board position', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))
    readerControllerState.entryIdFromUrl = 'today-entry'
    readerControllerState.selectedEntryId = 'today-entry'

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    render(<ReaderCore isMobile={true} />)

    expect(screen.getByTestId('today-board-probe')).toBeInTheDocument()
    expect(screen.getByTestId('article-reader')).toHaveTextContent('today-entry')
    expect(todayBoardSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedEntryId: null,
      }),
      expect.anything()
    )
  })

  it('disables pull-close gestures for the mobile today-board article reader', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))
    readerControllerState.entryIdFromUrl = 'today-entry'
    readerControllerState.selectedEntryId = 'today-entry'

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    render(<ReaderCore isMobile={true} />)

    expect(articleReaderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        enableMobileCloseGesture: false,
      }),
      expect.anything()
    )
  })

  it('navigates from today-board feed headers to the feed list', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    render(<ReaderCore isMobile={false} />)

    const lastCall = todayBoardSpy.mock.calls[todayBoardSpy.mock.calls.length - 1]
    expect(lastCall?.[0].onSelectFeed).toBeTypeOf('function')
    lastCall?.[0].onSelectFeed?.('feed-target')

    expect(navigateSpy).toHaveBeenCalledWith('/reader?feed=feed-target')
  })

  it('enables the today-board summary card when system + user AI integration are on', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))
    aiIntegrationState.enabled = true
    aiIntegrationState.userEnabled = true

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    render(<ReaderCore isMobile={false} />)

    expect(todayBoardSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        aiEnabled: true,
      }),
      expect.anything()
    )
  })

  it('keeps the today-board summary card disabled when only the system gate is enabled', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))
    aiIntegrationState.enabled = true
    aiIntegrationState.userEnabled = false

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    render(<ReaderCore isMobile={false} />)

    expect(todayBoardSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        aiEnabled: false,
      }),
      expect.anything()
    )
  })

  it('chunks today-board list translation requests so large boards do not hit the provider at once', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))
    readerControllerState.listTranslationAutoEnabled = true
    readerControllerState.entries = Array.from({ length: 30 }, (_, index) =>
      makeEntry({
        id: `entry-${index}`,
        title: `English headline ${index}`,
        summary: `English summary ${index}`,
        ingested_at: '2026-04-10T10:00:00.000Z',
        created_at: '2026-04-10T10:00:00.000Z',
      })
    )
    vi.mocked(entryService.translateTexts).mockImplementation(async (texts: string[]) => ({
      translations: texts.map((text) => `翻译 ${text}`),
      target_language: 'zh-CN',
    }))

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    render(<ReaderCore isMobile={false} />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(entryService.translateTexts).toHaveBeenCalled()
    for (const call of vi.mocked(entryService.translateTexts).mock.calls) {
      expect(call[0].length).toBeLessThanOrEqual(24)
    }
    const translatedCount = vi
      .mocked(entryService.translateTexts)
      .mock.calls.reduce((count, call) => count + call[0].length, 0)
    expect(translatedCount).toBeGreaterThan(24)
  })

  it('does not mark a selected today-board entry read immediately after opening detail', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))
    readerControllerState.entryIdFromUrl = 'today-entry'
    readerControllerState.selectedEntryId = 'today-entry'

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    render(<ReaderCore isMobile={false} />)

    expect(updateEntryStateSpy).not.toHaveBeenCalled()
  })

  it('keeps an unread desktop today-board entry unread when detail closes before the delay', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))
    readerControllerState.entryIdFromUrl = 'today-entry'
    readerControllerState.selectedEntryId = 'today-entry'

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    render(<ReaderCore isMobile={false} />)

    const lastCall = todayBoardSpy.mock.calls[todayBoardSpy.mock.calls.length - 1]
    expect(lastCall?.[0].onCloseDetail).toBeTypeOf('function')

    await act(async () => {
      lastCall?.[0].onCloseDetail?.()
      await Promise.resolve()
    })

    expect(updateEntryStateSpy).not.toHaveBeenCalled()
  })

  it('marks a selected today-board entry read after the open delay', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))
    readerControllerState.entryIdFromUrl = 'today-entry'
    readerControllerState.selectedEntryId = 'today-entry'

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    render(<ReaderCore isMobile={false} />)

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(updateEntryStateSpy).toHaveBeenCalledWith({
      entryId: 'today-entry',
      data: { is_read: true },
      updateListCache: false,
    })
  })

  it('keeps the delayed auto-read timer running across today-board rerenders', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))
    updateEntryStateSpy.mockResolvedValue(
      makeEntry({
        id: 'today-entry',
        is_read: true,
        ingested_at: '2026-04-10T10:00:00.000Z',
        created_at: '2026-04-10T10:00:00.000Z',
      })
    )
    readerControllerState.entryIdFromUrl = 'today-entry'
    readerControllerState.selectedEntryId = 'today-entry'

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    const { rerender } = render(<ReaderCore isMobile={false} />)

    await act(async () => {
      vi.advanceTimersByTime(500)
      rerender(<ReaderCore isMobile={false} />)
      vi.advanceTimersByTime(500)
      rerender(<ReaderCore isMobile={false} />)
      vi.advanceTimersByTime(500)
      rerender(<ReaderCore isMobile={false} />)
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(updateEntryStateSpy).toHaveBeenCalledWith({
      entryId: 'today-entry',
      data: { is_read: true },
      updateListCache: false,
    })
  })

  it('does not optimistically update today-board entries when delayed auto-read starts', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))
    let resolveUpdate: (entry: EntryWithState) => void = () => undefined
    updateEntryStateSpy.mockReturnValue(
      new Promise<EntryWithState>((resolve) => {
        resolveUpdate = resolve
      })
    )
    readerControllerState.entryIdFromUrl = 'today-entry'
    readerControllerState.selectedEntryId = 'today-entry'

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    render(<ReaderCore isMobile={false} />)

    expect(getLastTodayBoardEntry('today-entry')?.is_read).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(updateEntryStateSpy).toHaveBeenCalledWith({
      entryId: 'today-entry',
      data: { is_read: true },
      updateListCache: false,
    })
    expect(getLastTodayBoardEntry('today-entry')?.is_read).toBe(false)

    await act(async () => {
      resolveUpdate(
        makeEntry({
          id: 'today-entry',
          is_read: true,
          ingested_at: '2026-04-10T10:00:00.000Z',
          created_at: '2026-04-10T10:00:00.000Z',
        })
      )
      await Promise.resolve()
    })
  })

  it('keeps today-board entries visually unread after delayed auto-read resolves while detail is open', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))
    updateEntryStateSpy.mockResolvedValue(
      makeEntry({
        id: 'today-entry',
        is_read: true,
        ingested_at: '2026-04-10T10:00:00.000Z',
        created_at: '2026-04-10T10:00:00.000Z',
      })
    )
    readerControllerState.entryIdFromUrl = 'today-entry'
    readerControllerState.selectedEntryId = 'today-entry'

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    })

    render(<ReaderCore isMobile={false} />)

    expect(getLastTodayBoardEntry('today-entry')?.is_read).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
    })

    expect(getLastTodayBoardEntry('today-entry')?.is_read).toBe(false)
  })
})
