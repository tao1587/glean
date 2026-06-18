import { classifyPreElement } from './preTranslation'
import {
  collectTranslatableBlocks,
  normalizeLooseTextNodes,
  splitBlockByBreaks,
} from './translationRules'

const ORIGINAL_HTML_ATTR = 'data-original-html'

export interface TranslationSnapshot {
  original: string
  translated: string
  totalSegments: number
  translatedSegments: number
  isComplete: boolean
}

export function extractArticleTextBlocks(
  root: HTMLElement,
  translatePreUnknown: boolean
): string[] {
  normalizeLooseTextNodes(root, ORIGINAL_HTML_ATTR)
  const blocks = collectTranslatableBlocks(root, translatePreUnknown, classifyPreElement)
  return blocks
    .map((block) => splitBlockByBreaks(block).join('\n').trim())
    .filter((block) => block.length > 0)
}
