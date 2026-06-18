import { describe, expect, it } from 'vitest'
import { createMockFolderTreeNode } from '@/__tests__/helpers/mockData'
import {
  buildSiblingFolderOrders,
  getFolderDropPlacement,
  isFolderDropAreaActive,
} from './SidebarFeedsSection.dnd'

describe('SidebarFeedsSection drag helpers', () => {
  describe('buildSiblingFolderOrders', () => {
    it('moves a folder before a sibling within the same level', () => {
      const siblings = [
        createMockFolderTreeNode({ id: 'folder-a', position: 0 }),
        createMockFolderTreeNode({ id: 'folder-b', position: 1 }),
        createMockFolderTreeNode({ id: 'folder-c', position: 2 }),
      ]

      expect(buildSiblingFolderOrders(siblings, 'folder-c', 'folder-a', 'before')).toEqual([
        { id: 'folder-c', position: 0 },
        { id: 'folder-a', position: 1 },
        { id: 'folder-b', position: 2 },
      ])
    })

    it('moves a folder after a sibling within the same level', () => {
      const siblings = [
        createMockFolderTreeNode({ id: 'folder-a', position: 0 }),
        createMockFolderTreeNode({ id: 'folder-b', position: 1 }),
        createMockFolderTreeNode({ id: 'folder-c', position: 2 }),
      ]

      expect(buildSiblingFolderOrders(siblings, 'folder-a', 'folder-b', 'after')).toEqual([
        { id: 'folder-b', position: 0 },
        { id: 'folder-a', position: 1 },
        { id: 'folder-c', position: 2 },
      ])
    })

    it('returns an empty list when the drop does not change order', () => {
      const siblings = [
        createMockFolderTreeNode({ id: 'folder-a', position: 0 }),
        createMockFolderTreeNode({ id: 'folder-b', position: 1 }),
      ]

      expect(buildSiblingFolderOrders(siblings, 'folder-a', 'folder-b', 'before')).toEqual([])
    })
  })

  describe('getFolderDropPlacement', () => {
    it('treats upper half as before and lower half as after', () => {
      expect(getFolderDropPlacement({ top: 100, height: 40 }, 110)).toBe('before')
      expect(getFolderDropPlacement({ top: 100, height: 40 }, 130)).toBe('after')
    })
  })

  describe('isFolderDropAreaActive', () => {
    it('activates the folder content area for feed drops on the same folder', () => {
      expect(
        isFolderDropAreaActive({
          dragOverFolderId: 'folder-a',
          folderId: 'folder-a',
          draggedFeedFolderId: null,
          draggedFolderId: null,
        })
      ).toBe(true)
    })

    it('does not activate when dragging a feed into its current folder', () => {
      expect(
        isFolderDropAreaActive({
          dragOverFolderId: 'folder-a',
          folderId: 'folder-a',
          draggedFeedFolderId: 'folder-a',
          draggedFolderId: null,
        })
      ).toBe(false)
    })
  })
})
