import { useCallback, useEffect, useRef, useState } from 'react'
import { entryService } from '@glean/api-client'
import type { EntryWithState, TranslationTargetLanguage } from '@glean/types'
import { useAuthStore } from '../stores/authStore'
import { stripHtmlTags } from '../lib/html'
import { shouldAutoTranslate } from '../lib/translationLanguagePolicy'

const LIST_TRANSLATION_BATCH_SIZE = 24

export interface ListEntryTranslation {
  title?: string
  summary?: string
}

interface UseListEntriesTranslationOptions {
  entries: EntryWithState[]
  /**
   * Scroll container element to use as IntersectionObserver root.
   * Pass `null` to use the document viewport (window scrolling).
   */
  containerRef: React.RefObject<HTMLElement | null>
  /**
   * When false, the hook is a no-op and returns an empty translations map.
   * Defaults to the user's `list_translation_auto_enabled` setting.
   */
  enabled?: boolean
}

interface UseListEntriesTranslationReturn {
  translations: Record<string, ListEntryTranslation>
  isActive: boolean
  isLoading: boolean
}

/**
 * Viewport-aware batch translation of list card titles/summaries.
 *
 * Observes DOM nodes with `[data-entry-id]` inside `containerRef` and
 * translates visible entries' title + plain-text summary via the batch
 * translation API. Results are merged into a map keyed by entry id.
 *
 * This is the shared implementation used by the timeline entry list,
 * the TodayBoard view, and the Digest view.
 */
