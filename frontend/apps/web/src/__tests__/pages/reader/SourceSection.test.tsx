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

it('collapse: 8-entry group with action=none shows only 6, then all 8 after expand', () => {
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

  // First 6 visible
  expect(screen.getByText('Article 1')).toBeInTheDocument()
  expect(screen.getByText('Article 6')).toBeInTheDocument()
  // 7 and 8 hidden
  expect(screen.queryByText('Article 7')).not.toBeInTheDocument()
  expect(screen.queryByText('Article 8')).not.toBeInTheDocument()

  // Expand button present and correct label
  fireEvent.click(screen.getByText('展开全部 8 条'))

  // Now all 8 visible
  expect(screen.getByText('Article 7')).toBeInTheDocument()
  expect(screen.getByText('Article 8')).toBeInTheDocument()
})
