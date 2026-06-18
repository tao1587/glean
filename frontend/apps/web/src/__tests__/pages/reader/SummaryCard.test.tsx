import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SummaryView } from '@glean/types'
import type { SummaryUIState } from '@/hooks/useSummary'
import { SummaryCard } from '@/pages/reader/shared/components/SummaryCard'

interface TestEntry {
  id: string
  title: string
}

function makeEntry(overrides: Partial<TestEntry> = {}): TestEntry {
  return {
    id: overrides.id ?? 'entry-1',
    title: overrides.title ?? 'Test Entry Title',
  }
}

function makeSummary(overrides: Partial<SummaryView> = {}): SummaryView {
  return {
    period: 'day',
    period_start: '2026-06-13',
    period_end: '2026-06-13',
    status: 'done',
    title: overrides.title ?? 'Daily Summary Title',
    summary: overrides.summary ?? 'This is the narrative text.',
    topics: overrides.topics ?? [{ name: 'Topic A', entry_ids: ['entry-1'] }],
    highlights: overrides.highlights ?? [],
    recommended_entry_ids: overrides.recommended_entry_ids ?? ['entry-1'],
    model: 'gpt-4',
    generated_at: '2026-06-13T10:00:00Z',
    source_set_hash: 'abc123',
    source_count: 3,
    error_code: overrides.error_code ?? null,
    error_message: overrides.error_message ?? null,
    ...overrides,
  }
}

afterEach(cleanup)

const defaultProps = {
  summary: null as SummaryView | null,
  state: 'loading' as SummaryUIState,
  isStale: false,
  entriesById: new Map<string, TestEntry>(),
  onSelectEntry: vi.fn(),
  onRetry: vi.fn(),
}

describe('SummaryCard', () => {
  it('renders the outer section with data-testid and data-state', () => {
    render(<SummaryCard {...defaultProps} state="loading" />)
    const card = screen.getByTestId('summary-card')
    expect(card).toBeTruthy()
    expect(card.getAttribute('data-state')).toBe('loading')
  })

  describe('state: ready', () => {
    it('renders title, narrative, topic, and recommended entry button', () => {
      const entry = makeEntry({ id: 'entry-1', title: 'My Article' })
      const summary = makeSummary({
        title: 'My Daily Title',
        summary: 'Narrative paragraph here.',
        topics: [{ name: 'Topic Alpha', entry_ids: ['entry-1'] }],
        recommended_entry_ids: ['entry-1'],
      })
      const entriesById = new Map([['entry-1', entry]])
      const onSelectEntry = vi.fn()

      render(
        <SummaryCard
          {...defaultProps}
          state="ready"
          summary={summary}
          entriesById={entriesById}
          onSelectEntry={onSelectEntry}
        />
      )

      expect(screen.getByText('My Daily Title')).toBeTruthy()
      expect(screen.getByText('Narrative paragraph here.')).toBeTruthy()
      expect(screen.getByText(/Topic Alpha/)).toBeTruthy()

      const btn = screen.getByRole('button', { name: 'My Article' })
      expect(btn).toBeTruthy()
      fireEvent.click(btn)
      expect(onSelectEntry).toHaveBeenCalledWith(entry)
    })

    it('falls back to entry id when entry not in entriesById', () => {
      const summary = makeSummary({ recommended_entry_ids: ['unknown-id'] })
      render(
        <SummaryCard
          {...defaultProps}
          state="ready"
          summary={summary}
          entriesById={new Map()}
          onSelectEntry={vi.fn()}
        />
      )
      const btn = screen.getByRole('button', { name: 'unknown-id' })
      expect(btn).toBeTruthy()
      expect(btn).toBeDisabled()
    })

    it('shows stale hint when isStale is true', () => {
      const summary = makeSummary()
      render(
        <SummaryCard
          {...defaultProps}
          state="ready"
          summary={summary}
          isStale={true}
          entriesById={new Map()}
          onSelectEntry={vi.fn()}
        />
      )
      expect(screen.getByText(/有新增内容/)).toBeTruthy()
    })

    it('does not show stale hint when isStale is false', () => {
      const summary = makeSummary()
      render(
        <SummaryCard
          {...defaultProps}
          state="ready"
          summary={summary}
          isStale={false}
          entriesById={new Map()}
          onSelectEntry={vi.fn()}
        />
      )
      expect(screen.queryByText(/有新增内容/)).toBeNull()
    })
  })

  describe('state: loading', () => {
    it('renders skeleton and no title', () => {
      render(<SummaryCard {...defaultProps} state="loading" />)
      const card = screen.getByTestId('summary-card')
      expect(card.getAttribute('data-state')).toBe('loading')
      // No title text
      expect(screen.queryByRole('heading')).toBeNull()
    })
  })

  describe('state: generating', () => {
    it('renders skeleton and generating message', () => {
      render(<SummaryCard {...defaultProps} state="generating" />)
      expect(screen.getByText(/分析中/)).toBeTruthy()
    })
  })

  describe('state: failed', () => {
    it('shows retry button and calls onRetry when clicked', () => {
      const onRetry = vi.fn()
      render(
        <SummaryCard
          {...defaultProps}
          state="failed"
          summary={makeSummary({ status: 'failed', error_code: 'timeout' })}
          onRetry={onRetry}
        />
      )
      // Should show error_code somewhere
      expect(screen.getByText(/timeout/)).toBeTruthy()

      const retryBtn = screen.getByRole('button', { name: /Retry/i })
      fireEvent.click(retryBtn)
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('shows failed state without error_code', () => {
      render(
        <SummaryCard
          {...defaultProps}
          state="failed"
          summary={null}
          onRetry={vi.fn()}
        />
      )
      expect(screen.getByRole('button', { name: /Retry/i })).toBeTruthy()
    })
  })

  describe('state: empty', () => {
    it('shows empty message', () => {
      render(<SummaryCard {...defaultProps} state="empty" />)
      expect(screen.getByText(/今日暂无文章/)).toBeTruthy()
    })
  })

  describe('state: idle', () => {
    it('shows generate button when onGenerate is provided', () => {
      const onGenerate = vi.fn()
      render(
        <SummaryCard
          {...defaultProps}
          state="idle"
          onGenerate={onGenerate}
        />
      )
      const btn = screen.getByRole('button', { name: /生成综述/ })
      fireEvent.click(btn)
      expect(onGenerate).toHaveBeenCalledTimes(1)
    })

    it('shows pending hint when onGenerate is not provided', () => {
      render(<SummaryCard {...defaultProps} state="idle" />)
      expect(screen.getByText(/综述将稍后自动生成/)).toBeTruthy()
    })
  })

  describe('footer', () => {
    it('renders footer when provided', () => {
      render(
        <SummaryCard
          {...defaultProps}
          state="empty"
          footer={<span data-testid="custom-footer">Footer content</span>}
        />
      )
      expect(screen.getByTestId('custom-footer')).toBeTruthy()
      expect(screen.getByText('Footer content')).toBeTruthy()
    })
  })
})
