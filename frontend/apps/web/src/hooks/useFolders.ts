import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { folderService } from '@glean/api-client'
import { logger } from '@glean/logger'
import type {
  FolderTreeNode,
  FolderType,
  CreateFolderRequest,
  UpdateFolderRequest,
  Folder,
} from '@glean/types'

/**
 * Query key factory for folder tree queries.
 */
export const folderKeys = {
  all: ['folders'] as const,
  tree: (type?: FolderType) => [...folderKeys.all, 'tree', type] as const,
}

export function useFolders(type?: FolderType) {
  const queryClient = useQueryClient()

  const {
    data: folders = [] as FolderTreeNode[],
    isFetching: loading,
    error: queryError,
    refetch: fetchFolders,
  } = useQuery({
    queryKey: folderKeys.tree(type),
    queryFn: async (): Promise<FolderTreeNode[]> => {
      const response = await folderService.getFolders(type)
      return response.folders
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  const error = queryError ? 'Failed to load folders' : null

  const invalidateFolders = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: folderKeys.tree(type) })
  }, [queryClient, type])

  const createFolder = useCallback(
    async (data: CreateFolderRequest): Promise<Folder | null> => {
      try {
        const folder = await folderService.createFolder(data)
        invalidateFolders()
        return folder
      } catch (err) {
        logger.error('Failed to create folder:', err)
        return null
      }
    },
    [invalidateFolders]
  )

  const updateFolder = useCallback(
    async (folderId: string, data: UpdateFolderRequest): Promise<Folder | null> => {
      try {
        const folder = await folderService.updateFolder(folderId, data)
        invalidateFolders()
        return folder
      } catch (err) {
        logger.error('Failed to update folder:', err)
        return null
      }
    },
    [invalidateFolders]
  )

  const deleteFolder = useCallback(
    async (folderId: string): Promise<boolean> => {
      try {
        await folderService.deleteFolder(folderId)
        invalidateFolders()
        return true
      } catch (err) {
        logger.error('Failed to delete folder:', err)
        return false
      }
    },
    [invalidateFolders]
  )

  const moveFolder = useCallback(
    async (folderId: string, parentId: string | null): Promise<Folder | null> => {
      try {
        const folder = await folderService.moveFolder(folderId, { parent_id: parentId })
        invalidateFolders()
        return folder
      } catch (err) {
        logger.error('Failed to move folder:', err)
        return null
      }
    },
    [invalidateFolders]
  )

  return {
    folders,
    loading,
    error,
    fetchFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    moveFolder,
  }
}
