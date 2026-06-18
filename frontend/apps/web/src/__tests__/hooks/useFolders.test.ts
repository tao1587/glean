import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { createQueryWrapper } from '../helpers/queryWrapper'

vi.mock('@glean/api-client', () => ({
  folderService: {
    getFolders: vi.fn(),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveFolder: vi.fn(),
  },
}))

vi.mock('@glean/logger', () => ({
  logger: { error: vi.fn() },
}))

import { useFolders } from '@/hooks/useFolders'
import { folderService } from '@glean/api-client'
import { createMockFolder, createMockFolderTreeNode } from '../helpers/mockData'

describe('useFolders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return initial state', () => {
    vi.mocked(folderService.getFolders).mockResolvedValue({ folders: [] })
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useFolders(), { wrapper })

    expect(result.current.folders).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('should fetch folders successfully', async () => {
    const folders = [createMockFolderTreeNode({ id: 'f1', name: 'News' })]
    vi.mocked(folderService.getFolders).mockResolvedValue({ folders })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useFolders('feed'), { wrapper })

    await waitFor(() => {
      expect(result.current.folders).toEqual(folders)
    })

    expect(folderService.getFolders).toHaveBeenCalledWith('feed')
  })

  it('should set error on fetch failure', async () => {
    vi.mocked(folderService.getFolders).mockRejectedValue(new Error('fail'))

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useFolders(), { wrapper })

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load folders')
    })
  })

  it('should create a folder and refresh', async () => {
    const folder = createMockFolder({ id: 'f1', name: 'New', type: 'feed' })
    vi.mocked(folderService.createFolder).mockResolvedValue(folder)
    vi.mocked(folderService.getFolders).mockResolvedValue({ folders: [] })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useFolders(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    let created: unknown
    await act(async () => {
      created = await result.current.createFolder({ name: 'New', type: 'feed' })
    })

    expect(created).toEqual(folder)
  })

  it('should update a folder and refresh', async () => {
    const folder = createMockFolder({ id: 'f1', name: 'Updated' })
    vi.mocked(folderService.updateFolder).mockResolvedValue(folder)
    vi.mocked(folderService.getFolders).mockResolvedValue({ folders: [] })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useFolders(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    let updated: unknown
    await act(async () => {
      updated = await result.current.updateFolder('f1', { name: 'Updated' })
    })

    expect(updated).toEqual(folder)
  })

  it('should delete a folder and refresh', async () => {
    vi.mocked(folderService.deleteFolder).mockResolvedValue(undefined)
    vi.mocked(folderService.getFolders).mockResolvedValue({ folders: [] })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useFolders(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    let deleted: unknown
    await act(async () => {
      deleted = await result.current.deleteFolder('f1')
    })

    expect(deleted).toBe(true)
  })

  it('should move a folder and refresh', async () => {
    const folder = createMockFolder({ id: 'f1', parent_id: 'f2' })
    vi.mocked(folderService.moveFolder).mockResolvedValue(folder)
    vi.mocked(folderService.getFolders).mockResolvedValue({ folders: [] })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useFolders(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    let moved: unknown
    await act(async () => {
      moved = await result.current.moveFolder('f1', 'f2')
    })

    expect(moved).toEqual(folder)
    expect(folderService.moveFolder).toHaveBeenCalledWith('f1', { parent_id: 'f2' })
  })
})
