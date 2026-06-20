import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SourceSection } from '@/pages/reader/shared/components/PeriodView/SourceSection'

afterEach(() => cleanup())

const makeEntry = (id: string, title: string) => ({
  id,
  title,
  summary: '',
  effective_timestamp: new Date(),
  feed_id: 'f1',
  read_later: false,
})

const baseGroup = {
  feedId: 'f1',
  feedTitle: 'X',
  feedDescription: null,
  feedIconUrl: null,
  unreadCount: 1,
  totalCount: 1,
  isExpanded: true,
  isCollapsible: false,
  visibleEntries: [makeEntry('e1', 'Hello')],
  entries: [makeEntry('e1', 'Hello')],
} as never

it("action='hide' → clicking the 隐藏 button calls onAction with the entry", () => {
  const onAction = vi.fn()
  render(
    <SourceSection
      group={baseGroup}
      action="hide"
      onOpen={() => {}}
      onAction={onAction}
    />
  )
  fireEvent.click(screen.getByLabelText('隐藏'))
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }))
})

it("action='restore' → clicking 恢复 calls onAction", () => {
  const onAction = vi.fn()
  render(
    <SourceSection
      group={baseGroup}
      action="restore"
      onOpen={() => {}}
      onAction={onAction}
    />
  )
  fireEvent.click(screen.getByText('恢复'))
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }))
})

it('collapse: 6-entry group with action=none shows only 4, then all 6 after expand', () => {
  const entries = Array.from({ length: 6 }, (_, i) => makeEntry(`e${i + 1}`, `Article ${i + 1}`))
  const group = {
    feedId: 'f1',
    feedTitle: 'X',
    feedDescription: null,
    feedIconUrl: null,
    unreadCount: 6,
    totalCount: 6,
    isExpanded: true,
    isCollapsible: false,
    visibleEntries: entries,
    entries,
  } as never

  render(
    <SourceSection
      group={group}
      action="none"
      onOpen={() => {}}
      onAction={() => {}}
    />
  )

  // Only first 4 titles visible initially
  expect(screen.getByText('Article 1')).toBeInTheDocument()
  expect(screen.getByText('Article 4')).toBeInTheDocument()
  expect(screen.queryByText('Article 5')).not.toBeInTheDocument()
  expect(screen.queryByText('Article 6')).not.toBeInTheDocument()

  // Expand button present
  fireEvent.click(screen.getByText('展开全部 6 条'))

  // Now all 6 visible
  expect(screen.getByText('Article 5')).toBeInTheDocument()
  expect(screen.getByText('Article 6')).toBeInTheDocument()
})
