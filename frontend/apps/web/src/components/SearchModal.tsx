import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@glean/ui'
import { useTranslation } from '@glean/i18n'
import { entryService } from '@glean/api-client'
import type { EntryWithState } from '@glean/types'
import { useDigestSettingsStore, type SearchScope } from '@/stores/digestSettingsStore'
import { useSystemTime } from '@/hooks/useSystemTime'
import { getFeedColor } from '@/pages/reader/shared/components/DigestView/digestHelpers'

interface SearchModalProps {
  open: boolean
  onClose: () => void
  initialDate?: string
  onSelectEntry: (entry: EntryWithState) => void
}

/** Determine which date bucket a published_at string falls into. */
function getDateBucket(dateStr: string | null, todayDate: string): 'today' | 'yesterday' | 'thisWeek' | 'older' {
  if (!dateStr) return 'older'
  try {
    const d = new Date(dateStr)
    const [ty, tm, tday] = todayDate.split('-').map(Number)
    const today = new Date(ty, tm - 1, tday)
    const yesterday = new Date(ty, tm - 1, tday - 1)
    const weekAgo = new Date(ty, tm - 1, tday - 6)

    const entryDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())

    if (entryDay.getTime() === today.getTime()) return 'today'
    if (entryDay.getTime() === yesterday.getTime()) return 'yesterday'
    if (entryDay >= weekAgo) return 'thisWeek'
    return 'older'
  } catch {
    return 'older'
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${m}/${day}`
  } catch {
    return ''
  }
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${h}:${min}`
  } catch {
    return ''
  }
}

/** Simple inline debounce — avoids adding a new dependency. */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(id)
  }, [value, delay])
  return debounced
}

/** Highlight query matches in text using <mark>. */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark
              key={i}
              style={{
                background: 'var(--digest-accent-soft, #F5E6E5)',
                color: 'inherit',
                borderRadius: '2px',
                padding: '0 1px',
              }}
            >
              {part}
            </mark>
          ) : (
            part
          ),
        )}
      </>
    )
  } catch {
    return <>{text}</>
  }
}

interface ResultItemProps {
  entry: EntryWithState
  query: string
  isFocused: boolean
  onClick: () => void
  onCmdEnter: () => void
}

