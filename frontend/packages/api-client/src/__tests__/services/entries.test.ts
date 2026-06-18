import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EntryService } from '../../services/entries'
import { createMockClient } from '../helpers'

describe('EntryService', () => {
  let service: EntryService
  let mockClient: ReturnType<typeof createMockClient>

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockClient()
    service = new EntryService(mockClient)
  })

  it('should get entries without params', async () => {
    const response = { items: [], total: 0, page: 1, total_pages: 0 }
    vi.mocked(mockClient.get).mockResolvedValue(response)

    const result = await service.getEntries()

    expect(mockClient.get).toHaveBeenCalledWith('/entries', { params: undefined, signal: undefined })
    expect(result).toEqual(response)
  })

  it('should get entries with filters', async () => {
    const response = { items: [{ id: '1' }], total: 1, page: 1, total_pages: 1 }
    vi.mocked(mockClient.get).mockResolvedValue(response)

    const params = { feed_id: 'f1', is_read: false, page: 1, per_page: 20 }
    const result = await service.getEntries(params)

    expect(mockClient.get).toHaveBeenCalledWith('/entries', { params, signal: undefined })
    expect(result).toEqual(response)
  })

  it('should get entries with today-board view', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ items: [], total: 0, page: 1, total_pages: 0 })

    await service.getEntries({ view: 'today-board' })

    expect(mockClient.get).toHaveBeenCalledWith('/entries', {
      params: { view: 'today-board' },
      signal: undefined,
    })
  })

  it('should get today entries with a server date key', async () => {
    const response = { items: [], total: 0, page: 1, total_pages: 1, per_page: 500 }
    vi.mocked(mockClient.get).mockResolvedValue(response)

    const result = await service.getTodayEntries({ date: '2026-04-10', limit: 500 })

    expect(mockClient.get).toHaveBeenCalledWith('/entries/today', {
      params: { date: '2026-04-10', limit: 500 },
      signal: undefined,
    })
    expect(result).toEqual(response)
  })

  it('should get a single entry', async () => {
    const entry = { id: 'e1', title: 'Test Entry' }
    vi.mocked(mockClient.get).mockResolvedValue(entry)

    const result = await service.getEntry('e1')

    expect(mockClient.get).toHaveBeenCalledWith('/entries/e1', { signal: undefined })
    expect(result).toEqual(entry)
  })

  it('should update entry state', async () => {
    const updated = { id: 'e1', is_read: true }
    vi.mocked(mockClient.patch).mockResolvedValue(updated)

    const result = await service.updateEntryState('e1', { is_read: true })

    expect(mockClient.patch).toHaveBeenCalledWith('/entries/e1', { is_read: true })
    expect(result).toEqual(updated)
  })

  it('should mark all read without filters', async () => {
    vi.mocked(mockClient.post).mockResolvedValue({ message: 'ok' })

    await service.markAllRead()

    expect(mockClient.post).toHaveBeenCalledWith('/entries/mark-all-read', {
      feed_id: undefined,
      folder_id: undefined,
    })
  })

  it('should mark all read with feedId', async () => {
    vi.mocked(mockClient.post).mockResolvedValue({ message: 'ok' })

    await service.markAllRead('f1')

    expect(mockClient.post).toHaveBeenCalledWith('/entries/mark-all-read', {
      feed_id: 'f1',
      folder_id: undefined,
    })
  })

})
