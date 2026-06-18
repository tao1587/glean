import type { ReactElement, ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

import { useTranslation } from '@glean/i18n'
import type { SummaryView } from '@glean/types'

import type { SummaryUIState } from '@/hooks/useSummary'

interface SummaryCardProps<E extends { id: string; title: string }> {
  summary: SummaryView | null
  state: SummaryUIState
  isStale: boolean
  entriesById: Map<string, E>
  onSelectEntry: (entry: E) => void
  onRetry: () => void
  onGenerate?: () => void
  footer?: ReactNode
}

export function SummaryCard<E extends { id: string; title: string }>({
  summary,
  state,
  isStale,
  entriesById,
  onSelectEntry,
  onRetry,
  onGenerate,
  footer,
}: SummaryCardProps<E>): ReactElement {
  const { t } = useTranslation('reader')

  return (
    <section
      data-testid="summary-card"
      data-state={state}
      className="border-border/70 rounded-lg border bg-white px-4 py-3"
    >
      {/* loading */}
      {state === 'loading' && (
        <div className="space-y-2" aria-busy="true">
          <div className="bg-muted h-3 w-2/3 rounded" />
          <div className="bg-muted h-3 w-1/2 rounded" />
        </div>
      )}

      {/* generating */}
      {state === 'generating' && (
        <div className="space-y-2" aria-busy="true">
          <p className="text-muted-foreground text-sm">
            {t('todayBoard.summary.generating', { defaultValue: '分析中…' })}
          </p>
          <div className="bg-muted h-3 w-3/4 rounded" />
          <div className="bg-muted h-3 w-1/2 rounded" />
        </div>
      )}

      {/* empty */}
      {state === 'empty' && (
        <p className="text-muted-foreground text-sm">
          {t('todayBoard.summary.empty', { defaultValue: '今日暂无文章' })}
        </p>
      )}

      {/* idle */}
      {state === 'idle' && (
        onGenerate ? (
          <button
            type="button"
            onClick={onGenerate}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-medium"
          >
            {t('todayBoard.summary.generateCta', { defaultValue: '生成综述' })}
          </button>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t('todayBoard.summary.pending', { defaultValue: '综述将稍后自动生成' })}
          </p>
        )
      )}

      {/* failed */}
      {state === 'failed' && (
        <div className="text-destructive flex items-center gap-2 text-sm">
          <span>
            {t('todayBoard.summary.failed', { defaultValue: 'Summary failed' })}
            {summary?.error_code ? ` · ${summary.error_code}` : ''}
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
          >
            <RefreshCw className="h-3 w-3" />
            {t('todayBoard.summary.retry', { defaultValue: 'Retry' })}
          </button>
        </div>
      )}

      {/* ready */}
      {state === 'ready' && summary && (
        <div className="space-y-3">
          {isStale && (
            <div className="bg-amber-50 text-amber-900 rounded border border-amber-200 px-3 py-2 text-xs">
              {t('todayBoard.summary.stale', { defaultValue: '有新增内容,综述更新中' })}
            </div>
          )}
          {summary.title && (
            <h3 className="text-foreground text-base font-semibold">{summary.title}</h3>
          )}
          {summary.summary && (
            <p className="text-foreground text-sm leading-relaxed">{summary.summary}</p>
          )}
          {summary.topics && summary.topics.length > 0 && (
            <div>
              <h4 className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                {t('todayBoard.summary.topics', { defaultValue: 'Topics' })}
              </h4>
              <ul className="text-foreground space-y-0.5 text-sm">
                {summary.topics.map((topic, i) => (
                  <li key={i}>
                    {topic.name}{' '}
                    <span className="text-muted-foreground text-xs">({topic.entry_ids.length})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.recommended_entry_ids && summary.recommended_entry_ids.length > 0 && (
            <div>
              <h4 className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                {t('todayBoard.summary.recommended', { defaultValue: 'Recommended' })}
              </h4>
              <ol className="text-foreground space-y-0.5 text-sm">
                {summary.recommended_entry_ids.map((id, i) => {
                  const entry = entriesById.get(id)
                  return (
                    <li key={id}>
                      {i + 1}.{' '}
                      <button
                        type="button"
                        onClick={() => entry && onSelectEntry(entry)}
                        disabled={!entry}
                        className="hover:text-primary text-left underline-offset-2 hover:underline disabled:cursor-default disabled:no-underline"
                      >
                        {entry?.title ?? id}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </div>
      )}

      {footer}
    </section>
  )
}
