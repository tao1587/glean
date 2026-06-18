import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@glean/i18n'
import type { EntryWithState } from '@glean/types'
import { useMarkAllRead } from '../../../../hooks/useEntries'
import { format, formatDistanceToNow, isPast } from 'date-fns'
import {
  CheckCheck,
  Clock,
  Loader2,
  Inbox,
  Timer,
  ChevronDown,
} from 'lucide-react'
import { stripHtmlTags } from '../../../../lib/html'
import { iconProxyUrl } from '../../../../lib/icon'
import {
  buttonVariants,
  Skeleton,
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@glean/ui'
import type { FilterType } from '../useReaderController'

export function BookOpenIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

export function ResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current
      startXRef.current = e.clientX
      onResize(delta)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, onResize])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    startXRef.current = e.clientX
    setIsDragging(true)
  }

  return (
    <div
      className="absolute top-0 -right-1 bottom-0 w-2 cursor-col-resize"
      onMouseDown={handleMouseDown}
    >
      <div
        className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors ${
          isDragging ? 'bg-primary' : 'hover:bg-border bg-transparent'
        }`}
      />
    </div>
  )
}

function formatRemainingTime(readLaterUntil: string | null): string | null {
  if (!readLaterUntil) return null
  const untilDate = new Date(readLaterUntil)
  if (isPast(untilDate)) return 'Expired'
  return formatDistanceToNow(untilDate, { addSuffix: false })
}

function isLikelyImageUrl(url: string): boolean {
  const lower = url.toLowerCase()
  if (lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') || lower.includes('.m3u8')) {
    return false
  }
  return true
}

export function EntryListItem({
  entry,
  isSelected,
  onClick,
  onPrefetch,
  style,
  showFeedInfo = false,
  showReadLaterRemaining = false,
  hideReadStatusIndicator = false,
  hideReadLaterIndicator = false,
  translatedTitle,
  translatedSummary,
  dataEntryId,
}: {
  entry: EntryWithState
  isSelected: boolean
  onClick: () => void
  onPrefetch?: () => void
  style?: React.CSSProperties
  showFeedInfo?: boolean
  showReadLaterRemaining?: boolean
  hideReadStatusIndicator?: boolean
  hideReadLaterIndicator?: boolean
  translatedTitle?: string
  translatedSummary?: string
  dataEntryId?: string
}) {
  const [iconLoadFailed, setIconLoadFailed] = useState(false)
  const remainingTime = showReadLaterRemaining ? formatRemainingTime(entry.read_later_until) : null

  return (
    <div
      onClick={onClick}
      onMouseEnter={onPrefetch}
      onMouseDown={onPrefetch}
      onPointerDown={onPrefetch}
      onTouchStart={onPrefetch}
      data-entry-id={dataEntryId}
      className={`group animate-fade-in relative cursor-pointer px-1.5 py-1.5 transition-all duration-200 ${
        isSelected
          ? 'before:bg-primary relative before:absolute before:inset-y-0.5 before:left-0 before:w-0.5 before:rounded-full'
          : ''
      }`}
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: '160px',
        ...style,
      }}
    >
      <div
        className={`rounded-lg px-2.5 py-2 transition-all duration-200 ${
          isSelected ? 'bg-primary/8 ring-primary/20 ring-1' : 'hover:bg-accent/40'
        }`}
      >
        <div className="flex gap-2.5">
          <div className="mt-1.5 flex w-2.5 shrink-0 justify-center">
            {!hideReadStatusIndicator && !entry.is_read && (
              <div className="bg-primary shadow-primary/40 h-1.5 w-1.5 rounded-full shadow-[0_0_6px_1px]" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {showFeedInfo && (entry.feed_title || entry.feed_icon_url) && (
              <div className="mb-1 flex items-center gap-1.5">
                {entry.feed_icon_url && !iconLoadFailed && isLikelyImageUrl(entry.feed_icon_url) ? (
                  <img
                    src={iconProxyUrl(entry.feed_icon_url) ?? undefined}
                    alt=""
                    className="h-3.5 w-3.5 shrink-0 rounded-sm object-cover"
                    loading="lazy"
                    onError={() => setIconLoadFailed(true)}
                  />
                ) : (
                  <div className="bg-muted h-3.5 w-3.5 shrink-0 rounded-sm" />
                )}
                <span className="text-muted-foreground truncate text-xs font-medium">
                  {entry.feed_title || 'Unknown feed'}
                </span>
              </div>
            )}

            <h3
              className={`mb-1 line-clamp-2 text-sm leading-snug transition-colors duration-200 sm:text-[15px] ${
                entry.is_read
                  ? 'text-muted-foreground group-hover:text-foreground/80'
                  : 'text-foreground font-medium'
              }`}
            >
              {translatedTitle || entry.title}
            </h3>

            <div className="mb-1.5 h-9 sm:h-10">
              {(translatedSummary || entry.summary) && (
                <p className="text-muted-foreground/70 line-clamp-2 text-xs leading-relaxed sm:text-sm">
                  {translatedSummary || stripHtmlTags(entry.summary || '')}
                </p>
              )}
            </div>

            <div className="text-muted-foreground/80 flex items-center gap-2 text-[11px] sm:text-xs">
              {entry.author && <span className="max-w-[120px] truncate">{entry.author}</span>}
              {entry.author && entry.published_at && (
                <span className="text-muted-foreground/40">·</span>
              )}
              {entry.published_at && (
                <span className="tabular-nums">{format(new Date(entry.published_at), 'MMM d')}</span>
              )}

              <div className="ml-auto flex items-center gap-1.5">
                {!hideReadLaterIndicator && entry.read_later && !showReadLaterRemaining && (
                  <Clock className="text-primary h-3.5 w-3.5" />
                )}
                {!hideReadLaterIndicator && remainingTime && (
                  <span
                    className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium ${
                      remainingTime === 'Expired'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-primary/10 text-primary'
                    }`}
                  >
                    <Timer className="h-2.5 w-2.5" />
                    {remainingTime}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md px-2 py-1 text-xs font-medium transition-all duration-200 ${
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <span className={`shrink-0 transition-colors duration-200 ${active ? 'text-primary' : ''}`}>
        {icon}
      </span>
      <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 @[20rem]:ml-1.5 @[20rem]:max-w-full @[20rem]:opacity-100">
        {label}
      </span>
    </button>
  )
}

