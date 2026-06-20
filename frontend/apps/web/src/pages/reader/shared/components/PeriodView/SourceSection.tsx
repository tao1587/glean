import { useState } from 'react'
import type { TodayBoardEntry, TodayBoardFeedGroup } from '@/pages/reader/shared/todayBoard'
import { DigestArticleCard } from '../DigestView/DigestArticleCard'

export type CardAction = 'hide' | 'restore' | 'none'

const DEFAULT_VISIBLE = 5
const STEP = 5

export function SourceSection({ group, action, justHidden = [], onOpen, onAction, onUndo, translations, translateActive }: {
  group: TodayBoardFeedGroup
  action: CardAction
  justHidden?: TodayBoardEntry[]
  onOpen: (e: TodayBoardEntry) => void
  onAction: (e: TodayBoardEntry) => void
  onUndo?: (e: TodayBoardEntry) => void
  translations?: Record<string, { title?: string; summary?: string }>
  translateActive?: boolean
}) {
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE)
  const all = group.entries
  const visible = all.slice(0, visibleCount)
  const hasMore = visibleCount < all.length
  const isExpanded = visibleCount > DEFAULT_VISIBLE
  const remaining = all.length - visibleCount

  return (
    <section className="px-6">
      {/* Section header matching DigestSection */}
      <div
        className="mb-3 mt-8 border-b-2 pb-2"
        style={{ borderColor: 'var(--digest-text, #1A1A1A)' }}
      >
        <h2
          className="text-[22px] font-bold tracking-[-0.01em]"
          style={{
            fontFamily: "'Noto Serif SC', Georgia, serif",
            color: 'var(--digest-text, #1A1A1A)',
          }}
        >
          {group.feedTitle ?? '未知来源'}
          <span
            className="ml-3 text-[12px] font-normal"
            style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
          >
            共 {group.entries.length} 条
          </span>
        </h2>
      </div>

      {/* Cards in digest grid */}
      <div
        className="grid border-l"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          borderColor: 'var(--digest-divider, #E5E0D2)',
        }}
      >
        {visible.map((e) => (
          <DigestArticleCard
            key={e.id}
            entry={e}
            onClick={() => onOpen(e)}
            action={action}
            onAction={() => onAction(e)}
            translation={translateActive ? translations?.[e.id] : undefined}
          />
        ))}
      </div>

      {/* Undo rows for just-hidden entries */}
      {justHidden.map((e) => (
        <div key={e.id} className="mt-2 flex items-center gap-2 text-[11px]" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
          <span className="truncate">已隐藏 ·「{e.title}」</span>
          {onUndo ? (
            <button
              type="button"
              className="underline"
              style={{ color: 'var(--digest-text, #1A1A1A)' }}
              onClick={() => onUndo(e)}
            >
              撤销
            </button>
          ) : null}
        </div>
      ))}

      {/* Per-source incremental expand (+5) with a 收起 that sticks within this
          source's content window so it stays reachable while scrolling. */}
      {(hasMore || isExpanded) && (
        <div className={`mt-6 flex justify-center gap-2${isExpanded ? ' sticky bottom-3 z-10' : ''}`}>
          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((c) => Math.min(c + STEP, all.length))}
              className="rounded-md px-4 py-2 text-sm shadow-sm transition-colors"
              style={{
                color: 'var(--digest-text, #1A1A1A)',
                border: '1px solid var(--digest-divider, #E5E0D2)',
                background: 'var(--digest-bg-card, #FFFFFF)',
              }}
            >
              展开更多{remaining > 0 ? ` · 还有 ${remaining} 条` : ''}
            </button>
          )}
          {isExpanded && (
            <button
              type="button"
              onClick={() => setVisibleCount(DEFAULT_VISIBLE)}
              className="rounded-md px-4 py-2 text-sm shadow-sm transition-colors"
              style={{
                color: 'var(--digest-text, #1A1A1A)',
                border: '1px solid var(--digest-divider, #E5E0D2)',
                background: 'var(--digest-bg-card, #FFFFFF)',
              }}
            >
              收起
            </button>
          )}
        </div>
      )}
    </section>
  )
}
