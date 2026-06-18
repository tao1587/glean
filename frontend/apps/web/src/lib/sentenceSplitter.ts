/**
 * Sentence splitting utility for bilingual translation.
 *
 * Handles English, Chinese, and mixed-language content.
 * Splits text into sentences while preserving punctuation.
 */

// Minimum sentence length to avoid trivially short fragments (e.g. "Dr.", "U.S.")
const MIN_SENTENCE_LENGTH = 10
const NO_SPLIT_THRESHOLD = 400
const MID_SPLIT_THRESHOLD = 800
const LONG_TARGET_SEGMENT_LENGTH = 320

function joinSentencesForParagraph(sentences: string[]): string {
  if (sentences.length === 0) return ''
  let merged = sentences[0]
  for (let i = 1; i < sentences.length; i += 1) {
    const next = sentences[i]
    merged += /[。！？；]$/.test(merged) ? next : ` ${next}`
  }
  return merged
}

function mergeShortFragments(parts: string[]): string[] {
  const merged: string[] = []
  for (const part of parts) {
    if (merged.length > 0 && part.length < MIN_SENTENCE_LENGTH) {
      merged[merged.length - 1] = joinSentencesForParagraph([merged[merged.length - 1], part])
    } else {
      merged.push(part)
    }
  }
  return merged
}

function groupByDesiredCount(parts: string[], desiredCount: number): string[] {
  if (desiredCount <= 1 || parts.length <= 1) return [joinSentencesForParagraph(parts)]
  const totalLength = parts.reduce((sum, sentence) => sum + sentence.length, 0)
  const targetLength = Math.ceil(totalLength / desiredCount)
  const grouped: string[] = []
  let current: string[] = []
  let currentLength = 0

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]
    const remainingParts = parts.length - i
    const remainingGroups = desiredCount - grouped.length
    const mustFlushForRemainingGroups = current.length > 0 && remainingParts < remainingGroups
    const shouldFlush =
      mustFlushForRemainingGroups ||
      (current.length > 0 &&
        currentLength + part.length > targetLength &&
        remainingParts >= remainingGroups)

    if (shouldFlush) {
      grouped.push(joinSentencesForParagraph(current))
      current = [part]
      currentLength = part.length
    } else {
      current.push(part)
      currentLength += part.length
    }
  }

  if (current.length > 0) grouped.push(joinSentencesForParagraph(current))
  return grouped
}

function groupByTargetLength(parts: string[], targetLength: number): string[] {
  if (parts.length <= 1) return [joinSentencesForParagraph(parts)]
  const grouped: string[] = []
  let current: string[] = []
  let currentLength = 0

  for (const part of parts) {
    const shouldFlush = current.length > 0 && currentLength + part.length > targetLength
    if (shouldFlush) {
      grouped.push(joinSentencesForParagraph(current))
      current = [part]
      currentLength = part.length
    } else {
      current.push(part)
      currentLength += part.length
    }
  }

  if (current.length > 0) grouped.push(joinSentencesForParagraph(current))
  return grouped
}

/**
 * Split text into sentences.
 *
 * Handles:
 * - English: split after . ! ? followed by whitespace
 * - Chinese: split after 。！？；
 * - Mixed: combined regex
 * - Merges very short fragments with the previous sentence
 */
export function splitIntoSentences(text: string): string[] {
  if (!text.trim()) return []

  // Split on sentence-ending punctuation:
  // - English: .!?; followed by whitespace
  // - Chinese: 。！？； (no whitespace needed)
  const parts = text.split(/(?<=[.!?;])\s+|(?<=[。！？；])/)
  const candidates = mergeShortFragments(parts.map((part) => part.trim()).filter(Boolean))
  if (candidates.length === 0) return []
  if (candidates.length === 1) return candidates

  const totalLength = candidates.reduce((sum, sentence) => sum + sentence.length, 0)
  if (totalLength <= NO_SPLIT_THRESHOLD) {
    return [joinSentencesForParagraph(candidates)]
  }

  if (totalLength <= MID_SPLIT_THRESHOLD) {
    const desiredGroups = totalLength <= 600 ? 2 : 3
    return groupByDesiredCount(candidates, Math.min(desiredGroups, candidates.length))
  }

  return groupByTargetLength(candidates, LONG_TARGET_SEGMENT_LENGTH)
}
