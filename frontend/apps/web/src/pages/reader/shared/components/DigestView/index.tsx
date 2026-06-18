import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertTitle, AlertDescription, Skeleton } from '@glean/ui'
import { useTranslation } from '@glean/i18n'
import { entryService } from '@glean/api-client'
import type { EntryWithState } from '@glean/types'
import { ArticleReader, ArticleReaderSkeleton } from '@/components/ArticleReader'
import { SearchModal } from '@/components/SearchModal'
import { useEntry, useUpdateEntryState } from '@/hooks/useEntries'
import { useListEntriesTranslation } from '@/hooks/useListEntriesTranslation'
import { useAllSubscriptions } from '@/hooks/useSubscriptions'
import { useFolders } from '@/hooks/useFolders'
import { useSystemTime } from '@/hooks/useSystemTime'
import { useThemeStore } from '@/stores/themeStore'
import { useDigestSidebarStore } from '@/stores/digestSidebarStore'
import { useDigestSettingsStore } from '@/stores/digestSettingsStore'
import { DigestMasthead, DigestTopNav } from './DigestMasthead'
import { DigestSection } from './DigestSection'
import { DigestSidebar } from './DigestSidebar'
import { DigestReadingList } from './DigestReadingList'
import { AddFeedModal } from './AddFeedModal'
import {
  groupEntriesByFolder,
  computeDigestStats,
} from './digestHelpers'
import { format, subDays, addDays } from 'date-fns'

/** CSS custom properties for both light and dark modes */
const DIGEST_LIGHT_VARS: Record<string, string> = {
  '--digest-bg': '#FAF8F3',
  '--digest-bg-card': '#FFFFFF',
  '--digest-bg-hover': '#F1EDE2',
  '--digest-bg-sidebar': '#F5F2EA',
  '--digest-text': '#1A1A1A',
  '--digest-text-secondary': '#5E5A52',
  '--digest-text-tertiary': '#9A968C',
  '--digest-divider': '#E5E0D2',
  '--digest-divider-strong': '#B8B3A5',
  '--digest-accent': '#B8312F',
  '--digest-accent-soft': '#F5E6E5',
}

const DIGEST_DARK_VARS: Record<string, string> = {
  '--digest-bg': '#161614',
  '--digest-bg-card': '#1F1E1B',
  '--digest-bg-hover': '#2A2925',
  '--digest-bg-sidebar': '#1C1B18',
  '--digest-text': '#F2EFE7',
  '--digest-text-secondary': '#A8A498',
  '--digest-text-tertiary': '#6E6B62',
  '--digest-divider': '#2F2D28',
  '--digest-divider-strong': '#4A4740',
  '--digest-accent': '#E56B67',
  '--digest-accent-soft': '#3A2523',
}

interface DigestViewProps {
  date: string // YYYY-MM-DD
  isMobile: boolean
  onDateChange: (date: string) => void
}

