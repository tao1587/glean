/**
 * System service for system-level API endpoints.
 */

import type { ApiClient } from '../client'
import type { AIIntegrationStatusResponse, SystemTimeResponse } from '@glean/types'

export interface VectorizationStatus {
  enabled: boolean
  status: 'disabled' | 'idle' | 'validating' | 'rebuilding' | 'error'
  has_error: boolean
  error_message: string | null
  rebuild_progress?: {
    total: number
    pending: number
    processing: number
    done: number
    failed: number
  } | null
}

export class SystemService {
  constructor(private readonly client: ApiClient) {}

  /**
   * Get vectorization system status.
   */
  async getVectorizationStatus(): Promise<VectorizationStatus> {
    return this.client.get<VectorizationStatus>('/system/vectorization-status')
  }

  /**
   * Get non-sensitive local AI integration status.
   */
  async getAIIntegrationStatus(): Promise<AIIntegrationStatusResponse> {
    return this.client.get<AIIntegrationStatusResponse>('/system/ai-integration')
  }

  /**
   * Get server-configured time metadata.
   */
  async getSystemTime(): Promise<SystemTimeResponse> {
    return this.client.get<SystemTimeResponse>('/system/time')
  }
}
