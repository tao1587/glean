import React from 'react'
import {
  Badge,
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from '@glean/ui'
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { useTranslation } from '@glean/i18n'

interface FeedStatusBadgeProps {
  status: string
  errorCount: number
  errorMessage?: string | null
}

const FeedStatusBadge = React.memo(function FeedStatusBadge({
  status,
  errorCount,
  errorMessage,
}: FeedStatusBadgeProps) {
  const { t } = useTranslation(['admin'])

  if (errorCount > 0) {
    return (
      <Dialog>
        <DialogTrigger>
          <Badge variant="destructive" className="cursor-pointer gap-1 hover:opacity-80">
            <AlertCircle className="h-3 w-3" />
            {t('admin:feeds.status.error')} ({errorCount})
          </Badge>
        </DialogTrigger>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{t('admin:feeds.feedErrorTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin:feeds.feedErrorDescription', { count: errorCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="bg-destructive/10 rounded-lg p-4">
              <p className="text-destructive text-sm font-medium">
                {t('admin:feeds.feedErrorMessageLabel')}
              </p>
              <p className="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">
                {errorMessage || t('admin:feeds.noErrorMessage')}
              </p>
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    )
  }

  if (status === 'active') {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle className="h-3 w-3" />
        {t('admin:feeds.status.active')}
      </Badge>
    )
  }

  return (
    <Badge variant="secondary" className="gap-1">
      <XCircle className="h-3 w-3" />
      {t('admin:feeds.status.inactive')}
    </Badge>
  )
})

export default FeedStatusBadge
