import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useContentRenderer } from '../hooks/useContentRenderer'
import { useUpdateEntryState, entryKeys } from '../hooks/useEntries'
import { bookmarkService, entryService } from '@glean/api-client'
import { useTranslation } from '@glean/i18n'
import type { EntryWithState } from '@glean/types'
import {
  CheckCheck,
  Clock,
  Archive,
  ExternalLink,
  Globe,
  Languages,
  Loader2,
  Maximize2,
  Minimize2,
  X,
  ChevronLeft,
  Menu as MenuIcon,
  Ellipsis,
} from 'lucide-react'
import { format } from 'date-fns'
import { processHtmlContent } from '../lib/html'
import { classifyPreElement } from '../lib/preTranslation'
import {
  detectTranslationLanguageCategory,
  resolveAutoTranslationTargetLanguage,
} from '../lib/translationLanguagePolicy'
import {
  Button,
  Skeleton,
  Sheet,
  SheetPopup,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetPanel,
  Switch,
} from '@glean/ui'
import { toastManager } from '@glean/ui'
import { ArticleOutline } from './ArticleOutline'
import { useViewportTranslation } from '../hooks/useViewportTranslation'
import { useMobileBarsVisibility } from '../hooks/useMobileBarsVisibility'
import { useAuthStore } from '../stores/authStore'
import { useArticlePageMetadata } from '../hooks/useArticlePageMetadata'
import type { TranslationTargetLanguage } from '@glean/types'

/**
 * Hook to track animation state for action buttons
 * Returns the animation class only once when state changes from false to true
 */
function useAnimationTrigger(isActive: boolean | null | undefined, animationClass: string) {
  const prevState = useRef(isActive)
  const [shouldAnimate, setShouldAnimate] = useState(false)

  useEffect(() => {
    // Only trigger animation when state changes to active
    if (isActive && !prevState.current) {
      setShouldAnimate(true)
      // Reset animation state after animation completes
      const timer = setTimeout(() => setShouldAnimate(false), 500)
      return () => clearTimeout(timer)
    }
    prevState.current = isActive
  }, [isActive])

  return shouldAnimate ? animationClass : ''
}

interface ArticleReaderProps {
  entry: EntryWithState
  onClose?: () => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  /**
   * Show close button. Defaults to `true` on mobile, `false` on desktop.
   * Override with explicit boolean if needed.
   */
  showCloseButton?: boolean
  /**
   * Show fullscreen toggle button. Defaults to `true` on desktop, `false` on mobile.
   * Override with explicit boolean if needed.
   */
  showFullscreenButton?: boolean
  /** Hide read/unread status actions (for bookmarks page) */
  hideReadStatus?: boolean
  /** Enable mobile pull-down-to-close gesture. Defaults to true. */
  enableMobileCloseGesture?: boolean
}

/**
 * Hook to detect mobile viewport
 */
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  )

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < breakpoint)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [breakpoint])

  return isMobile
}

/**
 * Mobile close gestures:
 * - Pull down to close when scrolled to top.
 */
function useMobileCloseGestures(
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  onClose?: () => void
) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const pullDistanceRef = useRef(0)

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!enabled) return
      if (!scrollContainerRef.current || scrollContainerRef.current.scrollTop > 0) return

      const touch = e.touches[0]
      touchStartRef.current = { x: touch.clientX, y: touch.clientY }
      pullDistanceRef.current = 0
    },
    [enabled, scrollContainerRef]
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!enabled || !touchStartRef.current) return
      const touch = e.touches[0]
      const dx = touch.clientX - touchStartRef.current.x
      const dy = touch.clientY - touchStartRef.current.y

      // Only track mostly-vertical downward movement.
      if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        pullDistanceRef.current = dy
      } else {
        pullDistanceRef.current = 0
      }
    },
    [enabled]
  )

  const onTouchEnd = useCallback(() => {
    if (!enabled || !touchStartRef.current) return

    const shouldCloseByPull = pullDistanceRef.current > 96
    touchStartRef.current = null
    pullDistanceRef.current = 0

    if (shouldCloseByPull && onClose) {
      onClose()
    }
  }, [enabled, onClose])

  return { onTouchStart, onTouchMove, onTouchEnd }
}