function ResultItem({ entry, query, isFocused, onClick, onCmdEnter }: ResultItemProps) {
  const { t } = useTranslation('digest')
  const feedColor = getFeedColor(entry.feed_id)
  const timeStr = formatTime(entry.published_at)
  const dateStr = formatDate(entry.published_at)
  const ref = useRef<HTMLDivElement>(null)

  // Scroll focused item into view
  useEffect(() => {
    if (isFocused) {
      ref.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [isFocused])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        onCmdEnter()
      } else {
        onClick()
      }
    }
  }

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="option"
      aria-selected={isFocused}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors"
      style={{
        background: isFocused ? 'var(--digest-bg-hover, #F1EDE2)' : 'transparent',
        boxShadow: isFocused ? 'inset 3px 0 0 var(--digest-accent, #B8312F)' : undefined,
        outline: 'none',
      }}
    >
      {/* Feed color dot */}
      <span
        className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-[2px]"
        style={{ background: feedColor }}
      />

      {/* Title + meta */}
      <div className="min-w-0 flex-1">
        <div
          className="mb-0.5 text-[14px] font-medium leading-snug"
          style={{
            fontFamily: "'Noto Serif SC', Georgia, serif",
            color: 'var(--digest-text, #1A1A1A)',
            opacity: entry.is_read ? 0.7 : 1,
          }}
        >
          <HighlightMatch text={entry.title} query={query} />
        </div>
        <div
          className="flex flex-wrap items-center gap-1.5 text-[12px]"
          style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
        >
          <span style={{ color: 'var(--digest-text-secondary, #5E5A52)', fontWeight: 500 }}>
            {entry.feed_title || t('card.unknownSource')}
          </span>
          {(dateStr || timeStr) && (
            <>
              <span
                className="inline-block h-[3px] w-[3px] rounded-full"
                style={{ background: 'var(--digest-text-tertiary, #9A968C)' }}
              />
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {dateStr} {timeStr}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function SearchModal({ open, onClose, initialDate, onSelectEntry }: SearchModalProps) {
  const { t } = useTranslation('digest')
  const { data: systemTime } = useSystemTime()
  const todayDate = systemTime?.current_date ?? new Date().toISOString().slice(0, 10)

  const { searchScope, setSearchScope } = useDigestSettingsStore()
  const [inputValue, setInputValue] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(0)

  const debouncedQuery = useDebounce(inputValue, 300)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Scope options — 'date' falls back to today or initialDate
  const effectiveDate = initialDate ?? todayDate

  const { data, isLoading } = useQuery({
    queryKey: ['entry-search', debouncedQuery, searchScope, effectiveDate],
    queryFn: ({ signal }) => {
      if (debouncedQuery.trim().length < 2) return null
      return entryService.searchEntries(
        {
          q: debouncedQuery.trim(),
          scope: searchScope,
          date: searchScope === 'date' ? effectiveDate : undefined,
          limit: 30,
        },
        { signal },
      )
    },
    enabled: open && debouncedQuery.trim().length >= 2,
    staleTime: 30_000,
  })

  const results = data?.items ?? []
  const total = data?.total ?? 0
  const tookMs = data?.took_ms ?? 0

  // Reset focus index when results change
  useEffect(() => {
    setFocusedIndex(0)
  }, [results.length, debouncedQuery])

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      const id = window.requestAnimationFrame(() => inputRef.current?.focus())
      return () => window.cancelAnimationFrame(id)
    } else {
      setInputValue('')
    }
  }, [open])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((i) => Math.min(i + 1, results.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' && results.length > 0) {
        const entry = results[focusedIndex]
        if (entry) {
          if (e.metaKey || e.ctrlKey) {
            window.open(entry.url, '_blank', 'noopener,noreferrer')
          } else {
            onSelectEntry(entry)
            onClose()
          }
        }
        return
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, results, focusedIndex, onClose, onSelectEntry])

  // Group results by date bucket when scope is 'all' or 'week'
  const groupedResults = useCallback(() => {
    if (searchScope === 'date') {
      return [{ label: null, entries: results }]
    }

    const buckets: { label: 'today' | 'yesterday' | 'thisWeek' | 'older'; entries: EntryWithState[] }[] = [
      { label: 'today', entries: [] },
      { label: 'yesterday', entries: [] },
      { label: 'thisWeek', entries: [] },
      { label: 'older', entries: [] },
    ]

    for (const entry of results) {
      const bucket = getDateBucket(entry.published_at, todayDate)
      const group = buckets.find((b) => b.label === bucket)
      if (group) group.entries.push(entry)
    }

    return buckets.filter((b) => b.entries.length > 0).map((b) => ({
      label: b.label as string,
      entries: b.entries,
    }))
  }, [results, searchScope, todayDate])

  const groups = groupedResults()

  // Flat index lookup for focusedIndex
  const flatResults = groups.flatMap((g) => g.entries)

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('search.placeholder')}
      className="fixed inset-0 z-[200]"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="relative mx-auto mt-[12vh] w-full max-w-[720px] overflow-hidden rounded-xl shadow-2xl"
        style={{
          background: 'var(--digest-bg-card, #FFFFFF)',
          border: '1px solid var(--digest-divider, #E5E0D2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--digest-divider, #E5E0D2)' }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ color: 'var(--digest-text-tertiary, #9A968C)', flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={t('search.placeholder')}
            className="flex-1 bg-transparent text-[16px] outline-none"
            style={{ color: 'var(--digest-text, #1A1A1A)' }}
            aria-autocomplete="list"
            aria-controls="search-results"
          />
          {inputValue && (
            <button
              onClick={() => setInputValue('')}
              className="flex h-5 w-5 items-center justify-center rounded text-xs"
              style={{
                background: 'var(--digest-divider, #E5E0D2)',
                color: 'var(--digest-text-secondary, #5E5A52)',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Scope segmented control */}
        <div
          className="flex items-center gap-1 border-b px-4 py-2"
          style={{ borderColor: 'var(--digest-divider, #E5E0D2)' }}
        >
          {(['all', 'date', 'week'] as SearchScope[]).map((s) => (
            <button
              key={s}
              onClick={() => setSearchScope(s)}
              className="rounded-md px-3 py-1 text-[12px] font-medium transition-colors"
              style={
                searchScope === s
                  ? {
                      background: 'var(--digest-text, #1A1A1A)',
                      color: 'var(--digest-bg, #FAF8F3)',
                    }
                  : {
                      background: 'transparent',
                      color: 'var(--digest-text-secondary, #5E5A52)',
                    }
              }
            >
              {t(`search.scope.${s}`)}
            </button>
          ))}

          {/* Result count + timing */}
          {data && debouncedQuery.trim().length >= 2 && (
            <span
              className="ml-auto text-[11px]"
              style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
            >
              {t('search.took', { count: total, ms: tookMs })}
            </span>
          )}
        </div>

        {/* Results */}
        <div
          id="search-results"
          ref={listRef}
          role="listbox"
          className="max-h-[420px] overflow-y-auto"
        >
          {isLoading && debouncedQuery.trim().length >= 2 && (
            <div className="space-y-1 p-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3 py-2">
                  <Skeleton className="mt-1.5 h-2 w-2 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && debouncedQuery.trim().length >= 2 && flatResults.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <p
                className="mb-1 text-[15px] font-medium"
                style={{ color: 'var(--digest-text-secondary, #5E5A52)' }}
              >
                {t('search.empty.title')}
              </p>
              <p className="text-[13px]" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
                {t('search.empty.hint')}
              </p>
            </div>
          )}

          {!isLoading && flatResults.length > 0 && (
            <div>
              {groups.map((group) => {
                const groupStartIndex = flatResults.indexOf(group.entries[0])
                return (
                  <div key={group.label ?? 'default'}>
                    {group.label && (
                      <div
                        className="sticky top-0 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
                        style={{
                          background: 'var(--digest-bg-card, #FFFFFF)',
                          color: 'var(--digest-text-tertiary, #9A968C)',
                          borderBottom: '1px solid var(--digest-divider, #E5E0D2)',
                        }}
                      >
                        {t(`search.group.${group.label}`)}
                      </div>
                    )}
                    {group.entries.map((entry, i) => {
                      const flatIdx = groupStartIndex + i
                      return (
                        <ResultItem
                          key={entry.id}
                          entry={entry}
                          query={debouncedQuery}
                          isFocused={focusedIndex === flatIdx}
                          onClick={() => {
                            onSelectEntry(entry)
                            onClose()
                          }}
                          onCmdEnter={() => {
                            window.open(entry.url, '_blank', 'noopener,noreferrer')
                          }}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div
          className="border-t px-4 py-2 text-center text-[11px]"
          style={{
            borderColor: 'var(--digest-divider, #E5E0D2)',
            color: 'var(--digest-text-tertiary, #9A968C)',
          }}
        >
          {t('search.hints')}
        </div>
      </div>
    </div>
  )
}
