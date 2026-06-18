import { useStats } from '../hooks/useStats'
import { Users, Rss, FileText, BookMarked, TrendingUp, Activity } from 'lucide-react'
import { Skeleton } from '@glean/ui'
import { useTranslation } from '@glean/i18n'

/**
 * Admin dashboard page.
 */
export default function DashboardPage() {
  const { t } = useTranslation('admin')
  const { data: stats, isLoading } = useStats()

  const statCards = [
    {
      title: t('dashboard.cards.totalUsers'),
      value: stats?.total_users,
      icon: Users,
      color: 'text-primary',
      bgColor: 'bg-primary/10 ring-1 ring-primary/20',
    },
    {
      title: t('dashboard.cards.activeUsers'),
      value: stats?.active_users,
      icon: Activity,
      color: 'text-success',
      bgColor: 'bg-success/10 ring-1 ring-success/20',
      description: t('dashboard.cards.last7Days'),
    },
    {
      title: t('dashboard.cards.totalFeeds'),
      value: stats?.total_feeds,
      icon: Rss,
      color: 'text-info',
      bgColor: 'bg-info/10 ring-1 ring-info/20',
    },
    {
      title: t('dashboard.cards.totalEntries'),
      value: stats?.total_entries,
      icon: FileText,
      color: 'text-secondary',
      bgColor: 'bg-secondary/10 ring-1 ring-secondary/20',
    },
    {
      title: 'Total Subscriptions',
      value: stats?.total_subscriptions,
      icon: BookMarked,
      color: 'text-warning',
      bgColor: 'bg-warning/10 ring-1 ring-warning/20',
    },
    {
      title: 'New Users Today',
      value: stats?.new_users_today,
      icon: TrendingUp,
      color: 'text-secondary',
      bgColor: 'bg-secondary/10 ring-1 ring-secondary/20',
    },
  ]

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-border bg-card border-b px-8 py-6">
        <h1 className="text-foreground text-2xl font-bold">{t('dashboard.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('dashboard.subtitle')}</p>
      </div>

      {/* Content */}
      <div className="flex-1 p-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="border-border bg-card rounded-xl border p-6 shadow-sm">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <Skeleton className="mt-4 h-4 w-24" />
                  <Skeleton className="mt-2 h-8 w-16" />
                </div>
              ))
            : statCards.map((card) => {
                const Icon = card.icon
                return (
                  <div
                    key={card.title}
                    className="border-border bg-card rounded-xl border p-6 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-lg ${card.bgColor}`}
                      >
                        <Icon className={`h-6 w-6 ${card.color}`} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <p className="text-muted-foreground text-sm font-medium">{card.title}</p>
                      <p className="text-foreground mt-2 text-3xl font-bold">
                        {card.value?.toLocaleString() || '0'}
                      </p>
                      {card.description && (
                        <p className="text-muted-foreground mt-1 text-xs">{card.description}</p>
                      )}
                    </div>
                  </div>
                )
              })}
        </div>

        {/* Additional info */}
        {stats && (
          <div className="border-border bg-card mt-6 rounded-xl border p-6 shadow-sm">
            <h2 className="text-foreground text-lg font-semibold">
              {t('dashboard.activity.title')}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 ring-primary/20 flex h-10 w-10 items-center justify-center rounded-lg ring-1">
                  <TrendingUp className="text-primary h-5 w-5" />
                </div>
                <div>
                  <p className="text-foreground text-sm font-medium">
                    {t('dashboard.activity.newUsersToday', { count: stats.new_users_today })}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t('dashboard.activity.registeredToday')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-secondary/10 ring-secondary/20 flex h-10 w-10 items-center justify-center rounded-lg ring-1">
                  <FileText className="text-secondary h-5 w-5" />
                </div>
                <div>
                  <p className="text-foreground text-sm font-medium">
                    {t('dashboard.activity.newEntriesToday', { count: stats.new_entries_today })}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t('dashboard.activity.addedToday')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
