import type { FolderOrderItem, FolderTreeNode } from '@glean/types'

export type FolderDropPlacement = 'before' | 'after'

export function buildSiblingFolderOrders(
  siblings: FolderTreeNode[],
  draggedFolderId: string,
  targetFolderId: string,
  placement: FolderDropPlacement
): FolderOrderItem[] {
  const orderedSiblings = [...siblings].sort((left, right) => left.position - right.position)
  const draggedIndex = orderedSiblings.findIndex((folder) => folder.id === draggedFolderId)
  const targetIndex = orderedSiblings.findIndex((folder) => folder.id === targetFolderId)

  if (draggedIndex === -1 || targetIndex === -1) {
    return []
  }

  const nextOrder = [...orderedSiblings]
  const [draggedFolder] = nextOrder.splice(draggedIndex, 1)
  let insertionIndex = nextOrder.findIndex((folder) => folder.id === targetFolderId)

  if (insertionIndex === -1) {
    return []
  }

  if (placement === 'after') {
    insertionIndex += 1
  }

  nextOrder.splice(insertionIndex, 0, draggedFolder)

  const hasChanged = nextOrder.some((folder, index) => folder.id !== orderedSiblings[index]?.id)
  if (!hasChanged) {
    return []
  }

  return nextOrder.map((folder, index) => ({ id: folder.id, position: index }))
}

export function getFolderDropPlacement(
  rect: Pick<DOMRect, 'top' | 'height'>,
  clientY: number
): FolderDropPlacement {
  return clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

export function isFolderDropAreaActive({
  dragOverFolderId,
  folderId,
  draggedFeedFolderId,
  draggedFolderId,
}: {
  dragOverFolderId: string | null
  folderId: string
  draggedFeedFolderId: string | null
  draggedFolderId: string | null
}): boolean {
  return (
    dragOverFolderId === folderId &&
    draggedFolderId === null &&
    draggedFeedFolderId !== folderId
  )
}