/**
 * Standalone article reader component.
 *
 * Displays article content with actions like archive, mark read, and translation.
 * Can be used in the reader page or as a slide-out panel in bookmarks.
 */
export function ArticleReader({
  entry,
  onClose,
  isFullscreen = false,
  onToggleFullscreen,
  showCloseButton,
  showFullscreenButton,
  hideReadStatus = false,
  enableMobileCloseGesture = true,
}: ArticleReaderProps) {
  const { t } = useTranslation('reader')
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  useArticlePageMetadata(entry)

  const handleOpenMenu = () => {
    // Dispatch custom event to open mobile sidebar in Layout
    window.dispatchEvent(new CustomEvent('openMobileSidebar'))
  }
  const updateMutation = useUpdateEntryState()

  // Always render original content — translations are inserted into DOM by the hook
  const displayContent = entry.content || entry.summary || undefined

  const contentRef = useContentRenderer(displayContent)
  const [archiveFlowState, setArchiveFlowState] = useState<'idle' | 'archiving' | 'unarchiving'>(
    'idle'
  )
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false)
  const [hasOutline, setHasOutline] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const headerSentinelRef = useRef<HTMLDivElement>(null)
  const [isAtTop, setIsAtTop] = useState(true)
  const [needsPreChoice, setNeedsPreChoice] = useState(false)
  const [translatePreUnknown, setTranslatePreUnknown] = useState(false)
  const [translatedTitle, setTranslatedTitle] = useState<string | null>(null)
  const [isTitleTranslating, setIsTitleTranslating] = useState(false)
  const [titleTranslationError, setTitleTranslationError] = useState<string | null>(null)
  const preferredTargetLanguage = (user?.settings?.translation_target_language ??
    'zh-CN') as TranslationTargetLanguage

  const autoTargetLanguage = useMemo(() => {
    if (detectTranslationLanguageCategory(entry.title) === 'chinese') return null
    return resolveAutoTranslationTargetLanguage(
      entry.title + ' ' + (entry.content || entry.summary || ''),
      preferredTargetLanguage
    )
  }, [entry.title, entry.content, entry.summary, preferredTargetLanguage])

  const manualTargetLanguage = useMemo(() => {
    return resolveAutoTranslationTargetLanguage(
      entry.title + ' ' + (entry.content || entry.summary || ''),
      preferredTargetLanguage
    )
  }, [entry.title, entry.content, entry.summary, preferredTargetLanguage])
  const canTranslate = manualTargetLanguage !== null
  const {
    isActive: showTranslation,
    isTranslating,
    error: viewportTranslationError,
    toggle: toggleTranslation,
    activate: activateTranslation,
    ensureCompleteTranslation,
  } = useViewportTranslation({
    contentRef,
    scrollContainerRef,
    targetLanguage: manualTargetLanguage,
    entryId: entry.id,
    translatePreUnknown,
  })
  const isMobile = useIsMobile()
  const translationError = titleTranslationError ?? viewportTranslationError
  const isTranslationBusy = isTranslating || isTitleTranslating
  const barsVisible = useMobileBarsVisibility(scrollContainerRef, entry.id)
  const closeGestureHandlers = useMobileCloseGestures(
    scrollContainerRef,
    isMobile && enableMobileCloseGesture,
    onClose
  )
  const [translationLoadingPhase, setTranslationLoadingPhase] = useState<'idle' | 'start' | 'settled'>('idle')

  // The title to display — prefer translated title when translation is active
  const displayTitle = (showTranslation && translatedTitle) ? translatedTitle : entry.title

  // Apply smart defaults based on mobile detection
  // On mobile: show close button, hide fullscreen button
  // On desktop: hide close button, show fullscreen button
  const shouldShowCloseButton = showCloseButton ?? isMobile
  const shouldShowFullscreenButton = showFullscreenButton ?? !isMobile

  useEffect(() => {
    if (!autoTargetLanguage) return
    let timeoutId: number | null = null
    let idleId: number | null = null
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }

    const start = () => activateTranslation()

    if (typeof window !== 'undefined' && typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(() => {
        start()
      }, { timeout: 1200 })
    } else {
      // Defer translation work slightly so article content paints first.
      timeoutId = window.setTimeout(start, 350)
    }

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (idleId !== null && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleId)
      }
    }
  }, [autoTargetLanguage, activateTranslation, entry.id])

  useEffect(() => {
    if (!isTranslationBusy) {
      setTranslationLoadingPhase('idle')
      return
    }

    setTranslationLoadingPhase('start')
    const timer = window.setTimeout(() => {
      setTranslationLoadingPhase('settled')
    }, 1000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [isTranslationBusy])

  useEffect(() => {
    setTranslatedTitle(null)
    setIsTitleTranslating(false)
    setTitleTranslationError(null)
  }, [entry.id, manualTargetLanguage])

  useEffect(() => {
    if (!showTranslation || !manualTargetLanguage) return
    if (!entry.title.trim()) return
    if (translatedTitle) return

    let cancelled = false

    const translateTitle = async () => {
      setIsTitleTranslating(true)
      setTitleTranslationError(null)

      try {
        const response = await entryService.translateTexts(
          [entry.title],
          manualTargetLanguage,
          'auto',
          entry.id,
        )
        if (cancelled) return

        const translated = response.translations[0]?.trim()
        if (translated) {
          setTranslatedTitle(translated)
        }
      } catch (err) {
        if (cancelled) return
        setTitleTranslationError(err instanceof Error ? err.message : t('translation.failed'))
      } finally {
        if (!cancelled) {
          setIsTitleTranslating(false)
        }
      }
    }

    void translateTitle()

    return () => {
      cancelled = true
    }
  }, [entry.id, entry.title, showTranslation, t, manualTargetLanguage, translatedTitle])

  // Reset outline state when entry changes
  useEffect(() => {
    setHasOutline(false)
    setNeedsPreChoice(false)
    setTranslatePreUnknown(false)
  }, [entry.id])

  // Observe the header sentinel to hide the sticky action bar when the full
  // header is visible (at top), and reveal it only after the user scrolls past.
  useEffect(() => {
    if (isMobile) return
    const root = scrollContainerRef.current
    const sentinel = headerSentinelRef.current
    if (!root || !sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        setIsAtTop(entry.isIntersecting)
      },
      { root, threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [isMobile, entry.id])

  useEffect(() => {
    const contentEl = contentRef.current
    if (!contentEl) return

    const preElements = contentEl.querySelectorAll('pre')
    let hasUnknown = false
    preElements.forEach((pre) => {
      const classification = classifyPreElement(pre)
      if (classification === 'unknown') {
        hasUnknown = true
      }
    })

    setNeedsPreChoice(hasUnknown)
    if (!hasUnknown) {
      setTranslatePreUnknown(false)
    }
  }, [contentRef, displayContent, entry.id])

  // Animation triggers for action buttons
  const readLaterAnimation = useAnimationTrigger(entry.read_later, 'action-btn-clock-active')
  const bookmarkAnimation = useAnimationTrigger(entry.is_bookmarked, 'action-btn-archive-active')
  const readAnimation = useAnimationTrigger(entry.is_read, 'action-btn-check')

  const handleToggleRead = async () => {
    await updateMutation.mutateAsync({
      entryId: entry.id,
      data: { is_read: !entry.is_read },
    })
  }

  const handleToggleReadLater = async () => {
    await updateMutation.mutateAsync({
      entryId: entry.id,
      data: { read_later: !entry.read_later },
    })
  }

  const handleToggleBookmark = async () => {
    try {
      if (entry.is_bookmarked && entry.bookmark_id) {
        setArchiveFlowState('unarchiving')
        // Remove bookmark
        await bookmarkService.deleteBookmark(entry.bookmark_id)
      } else {
        setArchiveFlowState('archiving')
        if (showTranslation && manualTargetLanguage) {
          const translationSnapshot = await ensureCompleteTranslation()
          if (!translationSnapshot?.isComplete) {
            throw new Error(t('actions.translationIncomplete'))
          }
        }

        await bookmarkService.createBookmark({
          entry_id: entry.id,
        })
      }
      // Invalidate queries to refetch with updated is_bookmarked status
      await queryClient.invalidateQueries({ queryKey: entryKeys.lists() })
      await queryClient.invalidateQueries({ queryKey: entryKeys.detail(entry.id) })
    } catch (err) {
      console.error('Failed to toggle bookmark:', err)
      const message = err instanceof Error ? err.message : t('actions.archiveFailed')
      toastManager.add({
        title: t('actions.archiveFailed'),
        description: message,
        type: 'error',
      })
    } finally {
      setArchiveFlowState('idle')
    }
  }

  const handleOpenExternal = useCallback(() => {
    window.open(entry.url, '_blank', 'noopener,noreferrer')
  }, [entry.url])

  const translationButtonClassName = [
    'action-btn translate-action-btn',
    showTranslation ? 'text-primary' : 'text-muted-foreground',
    isTranslationBusy ? 'translate-action-btn-loading' : '',
    translationLoadingPhase === 'start' ? 'translate-action-btn-loading-start' : '',
    translationLoadingPhase === 'settled' ? 'translate-action-btn-loading-settled' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const isBookmarking = archiveFlowState !== 'idle'
  const bookmarkButtonClassName = [
    'action-btn',
    bookmarkAnimation,
    entry.is_bookmarked ? 'text-primary' : 'text-muted-foreground',
  ]
    .filter(Boolean)
    .join(' ')
  const bookmarkLabel =
    archiveFlowState === 'unarchiving'
      ? t('actions.unarchiving')
      : archiveFlowState === 'archiving'
        ? t('actions.archiving')
        : entry.is_bookmarked
          ? t('actions.archived')
          : t('actions.archive')

  // Full (non-sticky) header action buttons — labeled, own-row toolbar.
  // Close and fullscreen are moved to the title row (icon-only); only
  // content-related actions remain here.
  const fullHeaderActions = (
    <div className="flex flex-wrap items-center gap-2">
      {entry.url && (
        <Button
          variant="ghost"
          size="sm"
          render={(props) => (
            <a {...props} href={entry.url} target="_blank" rel="noopener noreferrer" />
          )}
          className="text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
          <span>{t('actions.openOriginal')}</span>
        </Button>
      )}      
      {canTranslate && (
        <Button
          variant="ghost"
          size="sm"
          onClick={showTranslation ? toggleTranslation : activateTranslation}
          className={translationButtonClassName}
        >
          <Languages className="h-4 w-4" />
          <span>
            {showTranslation
              ? t('translation.hideTranslation')
              : isTranslationBusy
                ? t('translation.translating')
                : t('translation.translate')}
          </span>
        </Button>
      )}
      {!hideReadStatus && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleRead}
          className={`action-btn ${readAnimation} ${entry.is_read ? 'text-muted-foreground' : 'text-primary'}`}
        >
          <CheckCheck className="h-4 w-4" />
          <span>{entry.is_read ? t('actions.markUnread') : t('actions.markRead')}</span>
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleReadLater}
        className={`action-btn ${readLaterAnimation} ${entry.read_later ? 'text-primary' : 'text-muted-foreground'}`}
      >
        <Clock className="h-4 w-4" />
        <span>{entry.read_later ? t('actions.savedForLater') : t('actions.readLater')}</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleBookmark}
        disabled={isBookmarking}
        className={bookmarkButtonClassName}
      >
        {archiveFlowState === 'archiving' || archiveFlowState === 'unarchiving' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Archive className="h-4 w-4" />
        )}
        <span>{bookmarkLabel}</span>
      </Button>
    </div>
  )

  // Sticky condensed bar action buttons — compact icon-only.
  const stickyHeaderActions = (
    <div className="flex shrink-0 items-center gap-1">
      {canTranslate && (
        <Button
          variant="ghost"
          size="icon"
          onClick={showTranslation ? toggleTranslation : activateTranslation}
          title={
            showTranslation
              ? t('translation.hideTranslation')
              : isTranslationBusy
                ? t('translation.translating')
                : t('translation.translate')
          }
          className={translationButtonClassName}
        >
          <Languages className="h-4 w-4" />
        </Button>
      )}
      {!hideReadStatus && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleRead}
          title={entry.is_read ? t('actions.markUnread') : t('actions.markRead')}
          className={`action-btn ${readAnimation} ${entry.is_read ? 'text-muted-foreground' : 'text-primary'}`}
        >
          <CheckCheck className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggleReadLater}
        title={entry.read_later ? t('actions.savedForLater') : t('actions.readLater')}
        className={`action-btn ${readLaterAnimation} ${entry.read_later ? 'text-primary' : 'text-muted-foreground'}`}
      >
        <Clock className="h-4 w-4" />
      </Button>
      {entry.url && (
        <Button
          variant="ghost"
          size="icon"
          title={t('actions.openOriginal')}
          render={(props) => (
            <a {...props} href={entry.url} target="_blank" rel="noopener noreferrer" />
          )}
          className="text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggleBookmark}
        disabled={isBookmarking}
        title={bookmarkLabel}
        className={bookmarkButtonClassName}
      >
        {archiveFlowState === 'archiving' || archiveFlowState === 'unarchiving' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Archive className="h-4 w-4" />
        )}
      </Button>
      {shouldShowFullscreenButton && onToggleFullscreen && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleFullscreen}
          title={isFullscreen ? t('actions.exitFullscreen') : t('actions.fullscreen')}
          className="text-muted-foreground hover:text-foreground"
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
      )}
      {shouldShowCloseButton && onClose && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          title={t('actions.close')}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )

  return (
    <div className="bg-background relative flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Mobile Header - auto-hide on scroll */}
      {isMobile && (
        <div
          className={`border-border bg-card/95 absolute inset-x-0 top-0 z-10 border-b backdrop-blur-sm transition-transform duration-300 ${
            barsVisible ? 'translate-y-0' : '-translate-y-full'
          }`}
        >
          <div className="flex h-14 items-center gap-2 px-4">
            {shouldShowCloseButton && onClose ? (
              <button
                onClick={onClose}
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : (
              <button
                onClick={handleOpenMenu}
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-foreground truncate text-base font-semibold" data-no-translate>
                {entry.title}
              </h1>
              {showTranslation && translatedTitle && translatedTitle !== entry.title && (
                <p className="text-muted-foreground truncate text-xs" data-no-translate>
                  {translatedTitle}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content with Outline */}
      <div className="flex flex-1 overflow-hidden">
        <>

            {/* Scrollable content area - hide scrollbar for cleaner reading */}
            <div
              ref={scrollContainerRef}
              className={`hide-scrollbar reader-pan-y no-horizontal-overscroll flex-1 overflow-y-auto ${
                isMobile ? 'pt-14 pb-16' : ''
              }`}
              onTouchStart={closeGestureHandlers.onTouchStart}
              onTouchMove={closeGestureHandlers.onTouchMove}
              onTouchEnd={closeGestureHandlers.onTouchEnd}
            >
              {/* Desktop: full (non-sticky) title + metadata + inline action
                  buttons — scrolls away. Title block and close/fullscreen
                  buttons sit on the same flex row; translated subtitle is
                  a second line inside the left block. */}
              {!isMobile && (
                <div className="bg-card/95 border-border border-b">
                  <div className="mx-auto w-full max-w-5xl px-6 py-4">
                    {/* Title row: left = title + translated subtitle, right = close/fullscreen.
                        Title block uses flex-wrap so a short translation sits inline after the
                        original title; long titles push the translation to a second line. */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h1
                          className="font-display text-foreground text-2xl leading-tight font-bold"
                          title={entry.title}
                          data-no-translate
                        >
                          {entry.title}
                        </h1>
                        {showTranslation && translatedTitle && translatedTitle !== entry.title && (
                          <h2
                            className="text-muted-foreground text-lg leading-snug font-normal"
                            title={translatedTitle}
                            data-no-translate
                          >
                            {translatedTitle}
                          </h2>
                        )}
                      </div>
                      {/* Icon-only close / fullscreen buttons, flush right */}
                      <div className="flex shrink-0 items-center gap-1">
                        {shouldShowFullscreenButton && onToggleFullscreen && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={onToggleFullscreen}
                            title={isFullscreen ? t('actions.exitFullscreen') : t('actions.fullscreen')}
                            aria-label={isFullscreen ? t('actions.exitFullscreen') : t('actions.fullscreen')}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isFullscreen ? (
                              <Minimize2 className="h-4 w-4" />
                            ) : (
                              <Maximize2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {shouldShowCloseButton && onClose && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            title={t('actions.close')}
                            aria-label={t('actions.close')}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {(entry.author || entry.published_at) && (
                      <div className="text-muted-foreground mt-3 flex items-center gap-3 text-sm">
                        {entry.author && <span className="font-medium">{entry.author}</span>}
                        {entry.author && entry.published_at && <span>·</span>}
                        {entry.published_at && (
                          <span>{format(new Date(entry.published_at), 'MMMM d, yyyy')}</span>
                        )}
                      </div>
                    )}
                    <div className="mt-4">{fullHeaderActions}</div>
                    {/* Sentinel: when visible in the scroll root, we're at the top. */}
                    <div ref={headerSentinelRef} aria-hidden="true" className="h-px" />
                  </div>
                </div>
              )}

              {/* Desktop sticky action row — pins to top of scroll container once
                  the user scrolls past the full title above. Contains a truncated
                  title (becomes the visible heading once full title scrolls away)
                  plus the action buttons. */}
              {!isMobile && (
                <div
                  className={`bg-card/95 border-border sticky top-0 z-20 mt-6 border-b backdrop-blur-sm transition-opacity duration-150 ${
                    isAtTop ? 'pointer-events-none -translate-y-2 opacity-0 hidden' : 'opacity-100'
                  }`}
                >
                  <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-2">
                    <h2
                      className="font-display text-foreground/90 min-w-0 flex-1 truncate text-sm font-semibold"
                      title={displayTitle}
                    >
                      {displayTitle}
                    </h2>
                    {stickyHeaderActions}
                  </div>
                </div>
              )}

              <div
                className={`px-4 py-6 sm:px-8 sm:py-8 ${!isMobile ? 'mx-auto max-w-5xl' : 'max-w-3xl'}`}
              >
                {/* Mobile: Author and date at top of content */}
                {isMobile && (entry.author || entry.published_at) && (
                  <div className="text-muted-foreground mb-4 flex items-center gap-2 text-xs">
                    {entry.author && <span className="font-medium">{entry.author}</span>}
                    {entry.author && entry.published_at && <span>·</span>}
                    {entry.published_at && (
                      <span>{format(new Date(entry.published_at), 'MMM d, yyyy')}</span>
                    )}
                  </div>
                )}

                {canTranslate && translationError && (
                  <div className="border-destructive/20 bg-destructive/5 mb-4 flex items-center justify-between rounded-lg border px-4 py-2">
                    <span className="text-destructive text-xs">{t('translation.failed')}</span>
                    <button
                      onClick={activateTranslation}
                      className="text-primary text-xs font-medium hover:underline"
                    >
                      {t('translation.retry')}
                    </button>
                  </div>
                )}

                {canTranslate && needsPreChoice && (
                  <div className="border-border/60 bg-card/60 mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-2">
                    <div className="min-w-0">
                      <div className="text-foreground text-xs font-medium">
                        {t('translation.preToggleTitle')}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        {t('translation.preToggleDesc')}
                      </div>
                    </div>
                    <Switch
                      checked={translatePreUnknown}
                      onCheckedChange={setTranslatePreUnknown}
                      aria-label={t('translation.preToggleLabel')}
                    />
                  </div>
                )}

                {displayContent ? (
                  <article
                    ref={contentRef}
                    className="prose prose-lg font-reading max-w-none"
                    dangerouslySetInnerHTML={{ __html: processHtmlContent(displayContent) }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-muted-foreground italic">{t('article.noContent')}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      render={(props) => (
                        <a {...props} href={entry.url} target="_blank" rel="noopener noreferrer" />
                      )}
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t('article.viewOriginal')}
                    </Button>
                  </div>
                )}

              </div>
            </div>

            {/* Desktop Outline - Sidebar that only takes space when there are headings */}
            {!isMobile && (entry.content || entry.summary) && (
              <div className={`hidden flex-col xl:flex ${hasOutline ? 'w-52 shrink-0' : 'w-0'}`}>
                <ArticleOutline
                  contentRef={contentRef}
                  scrollContainerRef={scrollContainerRef}
                  isMobile={false}
                  onHasHeadings={setHasOutline}
                />
              </div>
            )}
        </>
      </div>

      {/* Mobile Outline */}
      {isMobile && (entry.content || entry.summary) && (
        <ArticleOutline
          contentRef={contentRef}
          scrollContainerRef={scrollContainerRef}
          isMobile={true}
        />
      )}

      {/* Mobile Bottom Action Bar - auto-hide on scroll */}
      {isMobile && (
        <div
          className={`border-border bg-card/95 safe-bottom absolute inset-x-0 bottom-0 z-10 border-t backdrop-blur-sm transition-transform duration-300 ${
            barsVisible ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="flex h-14 items-center justify-around px-2">
            <button
              onClick={handleOpenExternal}
              className="action-btn action-btn-mobile action-btn-external text-muted-foreground hover:text-foreground flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors"
            >
              <Globe className="h-5 w-5" />
              <span className="text-[10px]">{t('actions.open')}</span>
            </button>

            {!hideReadStatus && (
              <button
                onClick={handleToggleRead}
                className={`action-btn action-btn-mobile ${readAnimation} flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
                  entry.is_read ? 'text-muted-foreground' : 'text-primary'
                }`}
              >
                <CheckCheck className="h-5 w-5" />
                <span className="text-[10px]">
                  {entry.is_read ? t('filters.unread') : t('actions.markRead')}
                </span>
              </button>
            )}

            {canTranslate && (
              <button
                onClick={showTranslation ? toggleTranslation : activateTranslation}
                className={`action-btn action-btn-mobile translate-action-btn flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
                  showTranslation ? 'text-primary' : 'text-muted-foreground'
                } ${
                  isTranslationBusy ? 'translate-action-btn-loading' : ''
                } ${
                  translationLoadingPhase === 'start' ? 'translate-action-btn-loading-start' : ''
                } ${
                  translationLoadingPhase === 'settled'
                    ? 'translate-action-btn-loading-settled'
                    : ''
                }`}
              >
                <span className="translate-action-btn__icon-wrap">
                  <span className="translate-action-btn__ring" aria-hidden="true" />
                  <span className="translate-action-btn__dot" aria-hidden="true" />
                  <Languages className="translate-action-btn__icon h-5 w-5" />
                </span>
                <span className="text-[10px]">
                  {showTranslation
                    ? t('translation.hideTranslation')
                    : isTranslationBusy
                      ? t('translation.translating')
                      : t('translation.translate')}
                </span>
              </button>
            )}

            <button
              onClick={() => setIsMoreSheetOpen(true)}
              className="action-btn action-btn-mobile text-muted-foreground hover:text-foreground flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors"
            >
              <Ellipsis className="h-5 w-5" />
              <span className="text-[10px]">{t('actions.more')}</span>
            </button>
          </div>
        </div>
      )}

      {isMobile && (
        <Sheet open={isMoreSheetOpen} onOpenChange={setIsMoreSheetOpen}>
          <SheetPopup side="bottom">
            <SheetHeader>
              <SheetTitle>{t('actions.more')}</SheetTitle>
              <SheetDescription>{t('actions.moreDescription')}</SheetDescription>
            </SheetHeader>
            <SheetPanel>
              <div className="space-y-2">
                <button
                  onClick={handleToggleReadLater}
                  className={`border-border hover:bg-accent ${readLaterAnimation} flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left transition-colors ${
                    entry.read_later ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>
                      {entry.read_later ? t('actions.savedForLater') : t('actions.readLater')}
                    </span>
                  </span>
                </button>

                <button
                  onClick={handleToggleBookmark}
                  disabled={isBookmarking}
                  className={`border-border hover:bg-accent flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left transition-colors ${
                    entry.is_bookmarked ? 'text-primary' : 'text-foreground'
                  } disabled:opacity-50`}
                >
                  <span className="flex items-center gap-2">
                    {archiveFlowState === 'archiving' || archiveFlowState === 'unarchiving' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span className="archive-action-btn__icon-wrap">
                        <span className="archive-action-btn__pulse" aria-hidden="true" />
                        <Archive className="h-4 w-4" />
                      </span>
                    )}
                    <span>{bookmarkLabel}</span>
                  </span>
                </button>
              </div>
            </SheetPanel>
          </SheetPopup>
        </Sheet>
      )}
    </div>
  )
}

/**
 * Skeleton loader for the article reader.
 */
export function ArticleReaderSkeleton() {
  return (
    <div className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-border bg-card border-b px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          {/* Title skeleton */}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
          <Skeleton className="h-10 w-10 shrink-0" />
        </div>

        {/* Meta info skeleton */}
        <div className="mb-4 flex items-center gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>

        {/* Actions skeleton */}
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
          {/* Paragraph skeletons */}
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />

          <div className="py-2" />

          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />

          <div className="py-2" />

          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />

          <div className="py-2" />

          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </div>
    </div>
  )
}
