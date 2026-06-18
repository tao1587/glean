import { useEffect } from 'react'
import type { EntryWithState } from '@glean/types'
import { stripHtmlTags } from '../lib/html'

const ARTICLE_SCHEMA_TEST_ID = 'article-schema'
const DESCRIPTION_MAX_LENGTH = 280

function summarizeForMetadata(entry: EntryWithState): string {
  const plainText = stripHtmlTags(entry.summary || entry.content || '')
  if (plainText.length <= DESCRIPTION_MAX_LENGTH) {
    return plainText
  }

  return `${plainText.slice(0, DESCRIPTION_MAX_LENGTH - 1).trimEnd()}…`
}

function upsertMeta(
  selector: string,
  attributes: Record<string, string>,
  content: string | null
): HTMLMetaElement | null {
  const existing = document.head.querySelector<HTMLMetaElement>(selector)

  if (!content) {
    existing?.remove()
    return null
  }

  const element = existing ?? document.createElement('meta')
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value)
  })
  element.content = content

  if (!existing) {
    document.head.appendChild(element)
  }

  return element
}

function setJsonLd(selector: string, payload: Record<string, unknown>) {
  const existing = document.head.querySelector<HTMLScriptElement>(selector)
  const script = existing ?? document.createElement('script')
  script.type = 'application/ld+json'
  script.setAttribute('data-testid', ARTICLE_SCHEMA_TEST_ID)
  script.textContent = JSON.stringify(payload)

  if (!existing) {
    document.head.appendChild(script)
  }

  return script
}

export function useArticlePageMetadata(entry: EntryWithState | null | undefined) {
  useEffect(() => {
    if (!entry) return

    const previousTitle = document.title
    const previousDescription = document.head.querySelector<HTMLMetaElement>(
      'meta[name="description"]'
    )?.content

    document.title = entry.title

    const description = summarizeForMetadata(entry)

    upsertMeta('meta[name="description"]', { name: 'description' }, description || null)
    upsertMeta('meta[name="author"]', { name: 'author' }, entry.author)
    upsertMeta('meta[property="og:title"]', { property: 'og:title' }, entry.title)
    upsertMeta(
      'meta[property="og:description"]',
      { property: 'og:description' },
      description || null
    )
    upsertMeta('meta[property="og:url"]', { property: 'og:url' }, entry.url)
    upsertMeta('meta[property="og:type"]', { property: 'og:type' }, 'article')
    upsertMeta(
      'meta[property="article:published_time"]',
      { property: 'article:published_time' },
      entry.published_at
    )

    const schema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: entry.title,
      description,
      url: entry.url,
      mainEntityOfPage: entry.url,
    }

    if (entry.author) {
      schema.author = {
        '@type': 'Person',
        name: entry.author,
      }
    }

    if (entry.published_at) {
      schema.datePublished = entry.published_at
      schema.dateModified = entry.published_at
    }

    setJsonLd(
      `script[type="application/ld+json"][data-testid="${ARTICLE_SCHEMA_TEST_ID}"]`,
      schema
    )

    return () => {
      document.title = previousTitle

      upsertMeta(
        'meta[name="description"]',
        { name: 'description' },
        previousDescription ?? null
      )
      document.head.querySelector('meta[name="author"]')?.remove()
      document.head.querySelector('meta[property="og:title"]')?.remove()
      document.head.querySelector('meta[property="og:description"]')?.remove()
      document.head.querySelector('meta[property="og:url"]')?.remove()
      document.head.querySelector('meta[property="og:type"]')?.remove()
      document.head.querySelector('meta[property="article:published_time"]')?.remove()
      document.head
        .querySelector(`script[type="application/ld+json"][data-testid="${ARTICLE_SCHEMA_TEST_ID}"]`)
        ?.remove()
    }
  }, [entry])
}
