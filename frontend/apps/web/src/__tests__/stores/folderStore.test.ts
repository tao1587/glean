import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@glean/api-client', () => ({
  folderService: {
    getFolders: vi.fn(),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveFolder: vi.fn(),
    reorderFolders: vi.fn(),
  },
}))

vi.mock('@glean/logger', () => ({
  logger: { error: vi.fn() },
}))

import { useFolderStore } from '@/stores/folderStore'
import { folderService } from '@glean/api-client'
import { createMockFolder, createMockFolderTreeNode } from '../helpers/mockData'

describe('folderStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFolderStore.setState({
      feedFolders: [],
      bookmarkFolders: [],
      loading: false,
      error: null,
    })
  })

  it('should have correct initial state', () => {
    const state = useFolderStore.getState()
    expect(state.feedFolders).toEqual([])
    expect(state.bookmarkFolders).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
  })

  describe('fetchFolders', () => {
    it('should fetch feed folders', async () => {
      const folders = [createMockFolderTreeNode({ id: 'f1', name: 'News', type: 'feed' })]
      vi.mocked(folderService.getFolders).mockResolvedValue({ folders })

      await useFolderStore.getState().fetchFolders('feed')

      expect(useFolderStore.getState().feedFolders).toEqual(folders)
      expect(folderService.getFolders).toHaveBeenCalledWith('feed')
    })

    it('should fetch bookmark folders', async () => {
      const folders = [createMockFolderTreeNode({ id: 'f1', name: 'Reading', type: 'bookmark' })]
      vi.mocked(folderService.getFolders).mockResolvedValue({ folders })

      await useFolderStore.getState().fetchFolders('bookmark')

      expect(useFolderStore.getState().bookmarkFolders).toEqual(folders)
    })

    it('should fetch both types when no type specified', async () => {
      const feedFolders = [createMockFolderTreeNode({ id: 'f1', name: 'Feed', type: 'feed' })]
      const bookmarkFolders = [createMockFolderTreeNode({ id: 'f2', name: 'Bookmark', type: 'bookmark' })]
      vi.mocked(folderService.getFolders)
        .mockResolvedValueOnce({ folders: [] }) // first call (no type)
        .mockResolvedValueOnce({ folders: feedFolders }) // feed call
        .mockResolvedValueOnce({ folders: bookmarkFolders }) // bookmark call

      await useFolderStore.getState().fetchFolders()

      expect(useFolderStore.getState().feedFolders).toEqual(feedFolders)
      expect(useFolderStore.getState().bookmarkFolders).toEqual(bookmarkFolders)
    })

    it('should set error on failure', async () => {
      vi.mocked(folderService.getFolders).mockRejectedValue(new Error('fail'))

      await useFolderStore.getState().fetchFolders('feed')

      expect(useFolderStore.getState().error).toBe('Failed to load folders')
      expect(useFolderStore.getState().loading).toBe(false)
    })
  })

  describe('createFolder', () => {
    it('should create a folder and refresh', async () => {
      const folder = createMockFolder({ id: 'f1', name: 'New Folder', type: 'feed' })
      vi.mocked(folderService.createFolder).mockResolvedValue(folder)
      vi.mocked(folderService.getFolders).mockResolvedValue({ folders: [] })

      const result = await useFolderStore.getState().createFolder({ name: 'New Folder', type: 'feed' })

      expect(result).toEqual(folder)
      expect(folderService.createFolder).toHaveBeenCalledWith({ name: 'New Folder', type: 'feed' })
    })

    it('should return null on failure', async () => {
      vi.mocked(folderService.createFolder).mockRejectedValue(new Error('fail'))

      const result = await useFolderStore.getState().createFolder({ name: 'New', type: 'feed' })

      expect(result).toBeNull()
      expect(useFolderStore.getState().error).toBe('Failed to create folder')
    })
  })

  describe('updateFolder', () => {
    it('should update a folder and refresh all', async () => {
      const folder = createMockFolder({ id: 'f1', name: 'Updated' })
      vi.mocked(folderService.updateFolder).mockResolvedValue(folder)
      vi.mocked(folderService.getFolders)
        .mockResolvedValueOnce({ folders: [] }) // no type
        .mockResolvedValueOnce({ folders: [] }) // feed
        .mockResolvedValueOnce({ folders: [] }) // bookmark

      const result = await useFolderStore.getState().updateFolder('f1', 'Updated')

      expect(result).toEqual(folder)
      expect(folderService.updateFolder).toHaveBeenCalledWith('f1', { name: 'Updated' })
    })

    it('should return null on failure', async () => {
      vi.mocked(folderService.updateFolder).mockRejectedValue(new Error('fail'))

      const result = await useFolderStore.getState().updateFolder('f1', 'Updated')

      expect(result).toBeNull()
    })
  })

  describe('deleteFolder', () => {
    it('should delete a folder and refresh', async () => {
      vi.mocked(folderService.deleteFolder).mockResolvedValue(undefined)
      vi.mocked(folderService.getFolders)
        .mockResolvedValueOnce({ folders: [] })
        .mockResolvedValueOnce({ folders: [] })
        .mockResolvedValueOnce({ folders: [] })

      const result = await useFolderStore.getState().deleteFolder('f1')

      expect(result).toBe(true)
      expect(folderService.deleteFolder).toHaveBeenCalledWith('f1')
    })

    it('should return false on failure', async () => {
      vi.mocked(folderService.deleteFolder).mockRejectedValue(new Error('fail'))

      const result = await useFolderStore.getState().deleteFolder('f1')

      expect(result).toBe(false)
    })
  })

  describe('moveFolder', () => {
    it('should move a folder and refresh', async () => {
      const folder = createMockFolder({ id: 'f1', parent_id: 'f2' })
      vi.mocked(folderService.moveFolder).mockResolvedValue(folder)
      vi.mocked(folderService.getFolders)
        .mockResolvedValueOnce({ folders: [] })
        .mockResolvedValueOnce({ folders: [] })
        .mockResolvedValueOnce({ folders: [] })

      const result = await useFolderStore.getState().moveFolder('f1', 'f2')

      expect(result).toEqual(folder)
      expect(folderService.moveFolder).toHaveBeenCalledWith('f1', { parent_id: 'f2' })
    })

    it('should return null on failure', async () => {
      vi.mocked(folderService.moveFolder).mockRejectedValue(new Error('fail'))

      const result = await useFolderStore.getState().moveFolder('f1', 'f2')

      expect(result).toBeNull()
    })
  })

  describe('reorderFolders', () => {
    it('should reorder folders and refresh', async () => {
      vi.mocked(folderService.reorderFolders).mockResolvedValue(undefined)
      vi.mocked(folderService.getFolders)
        .mockResolvedValueOnce({ folders: [] })
        .mockResolvedValueOnce({ folders: [] })
        .mockResolvedValueOnce({ folders: [] })

      await useFolderStore.getState().reorderFolders([
        { id: 'f1', position: 0 },
        { id: 'f2', position: 1 },
      ])

      expect(folderService.reorderFolders).toHaveBeenCalledWith({
        orders: [{ id: 'f1', position: 0 }, { id: 'f2', position: 1 }],
      })
    })
  })

  describe('reset', () => {
    it('should reset to initial state', () => {
      useFolderStore.setState({
        feedFolders: [createMockFolderTreeNode({ id: 'f1', name: 'A', type: 'feed' })],
        bookmarkFolders: [createMockFolderTreeNode({ id: 'f2', name: 'B', type: 'bookmark' })],
        loading: true,
        error: 'some error',
      })

      useFolderStore.getState().reset()

      const state = useFolderStore.getState()
      expect(state.feedFolders).toEqual([])
      expect(state.bookmarkFolders).toEqual([])
      expect(state.loading).toBe(false)
      expect(state.error).toBeNull()
    })
  })
})
