import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { entryService } from '@glean/api-client'
import { TranslationSnapshot, extractArticleTextBlocks } from '../lib/articleTextBlocks'
import { classifyPreElement } from '../lib/preTranslation'
import { renderBilingualSegmentsHtml } from '../lib/bilingualMarkup'
import {
  hasSkipAncestor,
  collectTranslatableBlocks,
  normalizeLooseTextNodes,
  splitBlockByBreaks,
} from '../lib/translationRules'

// Data attribute to mark a block as already processed
const PROCESSED_ATTR = 'data-translation-processed'

// Data attribute to store original HTML for restoration
const ORIGINAL_HTML_ATTR = 'data-original-html'

// Class added to blocks that have been replaced with bilingual content
const BILINGUAL_ACTIVE_CLASS = 'glean-bilingual-active'
const SESSION_TRANSLATION_CACHE = new Map<string, Map<string, string>>()

function getSessionCacheKey(entryId: string, targetLanguage: string): string {
  return `${entryId}::${targetLanguage}`
}

interface UseViewportTranslationOptions {
  contentRef: React.RefObject<HTMLElement | null>
  scrollContainerRef: React.RefObject<HTMLElement | null>
  targetLanguage: string | null
  entryId: string
  translatePreUnknown?: boolean
}

interface UseViewportTranslationReturn {
  isActive: boolean
  isTranslating: boolean
  error: string | null
  activate: () => void
  deactivate: () => void
  toggle: () => void
  retry: () => void
  ensureCompleteTranslation: () => Promise<TranslationSnapshot | null>
  getTranslationSnapshot: () => TranslationSnapshot | null
}

/**
 * Hook for viewport-based sentence-level translation.
 *
 * Translates only the content visible in the scroll container (plus a small buffer).
 * Each block element's text is split into logical segments based on hard line breaks.
 * The block's content is replaced in-place with bilingual pairs (original segment +
 * translation). We intentionally avoid a second sentence-level split here because
 * inline HTML often bisects the sentence text and causes truncated translations.
 */
