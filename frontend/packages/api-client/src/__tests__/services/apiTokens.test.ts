import { describe, it, expect, vi, beforeEach } from 'vitest'
import { APITokenService } from '../../services/apiTokens'
import { createMockClient } from '../helpers'

describe('APITokenService', () => {
  let service: APITokenService
  let mockClient: ReturnType<typeof createMockClient>

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockClient()
    service = new APITokenService(mockClient)
  })

  it('should get all tokens', async () => {
    const response = { tokens: [{ id: 't1', name: 'Test Token' }] }
    vi.mocked(mockClient.get).mockResolvedValue(response)

    const result = await service.getTokens()

    expect(mockClient.get).toHaveBeenCalledWith('/tokens')
    expect(result).toEqual(response)
  })

  it('should create a token', async () => {
    const response = { token: { id: 't1', name: 'New' }, plain_token: 'glean_abc123' }
    vi.mocked(mockClient.post).mockResolvedValue(response)

    const result = await service.createToken({ name: 'New' })

    expect(mockClient.post).toHaveBeenCalledWith('/tokens', { name: 'New' })
    expect(result).toEqual(response)
  })

  it('should revoke a token', async () => {
    vi.mocked(mockClient.delete).mockResolvedValue(undefined)

    await service.revokeToken('t1')

    expect(mockClient.delete).toHaveBeenCalledWith('/tokens/t1')
  })
})
