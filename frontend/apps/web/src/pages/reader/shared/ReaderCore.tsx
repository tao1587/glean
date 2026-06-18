import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  useInfiniteEntries,
  useEntry,
  useUpdateEntryState,
  useMarkAllRead,
  entryKeys,
} from '../../../hooks/useEntries'
import { useAllSubscriptions } from '../../../hooks/useSubscriptions'
import { entryService } from '@glean/api-client'
import { useAIIntegrationStatus } from '../../../hooks/useAIIntegration'
import { ArticleReader, ArticleReaderSkeleton } from '../../../components/ArticleReader'
import { useAuthStore } from '../../../stores/authStore'
import { useTranslation } from '@glean/i18n'
import type { EntryWithState, TranslationTargetLanguage } from '@glean/types'
import { Loader2, AlertCircle, Inbox, Languages } from 'lucide-react'
import { Alert, AlertTitle, AlertDescription, cn } from '@glean/ui'
import { useReaderController, type FilterType } from './useReaderController'
import {
  BookOpenIcon,
  ResizeHandle,
  EntryListItem,
  MarkAllReadButton,
  EntryListItemSkeleton,
  ReaderFilterTabs,
} from './components/ReaderCoreParts'
import { TodayBoard } from './components/TodayBoard'
import { DigestView } from './components/DigestView'
import { StreamView } from './components/StreamView'
import { PeriodView } from './components/PeriodView'
import { DigestSidebar } from './components/DigestView/DigestSidebar'
import { stripHtmlTags } from '../../../lib/html'
import { shouldAutoTranslate } from '../../../lib/translationLanguagePolicy'
import { buildTodayBoardEntries } from './todayBoard'

const FILTER_ORDER: FilterType[] = ['all', 'unread', 'read-later']
const ENTRY_ROW_ESTIMATED_HEIGHT = 144
const VIRTUALIZATION_THRESHOLD = 80
const VIRTUALIZATION_OVERSCAN = 8
const ENTRY_FADE_ANIMATION_LIMIT = 24
const AUTO_MARK_READ_DELAY_MS = 2000
const LIST_TRANSLATION_BATCH_SIZE = 24

export function calculateVirtualWindow(params: {
  totalCount: number
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  overscan: number
}) {
  const { totalCount, scrollTop, viewportHeight, rowHeight, overscan } = params
  const visibleCount = Math.ceil(viewportHeight / rowHeight)
  const rawStartIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const windowSize = visibleCount + overscan * 2
  const maxStartIndex = Math.max(0, totalCount - windowSize)
  const startIndex = Math.min(rawStartIndex, maxStartIndex)
  const endIndex = Math.min(totalCount, startIndex + windowSize)
  return { startIndex, endIndex, visibleCount, windowSize }
}

/**
 * Reader page.
 *
 * Main reading interface with entry list, filters, and reading pane.
 */
