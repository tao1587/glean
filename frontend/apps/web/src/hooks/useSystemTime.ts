import { useQuery } from '@tanstack/react-query'
import { systemService } from '@glean/api-client'
import type { SystemTimeResponse } from '@glean/types'

export const systemTimeKeys = {
  all: ['system-time'] as const,
}

export function useSystemTime() {
  return useQuery<SystemTimeResponse>({
    queryKey: systemTimeKeys.all,
    queryFn: () => systemService.getSystemTime(),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  })
}
