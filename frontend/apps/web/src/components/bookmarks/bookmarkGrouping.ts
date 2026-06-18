import type { Bookmark } from '@glean/types'

export interface SourceBookmarkGroup {
  source: string
  items: Bookmark[]
}

export function getBookmarkSource(bookmark: Bookmark): string {
  if (bookmark.url) {
    try {
      return new URL(bookmark.url).hostname.replace(/^www\./, '')
    } catch {
      // Ignore malformed URLs and use semantic fallback.
    }
  }
  return bookmark.entry_id ? 'Feed articles' : 'Manual bookmarks'
}

export function groupBookmarksBySource(bookmarks: Bookmark[]): SourceBookmarkGroup[] {
  const grouped = new Map<string, Bookmark[]>()

  for (const bookmark of bookmarks) {
    const source = getBookmarkSource(bookmark)
    const existing = grouped.get(source)
    if (existing) {
      existing.push(bookmark)
    } else {
      grouped.set(source, [bookmark])
    }
  }

  return Array.from(grouped.entries())
    .map(([source, items]) => ({
      source,
      items: [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    }))
    .sort((a, b) => {
      const latestA = a.items[0]?.created_at || ''
      const latestB = b.items[0]?.created_at || ''
      return new Date(latestB).getTime() - new Date(latestA).getTime()
    })
}
