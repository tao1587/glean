import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Inbox, Loader2 } from 'lucide-react'
import { Alert, AlertTitle, AlertDescription, cn, Skeleton } from '@glean/ui'
import { useTranslation } from '@glean/i18n'
import type { EntryWithState, FolderTreeNode } from '@glean/types'
import { ArticleReader, ArticleReaderSkeleton } from '@/components/ArticleReader'
import {
  useInfiniteEntries,
  useEntry,
  useUpdateEntryState,
} from '@/hooks/useEntries'
import { useListEntriesTranslation } from '@/hooks/useListEntriesTranslation'
import { useAllSubscriptions } from '@/hooks/useSubscriptions'
import { useFolders } from '@/hooks/useFolders'
import { useThemeStore } from '@/stores/themeStore'
import { useDigestSettingsStore } from '@/stores/digestSettingsStore'
import { DigestArticleCard } from '../DigestView/DigestArticleCard'
import { DigestSection } from '../DigestView/DigestSection'
import { groupEntries } from '../DigestView/digestHelpers'

/**
 * Reuse the DigestView color vocabulary so Stream feels continuous with Digest.
 * (Same tokens as DigestView/index.tsx.)
 */
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

type StreamFilter = 'unread' | 'all'

interface StreamViewProps {
  feedId?: string
  folderId?: string
  isMobile: boolean
}

function findFolderName(nodes: FolderTreeNode[], id: string): string | null {
  for (const n of nodes) {
    if (n.id === id) return n.name
    const inner = findFolderName(n.children, id)
    if (inner) return inner
  }
  return null
}

/** Collect the folder id plus all descendant folder ids under it. */
function collectFolderIds(nodes: FolderTreeNode[], targetId: string): Set<string> | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      const out = new Set<string>()
      const walk = (n: FolderTreeNode) => {
        out.add(n.id)
        for (const c of n.children) walk(c)
      }
      walk(node)
      return out
    }
    const inner = collectFolderIds(node.children, targetId)
    if (inner) return inner
  }
  return null
}

/**
 * StreamView — time-ordered infinite stream of entries for a single feed or folder.
 * Unread/All tab switcher. Shares Digest's visual vocabulary.
 *
 * NOTE: j/k/o/Esc shortcuts are not wired here yet — the existing `useDigestKeyboard`-style
 * keyboard logic in DigestView is tightly coupled to day-grouped sections. Add later if needed.
 */
