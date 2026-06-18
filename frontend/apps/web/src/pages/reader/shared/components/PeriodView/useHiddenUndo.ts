import { useCallback, useState } from 'react'
import type { TodayBoardEntry } from '@/pages/reader/shared/todayBoard'

export function useHiddenUndo() {
  const [hidden, setHidden] = useState<Record<string, TodayBoardEntry[]>>({})
  const add = useCallback((e: TodayBoardEntry) => {
    setHidden((m) => ({ ...m, [e.feed_id]: [...(m[e.feed_id] ?? []), e] }))
  }, [])
  const remove = useCallback((e: TodayBoardEntry) => {
    setHidden((m) => ({ ...m, [e.feed_id]: (m[e.feed_id] ?? []).filter((x) => x.id !== e.id) }))
  }, [])
  return { hidden, add, remove }
}