export function DigestView({ date, isMobile, onDateChange }: DigestViewProps) {
  const { t } = useTranslation('digest')
  const { data: systemTime } = useSystemTime()
  const todayDate = systemTime?.current_date ?? format(new Date(), 'yyyy-MM-dd')
  const { resolvedTheme } = useThemeStore()

  const [searchParams, setSearchParams] = useSearchParams()
  const selectedEntryId = searchParams.get('entry')

  const setSelectedEntryId = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id) {
            next.set('entry', id)
          } else {
            next.delete('entry')
          }
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null)
  const [addFeedOpen, setAddFeedOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // --- Section state lifted from DigestSection, survives reader open/close ---
  // Per-group open override. undefined = use default (open iff section has unread).
  // Presence = user has toggled and their choice wins.
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({})
  // "View all" (beyond MAX_VISIBLE_CARDS) toggle per group
  const [showAllMap, setShowAllMap] = useState<Record<string, boolean>>({})
  // Read-tail (已读 N 篇) toggle per group
  const [readTailMap, setReadTailMap] = useState<Record<string, boolean>>({})

  const { activePanel, setActivePanel } = useDigestSidebarStore()
  const isPanelOpen = !!activePanel
  const { autoMarkRead } = useDigestSettingsStore()

  const updateMutation = useUpdateEntryState()

  // Window scroll position of the digest list, captured when an entry is opened
  // so it can be restored exactly when the reader closes (see effect below).
  const savedDigestScrollRef = useRef(0)

  // Fetch all entries for the day in one request
  const {
    data: entriesResponse,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['digest-entries', date],
    queryFn: ({ signal }) =>
      entryService.getTodayEntries(
        {
          date,
          limit: 500,
        },
        { signal }
      ),
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!date,
  })

  const entries = useMemo(() => entriesResponse?.items ?? [], [entriesResponse])

  // Folder data for grouping — TanStack Query fetches automatically on mount
  const { folders } = useFolders('feed')
  const { data: subscriptions = [] } = useAllSubscriptions()

  // Group entries by folder (the only strategy DigestView uses).
  // NOTE: do NOT include `t` in deps — UI-language label lives in DigestSection.
  const sections = useMemo(() => {
    const grouped = groupEntriesByFolder(entries, folders, subscriptions)
    // Push fully-read sections to the bottom while preserving relative order.
    // Array.prototype.sort is stable in modern JS engines.
    return [...grouped].sort((a, b) => {
      const aAllRead = a.entries.length > 0 && a.entries.every((e) => e.is_read)
      const bAllRead = b.entries.length > 0 && b.entries.every((e) => e.is_read)
      return Number(aAllRead) - Number(bAllRead)
    })
  }, [entries, folders, subscriptions])

  // Reset per-date section state when date changes
  useEffect(() => {
    setOpenOverrides({})
    setShowAllMap({})
    setReadTailMap({})
  }, [date])

  // Collapse the sidebar whenever the user opens/closes an article or changes date
  useEffect(() => {
    setActivePanel(null)
  }, [date, selectedEntryId, setActivePanel])

  // Default-open rule: a section is open iff it still has any unread entry.
  // User toggles stored in openOverrides win over the default.
  const isSectionDefaultOpen = useCallback((entries: EntryWithState[]) => {
    if (entries.length === 0) return false
    return entries.some((e) => !e.is_read)
  }, [])

  // Per-section toggle with scroll anchor to prevent page jump when content above collapses.
  const onToggleOpen = useCallback(
    (groupKey: string, currentlyOpen: boolean, headerEl: HTMLElement | null) => {
      const topBefore = headerEl?.getBoundingClientRect().top ?? 0
      setOpenOverrides((prev) => ({ ...prev, [groupKey]: !currentlyOpen }))
      if (headerEl) {
        // Two rAFs: first lets React commit, second lets layout settle
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const topAfter = headerEl.getBoundingClientRect().top
            const delta = topAfter - topBefore
            if (Math.abs(delta) > 1)
              window.scrollBy({ top: delta, left: 0, behavior: 'instant' })
          })
        })
      }
    },
    []
  )

  const onToggleShowAll = useCallback((groupKey: string) => {
    setShowAllMap((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))
  }, [])

  const onToggleReadTail = useCallback((groupKey: string) => {
    setReadTailMap((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))
  }, [])

  // Flat entry list for j/k keyboard navigation
  const flatEntries = useMemo(() => sections.flatMap((s) => s.entries), [sections])

  // Viewport-aware list translation — respects user's
  // `list_translation_auto_enabled` + `translation_target_language` settings.
  // Digest scrolls on window, so pass a null-bearing ref to use the document root.
  const digestScrollRootRef = useRef<HTMLElement | null>(null)
  const { translations, isLoading: isTranslating } = useListEntriesTranslation({
    entries: flatEntries,
    containerRef: digestScrollRootRef,
  })

  // Stats
  const stats = useMemo(() => {
    const base = computeDigestStats(entries)
    return { ...base, topicCount: sections.length }
  }, [entries, sections])

  // Selected entry for article reader
  const { data: selectedEntry, isLoading: isLoadingEntry } = useEntry(selectedEntryId ?? '')

  // Scroll-based reading progress bar — writes a CSS variable directly to avoid re-renders
  useEffect(() => {
    let rafId: number | null = null
    const root = document.documentElement
    const update = () => {
      rafId = null
      const scrollTop = root.scrollTop || document.body.scrollTop
      const maxScroll = root.scrollHeight - root.clientHeight
      const pct = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0
      root.style.setProperty('--digest-scroll-progress', String(pct))
    }
    const onScroll = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      root.style.removeProperty('--digest-scroll-progress')
    }
  }, [])

  const handleCloseEntry = useCallback(() => {
    const closingId = selectedEntryId
    setSelectedEntryId(null)
    setIsFullscreen(false)
    // Ensure the just-viewed entry is marked read on close so it moves into the
    // read group. Opening alone only marks read when `autoMarkRead` is enabled,
    // which leaves manually-opened entries in the unread group after close.
    if (closingId) {
      const entry = flatEntries.find((e) => e.id === closingId)
      if (entry && !entry.is_read) {
        void updateMutation.mutateAsync({
          entryId: entry.id,
          data: { is_read: true },
        })
      }
    }
    // Scroll restoration is handled by the layout effect keyed on selectedEntryId
    // (covers both this close button and browser back), so nothing to do here.
  }, [selectedEntryId, flatEntries, updateMutation, setSelectedEntryId])

  const handleSelectEntry = useCallback(
    (entry: EntryWithState) => {
      // Capture the digest's window scroll position BEFORE the list unmounts.
      // Entering reading mode collapses the page to viewport height, which
      // clamps window.scrollY to 0 — so we must read it here, at click time.
      savedDigestScrollRef.current = window.scrollY
      setSelectedEntryId(entry.id)
      setFocusedEntryId(entry.id)
      if (autoMarkRead && !entry.is_read) {
        void updateMutation.mutateAsync({
          entryId: entry.id,
          data: { is_read: true },
        })
      }
    },
    [autoMarkRead, updateMutation, setSelectedEntryId]
  )

  // Restore the digest's scroll position when the reader closes. Keyed on
  // selectedEntryId so it fires for both the close button and browser back.
  // Two rAFs: the first lets React commit the remounted list, the second lets
  // its layout settle before we scroll (mirrors onToggleOpen above).
  const prevSelectedEntryIdRef = useRef(selectedEntryId)
  useLayoutEffect(() => {
    const prev = prevSelectedEntryIdRef.current
    prevSelectedEntryIdRef.current = selectedEntryId
    if (prev && !selectedEntryId) {
      const y = savedDigestScrollRef.current
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: y, left: 0, behavior: 'instant' })
        })
      })
    }
  }, [selectedEntryId])

  const handlePrevDay = useCallback(() => {
    const [y, m, d] = date.split('-').map(Number)
    const prev = subDays(new Date(y, m - 1, d), 1)
    onDateChange(format(prev, 'yyyy-MM-dd'))
  }, [date, onDateChange])

  const handleNextDay = useCallback(() => {
    const [y, m, d] = date.split('-').map(Number)
    const next = addDays(new Date(y, m - 1, d), 1)
    onDateChange(format(next, 'yyyy-MM-dd'))
  }, [date, onDateChange])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )
        return

      // When article reader is open: Escape closes; j/k switch articles in the left list
      if (selectedEntryId) {
        if (e.key === 'Escape') {
          handleCloseEntry()
          return
        }
        if (e.key === 'j' || e.key === 'k') {
          e.preventDefault()
          const currentIdx = flatEntries.findIndex((en) => en.id === selectedEntryId)
          const nextIdx =
            e.key === 'j'
              ? Math.min(currentIdx + 1, flatEntries.length - 1)
              : Math.max(currentIdx - 1, 0)
          const nextEntry = flatEntries[nextIdx]
          if (nextEntry && nextEntry.id !== selectedEntryId) {
            setSelectedEntryId(nextEntry.id)
            setFocusedEntryId(nextEntry.id)
            window.requestAnimationFrame(() => {
              document
                .querySelector(`[data-entry-id="${nextEntry.id}"]`)
                ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
            })
          }
        }
        return
      }

      // cmd+k / ctrl+k — open search modal
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        return
      }

      // / key — open search modal (when not inside an input)
      if (e.key === '/') {
        e.preventDefault()
        setSearchOpen(true)
        return
      }

      switch (e.key) {
        case 'ArrowLeft':
          handlePrevDay()
          break
        case 'ArrowRight':
          if (date < todayDate) handleNextDay()
          break

        case 'j': {
          // Focus next entry
          e.preventDefault()
          const currentIdx = focusedEntryId
            ? flatEntries.findIndex((en) => en.id === focusedEntryId)
            : -1
          const nextIdx = Math.min(currentIdx + 1, flatEntries.length - 1)
          const nextEntry = flatEntries[nextIdx]
          if (nextEntry) {
            setFocusedEntryId(nextEntry.id)
            window.requestAnimationFrame(() => {
              document
                .querySelector(`[data-entry-id="${nextEntry.id}"]`)
                ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
            })
          }
          break
        }

        case 'k': {
          // Focus previous entry
          e.preventDefault()
          const currentIdx = focusedEntryId
            ? flatEntries.findIndex((en) => en.id === focusedEntryId)
            : flatEntries.length
          const prevIdx = Math.max(currentIdx - 1, 0)
          const prevEntry = flatEntries[prevIdx]
          if (prevEntry) {
            setFocusedEntryId(prevEntry.id)
            window.requestAnimationFrame(() => {
              document
                .querySelector(`[data-entry-id="${prevEntry.id}"]`)
                ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
            })
          }
          break
        }

        case 'o':
        case 'Enter': {
          // Open focused entry
          if (focusedEntryId) {
            const entry = flatEntries.find((en) => en.id === focusedEntryId)
            if (entry) handleSelectEntry(entry)
          }
          break
        }

        case 's': {
          // Toggle save-for-later on focused entry
          if (focusedEntryId) {
            const entry = flatEntries.find((en) => en.id === focusedEntryId)
            if (entry) {
              void updateMutation.mutateAsync({
                entryId: entry.id,
                data: { read_later: !entry.read_later },
              })
            }
          }
          break
        }

        case 'm': {
          // Toggle read on focused entry
          if (focusedEntryId) {
            const entry = flatEntries.find((en) => en.id === focusedEntryId)
            if (entry) {
              void updateMutation.mutateAsync({
                entryId: entry.id,
                data: { is_read: !entry.is_read },
              })
            }
          }
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    date,
    todayDate,
    selectedEntryId,
    focusedEntryId,
    flatEntries,
    handleCloseEntry,
    handlePrevDay,
    handleNextDay,
    handleSelectEntry,
    updateMutation,
    setSelectedEntryId,
  ])

  // Refs kept fresh each render so the observer callback never closes over stale values
  const flatEntriesRef = useRef(flatEntries)
  const autoMarkReadRef = useRef(autoMarkRead)
  const mutateAsyncRef = useRef(updateMutation.mutateAsync)
  useEffect(() => {
    flatEntriesRef.current = flatEntries
  })
  useEffect(() => {
    autoMarkReadRef.current = autoMarkRead
  })
  useEffect(() => {
    mutateAsyncRef.current = updateMutation.mutateAsync
  })

  const mainRef = useRef<HTMLElement>(null)
  const scrollTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Stable key that only changes when the SET of entry IDs changes (not on is_read flips)
  const entryIdsKey = flatEntries.map((e) => e.id).join(',')

  useEffect(() => {
    if (!autoMarkReadRef.current) return
    // Don't observe cards while in reading mode — they're hidden and unreliable
    if (selectedEntryId) return
    const container = mainRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      (observations) => {
        observations.forEach((obs) => {
          const entryId = (obs.target as HTMLElement).dataset.entryId
          if (!entryId) return
          if (obs.isIntersecting) {
            const timer = scrollTimersRef.current.get(entryId)
            if (timer !== undefined) {
              clearTimeout(timer)
              scrollTimersRef.current.delete(entryId)
            }
          } else {
            if (scrollTimersRef.current.has(entryId)) return
            const timer = setTimeout(() => {
              scrollTimersRef.current.delete(entryId)
              const entry = flatEntriesRef.current.find((e) => e.id === entryId)
              if (entry && !entry.is_read) {
                void mutateAsyncRef.current({
                  entryId: entry.id,
                  data: { is_read: true },
                })
              }
            }, 1000)
            scrollTimersRef.current.set(entryId, timer)
          }
        })
      },
      { threshold: 0, root: null }
    )
    const els = container.querySelectorAll('[data-entry-id]')
    els.forEach((el) => observer.observe(el))
    return () => {
      observer.disconnect()
      scrollTimersRef.current.forEach((t) => clearTimeout(t))
      scrollTimersRef.current.clear()
    }
     
  }, [entryIdsKey, selectedEntryId])

  // Determine panel margin for desktop layout
  const panelOffset = isPanelOpen && !isMobile ? 264 : 0

  const digestVars = resolvedTheme === 'dark' ? DIGEST_DARK_VARS : DIGEST_LIGHT_VARS

  return (
    <div
      className="flex min-h-full"
      style={{ ...digestVars, background: 'var(--digest-bg)', color: 'var(--digest-text)' } as React.CSSProperties}
    >
      {/* Scroll progress bar — fixed at very top */}
      <div
        className="pointer-events-none fixed left-0 top-0 z-[100] h-0.5 transition-[width] duration-100"
        style={{
          width: 'calc(var(--digest-scroll-progress, 0) * 1%)',
          background: 'var(--digest-accent, #B8312F)',
          right: isMobile ? 0 : `${panelOffset}px`,
        }}
      />

      {/* Main content area */}
      <div
        className="flex min-w-0 flex-1 flex-col transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          marginRight: isMobile ? 0 : `${panelOffset}px`,
        }}
      >
        {/* Top nav (hidden in fullscreen reading mode) */}
        {!isFullscreen && (
          <DigestTopNav
            date={date}
            todayDate={todayDate}
            onPrevDay={handlePrevDay}
            onNextDay={handleNextDay}
            onAddFeed={() => setAddFeedOpen(true)}
            onDateChange={onDateChange}
            todayAnchor={(() => {
              const [y, m, d] = todayDate.split('-').map(Number)
              return new Date(y, m - 1, d)
            })()}
            isTranslating={isTranslating}
            onOpenSearch={() => setSearchOpen(true)}
          />
        )}

        {selectedEntryId ? (
          /* Reading mode: split-pane (list | reader) */
          <div className="flex min-h-0 flex-1">
            {/* Left pane — compact entry list (hidden on narrow viewports and in fullscreen) */}
            {!isMobile && !isFullscreen && (
              <aside
                className="w-[420px] shrink-0 overflow-y-auto border-r"
                style={{
                  borderColor: 'var(--digest-divider, #E5E0D2)',
                  background: 'var(--digest-bg-sidebar, #F5F2EA)',
                  maxHeight: 'calc(100vh - 60px)',
                }}
              >
                <DigestReadingList
                  entries={flatEntries}
                  selectedId={selectedEntryId}
                  onSelect={handleSelectEntry}
                  translations={translations}
                />
              </aside>
            )}

            {/* Right pane — article reader.
                NOTE: overflow is hidden here so the ArticleReader's own scroll
                container is the sole scroller — this lets its sticky action
                header actually pin to the top of the visible article. */}
            <main
              className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
              style={{
                background: 'var(--digest-bg-card, #FFFFFF)',
                maxHeight: 'calc(100vh - 60px)',
              }}
            >
              {isLoadingEntry && !selectedEntry ? (
                <ArticleReaderSkeleton />
              ) : selectedEntry ? (
                <ArticleReader
                  key={selectedEntry.id}
                  entry={selectedEntry}
                  onClose={handleCloseEntry}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={() => setIsFullscreen((v) => !v)}
                  showCloseButton
                />
              ) : null}
            </main>
          </div>
        ) : (
          <>
            {/* Masthead */}
            <DigestMasthead
              stats={stats}
              isLoading={isLoading}
              topicCount={sections.length}
            />

            {/* Content */}
            <main
              ref={mainRef}
              className="min-w-0 flex-1 px-[18px] pb-40 sm:px-6 md:px-8 lg:px-8 xl:px-12"
            >
              {/* overflow-anchor: auto is a browser-native safety net against layout jumps */}
              <div className="mx-auto max-w-[1600px]" style={{ overflowAnchor: 'auto' }}>
                {error && (
                  <div className="py-8">
                    <Alert variant="error">
                      <AlertCircle />
                      <AlertTitle>{t('error.title')}</AlertTitle>
                      <AlertDescription>{(error as Error).message}</AlertDescription>
                    </Alert>
                  </div>
                )}

                {isLoading && !error && <DigestLoadingSkeleton />}

                {!isLoading && !error && entries.length === 0 && (
                  <EmptyState
                    date={date}
                    onGoYesterday={handlePrevDay}
                    headline={t('empty.headline')}
                    description={t('empty.description', { date })}
                    ctaLabel={t('empty.yesterday')}
                  />
                )}

                {!isLoading &&
                  sections.map((section) => {
                    const groupKey = `${section.groupKind}:${section.groupId ?? '__others__'}`
                    const defaultOpen = isSectionDefaultOpen(section.entries)
                    const isOpen = openOverrides[groupKey] ?? defaultOpen
                    return (
                      <DigestSection
                        key={groupKey}
                        groupKey={groupKey}
                        groupId={section.groupId}
                        groupName={section.groupName}
                        groupKind={section.groupKind}
                        entries={section.entries}
                        sourceCount={section.sourceCount}
                        onSelectEntry={handleSelectEntry}
                        isCompact={section.groupKind === 'folder' && section.groupId === null}
                        focusedEntryId={focusedEntryId}
                        translations={translations}
                        hideHeader={section.groupKind === 'all'}
                        isOpen={isOpen}
                        onToggleOpen={(gk, headerEl) => onToggleOpen(gk, isOpen, headerEl)}
                        showAll={showAllMap[groupKey] ?? false}
                        onToggleShowAll={() => onToggleShowAll(groupKey)}
                        readTailOpen={readTailMap[groupKey] ?? false}
                        onToggleReadTail={() => onToggleReadTail(groupKey)}
                      />
                    )
                  })}

                {/* Bottom "yesterday" link */}
                {!isLoading && entries.length > 0 && (
                  <div
                    className="mt-16 flex justify-center border-t py-8"
                    style={{ borderColor: 'var(--digest-divider, #E5E0D2)' }}
                  >
                    <button
                      onClick={handlePrevDay}
                      className="text-sm transition-colors"
                      style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--digest-accent, #B8312F)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--digest-text-tertiary, #9A968C)'
                      }}
                    >
                      {t('empty.yesterday')}
                    </button>
                  </div>
                )}

                {/* Bottom padding for mobile tab bar */}
                {isMobile && <div className="h-[120px]" />}
              </div>
            </main>
          </>
        )}
      </div>

      {/* Right sidebar (hidden in fullscreen reading mode) */}
      {!isFullscreen && (
        <DigestSidebar
          onAddFeed={() => setAddFeedOpen(true)}
          onSelectEntry={handleSelectEntry}
          isMobile={isMobile}
        />
      )}

      {/* Mobile: full-width reader overlay (no left list on narrow viewports) */}
      {selectedEntryId && isMobile && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'var(--digest-bg-card, #FFFFFF)' }}
        >
          {isLoadingEntry && !selectedEntry ? (
            <ArticleReaderSkeleton />
          ) : selectedEntry ? (
            <ArticleReader
              key={selectedEntry.id}
              entry={selectedEntry}
              onClose={handleCloseEntry}
              showCloseButton
            />
          ) : null}
        </div>
      )}

      {/* Add Feed modal */}
      <AddFeedModal open={addFeedOpen} onClose={() => setAddFeedOpen(false)} />

      {/* Search modal */}
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        initialDate={date}
        onSelectEntry={(entry) => {
          setSearchOpen(false)
          handleSelectEntry(entry)
        }}
      />
    </div>
  )
}

