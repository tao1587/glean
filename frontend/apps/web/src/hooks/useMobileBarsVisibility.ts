import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Controls mobile top/bottom bar visibility based on article scroll behavior.
 * Designed to mimic mobile browser chrome: hide while scrolling down, reveal
 * when scrolling up or approaching bottom.
 */
export function useMobileBarsVisibility(
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  resetKey?: string
) {
  const [isVisible, setIsVisible] = useState(true)
  const lastScrollY = useRef(0)
  const ticking = useRef(false)
  const upwardTravel = useRef(0)
  const downwardTravel = useRef(0)
  const lastTouchY = useRef<number | null>(null)

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return

    const currentScrollY = scrollContainerRef.current.scrollTop
    const scrollHeight = scrollContainerRef.current.scrollHeight
    const clientHeight = scrollContainerRef.current.clientHeight
    const scrollDelta = currentScrollY - lastScrollY.current

    const isAtBottom = scrollHeight - currentScrollY - clientHeight < 48

    if (currentScrollY < 50 || isAtBottom) {
      setIsVisible(true)
      upwardTravel.current = 0
      downwardTravel.current = 0
    } else if (scrollDelta > 0) {
      downwardTravel.current += scrollDelta
      upwardTravel.current = 0
      if (downwardTravel.current > 24) {
        setIsVisible(false)
      }
    } else if (scrollDelta < 0) {
      upwardTravel.current += Math.abs(scrollDelta)
      downwardTravel.current = 0
      if (upwardTravel.current > 8) {
        setIsVisible(true)
      }
    }

    lastScrollY.current = currentScrollY
    ticking.current = false
  }, [scrollContainerRef])

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const onScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(handleScroll)
        ticking.current = true
      }
    }

    scrollContainer.addEventListener('scroll', onScroll, { passive: true })
    return () => scrollContainer.removeEventListener('scroll', onScroll)
  }, [handleScroll, scrollContainerRef])

  useEffect(() => {
    setIsVisible(true)
    const scrollTop = scrollContainerRef.current?.scrollTop ?? 0
    lastScrollY.current = scrollTop
    upwardTravel.current = 0
    downwardTravel.current = 0
    lastTouchY.current = null
  }, [resetKey, scrollContainerRef])

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const onTouchStart = () => setIsVisible(true)
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      if (lastTouchY.current === null) {
        lastTouchY.current = touch.clientY
        return
      }

      const deltaY = touch.clientY - lastTouchY.current
      lastTouchY.current = touch.clientY
      if (deltaY > 5) {
        setIsVisible(true)
      }
    }
    const onTouchEnd = () => {
      lastTouchY.current = null
    }

    scrollContainer.addEventListener('touchstart', onTouchStart, { passive: true })
    scrollContainer.addEventListener('touchmove', onTouchMove, { passive: true })
    scrollContainer.addEventListener('touchend', onTouchEnd, { passive: true })
    scrollContainer.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      scrollContainer.removeEventListener('touchstart', onTouchStart)
      scrollContainer.removeEventListener('touchmove', onTouchMove)
      scrollContainer.removeEventListener('touchend', onTouchEnd)
      scrollContainer.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [scrollContainerRef])

  return isVisible
}