export function useViewportTranslation({
  contentRef,
  scrollContainerRef,
  targetLanguage,
  entryId,
  translatePreUnknown = false,
}: UseViewportTranslationOptions): UseViewportTranslationReturn {
  const [isActive, setIsActive] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Translation cache: sentence text -> translated text
  const cacheRef = useRef<Map<string, string>>(new Map())
  // Blocks currently being translated (prevent duplicate requests)
  const pendingBlocksRef = useRef<Set<Element>>(new Set())
  // IntersectionObserver ref
  const observerRef = useRef<IntersectionObserver | null>(null)
  // Track active state in ref for use inside observer callback
  const isActiveRef = useRef(false)
  // Monotonic session version to drop stale async translation writes.
  const sessionVersionRef = useRef(0)
  const sessionCacheKey = getSessionCacheKey(entryId, targetLanguage ?? 'disabled')

  /**
   * Translate a batch of visible blocks and insert translation lines.
   */
  const translateBlocks = useCallback(
    async (blocks: Element[]) => {
      // Filter out already-processed or currently-pending blocks
      if (!targetLanguage) return
      const runVersion = sessionVersionRef.current
      const toTranslate = blocks.filter(
        (b) => !b.hasAttribute(PROCESSED_ATTR) && !pendingBlocksRef.current.has(b),
      )
      if (toTranslate.length === 0) return

      // Mark as pending
      toTranslate.forEach((b) => pendingBlocksRef.current.add(b))
      setIsTranslating(true)
      setError(null)

      // Collect sentences from all blocks
      const blockSegments: { block: Element; segments: string[] }[] = []
      for (const block of toTranslate) {
        if (hasSkipAncestor(block)) continue
        // Treat <br> as hard boundaries so pre/post-br are translated independently.
        const segments = splitBlockByBreaks(block)
        if (segments.length > 0) {
          blockSegments.push({ block, segments })
        }
      }

      if (blockSegments.length === 0) {
        toTranslate.forEach((b) => pendingBlocksRef.current.delete(b))
        setIsTranslating(false)
        return
      }

      // Collect all unique uncached sentences
      const allSegments = blockSegments.flatMap((bs) => bs.segments)
      const uncached = [...new Set(allSegments.filter((segment) => !cacheRef.current.has(segment)))]

      // Call API for uncached sentences
      if (uncached.length > 0) {
        try {
          const response = await entryService.translateTexts(
            uncached,
            targetLanguage,
            'auto',
            entryId,
          )
          if (!isActiveRef.current || runVersion !== sessionVersionRef.current) {
            toTranslate.forEach((b) => pendingBlocksRef.current.delete(b))
            setIsTranslating(false)
            return
          }
          uncached.forEach((text, i) => {
            cacheRef.current.set(text, response.translations[i])
          })
          SESSION_TRANSLATION_CACHE.set(sessionCacheKey, new Map(cacheRef.current))
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Translation failed'
          setError(msg)
          toTranslate.forEach((b) => pendingBlocksRef.current.delete(b))
          setIsTranslating(false)
          return
        }
      }

      // Replace each block's content in-place with bilingual segment pairs.
      // The block element itself stays in the DOM — no layout shift for the observer.
      // Adding translations makes blocks taller, pushing content DOWN (away from viewport),
      // so no cascade of new blocks entering the viewport.
      for (const { block, segments } of blockSegments) {
        if (!isActiveRef.current || runVersion !== sessionVersionRef.current) {
          pendingBlocksRef.current.delete(block)
          continue
        }
        // Save original HTML so we can restore on deactivate
        if (!block.hasAttribute(ORIGINAL_HTML_ATTR)) {
          block.setAttribute(ORIGINAL_HTML_ATTR, block.innerHTML)
        }

        // Build bilingual HTML: each original segment followed by its translation.
        const html = renderBilingualSegmentsHtml(
          segments.map((segment) => ({
            original: segment,
            translated: cacheRef.current.get(segment) ?? '',
          })),
        )

        block.innerHTML = html
        block.classList.add(BILINGUAL_ACTIVE_CLASS)
        block.setAttribute(PROCESSED_ATTR, 'true')
        pendingBlocksRef.current.delete(block)
      }

      setIsTranslating(false)
    },
    [targetLanguage, entryId, sessionCacheKey],
  )

  /**
   * Set up IntersectionObserver on all translatable blocks.
   */
  const setupObserver = useCallback(() => {
    if (!targetLanguage) return
    if (!contentRef.current || !scrollContainerRef.current) return

    // Normalize loose text-node content into paragraph blocks first.
    normalizeLooseTextNodes(contentRef.current, ORIGINAL_HTML_ATTR)

    // Find all translatable block elements
    const blocks = collectTranslatableBlocks(contentRef.current, translatePreUnknown, classifyPreElement)

    if (blocks.length === 0) return

    // Batch visible blocks with a debounce
    let pendingVisible: Element[] = []
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const observer = new IntersectionObserver(
      (entries) => {
        if (!isActiveRef.current) return

        const newlyVisible = entries.filter((e) => e.isIntersecting).map((e) => e.target)

        if (newlyVisible.length > 0) {
          pendingVisible.push(...newlyVisible)

          // Debounce to batch nearby blocks
          if (debounceTimer) clearTimeout(debounceTimer)
          debounceTimer = setTimeout(() => {
            const batch = [...pendingVisible]
            pendingVisible = []
            translateBlocks(batch)
          }, 200)
        }
      },
      {
        root: scrollContainerRef.current,
        // Pre-translate a few lines below viewport
        rootMargin: '0px 0px 200px 0px',
        threshold: 0,
      },
    )

    observerRef.current = observer
    blocks.forEach((block) => observer.observe(block))
  }, [contentRef, scrollContainerRef, translateBlocks, translatePreUnknown, targetLanguage])

  /**
   * Apply fully-cached translations immediately to avoid original-text flash.
   * Returns number of blocks updated.
   */
  const applyCachedTranslationsImmediately = useCallback((): number => {
    if (!contentRef.current || cacheRef.current.size === 0) return 0
    normalizeLooseTextNodes(contentRef.current, ORIGINAL_HTML_ATTR)

    const blocks = collectTranslatableBlocks(contentRef.current, translatePreUnknown, classifyPreElement)
    let applied = 0

    for (const block of blocks) {
      if (block.hasAttribute(PROCESSED_ATTR) || pendingBlocksRef.current.has(block)) continue
      if (hasSkipAncestor(block)) continue

      const segments = splitBlockByBreaks(block)
      if (segments.length === 0) continue

      const translations = segments.map((segment) => cacheRef.current.get(segment)?.trim() ?? '')
      const allCached = translations.every((translated) => translated.length > 0)
      if (!allCached) continue

      if (!block.hasAttribute(ORIGINAL_HTML_ATTR)) {
        block.setAttribute(ORIGINAL_HTML_ATTR, block.innerHTML)
      }

      const html = renderBilingualSegmentsHtml(
        segments.map((segment, index) => ({
          original: segment,
          translated: translations[index],
        })),
      )

      block.innerHTML = html
      block.classList.add(BILINGUAL_ACTIVE_CLASS)
      block.setAttribute(PROCESSED_ATTR, 'true')
      applied += 1
    }

    return applied
  }, [contentRef, translatePreUnknown])

  const getTranslationSnapshot = useCallback((): TranslationSnapshot | null => {
    if (!contentRef.current) return null

    const originalBlocks = extractArticleTextBlocks(contentRef.current, translatePreUnknown)
    if (originalBlocks.length === 0) {
      return {
        original: '',
        translated: '',
        totalSegments: 0,
        translatedSegments: 0,
        isComplete: true,
      }
    }

    const translatedBlocks: string[] = []
    let totalSegments = 0
    let translatedSegments = 0

    for (const block of originalBlocks) {
      const segments = block
        .split('\n')
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0)
      totalSegments += segments.length

      const translatedLines = segments.map((segment) => {
        const translated = cacheRef.current.get(segment)?.trim() ?? ''
        if (translated) {
          translatedSegments += 1
        }
        return translated
      })

      translatedBlocks.push(translatedLines.filter((line) => line.length > 0).join('\n'))
    }

    return {
      original: originalBlocks.join('\n\n'),
      translated: translatedBlocks.filter((block) => block.length > 0).join('\n\n'),
      totalSegments,
      translatedSegments,
      isComplete: totalSegments > 0 && translatedSegments === totalSegments,
    }
  }, [contentRef, translatePreUnknown])

  /**
   * Restore all translated blocks to their original HTML.
   */
  const removeTranslationElements = useCallback(() => {
    if (!contentRef.current) return

    const parent = contentRef.current

    // Restore original HTML for all bilingual blocks
    const modified = parent.querySelectorAll(`[${ORIGINAL_HTML_ATTR}]`)
    modified.forEach((el) => {
      const originalHtml = el.getAttribute(ORIGINAL_HTML_ATTR)
      if (originalHtml !== null) {
        el.innerHTML = originalHtml
      }
      el.removeAttribute(ORIGINAL_HTML_ATTR)
      el.classList.remove(BILINGUAL_ACTIVE_CLASS)
    })

    // Remove processed markers
    const processed = parent.querySelectorAll(`[${PROCESSED_ATTR}]`)
    processed.forEach((el) => el.removeAttribute(PROCESSED_ATTR))
  }, [contentRef])

  const activate = useCallback(() => {
    if (!targetLanguage) return
    sessionVersionRef.current += 1
    setIsActive(true)
    isActiveRef.current = true
    setError(null)
  }, [targetLanguage])

  const deactivate = useCallback(() => {
    sessionVersionRef.current += 1
    setIsActive(false)
    isActiveRef.current = false

    // Disconnect observer
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    // Restore original content
    removeTranslationElements()

    // Keep cache in memory; only hide rendered translations.
    pendingBlocksRef.current.clear()
    setIsTranslating(false)
    setError(null)
  }, [removeTranslationElements])

  const retry = useCallback(() => {
    if (!targetLanguage) return
    sessionVersionRef.current += 1
    // Clear error and pending state
    setError(null)
    pendingBlocksRef.current.clear()
    setIsTranslating(false)

    // Disconnect old observer
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    // Remove processed markers so failed blocks can be retried
    if (contentRef.current) {
      const processed = contentRef.current.querySelectorAll(`[${PROCESSED_ATTR}]`)
      processed.forEach((el) => el.removeAttribute(PROCESSED_ATTR))
    }

    // Re-setup observer to re-detect visible blocks
    setupObserver()
  }, [contentRef, setupObserver, targetLanguage])

  const toggle = useCallback(() => {
    if (isActiveRef.current) {
      deactivate()
    } else {
      activate()
    }
  }, [activate, deactivate])

  const ensureCompleteTranslation = useCallback(async (): Promise<TranslationSnapshot | null> => {
    if (!targetLanguage || !contentRef.current) return null

    if (!isActiveRef.current) {
      activate()
    }

    const blocks = collectTranslatableBlocks(contentRef.current, translatePreUnknown, classifyPreElement)
    const allSegments = blocks.flatMap((block) => splitBlockByBreaks(block))
    const missingSegments = [...new Set(allSegments.filter((segment) => !cacheRef.current.has(segment)))]

    try {
      setError(null)
      const batchSize = 24
      for (let index = 0; index < missingSegments.length; index += batchSize) {
        const batch = missingSegments.slice(index, index + batchSize)
        if (batch.length === 0) continue

        const response = await entryService.translateTexts(batch, targetLanguage, 'auto', entryId)
        batch.forEach((text, batchIndex) => {
          const translated = response.translations[batchIndex]?.trim()
          if (translated) {
            cacheRef.current.set(text, translated)
          }
        })
        SESSION_TRANSLATION_CACHE.set(sessionCacheKey, new Map(cacheRef.current))
      }

      if (blocks.length > 0) {
        await translateBlocks(blocks)
      }

      const snapshot = getTranslationSnapshot()
      if (snapshot && !snapshot.isComplete) {
        throw new Error('Translation is not complete yet')
      }
      return snapshot
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Translation failed'
      setError(message)
      throw err
    }
  }, [
    activate,
    contentRef,
    entryId,
    getTranslationSnapshot,
    sessionCacheKey,
    targetLanguage,
    translateBlocks,
    translatePreUnknown,
  ])

  // Set up observer when activated.
  // If persisted cache exists, apply cached translations first to avoid flash.
  useLayoutEffect(() => {
    if (!isActive || !targetLanguage) return

    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const hasPersistedCache = cacheRef.current.size > 0

    const initialize = () => {
      if (hasPersistedCache) {
        let attempts = 0
        const tryApply = () => {
          const applied = applyCachedTranslationsImmediately()
          if (applied === 0 && attempts < 8) {
            attempts += 1
            retryTimer = setTimeout(tryApply, 30)
            return
          }
          setupObserver()
        }
        tryApply()
        return
      }

      // Wait for useContentRenderer to finish (syntax highlighting, gallery)
      retryTimer = setTimeout(() => {
        setupObserver()
      }, 150)
    }

    initialize()

    return () => {
      if (retryTimer) {
        clearTimeout(retryTimer)
      }
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
    }
  }, [isActive, setupObserver, applyCachedTranslationsImmediately, targetLanguage])

  // Load cached sentence translations from DB when entry/language changes.
  // If cache exists, auto-enable translation display.
  useEffect(() => {
    let cancelled = false

    // Tear down previous entry runtime state.
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (isActiveRef.current) {
      removeTranslationElements()
    }
    setIsActive(false)
    isActiveRef.current = false
    sessionVersionRef.current += 1
    setIsTranslating(false)
    setError(null)
    pendingBlocksRef.current.clear()
    cacheRef.current.clear()

    const sessionCached = SESSION_TRANSLATION_CACHE.get(sessionCacheKey)
    if (sessionCached && sessionCached.size > 0) {
      cacheRef.current = new Map(sessionCached)
      setIsActive(true)
      isActiveRef.current = true
    }

    if (!targetLanguage) return

    const loadPersisted = async () => {
      try {
        const response = await entryService.getParagraphTranslations(entryId, targetLanguage)
        if (cancelled) return
        const entries = Object.entries(response.translations ?? {})
        if (entries.length > 0) {
          cacheRef.current = new Map(entries)
          SESSION_TRANSLATION_CACHE.set(sessionCacheKey, new Map(cacheRef.current))
          setIsActive(true)
          isActiveRef.current = true
        }
      } catch {
        if (cancelled) return
        // Ignore fetch errors; user can still trigger live translation.
      }
    }

    void loadPersisted()

    return () => {
      cancelled = true
    }
  }, [entryId, targetLanguage, removeTranslationElements, sessionCacheKey])

  return {
    isActive,
    isTranslating,
    error,
    activate,
    deactivate,
    toggle,
    retry,
    ensureCompleteTranslation,
    getTranslationSnapshot,
  }
}
