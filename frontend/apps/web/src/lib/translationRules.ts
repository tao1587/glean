export const TRANSLATABLE_BLOCKS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'BLOCKQUOTE',
  'FIGCAPTION',
  'DT',
  'DD',
  'ARTICLE',
  'PRE',
])

export const SKIP_TAGS = new Set(['CODE', 'PRE', 'SCRIPT', 'STYLE', 'KBD', 'SAMP'])
const HARD_BREAK_END_RE = /[。！？；.!?;]$/
const CONTINUATION_START_RE = /^[:：,，)\]}a-z0-9@#&([{'"“‘-]/
const SOFT_BREAK_LENGTH_THRESHOLD = 80
const PUNCT_ONLY_RE = /^[\s,，:：;；.!?。！？)\]}>"'”’-]+$/

export function hasSkipAncestor(el: Element): boolean {
  let current: Element | null = el
  while (current) {
    if (SKIP_TAGS.has(current.tagName)) return true
    if (current.hasAttribute('data-no-translate')) return true
    current = current.parentElement
  }
  return false
}

function isFragmentedBlockquote(el: Element): boolean {
  if (el.tagName !== 'BLOCKQUOTE') return false

  const directChildren = Array.from(el.children)
  if (directChildren.length === 0) return false

  const hasParagraphChild = directChildren.some((child) => child.tagName === 'P')
  const hasNonParagraphChild = directChildren.some((child) => child.tagName !== 'P')

  // General rule: when loose text and inline tags are mixed together, we normalize
  // them into a synthetic <p> so downstream translation works on a single block.
  // Blockquote is the exception when the DOM is already fragmented into
  // <p> + inline + <p> siblings: reader typography often styles blockquote <p>
  // with quote pseudo-elements, so translating those inner <p> nodes produces
  // duplicated/misaligned quote marks in the UI. In that case the whole
  // blockquote must be treated as one translation unit.
  return hasParagraphChild && hasNonParagraphChild
}

export function collectTranslatableBlocks(
  root: HTMLElement,
  translatePreUnknown: boolean,
  classifyPreElement: (el: Element) => 'text' | 'code' | 'unknown',
): Element[] {
  const blocks: Element[] = []
  const fragmentedBlockquotes = new Set<Element>()

  root.querySelectorAll('blockquote').forEach((el) => {
    if (isFragmentedBlockquote(el) && !hasSkipAncestor(el) && el.textContent?.trim()) {
      fragmentedBlockquotes.add(el)
      blocks.push(el)
    }
  })

  for (const tagName of TRANSLATABLE_BLOCKS) {
    const elements = root.querySelectorAll(tagName.toLowerCase())
    elements.forEach((el) => {
      if (fragmentedBlockquotes.has(el)) return
      if ([...fragmentedBlockquotes].some((blockquote) => blockquote.contains(el))) return
      if (el.tagName === 'ARTICLE' && el.children.length > 0) return
      if (el.tagName === 'PRE') {
        const preClass = classifyPreElement(el)
        if (preClass === 'code') return
        if (preClass === 'unknown' && !translatePreUnknown) return
      }
      if (el.classList.contains('glean-bilingual-active')) return
      if (!hasSkipAncestor(el) && el.textContent?.trim()) {
        blocks.push(el)
      }
    })
  }

  // Keep only leaf-most translatable blocks. This prevents parent/child overlap
  // (e.g. blockquote + p, li + p) from being translated twice.
  const uniqueBlocks = Array.from(new Set(blocks))
  return uniqueBlocks.filter(
    (el) => !uniqueBlocks.some((other) => other !== el && el.contains(other)),
  )
}

