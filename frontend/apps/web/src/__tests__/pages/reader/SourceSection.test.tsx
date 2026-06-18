import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SourceSection } from '@/pages/reader/shared/components/PeriodView/SourceSection'

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

const baseGroup = {
  feedId: 'f1', feedTitle: 'TechCrunch', feedDescription: null, feedIconUrl: null,
  unreadCount: 1, totalCount: 1, isExpanded: true, isCollapsible: false,
  visibleEntries: [{ id: 'e1', title: 'Hello', summary: '', read_later: false, effective_timestamp: new Date(), feed_id: 'f1' }],
  entries: [],
}
const range = { collected_after: 'X', collected_before: 'Y' }

afterEach(() => cleanup())

it('Hide calls onHide', () => {
  const onHide = vi.fn()
  wrap(<SourceSection group={baseGroup as never} range={range} justHidden={[]}
    onOpen={() => {}} onHide={onHide} onUndo={() => {}} onToggleSave={() => {}} />)
  fireEvent.click(screen.getByLabelText('不感兴趣'))
  expect(onHide).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }))
})

it('renders an undo line for a just-hidden entry', () => {
  wrap(<SourceSection group={{ ...baseGroup, visibleEntries: [] } as never} range={range}
    justHidden={[{ id: 'e1', title: 'Hello' } as never]}
    onOpen={() => {}} onHide={() => {}} onUndo={() => {}} onToggleSave={() => {}} />)
  expect(screen.getByText(/Hello/)).toBeInTheDocument()
  expect(screen.getByText('撤销')).toBeInTheDocument()
})
