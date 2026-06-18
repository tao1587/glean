import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useReaderController } from '@/pages/reader/shared/useReaderController'

vi.mock('@/hooks/useSystemTime', () => ({
  useSystemTime: () => ({
    data: {
      timezone: 'UTC',
      current_time: '2026-04-10T04:00:00Z',
      current_date: '2026-04-10',
    },
  }),
}))

function ControllerProbe() {
  const controller = useReaderController()
  const location = useLocation()

  return (
    <div>
      <div data-testid="today-board-date">{controller.todayBoardDate}</div>
      <div data-testid="selected-entry">{controller.selectedEntryId ?? 'none'}</div>
      <div data-testid="location-search">{location.search}</div>
      <button type="button" onClick={() => controller.setTodayBoardDate('2026-04-09')}>
        Select Apr 9
      </button>
      <button type="button" onClick={() => controller.setTodayBoardDate('2026-04-10')}>
        Select Today
      </button>
    </div>
  )
}

function renderController(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ControllerProbe />
    </MemoryRouter>
  )
}

describe('useReaderController today-board date URL state', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('restores a valid historical selected date from the URL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))

    renderController('/reader?view=today-board&date=2026-04-07&entry=entry-1')

    expect(screen.getByTestId('today-board-date')).toHaveTextContent('2026-04-07')
    expect(screen.getByTestId('selected-entry')).toHaveTextContent('entry-1')
  })

  it('pushes selected dates into the URL and clears stale selected entries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))

    renderController('/reader?view=today-board&date=2026-04-07&entry=entry-1')

    act(() => {
      screen.getByRole('button', { name: 'Select Apr 9' }).click()
    })

    expect(screen.getByTestId('today-board-date')).toHaveTextContent('2026-04-09')
    expect(screen.getByTestId('selected-entry')).toHaveTextContent('none')
    expect(screen.getByTestId('location-search')).toHaveTextContent('view=today-board')
    expect(screen.getByTestId('location-search')).toHaveTextContent('date=2026-04-09')
    expect(screen.getByTestId('location-search')).not.toHaveTextContent('entry=')
  })

  it('omits the date param when selecting today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00+08:00'))

    renderController('/reader?view=today-board&date=2026-04-07&entry=entry-1')

    act(() => {
      screen.getByRole('button', { name: 'Select Today' }).click()
    })

    expect(screen.getByTestId('today-board-date')).toHaveTextContent('2026-04-10')
    expect(screen.getByTestId('location-search')).toHaveTextContent('view=today-board')
    expect(screen.getByTestId('location-search')).not.toHaveTextContent('date=')
    expect(screen.getByTestId('location-search')).not.toHaveTextContent('entry=')
  })
})
