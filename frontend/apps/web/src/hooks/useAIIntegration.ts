import { useQuery } from '@tanstack/react-query'
import { systemService } from '@glean/api-client'
import type { AIIntegrationStatusResponse } from '@glean/types'

export const AI_INTEGRATION_STATUS_KEY = ['ai-integration-status']

export function useAIIntegrationStatus() {
  return useQuery<AIIntegrationStatusResponse>({
    queryKey: AI_INTEGRATION_STATUS_KEY,
    queryFn: () => systemService.getAIIntegrationStatus(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}