export function useListEntriesTranslation({
  entries,
  containerRef,
  enabled,
}: UseListEntriesTranslationOptions): UseListEntriesTranslationReturn {
  const user = useAuthStore((state) => state.user)
  const autoEnabled = user?.settings?.list_translation_auto_enabled ?? false
  const isActive = enabled ?? autoEnabled
  const targetLanguage = (user?.settings?.translation_target_language ??
    'zh-CN') as TranslationTargetLanguage

  const [translations, setTranslations] = useState<Record<string, ListEntryTranslation>>({})
  const [pendingBatches, setPendingBatches] = useState(0)

  // Build an id -> entry map for synchronous lookups inside observer callback.
  const entriesByIdRef = useRef(new Map<string, EntryWithState>())
  useEffect(() => {
    const map = new Map<string, EntryWithState>()
    for (const entry of entries) map.set(entry.id, entry)
    entriesByIdRef.current = map
  }, [entries])

  const translatedIdsRef = useRef<Set<string>>(new Set())
  const pendingIdsRef = useRef<Set<string>>(new Set())
  const textCacheRef = useRef<Map<string, string>>(new Map())
  const sessionRef = useRef(0)

  // Reset everything when the hook is disabled or the target language changes.
  useEffect(() => {
    sessionRef.current += 1
    translatedIdsRef.current.clear()
    pendingIdsRef.current.clear()
    textCacheRef.current.clear()
    setTranslations({})
    setPendingBatches(0)
  }, [isActive, targetLanguage])

  const translateEntries = useCallback(
    async (entryIds: string[]) => {
      if (!isActive) return
      const sessionId = sessionRef.current

      const toTranslate = entryIds.filter(
        (id) => !translatedIdsRef.current.has(id) && !pendingIdsRef.current.has(id)
      )
      if (toTranslate.length === 0) return

      type EntryTexts = { entry: EntryWithState; title: string; summaryPlain: string }
      const entryTexts: EntryTexts[] = []
      for (const id of toTranslate) {
        const entry = entriesByIdRef.current.get(id)
        if (!entry) continue
        const summaryPlain = stripHtmlTags(entry.summary || '').trim()
        const hasTranslatableText = [entry.title, summaryPlain]
          .filter((text) => text.length > 0)
          .some((text) => shouldAutoTranslate(text, targetLanguage))
        if (!hasTranslatableText) continue
        entryTexts.push({ entry, title: entry.title, summaryPlain })
        pendingIdsRef.current.add(id)
      }

      if (entryTexts.length === 0) return

      const allTexts = entryTexts.flatMap(({ title, summaryPlain }) =>
        [title, summaryPlain].filter((text) => text.length > 0)
      )
      const uncachedTexts = [
        ...new Set(allTexts.filter((text) => !textCacheRef.current.has(text))),
      ]

      setPendingBatches((count) => count + 1)

      // Entries still awaiting render — removed once their texts are all cached
      // and flushed to state. Lets us stream partial results per batch instead
      // of blocking the whole set on the slowest batch.
      const pendingEntryTexts = [...entryTexts]

      const flushReady = () => {
        const updates: Record<string, ListEntryTranslation> = {}
        const stillPending: EntryTexts[] = []
        for (const item of pendingEntryTexts) {
          const { entry, title, summaryPlain } = item
          const titleReady = title.length === 0 || textCacheRef.current.has(title)
          const summaryReady = summaryPlain.length === 0 || textCacheRef.current.has(summaryPlain)
          if (titleReady && summaryReady) {
            updates[entry.id] = {
              title: textCacheRef.current.get(title),
              summary: summaryPlain ? textCacheRef.current.get(summaryPlain) : undefined,
            }
            translatedIdsRef.current.add(entry.id)
          } else {
            stillPending.push(item)
          }
        }
        if (Object.keys(updates).length > 0) {
          setTranslations((prev) => ({ ...prev, ...updates }))
        }
        pendingEntryTexts.length = 0
        pendingEntryTexts.push(...stillPending)
      }

      try {
        // If all texts were cached from previous sessions, flush immediately
        // without an API roundtrip.
        if (uncachedTexts.length === 0) {
          flushReady()
          return
        }

        for (let index = 0; index < uncachedTexts.length; index += LIST_TRANSLATION_BATCH_SIZE) {
          const batch = uncachedTexts.slice(index, index + LIST_TRANSLATION_BATCH_SIZE)
          if (batch.length === 0) continue

          const response = await entryService.translateTexts(batch, targetLanguage, 'auto')
          if (sessionId !== sessionRef.current) return
          batch.forEach((text, batchIndex) => {
            const translated = response.translations[batchIndex]
            if (translated && translated.trim()) {
              textCacheRef.current.set(text, translated.trim())
            }
          })
          // Stream results — any entry whose texts are all cached renders now.
          flushReady()
        }
      } catch (error) {
        console.error('Failed to translate list entries:', error)
      } finally {
        if (sessionId === sessionRef.current) {
          setPendingBatches((count) => Math.max(0, count - 1))
          for (const { entry } of entryTexts) {
            pendingIdsRef.current.delete(entry.id)
          }
        }
      }
    },
    [isActive, targetLanguage]
  )

  // Stable dependency: re-run observer setup only when the SET of entry ids changes,
  // not when an individual entry's is_read flag flips.
  const entryIdsKey = entries.map((entry) => entry.id).join(',')

  useEffect(() => {
    if (!isActive || entries.length === 0) return

    const container = containerRef.current
    let pendingIds: string[] = []
    let timer: ReturnType<typeof setTimeout> | null = null

    const observer = new IntersectionObserver(
      (observed) => {
        const visibleIds = observed
          .filter((item) => item.isIntersecting)
          .map((item) => (item.target as HTMLElement).dataset.entryId)
          .filter((id): id is string => !!id)

        if (visibleIds.length === 0) return
        pendingIds.push(...visibleIds)

        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          const unique = Array.from(new Set(pendingIds))
          pendingIds = []
          void translateEntries(unique)
        }, 250)
      },
      { root: container ?? null, rootMargin: '0px 0px 400px 0px', threshold: 0 }
    )

    const observedNodes = new Set<Element>()

    const observeNew = (root: Element | Document) => {
      root.querySelectorAll('[data-entry-id]').forEach((node) => {
        if (!observedNodes.has(node)) {
          observedNodes.add(node)
          observer.observe(node)
        }
      })
    }

    // Observe nodes already in the DOM.
    observeNew(container ?? document)

    // Watch for newly added [data-entry-id] nodes (virtualized / paginated rendering).
    const mutationObserver = new MutationObserver(() => {
      observeNew(container ?? document)
    })
    mutationObserver.observe(container ?? document.body ?? document.documentElement, {
      childList: true,
      subtree: true,
    })

    return () => {
      if (timer) clearTimeout(timer)
      observer.disconnect()
      mutationObserver.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIdsKey, isActive, translateEntries])

  return {
    translations,
    isActive,
    isLoading: pendingBatches > 0,
  }
}
