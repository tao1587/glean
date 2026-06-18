import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHiddenUndo } from '@/pages/reader/shared/components/PeriodView/useHiddenUndo'

const e = { id: 'e1', feed_id: 'f1', title: 'x' } as never

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

it('add puts entry into hidden[feed_id]', () => {
  const { result } = renderHook(() => useHiddenUndo())
  act(() => { result.current.add(e) })
  expect(result.current.hidden['f1']).toHaveLength(1)
})

it('auto-dismisses after 6 seconds', () => {
  const { result } = renderHook(() => useHiddenUndo())
  act(() => { result.current.add(e) })
  expect(result.current.hidden['f1']).toHaveLength(1)
  act(() => { vi.advanceTimersByTime(6000) })
  expect(result.current.hidden['f1']).toHaveLength(0)
})

it('remove immediately removes and advancing timers does not throw', () => {
  const { result } = renderHook(() => useHiddenUndo())
  act(() => { result.current.add(e) })
  act(() => { result.current.remove(e) })
  expect((result.current.hidden['f1'] ?? [])).toHaveLength(0)
  // advancing time after manual remove should not throw
  act(() => { vi.advanceTimersByTime(6000) })
  expect((result.current.hidden['f1'] ?? [])).toHaveLength(0)
})
