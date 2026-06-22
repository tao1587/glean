import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { SparseSourceGrid } from '@/pages/reader/shared/components/PeriodView/SparseSourceGrid'
import type {
  TodayBoardFeedGroup,
  TodayBoardEntry,
} from '@/pages/reader/shared/todayBoard'

vi.mock('@/pages/reader/shared/components/DigestView/DigestArticleCard', () => ({
  DigestArticleCard: ({
    entry,
    onClick,
    onAction,
    action,
  }: {
    entry: { id: string }
    onClick: () => void
    onAction: () => void
    action: string
  }) => (
    <div data-testid="card" data-action={action}>
      <button data-testid={`open-${entry.id}`} onClick={onClick}>
        {entry.id}
      </button>
      <button data-testid={`action-${entry.id}`} onClick={onAction}>
        act
      </button>
    </div>
  ),
}))

function makeEntry(id: string): TodayBoardEntry {
  return { id, title: `Title ${id}` } as TodayBoardEntry
}

function makeGroup(feedId: string, ids: string[]): TodayBoardFeedGroup {
  return {
    feedId,
    feedTitle: feedId,
    feedDescription: null,
    feedIconUrl: null,
    unreadCount: ids.length,
    totalCount: ids.length,
    entries: ids.map(makeEntry),
    visibleEntries: [],
    isExpanded: false,
    isCollapsible: false,
  }
}

afterEach(cleanup)

describe('SparseSourceGrid', () => {
  it('renders one card per entry across all sparse groups', () => {
    render(
      <SparseSourceGrid
        groups={[makeGroup('a', ['a-1', 'a-2']), makeGroup('b', ['b-1'])]}
        action="hide"
        onOpen={vi.fn()}
        onAction={vi.fn()}
      />,
    )
    expect(screen.getAllByTestId('card')).toHaveLength(3)
  })

  it('renders nothing when there are no sparse groups', () => {
    const { container } = render(
      <SparseSourceGrid groups={[]} action="hide" onOpen={vi.fn()} onAction={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('wires onOpen and onAction to the matching entry', () => {
    const onOpen = vi.fn()
    const onAction = vi.fn()
    render(
      <SparseSourceGrid
        groups={[makeGroup('a', ['a-1'])]}
        action="hide"
        onOpen={onOpen}
        onAction={onAction}
      />,
    )
    fireEvent.click(screen.getByTestId('open-a-1'))
    fireEvent.click(screen.getByTestId('action-a-1'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-1' }))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-1' }))
  })

  it('renders an undoable line for each just-hidden entry', () => {
    const onUndo = vi.fn()
    render(
      <SparseSourceGrid
        groups={[makeGroup('a', ['a-2'])]}
        action="hide"
        justHidden={[makeEntry('a-1')]}
        onOpen={vi.fn()}
        onAction={vi.fn()}
        onUndo={onUndo}
      />,
    )
    fireEvent.click(screen.getByText('撤销'))
    expect(onUndo).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-1' }))
  })

  it('omits the 其余来源 separator when showSeparator is false', () => {
    render(
      <SparseSourceGrid
        groups={[makeGroup('a', ['a-1'])]}
        action="hide"
        showSeparator={false}
        onOpen={vi.fn()}
        onAction={vi.fn()}
      />,
    )
    expect(screen.queryByText('其余来源')).toBeNull()
  })
})
