import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { TodayBoardEntry, TodayBoardFeedGroup } from '@/pages/reader/shared/todayBoard'
import { PeriodEntryCard, type CardAction } from './PeriodEntryCard'

const DEFAULT_VISIBLE = 4

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
  const [expanded, setExpanded] = useState(false)
  const all = group.entries
  const visible = expanded ? all : all.slice(0, DEFAULT_VISIBLE)
  return (
    <section className="px-6 py-5" style={{ borderTop: '0.5px solid var(--digest-divider)' }}>
      <div className="mb-3.5 flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md text-[13px] font-medium" style={{ background: 'var(--digest-bg-hover)', color: 'var(--digest-text-secondary)' }}>{(group.feedTitle ?? '?').slice(0, 1)}</span>
        <span className="text-[15px] font-medium" style={{ color: 'var(--digest-text)' }}>{group.feedTitle ?? '未知来源'}</span>
      </div>
      <div className="flex flex-col gap-3.5">
        {visible.map((e) => (
          <PeriodEntryCard key={e.id} entry={e} action={action} onOpen={onOpen} onAction={onAction} translated={translateActive ? translations?.[e.id] : undefined} />
        ))}
      </div>
      {justHidden.map((e) => (
        <div key={e.id} className="mt-2 flex items-center gap-2 text-[11px]" style={{ color: 'var(--digest-text-tertiary)' }}>
          <span className="truncate">已隐藏 ·「{e.title}」</span>
          {onUndo ? <button type="button" className="underline" style={{ color: 'var(--digest-accent)' }} onClick={() => onUndo(e)}>撤销</button> : null}
        </div>
      ))}
      {all.length > DEFAULT_VISIBLE ? (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-3.5 flex items-center gap-1 text-[13px]" style={{ color: 'var(--digest-accent)' }}>
          {expanded ? '收起' : `展开全部 ${all.length} 条`}{!expanded ? <ChevronDown className="h-3.5 w-3.5" /> : null}
        </button>
      ) : null}
    </section>
  )
}
