import { resolveAutoTranslationTargetLanguage } from './translationLanguagePolicy'
import type { TranslationTargetLanguage } from '@glean/types'

/**
 * Backward-compatible wrapper.
 *
 * New translation policy only auto-translates non-Chinese content to Chinese.
 * For Chinese/unknown content this returns "zh-CN" as a stable fallback.
 */
export function detectTargetLanguage(
  text: string,
  preferredTargetLanguage: TranslationTargetLanguage = 'zh-CN'
): string {
  return resolveAutoTranslationTargetLanguage(text, preferredTargetLanguage) ?? preferredTargetLanguage
}
