import { Button, Input } from '@glean/ui'
import { Search, Filter } from 'lucide-react'
import { useTranslation } from '@glean/i18n'

interface Feed {
  id: string
  title: string
}

interface EntriesToolbarProps {
  searchInput: string
  search: string
  feedFilter: string
  feeds: Feed[]
  onSearchInputChange: (value: string) => void
  onSearchSubmit: (e: React.FormEvent) => void
  onSearchClear: () => void
  onFeedFilterChange: (feedId: string) => void
}

export function EntriesToolbar({
  searchInput,
  search,
  feedFilter,
  feeds,
  onSearchInputChange,
  onSearchSubmit,
  onSearchClear,
  onFeedFilterChange,
}: EntriesToolbarProps) {
  const { t } = useTranslation(['admin', 'common'])

  return (
    <div className="mb-6 flex flex-wrap items-center gap-4">
      <form onSubmit={onSearchSubmit} className="flex gap-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            type="text"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            placeholder={t('admin:entries.searchPlaceholder')}
            className="w-72 pl-10"
          />
        </div>
        <Button type="submit" size="sm">
          {t('admin:entries.search')}
        </Button>
        {search && (
          <Button type="button" variant="ghost" size="sm" onClick={onSearchClear}>
            {t('admin:entries.clear')}
          </Button>
        )}
      </form>

      {feeds.length > 0 && (
        <div className="flex items-center gap-2">
          <Filter className="text-muted-foreground h-4 w-4" />
          <select
            value={feedFilter}
            onChange={(e) => onFeedFilterChange(e.target.value)}
            className="border-border bg-card text-foreground focus:ring-primary/50 rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2 focus:outline-none"
          >
            <option value="">{t('admin:entries.filters.allFeeds')}</option>
            {feeds.map((feed) => (
              <option key={feed.id} value={feed.id}>
                {feed.title}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
