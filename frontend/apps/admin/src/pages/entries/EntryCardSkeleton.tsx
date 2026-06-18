import { Skeleton } from '@glean/ui'

interface EntryCardSkeletonProps {
  index: number
}

export function EntryCardSkeleton({ index }: EntryCardSkeletonProps) {
  return (
    <div
      className="animate-fadeIn border-border bg-card rounded-xl border p-4"
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
          <Skeleton className="h-3 w-2/3" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