function DigestLoadingSkeleton() {
  return (
    <div>
      {/* Section skeleton */}
      <div className="mt-14">
        <div
          className="mb-3 flex items-center justify-between border-b-2 pb-3"
          style={{ borderColor: 'var(--digest-text, #1A1A1A)' }}
        >
          <Skeleton className="h-7 w-36" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-6 w-10" />
          </div>
        </div>
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 border-b border-r p-7"
              style={{ borderColor: 'var(--digest-divider, #E5E0D2)' }}
            >
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmptyState({
  onGoYesterday,
  headline,
  description,
  ctaLabel,
}: {
  date: string
  onGoYesterday: () => void
  headline: string
  description: string
  ctaLabel: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div
        className="mb-4 text-5xl font-bold"
        style={{ fontFamily: "'Noto Serif SC', serif", color: 'var(--digest-divider-strong, #B8B3A5)' }}
      >
        {headline}
      </div>
      <p className="mb-6 text-sm" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
        {description}
      </p>
      <button
        onClick={onGoYesterday}
        className="rounded-md px-4 py-2 text-sm transition-colors"
        style={{
          border: '1px solid var(--digest-divider, #E5E0D2)',
          color: 'var(--digest-text-secondary, #5E5A52)',
        }}
      >
        {ctaLabel}
      </button>
    </div>
  )
}
