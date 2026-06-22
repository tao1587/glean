import type { TodayBoardEntry, TodayBoardFeedGroup } from '@/pages/reader/shared/todayBoard'
import { DigestArticleCard } from '../DigestView/DigestArticleCard'
import type { CardAction } from './SourceSection'

export function SparseSourceGrid({
  groups,
  action,
  justHidden = [],
  showSeparator = true,
  onOpen,
  onAction,
  onUndo,
  translations,
  translateActive,
}: {
  groups: TodayBoardFeedGroup[]
  action: CardAction
  justHidden?: TodayBoardEntry[]
  showSeparator?: boolean
  onOpen: (e: TodayBoardEntry) => void
  onAction: (e: TodayBoardEntry) => void
  onUndo?: (e: TodayBoardEntry) => void
  translations?: Record<string, { title?: string; summary?: string }>
  translateActive?: boolean
}) {
  if (groups.length === 0) return null
  const entries = groups.flatMap((g) => g.entries)

  return (
    <section className="px-6">
      {showSeparator ? (
        <div className="mb-3 mt-8 flex items-center gap-2">
          <span className="text-[12px]" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
            其余来源
          </span>
          <span className="h-px flex-1" style={{ background: 'var(--digest-divider, #E5E0D2)' }} />
        </div>
      ) : (
        <div className="mt-6" />
      )}

      <div
        className="grid border-l"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          borderColor: 'var(--digest-divider, #E5E0D2)',
        }}
      >
        {entries.map((e) => (
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

      {justHidden.map((e) => (
        <div
          key={e.id}
          className="mt-2 flex items-center gap-2 text-[11px]"
          style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
        >
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
    </section>
  )
}
