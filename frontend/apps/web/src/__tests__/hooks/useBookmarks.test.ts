import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@glean/api-client', () => ({
  bookmarkService: {
    getBookmarks: vi.fn(),
    createBookmark: vi.fn(),
    updateBookmark: vi.fn(),
    deleteBookmark: vi.fn(),
    addFolder: vi.fn(),
    removeFolder: vi.fn(),
  },
}))

vi.mock('@glean/logger', () => ({
  logger: { error: vi.fn() },
}))

import { useBookmarks } from '@/hooks/useBookmarks'
import { bookmarkService } from '@glean/api-client'
import { createMockBookmark, createMockBookmarkFolder } from '../helpers/mockData'

const mockBookmark = createMockBookmark({ id: 'b1', url: 'https://example.com', title: 'Test' })

describe('useBookmarks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return initial state', () => {
    const { result } = renderHook(() => useBookmarks())

    expect(result.current.bookmarks).toEqual([])
    expect(result.current.pagination.total).toBe(0)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should fetch bookmarks successfully', async () => {
    vi.mocked(bookmarkService.getBookmarks).mockResolvedValue({
      items: [mockBookmark],
      total: 1,
      page: 1,
      pages: 1,
      per_page: 20,
    })

    const { result } = renderHook(() => useBookmarks())

    await act(async () => {
      await result.current.fetchBookmarks()
    })

    expect(result.current.bookmarks).toEqual([mockBookmark])
    expect(result.current.pagination.total).toBe(1)
  })

  it('should set error on fetch failure', async () => {
    vi.mocked(bookmarkService.getBookmarks).mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useBookmarks())

    await act(async () => {
      await result.current.fetchBookmarks()
    })

    expect(result.current.error).toBe('Failed to load bookmarks')
  })

  it('should fetch bookmarks with filter params', async () => {
    vi.mocked(bookmarkService.getBookmarks).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pages: 0,
      per_page: 20,
    })

    const { result } = renderHook(() => useBookmarks())

    await act(async () => {
      await result.current.fetchBookmarks({ folder_id: 'f1', search: 'test' })
    })

    expect(bookmarkService.getBookmarks).toHaveBeenCalledWith({ folder_id: 'f1', search: 'test' })
  })

  it('should create a bookmark and refresh', async () => {
    vi.mocked(bookmarkService.createBookmark).mockResolvedValue(mockBookmark)
    vi.mocked(bookmarkService.getBookmarks).mockResolvedValue({
      items: [mockBookmark],
      total: 1,
      page: 1,
      pages: 1,
      per_page: 20,
    })

    const { result } = renderHook(() => useBookmarks())

    let created: unknown
    await act(async () => {
      created = await result.current.createBookmark({ url: 'https://example.com' })
    })

    expect(created).toEqual(mockBookmark)
  })

  it('should update a bookmark in place', async () => {
    vi.mocked(bookmarkService.getBookmarks).mockResolvedValue({
      items: [mockBookmark],
      total: 1,
      page: 1,
      pages: 1,
      per_page: 20,
    })
    const updated = { ...mockBookmark, title: 'Updated' }
    vi.mocked(bookmarkService.updateBookmark).mockResolvedValue(updated)

    const { result } = renderHook(() => useBookmarks())

    await act(async () => {
      await result.current.fetchBookmarks()
    })

    await act(async () => {
      await result.current.updateBookmark('b1', { title: 'Updated' })
    })

    expect(result.current.bookmarks[0].title).toBe('Updated')
  })

  it('should delete a bookmark', async () => {
    vi.mocked(bookmarkService.getBookmarks).mockResolvedValue({
      items: [mockBookmark],
      total: 1,
      page: 1,
      pages: 1,
      per_page: 20,
    })
    vi.mocked(bookmarkService.deleteBookmark).mockResolvedValue(undefined)

    const { result } = renderHook(() => useBookmarks())

    await act(async () => {
      await result.current.fetchBookmarks()
    })

    let deleted: unknown
    await act(async () => {
      deleted = await result.current.deleteBookmark('b1')
    })

    expect(deleted).toBe(true)
    expect(result.current.bookmarks).toEqual([])
  })

  it('should add folder to bookmark', async () => {
    vi.mocked(bookmarkService.getBookmarks).mockResolvedValue({
      items: [mockBookmark],
      total: 1,
      page: 1,
      pages: 1,
      per_page: 20,
    })
    const updated = { ...mockBookmark, folders: [createMockBookmarkFolder({ id: 'f1' })] }
    vi.mocked(bookmarkService.addFolder).mockResolvedValue(updated)

    const { result } = renderHook(() => useBookmarks())

    await act(async () => {
      await result.current.fetchBookmarks()
    })

    await act(async () => {
      await result.current.addFolder('b1', 'f1')
    })

    expect(result.current.bookmarks[0].folders).toEqual([createMockBookmarkFolder({ id: 'f1' })])
  })

  it('should remove folder from bookmark', async () => {
    const withFolder = { ...mockBookmark, folders: [createMockBookmarkFolder({ id: 'f1' })] }
    vi.mocked(bookmarkService.getBookmarks).mockResolvedValue({
      items: [withFolder],
      total: 1,
      page: 1,
      pages: 1,
      per_page: 20,
    })
    vi.mocked(bookmarkService.removeFolder).mockResolvedValue({ ...mockBookmark, folders: [] })

    const { result } = renderHook(() => useBookmarks())

    await act(async () => {
      await result.current.fetchBookmarks()
    })

    await act(async () => {
      await result.current.removeFolder('b1', 'f1')
    })

    expect(result.current.bookmarks[0].folders).toEqual([])
  })

})
