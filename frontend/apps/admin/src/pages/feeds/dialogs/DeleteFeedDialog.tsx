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
import { useDeleteFeed } from '../../../hooks/useFeeds'

interface DeleteFeedDialogProps {
  feedId: string
  onClose: () => void
}

const DeleteFeedDialog = React.memo(function DeleteFeedDialog({
  feedId,
  onClose,
}: DeleteFeedDialogProps) {
  const { t } = useTranslation(['admin', 'common'])
  const deleteFeedMutation = useDeleteFeed()

  const handleConfirm = async () => {
    await deleteFeedMutation.mutateAsync(feedId)
    onClose()
  }

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('admin:feeds.deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('admin:feeds.deleteDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose className={buttonVariants({ variant: 'ghost' })}>
            {t('common:actions.cancel')}
          </AlertDialogClose>
          <AlertDialogClose
            className={buttonVariants({ variant: 'destructive' })}
            onClick={handleConfirm}
            disabled={deleteFeedMutation.isPending}
          >
            {deleteFeedMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('admin:feeds.deleting')}
              </>
            ) : (
              t('admin:feeds.delete')
            )}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
})

export default DeleteFeedDialog
