import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
  Button,
  buttonVariants,
} from '@glean/ui'
import { Trash2, Loader2 } from 'lucide-react'
import { useTranslation } from '@glean/i18n'

interface DeleteEntryDialogProps {
  open: boolean
  isPending: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}

export function DeleteEntryDialog({
  open,
  isPending,
  onConfirm,
  onOpenChange,
}: DeleteEntryDialogProps) {
  const { t } = useTranslation(['admin', 'common'])

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('admin:entries.deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('admin:entries.deleteDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter variant="bare">
          <AlertDialogClose className={buttonVariants({ variant: 'ghost' })}>
            {t('common:actions.cancel')}
          </AlertDialogClose>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('admin:entries.deleting')}</span>
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                <span>{t('admin:entries.delete')}</span>
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}