export function FilterDropdownMenu({
  filterType,
  onFilterChange,
}: {
  filterType: FilterType
  onFilterChange: (type: FilterType) => void
}) {
  const { t } = useTranslation('reader')

  const getFilterIcon = (type: FilterType) => {
    switch (type) {
      case 'all':
        return <Inbox className="h-4 w-4" />
      case 'unread':
        return <div className="h-2 w-2 rounded-full bg-current" />
      case 'read-later':
        return <Clock className="h-4 w-4" />
    }
  }

  const getFilterLabel = (type: FilterType) => {
    switch (type) {
      case 'all':
        return t('filters.all')
      case 'unread':
        return t('filters.unread')
      case 'read-later':
        return t('filters.readLater')
    }
  }

  const availableFilters: FilterType[] = ['all', 'unread', 'read-later']

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="text-foreground hover:bg-accent flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors">
        <span className="flex items-center gap-2">
          {getFilterIcon(filterType)}
          <span>{getFilterLabel(filterType)}</span>
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {availableFilters.map((type) => (
          <DropdownMenuItem
            key={type}
            onClick={() => onFilterChange(type)}
            className={filterType === type ? 'bg-accent' : ''}
          >
            <span className="flex items-center gap-2">
              <span className="flex w-4 items-center justify-center">{getFilterIcon(type)}</span>
              <span>{getFilterLabel(type)}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function MarkAllReadButton({ feedId, folderId }: { feedId?: string; folderId?: string }) {
  const { t } = useTranslation('reader')
  const markAllMutation = useMarkAllRead()
  const [showConfirm, setShowConfirm] = useState(false)

  const handleMarkAll = async () => {
    await markAllMutation.mutateAsync({ feedId, folderId })
    setShowConfirm(false)
  }

  const getScopeText = () => {
    if (feedId) return t('entries.scope.feed')
    if (folderId) return t('entries.scope.folder')
    return t('entries.scope.all')
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={markAllMutation.isPending}
        title={t('entries.markAll')}
        className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50"
      >
        <CheckCheck className="h-4 w-4" />
      </button>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('entries.markConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('entries.markConfirmDescription', { scope: getScopeText() })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose className={buttonVariants({ variant: 'ghost' })}>
              {t('actions.close')}
            </AlertDialogClose>
            <AlertDialogClose
              className={buttonVariants()}
              onClick={handleMarkAll}
              disabled={markAllMutation.isPending}
            >
              {markAllMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('entries.marking')}</span>
                </>
              ) : (
                t('entries.markAll')
              )}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  )
}

export function EntryListItemSkeleton() {
  return (
    <div className="px-1.5 py-1.5">
      <div className="rounded-lg px-2.5 py-2">
        <div className="flex gap-2.5">
          <div className="mt-1.5 flex w-2.5 shrink-0 justify-center">
            <Skeleton className="h-1.5 w-1.5 rounded-full" />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="space-y-1">
              <Skeleton className="h-[18px] w-full" />
              <Skeleton className="h-[18px] w-3/4" />
            </div>

            <div className="h-10 space-y-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>

            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ReaderSmartTabs({
  filterType,
  onFilterChange,
}: {
  filterType: FilterType
  onFilterChange: (filter: FilterType) => void
}) {
  const { t } = useTranslation('reader')

  return (
    <>
      <FilterTab
        active={filterType === 'unread'}
        onClick={() => onFilterChange('unread')}
        icon={<div className="h-2 w-2 rounded-full bg-current" />}
        label={t('filters.unread')}
      />
      <FilterTab
        active={filterType === 'all'}
        onClick={() => onFilterChange('all')}
        icon={<Inbox className="h-3.5 w-3.5" />}
        label={t('filters.all')}
      />
    </>
  )
}

export function ReaderFilterTabs({
  filterType,
  onFilterChange,
}: {
  filterType: FilterType
  onFilterChange: (filter: FilterType) => void
}) {
  const { t } = useTranslation('reader')

  return (
    <>
      <FilterTab
        active={filterType === 'all'}
        onClick={() => onFilterChange('all')}
        icon={<Inbox className="h-3.5 w-3.5" />}
        label={t('filters.all')}
      />
      <FilterTab
        active={filterType === 'unread'}
        onClick={() => onFilterChange('unread')}
        icon={<div className="h-2 w-2 rounded-full bg-current" />}
        label={t('filters.unread')}
      />
      <FilterTab
        active={filterType === 'read-later'}
        onClick={() => onFilterChange('read-later')}
        icon={<Clock className="h-3.5 w-3.5" />}
        label={t('filters.readLater')}
      />
    </>
  )
}
