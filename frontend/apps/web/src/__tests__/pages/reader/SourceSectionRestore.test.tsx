import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SourceSection } from '@/pages/reader/shared/components/PeriodView/SourceSection'

vi.mock('@/hooks/useRangeEntries', () => ({
  useRangeReadEntries: () => ({ entries: [] }),
  useRangeHiddenEntries: () => ({
    entries: [{ id: 'h1', title: 'Hidden one', feed_id: 'f1' }],
  }),
}))

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>
  )

const baseGroup = {
  feedId: 'f1',
  feedTitle: 'TechCrunch',
  feedDescription: null,
  feedIconUrl: null,
  unreadCount: 0,
  totalCount: 0,
  isExpanded: true,
  isCollapsible: false,
  visibleEntries: [],
  entries: [],
}

it('clicking 隐藏的 toggle reveals hidden entries and 恢复 calls onRestore', () => {
  const onRestore = vi.fn()
  wrap(
    <SourceSection
      group={baseGroup as never}
      period="week"
      anchorDate="2026-06-17"
      justHidden={[]}
      onOpen={vi.fn()}
      onHide={vi.fn()}
      onUndo={vi.fn()}
      onToggleSave={vi.fn()}
      onRestore={onRestore}
    />
  )

  // Toggle should be visible
  fireEvent.click(screen.getByText('隐藏的'))

  // Hidden entry title appears
  expect(screen.getByText('Hidden one')).toBeInTheDocument()

  // Click restore
  fireEvent.click(screen.getByText('恢复'))
  expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1' }))
})
