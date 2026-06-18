import React from 'react'
import {
  buttonVariants,
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
} from '@glean/ui'
import { Loader2 } from 'lucide-react'
import { useTranslation } from '@glean/i18n'

interface BatchDeleteDialogProps {
  count: number
  isPending: boolean
  onConfirm: () => Promise<void>
  onClose: () => void
}

const BatchDeleteDialog = React.memo(function BatchDeleteDialog({
  count,
  isPending,
  onConfirm,
  onClose,
}: BatchDeleteDialogProps) {
  const { t } = useTranslation(['admin', 'common'])

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('admin:feeds.batch.batchDeleteTitle', { count })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('admin:feeds.batch.batchDeleteDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose className={buttonVariants({ variant: 'ghost' })}>
            {t('common:actions.cancel')}
          </AlertDialogClose>
          <AlertDialogClose
            className={buttonVariants({ variant: 'destructive' })}
            onClick={async () => {
              await onConfirm()
              onClose()
            }}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('admin:feeds.deleting')}
              </>
            ) : (
              t('admin:feeds.batch.delete')
            )}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
})

export default BatchDeleteDialog