export function normalizeLooseTextNodes(root: HTMLElement, originalHtmlAttr: string): void {
  const containers = [
    root,
    ...Array.from(root.querySelectorAll('div, article, section, blockquote, li, dt, dd, figcaption')),
  ]
  const structuralTags = new Set([
    'P',
    'DIV',
    'SECTION',
    'ARTICLE',
    'BLOCKQUOTE',
    'UL',
    'OL',
    'LI',
    'DL',
    'DT',
    'DD',
    'TABLE',
    'THEAD',
    'TBODY',
    'TR',
    'TD',
    'TH',
    'PRE',
    'FIGURE',
    'FIGCAPTION',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HR',
  ])

  for (const container of containers) {
    if (hasSkipAncestor(container)) continue

    const directNodes = Array.from(container.childNodes)
    const hasLooseText = directNodes.some(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent?.trim().length ?? 0) > 0,
    )
    if (!hasLooseText) continue

    if (!container.hasAttribute(originalHtmlAttr)) {
      container.setAttribute(originalHtmlAttr, container.innerHTML)
    }

    const fragment = document.createDocumentFragment()
    let inlineParagraph: HTMLParagraphElement | null = null

    const ensureInlineParagraph = () => {
      // Default normalization rule:
      // loose text + inline descendants should become one synthetic <p>, so
      // translation sees a stable block boundary instead of fragmented text nodes.
      if (!inlineParagraph) inlineParagraph = document.createElement('p')
      return inlineParagraph
    }

    const flushInlineParagraph = () => {
      if (!inlineParagraph) return
      if ((inlineParagraph.textContent ?? '').trim().length > 0) {
        fragment.appendChild(inlineParagraph)
      }
      inlineParagraph = null
    }

    for (const node of directNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ''
        if (!text.trim()) continue
        ensureInlineParagraph().appendChild(document.createTextNode(text))
        continue
      }

      if (node.nodeType !== Node.ELEMENT_NODE) continue
      const el = node as Element

      if (structuralTags.has(el.tagName)) {
        flushInlineParagraph()
        fragment.appendChild(el)
        continue
      }

      ensureInlineParagraph().appendChild(el)
    }

    flushInlineParagraph()

    container.replaceChildren(fragment)
  }
}

function joinFragments(left: string, right: string): string {
  if (!left) return right
  if (!right) return left

  const needsSpace = !/\s$/.test(left) && !/^[\s.,!?;:，。！？；：)\]}]/.test(right)
  return needsSpace ? `${left} ${right}` : `${left}${right}`
}

/**
 * Segment extraction rules for rich article content:
 * 1. A translatable unit starts as one eligible block element.
 * 2. Direct text nodes mixed with inline tags are wrapped into a synthetic <p>.
 * 3. Inline tags such as <a>/<strong>/<em> contribute text to the current unit.
 * 4. <br> creates a hard boundary, but visually wrapped short fragments are re-merged.
 * 5. Code-like descendants and previously rendered bilingual spans are ignored.
 */
function mergeSoftBreakSegments(parts: string[]): string[] {
  const merged: string[] = []

  for (const raw of parts) {
    const part = raw.trim()
    if (!part) continue

    if (merged.length === 0) {
      merged.push(part)
      continue
    }

    const prev = merged[merged.length - 1]
    const prevEndsHard = HARD_BREAK_END_RE.test(prev)
    const punctuationOnly = PUNCT_ONLY_RE.test(part)
    const hasShortSide =
      prev.length < SOFT_BREAK_LENGTH_THRESHOLD || part.length < SOFT_BREAK_LENGTH_THRESHOLD
    const startsAsContinuation = CONTINUATION_START_RE.test(part)
    const shouldMerge = !prevEndsHard && (punctuationOnly || hasShortSide || startsAsContinuation)

    if (shouldMerge) {
      merged[merged.length - 1] = joinFragments(prev, part)
      continue
    }

    merged.push(part)
  }

  return merged
}

/**
 * Split block text into translation segments.
 *
 * The walker preserves inline formatting text as part of the same segment and only
 * flushes on hard break markers such as <br>. After traversal, nearby short fragments
 * that were separated only for visual wrapping are merged back together.
 */
export function splitBlockByBreaks(block: Element): string[] {
  const parts: string[] = []
  let current = ''

  const flush = () => {
    const text = current.trim()
    if (text) parts.push(text)
    current = ''
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (!text) return
      // Preserve token boundaries across adjacent text nodes.
      if (current && !/\s$/.test(current) && !/^[\s.,!?;:，。！？；：)\]}]/.test(text)) {
        current += ' '
      }
      current += text
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element

    if (el.tagName === 'BR') {
      flush()
      return
    }

    // Prevent reusing previously rendered bilingual lines as source sentences.
    if (
      el.classList.contains('glean-original-sentence') ||
      el.classList.contains('glean-translated-sentence')
    ) {
      return
    }

    if (SKIP_TAGS.has(el.tagName)) return

    const children = Array.from(el.childNodes)
    children.forEach((child) => walk(child))
  }

  walk(block)
  flush()

  return mergeSoftBreakSegments(parts)
}
