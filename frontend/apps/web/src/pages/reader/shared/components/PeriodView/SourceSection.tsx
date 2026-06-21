import { useState } from 'react'
import { useTranslation } from '@glean/i18n'
import type { TodayBoardEntry, TodayBoardFeedGroup } from '@/pages/reader/shared/todayBoard'
import { DigestArticleCard } from '../DigestView/DigestArticleCard'

export type CardAction = 'hide' | 'restore' | 'none'

const DEFAULT_VISIBLE = 5

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
  const { t } = useTranslation('digest')
  const [showAll, setShowAll] = useState(false)
  const all = group.entries
  const visible = showAll ? all : all.slice(0, DEFAULT_VISIBLE)

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

      {/* Per-source expand / collapse using the same i18n keys as DigestSection */}
      {all.length > DEFAULT_VISIBLE && (
        <div className={`mt-6 flex justify-center${showAll ? ' sticky bottom-3 z-10' : ''}`}>
          {!showAll ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="rounded-md px-4 py-2 text-sm transition-colors"
              style={{
                color: 'var(--digest-text, #1A1A1A)',
                border: '1px solid var(--digest-divider, #E5E0D2)',
              }}
            >
              {t('section.showRemaining', { count: all.length - DEFAULT_VISIBLE })}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="rounded-md px-4 py-2 text-sm transition-colors"
              style={{
                color: 'var(--digest-text, #1A1A1A)',
                border: '1px solid var(--digest-divider, #E5E0D2)',
                background: 'var(--digest-bg, #FAF8F3)',
              }}
            >
              {t('section.collapseViewAll')}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
