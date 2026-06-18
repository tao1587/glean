import type { TranslationTargetLanguage } from '@glean/types'

const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g
const KANA_RE = /[\u3040-\u30ff\uff66-\uff9f]/g
const HANGUL_RE = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/g
// Count Latin words (not individual chars) to avoid over-weighting English in CJK-Latin mixed text.
// e.g. "React" = 1 word (not 5 chars), keeping Chinese tech articles classified as 'chinese'.
const LATIN_WORD_RE = /[A-Za-z][A-Za-z'-]*/g

export type TranslationLanguageCategory = 'chinese' | 'non_chinese' | 'unknown'

function countMatches(text: string, regex: RegExp): number {
  return text.match(regex)?.length ?? 0
}

function normalizeSample(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900)
}

function isOtherScriptCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0370 && codePoint <= 0x03ff) ||
    (codePoint >= 0x0400 && codePoint <= 0x04ff) ||
    (codePoint >= 0x0530 && codePoint <= 0x058f) ||
    (codePoint >= 0x0590 && codePoint <= 0x05ff) ||
    (codePoint >= 0x0600 && codePoint <= 0x06ff) ||
    (codePoint >= 0x0900 && codePoint <= 0x097f)
  )
}

function countOtherScriptMatches(text: string): number {
  let count = 0

  for (const char of text) {
    const codePoint = char.codePointAt(0)
    if (codePoint && isOtherScriptCodePoint(codePoint)) {
      count += 1
    }
  }

  return count
}

export function detectTranslationLanguageCategory(text: string): TranslationLanguageCategory {
  const sample = normalizeSample(text)
  if (!sample) return 'unknown'

  const hanCount = countMatches(sample, HAN_RE)
  const kanaCount = countMatches(sample, KANA_RE)
  const hangulCount = countMatches(sample, HANGUL_RE)
  // latinCount is word count, not char count — "TypeScript" = 1, not 10
  const latinCount = countMatches(sample, LATIN_WORD_RE)
  const otherScriptCount = countOtherScriptMatches(sample)

  const nonChineseSignal = kanaCount + hangulCount + latinCount + otherScriptCount
  const totalSignal = hanCount + nonChineseSignal

  // Minimum 2 units; lower than before because word-based Latin counts are smaller than char counts.
  if (totalSignal < 2) return 'unknown'
  if (kanaCount > 0 || hangulCount > 0 || otherScriptCount > 0) return 'non_chinese'
  if (hanCount === 0) return latinCount > 0 ? 'non_chinese' : 'unknown'
  if (nonChineseSignal === 0) return 'chinese'

  const hanRatio = hanCount / totalSignal
  return hanRatio >= 0.65 ? 'chinese' : 'non_chinese'
}

export function resolveAutoTranslationTargetLanguage(
  text: string,
  preferredTargetLanguage: TranslationTargetLanguage = 'zh-CN'
): TranslationTargetLanguage | null {
  const category = detectTranslationLanguageCategory(text)
  if (category === 'unknown') return null

  if (preferredTargetLanguage === 'zh-CN') {
    return category === 'non_chinese' ? 'zh-CN' : null
  }

  return category === 'chinese' ? 'en' : null
}

export function shouldAutoTranslate(
  text: string,
  preferredTargetLanguage: TranslationTargetLanguage = 'zh-CN'
): boolean {
  return resolveAutoTranslationTargetLanguage(text, preferredTargetLanguage) !== null
}
