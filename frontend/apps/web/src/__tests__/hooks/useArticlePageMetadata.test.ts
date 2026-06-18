import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EntryWithState } from '@glean/types'
import { useArticlePageMetadata } from '@/hooks/useArticlePageMetadata'

const defaultTitle = 'Glean - Personal Knowledge Management'
const defaultDescription = 'Default app description'

function createEntry(overrides: Partial<EntryWithState> = {}): EntryWithState {
  return {
    id: 'entry-1',
    feed_id: 'feed-1',
    guid: 'guid-1',
    url: 'https://example.com/articles/test-entry',
    title: 'Understanding Web Clipper Metadata',
    author: 'Ada Lovelace',
    content: '<p>Full content should not be preferred when a summary exists.</p>',
    summary:
      '<p>A concise summary for metadata extraction with <strong>inline markup</strong>.</p>',
    published_at: '2026-04-05T12:34:56.000Z',
    created_at: '2026-04-05T12:34:56.000Z',
    is_read: false,
    read_later: false,
    read_later_until: null,
    read_at: null,
    is_bookmarked: false,
    bookmark_id: null,
    feed_title: 'Example Feed',
    feed_icon_url: null,
    ...overrides,
  }
}

function getMeta(selector: string) {
  return document.head.querySelector<HTMLMetaElement>(selector)?.content ?? null
}

describe('useArticlePageMetadata', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.title = defaultTitle

    const description = document.createElement('meta')
    description.name = 'description'
    description.content = defaultDescription
    document.head.appendChild(description)
  })

  afterEach(() => {
    document.head.innerHTML = ''
    document.title = ''
  })

  it('writes article metadata into document head for clipper extraction', () => {
    const entry = createEntry()

    renderHook(() => useArticlePageMetadata(entry))

    expect(document.title).toBe(entry.title)
    expect(getMeta('meta[name="description"]')).toBe(
      'A concise summary for metadata extraction with inline markup.'
    )
    expect(getMeta('meta[name="author"]')).toBe(entry.author)
    expect(getMeta('meta[property="og:title"]')).toBe(entry.title)
    expect(getMeta('meta[property="og:description"]')).toBe(
      'A concise summary for metadata extraction with inline markup.'
    )
    expect(getMeta('meta[property="og:url"]')).toBe(entry.url)
    expect(getMeta('meta[property="og:type"]')).toBe('article')
    expect(getMeta('meta[property="article:published_time"]')).toBe(entry.published_at)

    const schema = document.head.querySelector<HTMLScriptElement>(
      'script[type="application/ld+json"][data-testid="article-schema"]'
    )
    expect(schema).not.toBeNull()
    expect(JSON.parse(schema!.textContent || '{}')).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: entry.title,
      author: {
        '@type': 'Person',
        name: entry.author,
      },
      datePublished: entry.published_at,
      description: 'A concise summary for metadata extraction with inline markup.',
      mainEntityOfPage: entry.url,
    })
  })

  it('restores default head values when article metadata unmounts', () => {
    const entry = createEntry()

    const { unmount } = renderHook(() => useArticlePageMetadata(entry))
    unmount()

    expect(document.title).toBe(defaultTitle)
    expect(getMeta('meta[name="description"]')).toBe(defaultDescription)
    expect(getMeta('meta[name="author"]')).toBeNull()
    expect(getMeta('meta[property="og:title"]')).toBeNull()
    expect(
      document.head.querySelector('script[type="application/ld+json"][data-testid="article-schema"]')
    ).toBeNull()
  })

  it('falls back to stripped content when summary is missing', () => {
    const entry = createEntry({
      summary: null,
      content: '<p>Content fallback for description metadata.</p>',
      author: null,
      published_at: null,
    })

    renderHook(() => useArticlePageMetadata(entry))

    expect(getMeta('meta[name="description"]')).toBe('Content fallback for description metadata.')
    expect(getMeta('meta[name="author"]')).toBeNull()
    expect(getMeta('meta[property="article:published_time"]')).toBeNull()

    const schema = document.head.querySelector<HTMLScriptElement>(
      'script[type="application/ld+json"][data-testid="article-schema"]'
    )
    expect(JSON.parse(schema!.textContent || '{}')).toMatchObject({
      headline: entry.title,
      description: 'Content fallback for description metadata.',
      url: entry.url,
    })
    expect(JSON.parse(schema!.textContent || '{}')).not.toHaveProperty('author')
    expect(JSON.parse(schema!.textContent || '{}')).not.toHaveProperty('datePublished')
  })
})