export function ReaderCore({ isMobile }: { isMobile: boolean }) {
  const { t } = useTranslation('reader')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {
    selectedFeedId,
    selectedFolderId,
    entryIdFromUrl,
    viewParam,
    isTodayBoardView,
    isDigestView,
    filterType,
    setFilterType,
    selectedEntryId,
    selectEntry,
    clearSelectedEntry,
    todayBoardDate,
    todayBoardTodayDate,
    recentTodayBoardDates,
    setTodayBoardDate,
    digestDate,
    setDigestDate,
    periodKind,
    periodAnchor,
    setPeriodView,
  } = useReaderController()
  const { user } = useAuthStore()
  const { data: subscriptions = [] } = useAllSubscriptions()
  const { data: aiIntegrationStatus } = useAIIntegrationStatus()
  const userAIIntegrationEnabled = user?.settings?.ai_integration_enabled ?? false
  const aiIntegrationEnabled = (aiIntegrationStatus?.enabled ?? false) && userAIIntegrationEnabled

  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null)

  const handleChangePeriod = useCallback(
    (kind: 'day' | 'week' | 'month', anchor: string) => {
      if (kind === 'day') setDigestDate(anchor)
      else setPeriodView(kind, anchor)
    },
    [setDigestDate, setPeriodView]
  )

  // Store the original position data of the selected entry when it was first clicked.
  const selectedEntryOriginalDataRef = useRef<{
    id: string
    publishedAt: string | null
  } | null>(null)

  // Track previous view state for animations
  const prevViewRef = useRef<{
    feedId: string | undefined
    folderId: string | undefined
    view: 'timeline' | 'today-board' | 'digest'
  }>({
    feedId: selectedFeedId,
    folderId: selectedFolderId,
    view: isTodayBoardView ? 'today-board' : 'timeline',
  })
  const [entriesWidth, setEntriesWidth] = useState(() => {
    const saved = localStorage.getItem('glean:entriesWidth')
    return saved !== null ? Number(saved) : 360
  })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isExitingArticle, setIsExitingArticle] = useState(false)
  const [isExitingEntryList, setIsExitingEntryList] = useState(false)
  const [isEnteringEntryList, setIsEnteringEntryList] = useState(false)
  const exitingEntryRef = useRef<EntryWithState | null>(null)
  const entryListRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const translationObserverRef = useRef<IntersectionObserver | null>(null)
  const translationCacheRef = useRef<Map<string, string>>(new Map())
  const pendingTranslationEntryIdsRef = useRef<Set<string>>(new Set())
  const translatedEntryIdsRef = useRef<Set<string>>(new Set())
  const listTranslationSessionRef = useRef(0)
  const todayBoardTranslationKeyRef = useRef<string | null>(null)
  const autoMarkedEntryIdsRef = useRef<Set<string>>(new Set())
  const [isListTranslationActive, setIsListTranslationActive] = useState(
    user?.settings?.list_translation_auto_enabled ?? false
  )
  const [translatedEntryTexts, setTranslatedEntryTexts] = useState<
    Record<string, { title?: string; summary?: string }>
  >({})
  const [listTranslationBatchCount, setListTranslationBatchCount] = useState(0)
  const [listTranslationLoadingPhase, setListTranslationLoadingPhase] = useState<
    'idle' | 'start' | 'settled'
  >('idle')
  const [listScrollTop, setListScrollTop] = useState(0)
  const [listViewportHeight, setListViewportHeight] = useState(0)
  const prefetchingEntryIdsRef = useRef<Set<string>>(new Set())

  const updateMutation = useUpdateEntryState()
  const { mutateAsync: markAllReadAsync } = useMarkAllRead()
  const updateEntryStateRef = useRef(updateMutation.mutateAsync)
  useEffect(() => {
    updateEntryStateRef.current = updateMutation.mutateAsync
  }, [updateMutation.mutateAsync])

  const prefetchEntryDetail = useCallback(
    (entryId: string) => {
      if (!entryId || prefetchingEntryIdsRef.current.has(entryId)) return
      prefetchingEntryIdsRef.current.add(entryId)

      void queryClient
        .prefetchQuery({
          queryKey: entryKeys.detail(entryId),
          queryFn: () => entryService.getEntry(entryId),
          staleTime: 2 * 60 * 1000,
        })
        .finally(() => {
          prefetchingEntryIdsRef.current.delete(entryId)
        })
    },
    [queryClient]
  )

  const getFilterParams = () => {
    if (isTodayBoardView) {
      return { collected_date: todayBoardDate || undefined, per_page: 500 }
    }

    switch (filterType) {
      case 'unread':
        return { is_read: false }
      case 'read-later':
        return { read_later: true }
      default:
        return {}
    }
  }

  const {
    data: entriesData,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteEntries(
    {
      feed_id: selectedFeedId,
      folder_id: selectedFolderId,
      ...getFilterParams(),
      view: isTodayBoardView ? 'today-board' : 'timeline',
    },
    {
      enabled: (!isTodayBoardView || !!todayBoardDate) && !periodKind,
    }
  )

  const rawEntries = useMemo(
    () => entriesData?.pages.flatMap((page) => page.items) ?? [],
    [entriesData?.pages]
  )
  const feedDescriptionById = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const subscription of subscriptions) {
      map.set(subscription.feed_id, subscription.feed.description ?? null)
    }
    return map
  }, [subscriptions])
  const todayBoardEntries = useMemo(
    () =>
      buildTodayBoardEntries(rawEntries, {
        selectedDate: todayBoardDate,
        filterBySelectedDate: false,
        getFeedDescription: (feedId) => feedDescriptionById.get(feedId) ?? null,
      }),
    [rawEntries, feedDescriptionById, todayBoardDate]
  )
  const todayBoardTranslationEntryIds = useMemo(
    () => todayBoardEntries.map((entry) => entry.id),
    [todayBoardEntries]
  )
  // The daily summary card manages its own data; nothing fetched here.

  // Fetch selected entry separately to keep it visible even when filtered out of list
  const { data: selectedEntry, isLoading: isLoadingEntry } = useEntry(selectedEntryId || '')

  const visibleEntries = useMemo(() => {
    const isUnreadScoped = filterType === 'unread'
    if (!isUnreadScoped) return rawEntries

    return rawEntries.filter((entry) => !entry.is_read || entry.id === selectedEntryId)
  }, [rawEntries, filterType, selectedEntryId])

  const entriesById = useMemo(() => {
    const map = new Map<string, EntryWithState>()
    for (const entry of visibleEntries) {
      map.set(entry.id, entry)
    }
    return map
  }, [visibleEntries])
  const selectedEntryPreview = selectedEntryId ? entriesById.get(selectedEntryId) : undefined
  const resolvedSelectedEntry = selectedEntry ?? selectedEntryPreview

  const markEntryRead = useCallback(
    (entryId: string) => {
      if (autoMarkedEntryIdsRef.current.has(entryId)) return
      autoMarkedEntryIdsRef.current.add(entryId)

      void updateEntryStateRef.current({
        entryId,
        data: { is_read: true },
        updateListCache: !isTodayBoardView,
      })
    },
    [isTodayBoardView]
  )

  const resolvedSelectedEntryId = resolvedSelectedEntry?.id
  const resolvedSelectedEntryIsRead = resolvedSelectedEntry?.is_read ?? false
  useEffect(() => {
    if (!selectedEntryId || !resolvedSelectedEntryId || resolvedSelectedEntryIsRead) return
    if (autoMarkedEntryIdsRef.current.has(selectedEntryId)) return

    const entryId = selectedEntryId
    const timer = window.setTimeout(() => {
      markEntryRead(entryId)
    }, AUTO_MARK_READ_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [markEntryRead, resolvedSelectedEntryId, resolvedSelectedEntryIsRead, selectedEntryId])

  const shouldVirtualize = visibleEntries.length >= VIRTUALIZATION_THRESHOLD
  const virtualizedList = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        startIndex: 0,
        endIndex: visibleEntries.length,
        entries: visibleEntries,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      }
    }

    const viewportHeight = listViewportHeight > 0 ? listViewportHeight : 720
    const { startIndex, endIndex } = calculateVirtualWindow({
      totalCount: visibleEntries.length,
      scrollTop: listScrollTop,
      viewportHeight,
      rowHeight: ENTRY_ROW_ESTIMATED_HEIGHT,
      overscan: VIRTUALIZATION_OVERSCAN,
    })

    return {
      startIndex,
      endIndex,
      entries: visibleEntries.slice(startIndex, endIndex),
      topSpacerHeight: startIndex * ENTRY_ROW_ESTIMATED_HEIGHT,
      bottomSpacerHeight: Math.max(
        0,
        (visibleEntries.length - endIndex) * ENTRY_ROW_ESTIMATED_HEIGHT
      ),
    }
  }, [shouldVirtualize, visibleEntries, listViewportHeight, listScrollTop])

  const preferredTargetLanguage = (user?.settings?.translation_target_language ??
    'zh-CN') as TranslationTargetLanguage
  const listTranslationTargetLanguage = preferredTargetLanguage
  const isListTranslationLoading = isListTranslationActive && listTranslationBatchCount > 0

  // Handle filter change with slide direction
  const handleFilterChange = (newFilter: FilterType) => {
    if (newFilter === filterType) return

    const currentIndex = FILTER_ORDER.indexOf(filterType)
    const newIndex = FILTER_ORDER.indexOf(newFilter)
    const direction = newIndex > currentIndex ? 'right' : 'left'

    setSlideDirection(direction)
    setFilterType(newFilter)
    void queryClient.invalidateQueries({ queryKey: entryKeys.lists() })

    // Reset slide direction after animation completes
    setTimeout(() => setSlideDirection(null), 250)
  }

  useEffect(() => {
    const container = entryListRef.current
    if (!container) return

    const syncMetrics = () => {
      setListViewportHeight(container.clientHeight)
      setListScrollTop(container.scrollTop)
    }

    syncMetrics()
    const resizeObserver = new ResizeObserver(syncMetrics)
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [isMobile])

  // Infinite scroll: use Intersection Observer to detect when load-more element is visible
  useEffect(() => {
    const loadMoreElement = loadMoreRef.current
    const container = entryListRef.current

    if (!loadMoreElement || !container || isLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        // Only fetch if the element is intersecting, has next page, and not already fetching
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      {
        root: container,
        // Trigger prefetch earlier to avoid "must scroll to absolute bottom" on mobile.
        rootMargin: '500px 0px',
        threshold: 0,
      }
    )

    observer.observe(loadMoreElement)

    return () => {
      observer.disconnect()
    }
    // Refs (loadMoreRef, entryListRef) are stable and don't need to be in dependencies
    // Filter params (filterType, feedId, folderId, viewParam) are handled by React Query
    // fetchNextPage is stable and always uses current query parameters
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, isLoading])

  // Scroll handling: prefetch next page and persist resume anchors.
  useEffect(() => {
    const container = entryListRef.current
    if (!container || isLoading) return

    const onScroll = () => {
      setListScrollTop(container.scrollTop)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
    }
  }, [isLoading])

  // Initialize list translation toggle from persisted setting
  useEffect(() => {
    setIsListTranslationActive(user?.settings?.list_translation_auto_enabled ?? false)
  }, [user?.settings?.list_translation_auto_enabled])

  useEffect(() => {
    if (isListTranslationActive) return
    listTranslationSessionRef.current += 1
    translatedEntryIdsRef.current.clear()
    pendingTranslationEntryIdsRef.current.clear()
    translationCacheRef.current.clear()
    setListTranslationBatchCount(0)
    setListTranslationLoadingPhase('idle')
    setTranslatedEntryTexts({})
  }, [isListTranslationActive])

  useEffect(() => {
    if (!isListTranslationLoading) {
      setListTranslationLoadingPhase('idle')
      return
    }

    setListTranslationLoadingPhase('start')
    const timer = window.setTimeout(() => {
      setListTranslationLoadingPhase('settled')
    }, 1000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [isListTranslationLoading])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('readerMobileListActions:state', {
        detail: {
          active: isListTranslationActive,
          loading: isListTranslationLoading,
          phase: listTranslationLoadingPhase,
        },
      })
    )
  }, [isListTranslationActive, isListTranslationLoading, listTranslationLoadingPhase])

  // Batch-translate multiple visible list entries in a single API call.
  const translateListEntries = useCallback(
    async (entryIds: string[]) => {
      if (!isListTranslationActive) return
      const sessionId = listTranslationSessionRef.current

      // Filter to entries that haven't been translated or are pending
      const toTranslate = entryIds.filter(
        (id) =>
          !translatedEntryIdsRef.current.has(id) && !pendingTranslationEntryIdsRef.current.has(id)
      )
      if (toTranslate.length === 0) return

      // Build per-entry text lists and collect all uncached texts
      type EntryTexts = { entry: EntryWithState; title: string; summaryPlain: string }
      const entryTexts: EntryTexts[] = []
      for (const id of toTranslate) {
        const entry = entriesById.get(id)
        if (!entry) continue
        const summaryPlain = stripHtmlTags(entry.summary || '').trim()
        const hasTranslatableText = [entry.title, summaryPlain]
          .filter((t) => t.length > 0)
          .some((t) => shouldAutoTranslate(t, preferredTargetLanguage))
        if (!hasTranslatableText) continue
        entryTexts.push({ entry, title: entry.title, summaryPlain })
        pendingTranslationEntryIdsRef.current.add(id)
      }

      if (entryTexts.length === 0) return

      // Collect all unique uncached texts across all entries
      const allTexts = entryTexts.flatMap(({ title, summaryPlain }) =>
        [title, summaryPlain].filter((t) => t.length > 0)
      )
      const uncachedTexts = [
        ...new Set(allTexts.filter((t) => !translationCacheRef.current.has(t))),
      ]
      setListTranslationBatchCount((count) => count + 1)

      try {
        for (let index = 0; index < uncachedTexts.length; index += LIST_TRANSLATION_BATCH_SIZE) {
          const batch = uncachedTexts.slice(index, index + LIST_TRANSLATION_BATCH_SIZE)
          if (batch.length === 0) continue

          const response = await entryService.translateTexts(
            batch,
            listTranslationTargetLanguage,
            'auto'
          )
          if (sessionId !== listTranslationSessionRef.current) return
          batch.forEach((text, batchIndex) => {
            const translated = response.translations[batchIndex]
            if (translated && translated.trim()) {
              translationCacheRef.current.set(text, translated.trim())
            }
          })
        }
        if (sessionId !== listTranslationSessionRef.current) return

        const updates: Record<string, { title?: string; summary?: string }> = {}
        for (const { entry, title, summaryPlain } of entryTexts) {
          updates[entry.id] = {
            title: translationCacheRef.current.get(title),
            summary: summaryPlain ? translationCacheRef.current.get(summaryPlain) : undefined,
          }
          translatedEntryIdsRef.current.add(entry.id)
        }

        // Apply results to all entries at once.
        setTranslatedEntryTexts((prev) => ({ ...prev, ...updates }))
      } catch (error) {
        console.error('Failed to translate list entries:', error)
      } finally {
        if (sessionId === listTranslationSessionRef.current) {
          setListTranslationBatchCount((count) => Math.max(0, count - 1))
          for (const { entry } of entryTexts) {
            pendingTranslationEntryIdsRef.current.delete(entry.id)
          }
        }
      }
    },
    [entriesById, isListTranslationActive, listTranslationTargetLanguage, preferredTargetLanguage]
  )

  // Viewport-only list translation to reduce API usage
  useEffect(() => {
    if (!isListTranslationActive || !entryListRef.current || visibleEntries.length === 0) return

    const container = entryListRef.current
    let pendingIds: string[] = []
    let timer: ReturnType<typeof setTimeout> | null = null

    const observer = new IntersectionObserver(
      (intersectionEntries) => {
        const visibleIds = intersectionEntries
          .filter((item) => item.isIntersecting)
          .map((item) => (item.target as HTMLElement).dataset.entryId)
          .filter((id): id is string => !!id)

        if (visibleIds.length === 0) return
        pendingIds.push(...visibleIds)

        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          const unique = Array.from(new Set(pendingIds))
          pendingIds = []
          // Batch all visible entries into a single API call
          void translateListEntries(unique)
        }, 120)
      },
      { root: container, rootMargin: '0px 0px 220px 0px', threshold: 0.1 }
    )

    translationObserverRef.current = observer
    const entryNodes = container.querySelectorAll('[data-entry-id]')
    entryNodes.forEach((node) => observer.observe(node))

    return () => {
      if (timer) clearTimeout(timer)
      observer.disconnect()
      translationObserverRef.current = null
    }
  }, [
    virtualizedList.startIndex,
    virtualizedList.endIndex,
    isListTranslationActive,
    translateListEntries,
    visibleEntries.length,
  ])

  useEffect(() => {
    if (
      !isTodayBoardView ||
      !isListTranslationActive ||
      todayBoardTranslationEntryIds.length === 0
    ) {
      todayBoardTranslationKeyRef.current = null
      return
    }

    const translationKey = [
      listTranslationSessionRef.current,
      todayBoardDate,
      todayBoardTranslationEntryIds.join('\u0000'),
    ].join(':')
    if (todayBoardTranslationKeyRef.current === translationKey) return

    todayBoardTranslationKeyRef.current = translationKey
    void translateListEntries(todayBoardTranslationEntryIds)
  }, [
    isTodayBoardView,
    isListTranslationActive,
    todayBoardDate,
    todayBoardTranslationEntryIds,
    translateListEntries,
  ])

  // Trigger animation on view change (Smart <-> Feed/Folder/All)
  // Also reset selected entry when switching views to prevent stale entries
  useEffect(() => {
    if (!entryIdFromUrl) {
      selectedEntryOriginalDataRef.current = null
    }
  }, [entryIdFromUrl])

  useEffect(() => {
    const prev = prevViewRef.current
    const currentViewMode = isTodayBoardView ? 'today-board' : 'timeline'
    const viewChanged =
      prev.feedId !== selectedFeedId ||
      prev.folderId !== selectedFolderId ||
      prev.view !== currentViewMode

    if (viewChanged) {
      // Clear selected entry when switching views
      // This prevents showing an entry from a different feed/folder in the new view
      // Only clear if the change is not due to URL entry parameter
      if (!entryIdFromUrl) {
        clearSelectedEntry(true)
      }

      void queryClient.invalidateQueries({ queryKey: entryKeys.lists() })

      setSlideDirection('right')

      // Update ref
      prevViewRef.current = {
        feedId: selectedFeedId,
        folderId: selectedFolderId,
        view: currentViewMode,
      }

      // Reset slide direction after animation
      setTimeout(() => setSlideDirection(null), 300)
    }
  }, [
    selectedFeedId,
    selectedFolderId,
    isTodayBoardView,
    entryIdFromUrl,
    clearSelectedEntry,
    queryClient,
  ])

  // Keyboard navigation: arrow keys and j/k to switch between entries
  const handleKeyboardNavigation = useCallback(
    (e: KeyboardEvent) => {
      // Ignore when focus is in input, textarea, or contenteditable elements
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      const isNext = e.key === 'ArrowDown' || e.key === 'j'
      const isPrev = e.key === 'ArrowUp' || e.key === 'k'
      if (!isNext && !isPrev) return

      e.preventDefault()

      if (visibleEntries.length === 0) return

      const currentIndex = selectedEntryId
        ? visibleEntries.findIndex((entry) => entry.id === selectedEntryId)
        : -1

      let nextIndex: number
      if (currentIndex === -1) {
        // No entry selected: select the first one
        nextIndex = 0
      } else if (isNext) {
        if (currentIndex >= visibleEntries.length - 1) return // Already at the end
        nextIndex = currentIndex + 1
      } else {
        if (currentIndex <= 0) return // Already at the beginning
        nextIndex = currentIndex - 1
      }

      const nextEntry = visibleEntries[nextIndex]
      if (nextEntry) {
        handleSelectEntry(nextEntry)
        const container = entryListRef.current
        if (container) {
          const itemTop = nextIndex * ENTRY_ROW_ESTIMATED_HEIGHT
          const itemBottom = itemTop + ENTRY_ROW_ESTIMATED_HEIGHT
          if (itemTop < container.scrollTop) {
            container.scrollTo({ top: itemTop, behavior: 'smooth' })
          } else if (itemBottom > container.scrollTop + container.clientHeight) {
            container.scrollTo({
              top: itemBottom - container.clientHeight,
              behavior: 'smooth',
            })
          }
        }
      }
    },
    [visibleEntries, selectedEntryId] // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardNavigation)
    return () => document.removeEventListener('keydown', handleKeyboardNavigation)
  }, [handleKeyboardNavigation])

  // Handle entry selection. A separate effect marks unread entries as read after
  // they remain open briefly, so quick peeks do not immediately consume them.
  const handleSelectEntry = async (entry: EntryWithState) => {
    // Seed detail cache immediately for perceived instant open.
    queryClient.setQueryData(entryKeys.detail(entry.id), (old: EntryWithState | undefined) => ({
      ...entry,
      ...(old || {}),
    }))

    // On mobile, trigger entry list exit animation while opening reader
    if (isMobile) {
      setIsExitingEntryList(true)
      selectEntry(entry.id)
      // Notify Layout to hide its header (ArticleReader will show its own)
      window.dispatchEvent(new CustomEvent('showArticleReader'))
    } else {
      selectEntry(entry.id)
    }

    // Save the original position data when first selecting an entry.
    if (selectedEntryOriginalDataRef.current?.id !== entry.id) {
      selectedEntryOriginalDataRef.current = {
        id: entry.id,
        publishedAt: entry.published_at,
      }
    }
  }

  const handleTodayBoardFeedSelect = useCallback(
    (feedId: string) => {
      const nextParams = new URLSearchParams()
      nextParams.set('feed', feedId)
      navigate(`/reader?${nextParams.toString()}`)
    },
    [navigate]
  )

  const handleTodayBoardDetailClose = useCallback(() => {
    clearSelectedEntry(true)
    void queryClient.invalidateQueries({ queryKey: entryKeys.lists() })
  }, [clearSelectedEntry, queryClient])

  const handleTodayBoardMarkAllRead = useCallback(
    async (feedId: string) => {
      await markAllReadAsync({ feedId })
    },
    [markAllReadAsync]
  )

  useEffect(() => {
    localStorage.setItem('glean:entriesWidth', String(entriesWidth))
  }, [entriesWidth])

  // On mobile, keep list mounted to preserve scroll position and observer bindings.
  const isReaderVisibleOnMobile = isMobile && (!!selectedEntryId || isExitingArticle)
  const showReader = !isMobile || !!selectedEntryId

  useEffect(() => {
    const onToggleTranslation = () => {
      if (!isMobile || isReaderVisibleOnMobile) return
      setIsListTranslationActive((v) => !v)
    }
    const onSetFilter = (event: Event) => {
      if (!isMobile || isReaderVisibleOnMobile) return
      const detail = (event as CustomEvent).detail as { filter?: FilterType } | undefined
      const nextFilter = detail?.filter
      if (!nextFilter || !FILTER_ORDER.includes(nextFilter)) return
      handleFilterChange(nextFilter)
    }

    window.addEventListener('readerMobileListActions:toggleTranslation', onToggleTranslation)
    window.addEventListener('readerMobileListActions:setFilter', onSetFilter)
    return () => {
      window.removeEventListener('readerMobileListActions:toggleTranslation', onToggleTranslation)
      window.removeEventListener('readerMobileListActions:setFilter', onSetFilter)
    }
  }, [isMobile, isReaderVisibleOnMobile, filterType]) // eslint-disable-line react-hooks/exhaustive-deps

  if (periodKind) {
    return (
      <PeriodView
        periodKind={periodKind}
        anchorDate={periodAnchor}
        onChangePeriod={handleChangePeriod}
        onOpenEntry={(e) => selectEntry(e.id)}
      />
    )
  }

  if (isDigestView) {
    // When a feed/folder scope is active, swap Digest for the time-ordered StreamView.
    // The DigestSidebar (rendered inside each view) handles URL params for scope selection.
    if (selectedFeedId || selectedFolderId) {
      return (
        <StreamViewShell
          feedId={selectedFeedId}
          folderId={selectedFolderId}
          isMobile={isMobile}
        />
      )
    }
    return (
      <DigestView
        date={digestDate}
        isMobile={isMobile}
        onDateChange={setDigestDate}
        onChangePeriod={handleChangePeriod}
      />
    )
  }

  if (isTodayBoardView) {
    return (
      <div className="relative flex h-full w-full min-w-0">
        {error ? (
          <div className="w-full p-4">
            <Alert variant="error">
              <AlertCircle />
              <AlertTitle>{t('entries.loadError')}</AlertTitle>
              <AlertDescription>{(error as Error).message}</AlertDescription>
            </Alert>
          </div>
        ) : (
          <>
            <div
              className={cn(
                'flex min-w-0 flex-1',
                isMobile && selectedEntryId && 'pointer-events-none opacity-0'
              )}
              aria-hidden={isMobile && !!selectedEntryId}
            >
              <TodayBoard
                entries={todayBoardEntries}
                selectedEntryId={isMobile ? null : selectedEntryId}
                selectedDateKey={todayBoardDate}
                todayDateKey={todayBoardTodayDate}
                recentDates={recentTodayBoardDates}
                onSelectDate={setTodayBoardDate}
                onSelectFeed={handleTodayBoardFeedSelect}
                isLoading={isLoading}
                onSelectEntry={handleSelectEntry}
                onCloseDetail={handleTodayBoardDetailClose}
                onMarkAllReadFeed={handleTodayBoardMarkAllRead}
                listWidthPx={entriesWidth}
                isTranslationActive={isListTranslationActive}
                isTranslationLoading={isListTranslationLoading}
                translationLoadingPhase={listTranslationLoadingPhase}
                translatedTexts={translatedEntryTexts}
                onToggleTranslation={() => setIsListTranslationActive((value) => !value)}
                aiEnabled={aiIntegrationEnabled}
                renderDetail={
                  isMobile
                    ? undefined
                    : (entry) => (
                        <ArticleReader
                          key={entry.id}
                          entry={
                            selectedEntryId === entry.id && resolvedSelectedEntry
                              ? resolvedSelectedEntry
                              : entry
                          }
                          onClose={handleTodayBoardDetailClose}
                          isFullscreen={isFullscreen}
                          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
                          showCloseButton
                          showFullscreenButton
                        />
                      )
                }
              />
            </div>

            {isMobile && selectedEntryId ? (
              <div className="absolute inset-0 z-20 flex min-w-0 flex-1 flex-col">
                {isLoadingEntry && !resolvedSelectedEntry ? (
                  <ArticleReaderSkeleton />
                ) : resolvedSelectedEntry ? (
                  <ArticleReader
                    key={resolvedSelectedEntry.id}
                    entry={resolvedSelectedEntry}
                    onClose={() => {
                      window.dispatchEvent(new CustomEvent('hideArticleReader'))
                      clearSelectedEntry(true)
                      void queryClient.invalidateQueries({ queryKey: entryKeys.lists() })
                    }}
                    isFullscreen={false}
                    onToggleFullscreen={() => undefined}
                    showCloseButton
                    enableMobileCloseGesture={false}
                  />
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    )
  }

  return (
    <div className={`flex h-full ${isMobile ? 'relative' : ''}`}>
      {/* Entry list */}
      {!isFullscreen && (
        <>
          <div
            className={`border-border bg-card/50 relative flex min-w-0 flex-col border-r ${
              isMobile
                ? `absolute inset-0 z-10 w-full transition-opacity duration-200 ${
                    isExitingEntryList
                      ? 'entry-list-transition-exit'
                      : isEnteringEntryList
                        ? 'entry-list-transition'
                        : isReaderVisibleOnMobile
                          ? 'pointer-events-none opacity-0'
                          : ''
                  }`
                : ''
            }`}
            style={
              !isMobile
                ? { width: `${entriesWidth}px`, minWidth: '280px', maxWidth: '500px' }
                : undefined
            }
            onAnimationEnd={(e) => {
              // Only handle the entry list animation end, not nested animations
              if (isMobile && e.currentTarget === e.target) {
                if (isExitingEntryList) {
                  setIsExitingEntryList(false)
                }
                if (isEnteringEntryList) {
                  setIsEnteringEntryList(false)
                }
              }
            }}
          >
            {/* Filters */}
            {!isMobile && (
              <div className="border-border bg-card border-b px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="bg-muted/50 @container flex min-w-0 flex-1 items-center gap-1 rounded-lg p-1">
                    <ReaderFilterTabs
                      filterType={filterType}
                      onFilterChange={handleFilterChange}
                    />
                  </div>

                  <button
                    onClick={() => setIsListTranslationActive((v) => !v)}
                    title={
                      isListTranslationLoading
                        ? t('translation.translating')
                        : isListTranslationActive
                          ? t('translation.hideTranslation')
                          : t('translation.translate')
                    }
                    aria-label={
                      isListTranslationLoading
                        ? t('translation.translating')
                        : isListTranslationActive
                          ? t('translation.hideTranslation')
                          : t('translation.translate')
                    }
                    className={cn(
                      'list-translation-toggle hover:bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                      isListTranslationActive ? 'text-primary' : 'text-muted-foreground',
                      isListTranslationLoading && 'list-translation-toggle-loading',
                      listTranslationLoadingPhase === 'start' &&
                        'list-translation-toggle-loading-start',
                      listTranslationLoadingPhase === 'settled' &&
                        'list-translation-toggle-loading-settled'
                    )}
                  >
                    <span className="list-translation-toggle__icon-wrap">
                      <span className="list-translation-toggle__ring" aria-hidden="true" />
                      <Languages className="list-translation-toggle__icon h-4 w-4" />
                    </span>
                  </button>

                  <MarkAllReadButton feedId={selectedFeedId} folderId={selectedFolderId} />
                </div>
              </div>
            )}

            {/* Entry list */}
            <div
              ref={entryListRef}
              className="reader-pan-y no-horizontal-overscroll flex-1 overflow-y-auto"
            >
              <div
                key={`${selectedFeedId || 'all'}-${selectedFolderId || 'none'}-${filterType}-${viewParam || 'timeline'}`}
                className={`feed-content-transition ${
                  slideDirection === 'right'
                    ? 'animate-slide-from-right'
                    : slideDirection === 'left'
                      ? 'animate-slide-from-left'
                      : ''
                }`}
              >
                {isLoading && (
                  <div className="divide-border/40 divide-y px-1 py-0.5">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <EntryListItemSkeleton key={index} />
                    ))}
                  </div>
                )}

                {error && (
                  <div className="p-4">
                    <Alert variant="error">
                      <AlertCircle />
                      <AlertTitle>{t('entries.loadError')}</AlertTitle>
                      <AlertDescription>{(error as Error).message}</AlertDescription>
                    </Alert>
                  </div>
                )}

                {visibleEntries.length === 0 && !isLoading && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                      <Inbox className="text-muted-foreground h-8 w-8" />
                    </div>
                    <p className="text-muted-foreground">{t('entries.noEntries')}</p>
                    <p className="text-muted-foreground/60 mt-1 text-xs">
                      {t('empty.tryChangingFilter')}
                    </p>
                  </div>
                )}

                <div className="divide-border/40 divide-y px-1 py-0.5">
                  {virtualizedList.topSpacerHeight > 0 && (
                    <div aria-hidden style={{ height: virtualizedList.topSpacerHeight }} />
                  )}
                  {virtualizedList.entries.map((entry, index) => {
                    const globalIndex = virtualizedList.startIndex + index
                    const delay =
                      !shouldVirtualize && globalIndex < ENTRY_FADE_ANIMATION_LIMIT
                        ? `${globalIndex * 0.02}s`
                        : undefined

                    return (
                      <EntryListItem
                        key={entry.id}
                        entry={entry}
                        isSelected={selectedEntryId === entry.id}
                        onClick={() => handleSelectEntry(entry)}
                        onPrefetch={() => prefetchEntryDetail(entry.id)}
                        style={delay ? { animationDelay: delay } : undefined}
                        showFeedInfo={!selectedFeedId}
                        showReadLaterRemaining={
                          !isMobile &&
                          filterType === 'read-later' &&
                          (user?.settings?.show_read_later_remaining ?? true)
                        }
                        hideReadStatusIndicator={isMobile}
                        hideReadLaterIndicator={isMobile}
                        translatedTitle={
                          isListTranslationActive
                            ? translatedEntryTexts[entry.id]?.title
                            : undefined
                        }
                        translatedSummary={
                          isListTranslationActive
                            ? translatedEntryTexts[entry.id]?.summary
                            : undefined
                        }
                        dataEntryId={entry.id}
                      />
                    )
                  })}
                  {virtualizedList.bottomSpacerHeight > 0 && (
                    <div aria-hidden style={{ height: virtualizedList.bottomSpacerHeight }} />
                  )}
                </div>

                {/* Intersection observer target for infinite scroll */}
                {hasNextPage && !isFetchingNextPage && visibleEntries.length > 0 && (
                  <div ref={loadMoreRef} className="h-4" />
                )}

                {/* Loading more indicator */}
                {isFetchingNextPage && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
                    <span className="text-muted-foreground ml-2 text-sm">
                      {t('entries.loadingMore')}
                    </span>
                  </div>
                )}

                {/* End of list indicator */}
                {!hasNextPage && visibleEntries.length > 0 && (
                  <div className="flex items-center justify-center py-6">
                    <span className="text-muted-foreground text-sm">
                      {t('entries.noMoreEntries')}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* Resize handle - desktop only, positioned inside container */}
            {!isMobile && (
              <ResizeHandle
                onResize={(delta) =>
                  setEntriesWidth((w) => Math.max(280, Math.min(500, w + delta)))
                }
              />
            )}
          </div>
        </>
      )}

      {/* Reading pane */}
      {(showReader || isExitingArticle) && (
        <div
          key={selectedEntryId || 'exiting'}
          className={`flex min-w-0 flex-1 flex-col ${
            isMobile
              ? `absolute inset-0 z-20 ${isExitingArticle ? 'reader-transition-exit' : 'reader-transition'}`
              : isExitingArticle
                ? 'reader-transition-exit'
                : 'reader-transition'
          }`}
          onAnimationEnd={() => {
            if (isExitingArticle) {
              setIsExitingArticle(false)
              exitingEntryRef.current = null
            }
          }}
        >
          {isLoadingEntry && selectedEntryId && !resolvedSelectedEntry ? (
            <ArticleReaderSkeleton />
          ) : resolvedSelectedEntry || exitingEntryRef.current ? (
            <ArticleReader
              key={(resolvedSelectedEntry || exitingEntryRef.current)!.id}
              entry={(resolvedSelectedEntry || exitingEntryRef.current)!}
              onClose={() => {
                if (isMobile && selectedEntry) {
                  // Notify Layout to show its header immediately (starts fade-in animation
                  // concurrently with reader slide-out animation)
                  window.dispatchEvent(new CustomEvent('hideArticleReader'))
                  exitingEntryRef.current = selectedEntry
                  setIsExitingArticle(true)
                  setIsEnteringEntryList(true)
                  clearSelectedEntry(true)
                  void queryClient.invalidateQueries({ queryKey: entryKeys.lists() })
                } else {
                  clearSelectedEntry(true)
                  void queryClient.invalidateQueries({ queryKey: entryKeys.lists() })
                }
              }}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
            />
          ) : !isMobile ? (
            <div className="bg-background flex min-w-0 flex-1 flex-col items-center justify-center">
              <div className="text-center">
                <div className="bg-muted mb-4 inline-flex h-20 w-20 items-center justify-center rounded-2xl">
                  <BookOpenIcon className="text-muted-foreground h-10 w-10" />
                </div>
                <h3 className="font-display text-foreground text-lg font-semibold">
                  {t('empty.selectArticle')}
                </h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t('empty.selectArticleDescription')}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * Small shell that renders StreamView alongside DigestSidebar so the rail/panel
 * (feeds/saved/settings) stays available while browsing a feed or folder stream.
 */
function StreamViewShell({
  feedId,
  folderId,
  isMobile,
}: {
  feedId?: string
  folderId?: string
  isMobile: boolean
}) {
  const [, setSearchParams] = useSearchParams()
  // Saved-panel entry selection → sync ?entry= so the current view can pick it up.
  // StreamView manages its own local selection; we're just keeping the Saved flow alive.
  const handleSelectEntry = useCallback(
    (entry: EntryWithState) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('entry', entry.id)
          return next
        },
        { replace: false }
      )
    },
    [setSearchParams]
  )

  // Sidebar's onAddFeed is a no-op here — the panel has its own add-feed button
  // inside FeedsPanel, and the shell does not own an AddFeedModal. Wire up if needed.
  return (
    <div className="flex min-h-full w-full flex-1">
      <StreamView feedId={feedId} folderId={folderId} isMobile={isMobile} />
      <DigestSidebar
        onAddFeed={() => undefined}
        onSelectEntry={handleSelectEntry}
        isMobile={isMobile}
      />
    </div>
  )
}

