import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SourceSection } from '@/pages/reader/shared/components/PeriodView/SourceSection'

afterEach(() => cleanup())

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const makeEntry = (id: string, title: string) => ({
  id,
  title,
  summary: '',
  published_at: null,
  feed_id: 'f1',
  feed_title: 'X',
  feed_icon_url: null,
  is_read: false,
  effective_timestamp: new Date(),
  collection_timestamp: new Date(),
  feed_description: null,
} as never)

const makeGroup = (entries: ReturnType<typeof makeEntry>[]) => ({
  feedId: 'f1',
  feedTitle: 'X',
  feedDescription: null,
  feedIconUrl: null,
  unreadCount: entries.length,
  totalCount: entries.length,
  isExpanded: true,
  isCollapsible: false,
  visibleEntries: entries,
  entries,
} as never)

it("action='hide' → clicking the 隐藏 button calls onAction with the entry", () => {
  const onAction = vi.fn()
  render(
    <SourceSection
      group={makeGroup([makeEntry('e1', 'Hello')])}
      action="hide"
      onOpen={() => {}}
      onAction={onAction}
    />,
    { wrapper }
  )
  fireEvent.click(screen.getByLabelText('隐藏'))
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }))
})

it("action='restore' → clicking 恢复 calls onAction", () => {
  const onAction = vi.fn()
  render(
    <SourceSection
      group={makeGroup([makeEntry('e1', 'Hello')])}
      action="restore"
      onOpen={() => {}}
      onAction={onAction}
    />,
    { wrapper }
  )
  fireEvent.click(screen.getByText('恢复'))
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }))
})

it('expand: 8-entry group shows 5, reveals +5 per click, and 收起 collapses back', () => {
  const entries = Array.from({ length: 8 }, (_, i) => makeEntry(`e${i + 1}`, `Article ${i + 1}`))
  render(
    <SourceSection
      group={makeGroup(entries)}
      action="none"
      onOpen={() => {}}
      onAction={() => {}}
    />,
    { wrapper }
  )

  // First 5 visible, 6+ hidden
  expect(screen.getByText('Article 5')).toBeInTheDocument()
  expect(screen.queryByText('Article 6')).not.toBeInTheDocument()

  // Reveal 5 more (capped at the remaining 3 → all 8)
  fireEvent.click(screen.getByText('展开更多 · 还有 3 条'))
  expect(screen.getByText('Article 8')).toBeInTheDocument()

  // 收起 collapses back to 5
  fireEvent.click(screen.getByText('收起'))
  expect(screen.queryByText('Article 6')).not.toBeInTheDocument()
})