export function StreamView({ feedId, folderId, isMobile }: StreamViewProps) {
  const { t } = useTranslation('reader')
  const { t: tDigest } = useTranslation('digest')
  const navigate = useNavigate()
  const { resolvedTheme } = useThemeStore()
  const { autoMarkRead } = useDigestSettingsStore()

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)

  const updateMutation = useUpdateEntryState()

  // Resolve stream title from subs/folders.
  const { data: subscriptions = [] } = useAllSubscriptions()
  const { folders } = useFolders('feed')

  const title = useMemo(() => {
    if (feedId) {
      const sub = subscriptions.find((s) => s.feed_id === feedId)
      return sub?.custom_title || sub?.feed.title || sub?.feed.url || ''
    }
    if (folderId) {
      return findFolderName(folders, folderId) ?? ''
    }
    return ''
  }, [feedId, folderId, subscriptions, folders])

  // Feed ids that belong to the active folder (direct + nested).
  const folderFeedIdSet = useMemo<Set<string> | null>(() => {
    if (!folderId) return null
    const folderIds = collectFolderIds(folders, folderId) ?? new Set<string>([folderId])
    const feedIds = new Set<string>()
    for (const sub of subscriptions) {
      if (sub.folder_id && folderIds.has(sub.folder_id)) {
        feedIds.add(sub.feed_id)
      }
    }
    return feedIds
  }, [folderId, folders, subscriptions])

  const unreadCount = useMemo(() => {
    if (feedId) {
      const sub = subscriptions.find((s) => s.feed_id === feedId)
      return sub?.unread_count ?? 0
    }
    if (folderId && folderFeedIdSet) {
      return subscriptions
        .filter((s) => folderFeedIdSet.has(s.feed_id))
        .reduce((sum, s) => sum + (s.unread_count || 0), 0)
    }
    return 0
  }, [feedId, folderId, subscriptions, folderFeedIdSet])

  // Smart default tab: 'unread' when there is unread, else 'all'. Only set once
  // to avoid fighting the user's manual selection after subs data arrives.
  const [filter, setFilter] = useState<StreamFilter>(() =>
    unreadCount > 0 ? 'unread' : 'all'
  )
  const filterInitializedRef = useRef(false)
  useEffect(() => {
    if (filterInitializedRef.current) return
    if (subscriptions.length === 0) return
    filterInitializedRef.current = true
    setFilter(unreadCount > 0 ? 'unread' : 'all')
    // Intentionally depend on subs length — first non-empty load triggers the one-time adjust.
  }, [subscriptions.length, unreadCount])

  // Reset the initialized flag when the scope changes so a new feed/folder
  // can re-evaluate its own default.
  useEffect(() => {
    filterInitializedRef.current = false
  }, [feedId, folderId])

  // Fetch entries via infinite scroll.
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteEntries(
    {
      feed_id: feedId,
      folder_id: folderId,
      ...(filter === 'unread' ? { is_read: false } : {}),
    },
    { enabled: !!(feedId || folderId) }
  )

  const entries = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data?.pages]
  )

  // List translation (viewport-aware).
  const scrollRootRef = useRef<HTMLElement | null>(null)
  const { translations } = useListEntriesTranslation({
    entries,
    containerRef: scrollRootRef,
  })

  // Selected entry for article reader.
  const { data: selectedEntry, isLoading: isLoadingEntry } = useEntry(selectedEntryId ?? '')

  const handleSelectEntry = useCallback(
    (entry: EntryWithState) => {
      setSelectedEntryId(entry.id)
      if (autoMarkRead && !entry.is_read) {
        void updateMutation.mutateAsync({
          entryId: entry.id,
          data: { is_read: true },
        })
      }
    },
    [autoMarkRead, updateMutation]
  )

  const handleCloseEntry = useCallback(() => {
    const closingId = selectedEntryId
    setSelectedEntryId(null)
    if (closingId) {
      const entry = entries.find((e) => e.id === closingId)
      if (entry && !entry.is_read) {
        void updateMutation.mutateAsync({
          entryId: entry.id,
          data: { is_read: true },
        })
      }
    }
  }, [selectedEntryId, entries, updateMutation])

  // Reset selection on filter or scope change.
  useEffect(() => {
    setSelectedEntryId(null)
  }, [feedId, folderId, filter])

  // Infinite scroll sentinel.
  const loadMoreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (obs) => {
        const [first] = obs
        if (first?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '600px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const digestVars = resolvedTheme === 'dark' ? DIGEST_DARK_VARS : DIGEST_LIGHT_VARS

  const handleBackToDigest = useCallback(() => {
    navigate('/reader')
  }, [navigate])

  // Group entries by feed when in folder view.
  const folderSections = useMemo(() => {
    if (!folderId || feedId) return null
    return groupEntries(entries, 'feed', { folders, subscriptions })
  }, [folderId, feedId, entries, folders, subscriptions])

  return (
    <div
      className="flex min-h-full flex-1"
      style={
        {
          ...digestVars,
          background: 'var(--digest-bg)',
          color: 'var(--digest-text)',
        } as React.CSSProperties
      }
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {selectedEntryId ? (
          /* Reading mode: full-width reader. Mobile gets overlay treatment. */
          <div
            className={cn(
              'flex min-h-0 flex-1',
              isMobile && 'fixed inset-0 z-50 flex-col'
            )}
            style={isMobile ? { background: 'var(--digest-bg-card, #FFFFFF)' } : undefined}
          >
            <main
              className="min-w-0 flex-1 overflow-y-auto"
              style={{ background: 'var(--digest-bg-card, #FFFFFF)' }}
            >
              {isLoadingEntry && !selectedEntry ? (
                <ArticleReaderSkeleton />
              ) : selectedEntry ? (
                <ArticleReader
                  key={selectedEntry.id}
                  entry={selectedEntry}
                  onClose={handleCloseEntry}
                  isFullscreen={false}
                  onToggleFullscreen={() => undefined}
                  showCloseButton
                />
              ) : null}
            </main>
          </div>
        ) : (
          <>
            {/* Masthead */}
            <header
              className="border-b px-6 pb-6 pt-6 sm:px-8 md:px-10 lg:px-12"
              style={{ borderColor: 'var(--digest-divider, #E5E0D2)' }}
            >
              <div className="mx-auto max-w-[1600px]">
                {/* Back to digest link */}
                <button
                  type="button"
                  onClick={handleBackToDigest}
                  className="mb-3 inline-flex items-center gap-1 text-xs transition-colors"
                  style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--digest-text, #1A1A1A)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--digest-text-tertiary, #9A968C)'
                  }}
                >
                  <ArrowLeft className="h-3 w-3" />
                  {tDigest('masthead.backToDigest')}
                </button>

                {/* Title + unread badge on left, tabs on right — one row */}
                <div className="flex items-center justify-between gap-4">
                  <h1
                    className="flex items-baseline gap-3 font-serif font-bold leading-none tracking-tight"
                    style={{
                      fontFamily: "'Noto Serif SC', Georgia, serif",
                      fontSize: 'clamp(26px, 3.8vw, 40px)',
                    }}
                  >
                    <span>{title}</span>
                    {unreadCount > 0 && (
                      <span
                        className="text-xs font-normal"
                        style={{
                          color: 'var(--digest-text-tertiary, #9A968C)',
                          fontFeatureSettings: '"tnum"',
                        }}
                      >
                        {unreadCount}
                      </span>
                    )}
                  </h1>

                  <div
                    className="flex shrink-0 items-center gap-1 rounded-md p-1"
                    style={{ background: 'var(--digest-bg-hover, #F1EDE2)' }}
                  >
                    <FilterTab
                      active={filter === 'unread'}
                      onClick={() => setFilter('unread')}
                      label={t('filters.unread')}
                    />
                    <FilterTab
                      active={filter === 'all'}
                      onClick={() => setFilter('all')}
                      label={t('filters.all')}
                    />
                  </div>
                </div>
              </div>
            </header>

            {/* Content */}
            <main className="min-w-0 flex-1 px-[18px] pb-40 sm:px-6 md:px-8 lg:px-8 xl:px-12">
              <div className="mx-auto max-w-[1600px]">
                {error && (
                  <div className="py-8">
                    <Alert variant="error">
                      <AlertCircle />
                      <AlertTitle>{t('entries.loadError')}</AlertTitle>
                      <AlertDescription>{(error as Error).message}</AlertDescription>
                    </Alert>
                  </div>
                )}

                {isLoading && !error && <StreamLoadingSkeleton />}

                {!isLoading && !error && entries.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div
                      className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                      style={{ background: 'var(--digest-bg-hover, #F1EDE2)' }}
                    >
                      <Inbox
                        className="h-8 w-8"
                        style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
                      />
                    </div>
                    <p
                      className="text-sm"
                      style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
                    >
                      {t('entries.noEntries')}
                    </p>
                  </div>
                )}

                {!isLoading && entries.length > 0 && folderSections && (
                  <div className="flex flex-col gap-2">
                    {folderSections.map((section) => (
                      <DigestSection
                        key={section.groupId ?? 'others'}
                        groupId={section.groupId}
                        groupName={section.groupName}
                        groupKind={section.groupKind}
                        entries={section.entries}
                        sourceCount={section.sourceCount}
                        onSelectEntry={handleSelectEntry}
                        translations={translations}
                      />
                    ))}
                  </div>
                )}

                {!isLoading && entries.length > 0 && !folderSections && (
                  <div
                    className="grid border-l"
                    style={{
                      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                      borderColor: 'var(--digest-divider, #E5E0D2)',
                    }}
                  >
                    {entries.map((entry) => (
                      <DigestArticleCard
                        key={entry.id}
                        entry={entry}
                        onClick={() => handleSelectEntry(entry)}
                        translation={translations?.[entry.id]}
                      />
                    ))}
                  </div>
                )}

                {hasNextPage && !isLoading && (
                  <div ref={loadMoreRef} className="h-4" />
                )}

                {isFetchingNextPage && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2
                      className="h-5 w-5 animate-spin"
                      style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
                    />
                    <span
                      className="ml-2 text-sm"
                      style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
                    >
                      {t('entries.loadingMore')}
                    </span>
                  </div>
                )}

                {!hasNextPage && !isLoading && entries.length > 0 && (
                  <div className="flex items-center justify-center py-6">
                    <span
                      className="text-sm"
                      style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
                    >
                      {t('entries.noMoreEntries')}
                    </span>
                  </div>
                )}

                {isMobile && <div className="h-[120px]" />}
              </div>
            </main>
          </>
        )}
      </div>
    </div>
  )
}

function FilterTab({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="whitespace-nowrap rounded px-3 py-1 text-xs font-medium transition-colors"
      style={{
        background: active ? 'var(--digest-bg-card, #FFFFFF)' : 'transparent',
        color: active
          ? 'var(--digest-text, #1A1A1A)'
          : 'var(--digest-text-tertiary, #9A968C)',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.04)' : undefined,
      }}
    >
      {label}
    </button>
  )
}

function StreamLoadingSkeleton() {
  return (
    <div
      className="grid border-l"
      style={{
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        borderColor: 'var(--digest-divider, #E5E0D2)',
      }}
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
  )
}
