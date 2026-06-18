import { useMemo, useRef, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { EntryWithState } from '@glean/types'
import { useTranslation } from '@glean/i18n'
import { DigestArticleCard } from './DigestArticleCard'
import { DigestCompactList } from './DigestCompactList'
import { useMarkAllRead, useUpdateEntryState } from '@/hooks/useEntries'
import type { ListEntryTranslation } from '@/hooks/useListEntriesTranslation'

const MAX_VISIBLE_CARDS = 6

interface DigestSectionProps {
  /** Unique key for this group, e.g. `folder:abc123` or `folder:__others__` */
  groupKey?: string
  groupId: string | null
  groupName: string
  groupKind: 'folder' | 'feed' | 'all'
  entries: EntryWithState[]
  sourceCount: number
  onSelectEntry: (entry: EntryWithState) => void
  isCompact?: boolean
  focusedEntryId?: string | null
  translations?: Record<string, ListEntryTranslation>
  /** Hide the section header entirely (e.g. when grouping is 'none' and the masthead already shows context). */
  hideHeader?: boolean
  /** Whether this section is currently open (accordion state from parent). Defaults to true. */
  isOpen?: boolean
  /** Toggle open/close. Parent passes groupKey + headerEl for scroll-anchor logic. */
  onToggleOpen?: (groupKey: string, headerEl: HTMLElement | null) => void
  /** Whether "view all" (beyond MAX_VISIBLE_CARDS) is active. */
  showAll?: boolean
  onToggleShowAll?: () => void
  /** Whether the read-tail (已读 N 篇) list is expanded. */
  readTailOpen?: boolean
  onToggleReadTail?: () => void
}

export function DigestSection({
  groupKey = '',
  groupId,
  groupName,
  groupKind,
  entries,
  sourceCount,
  onSelectEntry,
  isCompact = false,
  focusedEntryId,
  translations,
  hideHeader = false,
  isOpen = true,
  onToggleOpen,
  showAll = false,
  onToggleShowAll,
  readTailOpen = false,
  onToggleReadTail,
}: DigestSectionProps) {
  const { t } = useTranslation('digest')
  const displayName =
    groupKind === 'folder' && groupId === null ? t('section.otherFolder') : groupName
  const markAllReadMutation = useMarkAllRead()
  const updateMutation = useUpdateEntryState()

  // Ref on the header wrapper div — used by onToggleOpen for scroll-anchor
  const headerRef = useRef<HTMLDivElement>(null)

  // Split: fresh entries (unread + not-yet-committed) vs committed-read (floats to bottom)
  const { fresh, readTail } = useMemo(() => {
    const freshList: EntryWithState[] = []
    const readList: EntryWithState[] = []
    for (const e of entries) {
      if (e.is_read) {
        readList.push(e)
      } else {
        freshList.push(e)
      }
    }
    return { fresh: freshList, readTail: readList }
  }, [entries])

  const visibleFresh = showAll ? fresh : fresh.slice(0, MAX_VISIBLE_CARDS)
  const allRead = entries.length > 0 && entries.every((e) => e.is_read)
  // 未读优先: hide read-tail while any unread is still truncated behind the "view all" gate.
  const unreadTruncated = fresh.length > MAX_VISIBLE_CARDS && !showAll
  const showReadTail = readTail.length > 0 && !unreadTruncated

  const handleToggleOpen = () => onToggleOpen?.(groupKey, headerRef.current)

  const handleTitleKeyDown = (e: KeyboardEvent<HTMLHeadingElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleToggleOpen()
    }
  }

  const handleMarkAllRead = async () => {
    if (groupId && groupKind === 'folder') {
      markAllReadMutation.mutate({ folderId: groupId })
      return
    }
    if (groupId && groupKind === 'feed') {
      markAllReadMutation.mutate({ feedId: groupId })
      return
    }
    const unread = entries.filter((e) => !e.is_read)
    if (unread.length === 0) return
    await Promise.all(
      unread.map((e) =>
        updateMutation.mutateAsync({
          entryId: e.id,
          data: { is_read: true },
        })
      )
    )
  }

  return (
    <section>
      {!hideHeader && (
        <div
          ref={headerRef}
          className="mb-3 mt-8 flex items-baseline justify-between gap-4 border-b-2 pb-2"
          style={{ borderColor: 'var(--digest-text, #1A1A1A)' }}
        >
          <h2
            role="button"
            tabIndex={0}
            onClick={handleToggleOpen}
            onKeyDown={handleTitleKeyDown}
            className="flex flex-wrap items-baseline gap-3 text-[22px] font-bold tracking-[-0.01em]"
            style={{
              fontFamily: "'Noto Serif SC', Georgia, serif",
              color: 'var(--digest-text, #1A1A1A)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {displayName}
            <span
              className="text-[12px] font-normal"
              style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
            >
              {t('section.count', { entries: entries.length, sources: sourceCount })}
            </span>
          </h2>

          <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
            {!allRead && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  void handleMarkAllRead()
                }}
                disabled={markAllReadMutation.isPending}
                className="whitespace-nowrap rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
                style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
                  e.currentTarget.style.color = 'var(--digest-text, #1A1A1A)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = ''
                  e.currentTarget.style.color = 'var(--digest-text-tertiary, #9A968C)'
                }}
              >
                {t('section.markAllRead')}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleOpen?.(groupKey, headerRef.current)
              }}
              className="flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs transition-colors"
              style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
                e.currentTarget.style.color = 'var(--digest-text, #1A1A1A)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = ''
                e.currentTarget.style.color = 'var(--digest-text-tertiary, #9A968C)'
              }}
            >
              {isOpen ? (
                <>
                  <ChevronUp className="h-3 w-3" /> {t('section.collapse')}
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" /> {t('section.expand')}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {isOpen && (
        <>
          {isCompact ? (
            <DigestCompactList
              entries={[...fresh, ...readTail]}
              onSelectEntry={onSelectEntry}
              focusedEntryId={focusedEntryId}
              translations={translations}
            />
          ) : (
            <>
              {fresh.length === 0 ? (
                <DigestCompactList
                  entries={readTail}
                  onSelectEntry={onSelectEntry}
                  focusedEntryId={focusedEntryId}
                  translations={translations}
                />
              ) : (
                <div
                  className="grid border-l"
                  style={{
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    borderColor: 'var(--digest-divider, #E5E0D2)',
                  }}
                >
                  {visibleFresh.map((entry) => (
                    <DigestArticleCard
                      key={entry.id}
                      entry={entry}
                      onClick={() => onSelectEntry(entry)}
                      isFocused={focusedEntryId === entry.id}
                      translation={translations?.[entry.id]}
                    />
                  ))}
                </div>
              )}

              {/* Block 1a: "view all" — shown only before user expands */}
              {fresh.length > MAX_VISIBLE_CARDS && !showAll && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={onToggleShowAll}
                    className="rounded-md px-4 py-2 text-sm transition-colors"
                    style={{
                      color: 'var(--digest-text, #1A1A1A)',
                      border: '1px solid var(--digest-divider, #E5E0D2)',
                    }}
                  >
                    {t('section.viewAll', { count: fresh.length })}
                  </button>
                </div>
              )}

              {/* Block 2: read-tail divider — hidden while unread are still truncated (未读优先).
                  Flanking lines stretch (flex-1) so the toggle pill sits in a full-width
                  divider, giving the read-tail grid below a proper top edge. */}
              {showReadTail && (
                <div className="mt-6 flex items-center gap-2">
                  <div
                    className="h-px flex-1"
                    style={{ background: 'var(--digest-divider, #E5E0D2)' }}
                  />
                  <button
                    onClick={() => onToggleReadTail?.()}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
                    style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--digest-text, #1A1A1A)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--digest-text-tertiary, #9A968C)'
                    }}
                  >
                    {t('section.readTail', { count: readTail.length })}
                    {readTailOpen ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                  <div
                    className="h-px flex-1"
                    style={{ background: 'var(--digest-divider, #E5E0D2)' }}
                  />
                </div>
              )}

              {/* Block 3: expanded read-tail cards — gated on the same condition as Block 2.
                  No bottom collapse button: the chevron toggle in Block 2 already collapses. */}
              {showReadTail && readTailOpen && (
                <div
                  className="mt-4 grid border-l"
                  style={{
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    borderColor: 'var(--digest-divider, #E5E0D2)',
                  }}
                >
                  {readTail.map((entry) => (
                    <DigestArticleCard
                      key={entry.id}
                      entry={entry}
                      onClick={() => onSelectEntry(entry)}
                      isFocused={focusedEntryId === entry.id}
                      translation={translations?.[entry.id]}
                    />
                  ))}
                </div>
              )}

              {/* Block 1b: "collapse view-all" — sits AFTER read-tail so order stays stable. */}
              {/* Clicking it anchors on the button itself so the user keeps their reading position. */}
              {fresh.length > MAX_VISIBLE_CARDS && showAll && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={(e) => {
                      const btn = e.currentTarget
                      const topBefore = btn.getBoundingClientRect().top
                      onToggleShowAll?.()
                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          const topAfter = btn.getBoundingClientRect().top
                          const delta = topAfter - topBefore
                          if (Math.abs(delta) > 1)
                            window.scrollBy({ top: delta, left: 0, behavior: 'instant' })
                        })
                      })
                    }}
                    className="rounded-md px-4 py-2 text-sm transition-colors"
                    style={{
                      color: 'var(--digest-text, #1A1A1A)',
                      border: '1px solid var(--digest-divider, #E5E0D2)',
                    }}
                  >
                    {t('section.collapseViewAll')}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
