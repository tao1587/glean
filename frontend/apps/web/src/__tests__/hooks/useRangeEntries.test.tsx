import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { entryService } from '@glean/api-client'
import { useRangeEntries } from '@/hooks/useRangeEntries'

vi.mock('@glean/api-client', () => ({ entryService: { getEntries: vi.fn() } }))

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  ;(entryService.getEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
    items: [{ id: 'a' }], total: 1, page: 1, per_page: 50, total_pages: 1,
  })
})

it('fetches unread non-hidden entries for the period', async () => {
  const { result } = renderHook(
    () => useRangeEntries({ period: 'week', anchorDate: '2026-06-17', enabled: true }),
    { wrapper }
  )
  await waitFor(() => expect(result.current.entries.length).toBe(1))
  expect(entryService.getEntries).toHaveBeenCalledWith(
    expect.objectContaining({ is_read: false, is_hidden: false, period: 'week', period_anchor: '2026-06-17' }),
    expect.anything()
  )
})
