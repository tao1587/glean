import type {
  APITokenCreateResponse,
  APITokenListResponse,
  CreateAPITokenRequest,
} from '@glean/types'
import { ApiClient } from '../client'

/**
 * API Tokens service.
 *
 * Handles API token CRUD operations for MCP authentication.
 */
export class APITokenService {
  constructor(private client: ApiClient) {}

  /**
   * Get all API tokens for the current user.
   */
  async getTokens(): Promise<APITokenListResponse> {
    return this.client.get<APITokenListResponse>('/tokens')
  }

  /**
   * Create a new API token.
   * The plain token is only returned once during creation.
   */
  async createToken(data: CreateAPITokenRequest): Promise<APITokenCreateResponse> {
    return this.client.post<APITokenCreateResponse>('/tokens', data)
  }

  /**
   * Revoke (delete) an API token.
   */
  async revokeToken(tokenId: string): Promise<void> {
    await this.client.delete(`/tokens/${tokenId}`)
  }
}
