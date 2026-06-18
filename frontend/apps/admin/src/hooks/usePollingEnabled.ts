import { useEffect, useState } from 'react'

export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')

  useEffect(() => {
    const handler = () => setVisible(document.visibilityState === 'visible')
    window.addEventListener('visibilitychange', handler)
    return () => window.removeEventListener('visibilitychange', handler)
  }, [])

  return visible
}

export function conditionalInterval(enabled: boolean, intervalMs: number): number | false {
  return enabled ? intervalMs : false
}
