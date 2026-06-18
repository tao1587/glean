import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FolderService } from '../../services/folders'
import { createMockClient } from '../helpers'

describe('FolderService', () => {
  let service: FolderService
  let mockClient: ReturnType<typeof createMockClient>

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockClient()
    service = new FolderService(mockClient)
  })

  it('should get folders without type', async () => {
    const response = { folders: [] }
    vi.mocked(mockClient.get).mockResolvedValue(response)

    const result = await service.getFolders()

    expect(mockClient.get).toHaveBeenCalledWith('/folders')
    expect(result).toEqual(response)
  })

  it('should get folders with feed type', async () => {
    const response = { folders: [{ id: 'f1', name: 'News' }] }
    vi.mocked(mockClient.get).mockResolvedValue(response)

    const result = await service.getFolders('feed')

    expect(mockClient.get).toHaveBeenCalledWith('/folders?type=feed')
    expect(result).toEqual(response)
  })

  it('should get folders with bookmark type', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ folders: [] })

    await service.getFolders('bookmark')

    expect(mockClient.get).toHaveBeenCalledWith('/folders?type=bookmark')
  })

  it('should get a specific folder', async () => {
    const folder = { id: 'f1', name: 'News' }
    vi.mocked(mockClient.get).mockResolvedValue(folder)

    const result = await service.getFolder('f1')

    expect(mockClient.get).toHaveBeenCalledWith('/folders/f1')
    expect(result).toEqual(folder)
  })

  it('should create a folder', async () => {
    const folder = { id: 'f1', name: 'New Folder' }
    vi.mocked(mockClient.post).mockResolvedValue(folder)

    const result = await service.createFolder({ name: 'New Folder', type: 'feed' })

    expect(mockClient.post).toHaveBeenCalledWith('/folders', { name: 'New Folder', type: 'feed' })
    expect(result).toEqual(folder)
  })

  it('should update a folder', async () => {
    const folder = { id: 'f1', name: 'Updated' }
    vi.mocked(mockClient.patch).mockResolvedValue(folder)

    const result = await service.updateFolder('f1', { name: 'Updated' })

    expect(mockClient.patch).toHaveBeenCalledWith('/folders/f1', { name: 'Updated' })
    expect(result).toEqual(folder)
  })

  it('should delete a folder', async () => {
    vi.mocked(mockClient.delete).mockResolvedValue(undefined)

    await service.deleteFolder('f1')

    expect(mockClient.delete).toHaveBeenCalledWith('/folders/f1')
  })

  it('should move a folder', async () => {
    const folder = { id: 'f1', parent_id: 'f2' }
    vi.mocked(mockClient.post).mockResolvedValue(folder)

    const result = await service.moveFolder('f1', { parent_id: 'f2' })

    expect(mockClient.post).toHaveBeenCalledWith('/folders/f1/move', { parent_id: 'f2' })
    expect(result).toEqual(folder)
  })

  it('should reorder folders', async () => {
    vi.mocked(mockClient.post).mockResolvedValue(undefined)

    await service.reorderFolders({ orders: [{ id: 'f1', position: 0 }, { id: 'f2', position: 1 }] })

    expect(mockClient.post).toHaveBeenCalledWith('/folders/reorder', {
      orders: [{ id: 'f1', position: 0 }, { id: 'f2', position: 1 }],
    })
  })
})
