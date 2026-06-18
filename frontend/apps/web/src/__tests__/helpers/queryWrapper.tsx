import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Create a wrapper with a fresh QueryClient for testing TanStack Query hooks.
 */
export function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return { wrapper: Wrapper, queryClient }
}
