import { useCallback, useEffect, useRef, useState } from 'react'
import type { TodayBoardEntry } from '@/pages/reader/shared/todayBoard'

const UNDO_TIMEOUT_MS = 6000

export function useHiddenUndo() {
  const [hidden, setHidden] = useState<Record<string, TodayBoardEntry[]>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const remove = useCallback((e: TodayBoardEntry) => {
    const t = timers.current[e.id]
    if (t) { clearTimeout(t); delete timers.current[e.id] }
    setHidden((m) => ({ ...m, [e.feed_id]: (m[e.feed_id] ?? []).filter((x) => x.id !== e.id) }))
  }, [])

  const add = useCallback((e: TodayBoardEntry) => {
    setHidden((m) => ({ ...m, [e.feed_id]: [...(m[e.feed_id] ?? []), e] }))
    timers.current[e.id] = setTimeout(() => remove(e), UNDO_TIMEOUT_MS)
  }, [remove])

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout) }, [])

  return { hidden, add, remove }
}
