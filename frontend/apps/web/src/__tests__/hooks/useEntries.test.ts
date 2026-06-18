import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createQueryWrapper } from '../helpers/queryWrapper'

vi.mock('@glean/api-client', () => ({
  entryService: {
    getEntries: vi.fn(),
    getTodayEntries: vi.fn(),
    getEntry: vi.fn(),
    updateEntryState: vi.fn(),
    markAllRead: vi.fn(),
  },
}))

import {
  entryKeys,
  getInfiniteEntriesQueryOptions,
  useEntries,
  useInfiniteEntries,
  useEntry,
  useUpdateEntryState,
  useMarkAllRead,
} from '@/hooks/useEntries'
import { entryService } from '@glean/api-client'
import { createMockEntry } from '../helpers/mockData'

describe('entryKeys', () => {
  it('should generate correct all key', () => {
    expect(entryKeys.all).toEqual(['entries'])
  })

  it('should generate correct lists key', () => {
    expect(entryKeys.lists()).toEqual(['entries', 'list'])
  })

  it('should generate correct list key with filters', () => {
    expect(entryKeys.list({ feed_id: 'f1' })).toEqual(['entries', 'list', { feed_id: 'f1' }])
  })

  it('should generate correct detail key', () => {
    expect(entryKeys.detail('e1')).toEqual(['entries', 'detail', 'e1'])
  })
})

describe('getInfiniteEntriesQueryOptions', () => {
  it('does not cap pages with maxPages so long scrolling keeps prior items', () => {
    const options = getInfiniteEntriesQueryOptions({ view: 'timeline' })
    expect('maxPages' in options).toBe(false)
  })

  it('uses the dedicated today endpoint for today-board aggregate views', async () => {
    vi.mocked(entryService.getTodayEntries).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      total_pages: 1,
      per_page: 500,
    })
    const options = getInfiniteEntriesQueryOptions({
      view: 'today-board',
      collected_date: '2026-04-10',
      per_page: 500,
    })
    const signal = new AbortController().signal

    await options.queryFn({ pageParam: 2, signal })

    expect(entryService.getTodayEntries).toHaveBeenCalledWith(
      {
        date: '2026-04-10',
        limit: 500,
      },
      { signal }
    )
    expect(entryService.getEntries).not.toHaveBeenCalled()
  })

  it('can hold the today-board query until the server date is ready', async () => {
    vi.clearAllMocks()
    const { wrapper } = createQueryWrapper()

    renderHook(
      () =>
        useInfiniteEntries(
          {
            view: 'today-board',
            per_page: 500,
          },
          { enabled: false }
        ),
      { wrapper }
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(entryService.getTodayEntries).not.toHaveBeenCalled()
    expect(entryService.getEntries).not.toHaveBeenCalled()
  })
})

describe('useEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch entries', async () => {
    const response = { items: [createMockEntry({ id: 'e1', title: 'Test' })], total: 1, page: 1, total_pages: 1, per_page: 20 }
    vi.mocked(entryService.getEntries).mockResolvedValue(response)
    const { wrapper } = createQueryWrapper()

    const { result } = renderHook(() => useEntries({ feed_id: 'f1' }), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(response)
    expect(entryService.getEntries).toHaveBeenCalledWith(
      { feed_id: 'f1' },
      expect.objectContaining({ signal: expect.any(Object) })
    )
  })

  it('should fetch entries without filters', async () => {
    vi.mocked(entryService.getEntries).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      total_pages: 0,
      per_page: 20,
    })
    const { wrapper } = createQueryWrapper()

    const { result } = renderHook(() => useEntries(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(entryService.getEntries).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ signal: expect.any(Object) })
    )
  })
})

describe('useEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch a single entry', async () => {
    const entry = createMockEntry({ id: 'e1', title: 'Test Entry' })
    vi.mocked(entryService.getEntry).mockResolvedValue(entry)
    const { wrapper } = createQueryWrapper()

    const { result } = renderHook(() => useEntry('e1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(entry)
    expect(entryService.getEntry).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ signal: expect.any(Object) })
    )
  })

  it('should not fetch when entryId is empty', () => {
    const { wrapper } = createQueryWrapper()

    const { result } = renderHook(() => useEntry(''), { wrapper })

    expect(result.current.fetchStatus).toBe('idle')
    expect(entryService.getEntry).not.toHaveBeenCalled()
  })
})

describe('useUpdateEntryState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should update entry state', async () => {
    const updatedEntry = createMockEntry({ id: 'e1', is_read: true })
    vi.mocked(entryService.updateEntryState).mockResolvedValue(updatedEntry)
    const { wrapper, queryClient } = createQueryWrapper()
    vi.spyOn(queryClient, 'setQueryData')
    vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateEntryState(), { wrapper })

    await result.current.mutateAsync({ entryId: 'e1', data: { is_read: true } })

    expect(entryService.updateEntryState).toHaveBeenCalledWith('e1', { is_read: true })
    // Should update cache
    expect(queryClient.setQueryData).toHaveBeenCalled()
    // Should invalidate subscriptions for unread counts
    expect(queryClient.invalidateQueries).toHaveBeenCalled()
  })

  it('updates cached digest entries after state changes', async () => {
    const updatedEntry = createMockEntry({ id: 'e1', is_read: true })
    vi.mocked(entryService.updateEntryState).mockResolvedValue(updatedEntry)
    const { wrapper, queryClient } = createQueryWrapper()
    queryClient.setQueryData(['digest-entries', '2026-04-19'], {
      items: [createMockEntry({ id: 'e1', is_read: false }), createMockEntry({ id: 'e2' })],
      total: 2,
      page: 1,
      total_pages: 1,
      per_page: 500,
    })

    const { result } = renderHook(() => useUpdateEntryState(), { wrapper })

    await result.current.mutateAsync({ entryId: 'e1', data: { is_read: true } })

    expect(
      queryClient
        .getQueryData<{ items: Array<{ id: string; is_read: boolean }> }>([
          'digest-entries',
          '2026-04-19',
        ])
        ?.items.map((entry) => [entry.id, entry.is_read])
    ).toEqual([
      ['e1', true],
      ['e2', false],
    ])
  })

  it('can update entry detail without updating cached entry lists', async () => {
    const updatedEntry = createMockEntry({ id: 'e1', is_read: true })
    vi.mocked(entryService.updateEntryState).mockResolvedValue(updatedEntry)
    const { wrapper, queryClient } = createQueryWrapper()
    vi.spyOn(queryClient, 'setQueryData')
    vi.spyOn(queryClient, 'setQueriesData')
    vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateEntryState(), { wrapper })

    await result.current.mutateAsync({
      entryId: 'e1',
      data: { is_read: true },
      updateListCache: false,
    })

    expect(entryService.updateEntryState).toHaveBeenCalledWith('e1', { is_read: true })
    expect(queryClient.setQueryData).toHaveBeenCalled()
    expect(queryClient.setQueriesData).not.toHaveBeenCalled()
    expect(queryClient.invalidateQueries).toHaveBeenCalled()
  })
})

describe('useMarkAllRead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should mark all entries as read', async () => {
    vi.mocked(entryService.markAllRead).mockResolvedValue({ message: 'ok' })
    const { wrapper, queryClient } = createQueryWrapper()
    vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useMarkAllRead(), { wrapper })

    await result.current.mutateAsync({ feedId: 'f1' })

    expect(entryService.markAllRead).toHaveBeenCalledWith('f1', undefined)
    // Should invalidate both entries and subscriptions
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2)
  })
})
