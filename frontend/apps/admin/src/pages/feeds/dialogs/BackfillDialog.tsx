import React, { useState, useEffect } from 'react'
import {
  buttonVariants,
  Button,
  Input,
  Badge,
  Skeleton,
  Checkbox,
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogClose,
  Label,
} from '@glean/ui'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from '@glean/i18n'
import {
  useFeedContentBackfillCandidates,
  useEnqueueFeedContentBackfill,
  type AdminFeed,
  type AdminContentBackfillResponse,
} from '../../../hooks/useFeeds'

interface BackfillDialogProps {
  feed: AdminFeed
  onClose: () => void
}

const BackfillDialog = React.memo(function BackfillDialog({ feed, onClose }: BackfillDialogProps) {
  const { t } = useTranslation(['admin', 'common'])
  const [limit, setLimit] = useState('50')
  const [missingOnly, setMissingOnly] = useState(true)
  const [force, setForce] = useState(false)
  const [result, setResult] = useState<AdminContentBackfillResponse | null>(null)

  const backfillCandidatesMutation = useFeedContentBackfillCandidates()
  const enqueueBackfillMutation = useEnqueueFeedContentBackfill()

  useEffect(() => {
    let ignore = false
    backfillCandidatesMutation
      .mutateAsync({
        feedId: feed.id,
        params: { limit: 50, force: false, missing_only: true },
      })
      .then((res) => { if (!ignore) setResult(res) })
      .catch(() => { if (!ignore) setResult(null) })
    return () => { ignore = true }
    // Run only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.id])

  const buildRequest = (dryRun: boolean) => ({
    limit: Math.max(1, Number(limit) || 50),
    force,
    missing_only: missingOnly,
    dry_run: dryRun,
  })

  const handlePreview = async () => {
    const res = await backfillCandidatesMutation.mutateAsync({
      feedId: feed.id,
      params: buildRequest(true),
    })
    setResult(res)
  }

  const handleEnqueue = async () => {
    const res = await enqueueBackfillMutation.mutateAsync({
      feedId: feed.id,
      data: buildRequest(false),
    })
    setResult(res)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogPopup className="sm:max-w-3xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>{t('admin:feeds.contentBackfill.title')}</DialogTitle>
          <DialogDescription>
            {t('admin:feeds.contentBackfill.description', {
              title: feed.title || feed.url || '',
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="space-y-5">
            <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[160px_1fr]">
              <div className="space-y-2">
                <Label htmlFor="backfill-limit">{t('admin:feeds.contentBackfill.limit')}</Label>
                <Input
                  id="backfill-limit"
                  type="number"
                  min={1}
                  max={1000}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={missingOnly}
                    onCheckedChange={(checked) => setMissingOnly(Boolean(checked))}
                  />
                  <span>{t('admin:feeds.contentBackfill.missingOnly')}</span>
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={force}
                    onCheckedChange={(checked) => setForce(Boolean(checked))}
                  />
                  <span>{t('admin:feeds.contentBackfill.force')}</span>
                </label>
              </div>
            </div>

            {result && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border px-4 py-3">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    {t('admin:feeds.contentBackfill.summary.matched')}
                  </p>
                  <p className="text-foreground mt-1 text-2xl font-semibold">{result.matched}</p>
                </div>
                <div className="rounded-lg border px-4 py-3">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    {t('admin:feeds.contentBackfill.summary.enqueued')}
                  </p>
                  <p className="text-foreground mt-1 text-2xl font-semibold">{result.enqueued}</p>
                </div>
                <div className="rounded-lg border px-4 py-3">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    {t('admin:feeds.contentBackfill.summary.mode')}
                  </p>
                  <p className="text-foreground mt-1 text-sm font-medium">
                    {result.dry_run
                      ? t('admin:feeds.contentBackfill.previewMode')
                      : t('admin:feeds.contentBackfill.queuedMode')}
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-lg border">
              <div className="border-b px-4 py-3">
                <p className="text-sm font-medium">
                  {t('admin:feeds.contentBackfill.candidatesTitle')}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('admin:feeds.contentBackfill.candidatesDescription')}
                </p>
              </div>
              <div className="max-h-80 overflow-auto">
                {backfillCandidatesMutation.isPending && !result ? (
                  <div className="space-y-3 p-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} className="h-14 w-full" />
                    ))}
                  </div>
                ) : result && result.candidates.length > 0 ? (
                  <div className="divide-y">
                    {result.candidates.map((candidate) => (
                      <div key={candidate.id} className="space-y-2 px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{candidate.title}</p>
                            <p className="text-muted-foreground truncate text-xs">{candidate.url}</p>
                          </div>
                          <Badge variant="outline" className="shrink-0">
                            {candidate.content_source || candidate.content_backfill_status}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          <span>
                            {t('admin:feeds.contentBackfill.published')}:{' '}
                            {candidate.published_at
                              ? format(new Date(candidate.published_at), 'MMM d, yyyy')
                              : t('admin:feeds.contentBackfill.unknown')}
                          </span>
                          <span>
                            {t('admin:feeds.contentBackfill.contentLength')}:{' '}
                            {candidate.content_length}
                          </span>
                          <span>
                            {t('admin:feeds.contentBackfill.summaryLength')}:{' '}
                            {candidate.summary_length}
                          </span>
                          <span>
                            {t('admin:feeds.contentBackfill.attempts')}:{' '}
                            {candidate.content_backfill_attempts}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted-foreground p-6 text-sm">
                    {t('admin:feeds.contentBackfill.empty')}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <DialogClose className={buttonVariants({ variant: 'ghost' })}>
                {t('common:actions.cancel')}
              </DialogClose>
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                disabled={backfillCandidatesMutation.isPending || enqueueBackfillMutation.isPending}
              >
                {backfillCandidatesMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('admin:feeds.contentBackfill.previewing')}
                  </>
                ) : (
                  t('admin:feeds.contentBackfill.preview')
                )}
              </Button>
              <Button
                type="button"
                onClick={handleEnqueue}
                disabled={
                  enqueueBackfillMutation.isPending ||
                  backfillCandidatesMutation.isPending ||
                  (result?.matched ?? 0) === 0
                }
              >
                {enqueueBackfillMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('admin:feeds.contentBackfill.queueing')}
                  </>
                ) : (
                  t('admin:feeds.contentBackfill.enqueue')
                )}
              </Button>
            </div>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
})

export default BackfillDialog
