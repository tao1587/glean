import { afterEach, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SourceSection } from '@/pages/reader/shared/components/PeriodView/SourceSection'

afterEach(() => cleanup())

// Mock @glean/i18n so tests don't depend on real translation files and
// produce predictable button labels for section.viewAll / section.collapseViewAll.
beforeEach(() => {
  vi.mock('@glean/i18n', () => ({
    useTranslation: () => ({
      t: (key: string, opts?: { count?: number }) => {
        if (key === 'section.viewAll') return `viewAll:${opts?.count ?? ''}`
        if (key === 'section.collapseViewAll') return 'collapseViewAll'
        return key
      },
    }),
  }))
})

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

it('expand: 8-entry group shows 5 by default, view-all reveals all 8, collapse returns to 5', () => {
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

  // "view all" button shows total count (8)
  const viewAllBtn = screen.getByText('viewAll:8')
  expect(viewAllBtn).toBeInTheDocument()

  // Click to expand → all 8 visible
  fireEvent.click(viewAllBtn)
  expect(screen.getByText('Article 8')).toBeInTheDocument()
  expect(screen.queryByText('viewAll:8')).not.toBeInTheDocument()

  // Collapse button is now shown
  const collapseBtn = screen.getByText('collapseViewAll')
  expect(collapseBtn).toBeInTheDocument()

  // Click collapse → back to 5
  fireEvent.click(collapseBtn)
  expect(screen.queryByText('Article 6')).not.toBeInTheDocument()
  expect(screen.getByText('Article 5')).toBeInTheDocument()
})
