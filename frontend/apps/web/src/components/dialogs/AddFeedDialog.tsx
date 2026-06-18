import { useState } from 'react'
import { useTranslation } from '@glean/i18n'
import { Button, Alert, AlertDescription, Input, Label } from '@glean/ui'
import { Sparkles, X, Plus, Loader2, AlertCircle } from 'lucide-react'
import { useDiscoverFeed } from '../../hooks/useSubscriptions'

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const msg = error.message
  if (msg === 'Network Error' || msg.includes('ECONNREFUSED') || msg.includes('ERR_NETWORK')) {
    return '网络连接失败，请检查网络后重试'
  }
  return msg
}

interface AddFeedDialogProps {
  onClose: () => void
}

export function AddFeedDialog({ onClose }: AddFeedDialogProps) {
  const { t } = useTranslation('feeds')
  const [url, setUrl] = useState('')
  const [rsshubPath, setRsshubPath] = useState('')
  const discoverMutation = useDiscoverFeed()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedUrl = url.trim()
    const trimmedRsshubPath = rsshubPath.trim()
    if (!trimmedUrl && !trimmedRsshubPath) return

    try {
      await discoverMutation.mutateAsync({
        url: trimmedUrl || undefined,
        rsshub_path: trimmedRsshubPath || undefined,
      })
      onClose()
    } catch {
      // handled by mutation
    }
  }

  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="animate-fade-in border-border bg-card w-full max-w-md rounded-2xl border p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl">
              <Sparkles className="text-primary h-5 w-5" />
            </div>
            <h2 className="font-display text-foreground text-xl font-bold">
              {t('dialogs.addFeed.title')}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {discoverMutation.error && (
            <Alert variant="error">
              <AlertCircle />
              <AlertDescription>{getErrorMessage(discoverMutation.error)}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="feedUrl" className="text-foreground">
              {t('dialogs.addFeed.url')}
            </Label>
            <Input
              id="feedUrl"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('dialogs.addFeed.urlPlaceholder')}
              disabled={discoverMutation.isPending}
              className="w-full"
            />
            <p className="text-muted-foreground text-xs">{t('dialogs.addFeed.urlDescription')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rsshubPath" className="text-foreground">
              {t('dialogs.addFeed.rsshubPath')}
            </Label>
            <Input
              id="rsshubPath"
              value={rsshubPath}
              onChange={(e) => setRsshubPath(e.target.value)}
              placeholder="/bilibili/user/dynamic/946974"
              disabled={discoverMutation.isPending}
              className="w-full"
            />
            <p className="text-muted-foreground text-xs">
              {t('dialogs.addFeed.rsshubDescription')}
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={discoverMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={discoverMutation.isPending || (!url.trim() && !rsshubPath.trim())}
              className="btn-glow"
            >
              {discoverMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('dialogs.addFeed.adding')}</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>{t('dialogs.addFeed.add')}</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
