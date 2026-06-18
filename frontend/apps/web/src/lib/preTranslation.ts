export type PreTranslationClass = 'text' | 'code' | 'unknown'

function looksLikeCode(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  const symbolCount =
    (trimmed.match(/[{}[\];<>]/g)?.length ?? 0) +
    (trimmed.match(/=>/g)?.length ?? 0) +
    (trimmed.match(/::/g)?.length ?? 0) +
    (trimmed.match(/\/\//g)?.length ?? 0)
  const keywordHits = trimmed.match(
    /\b(function|const|let|var|class|def|import|from|return|if|else|for|while|switch|case|try|catch)\b/g,
  )?.length
  const density = (symbolCount + (keywordHits ?? 0) * 2) / Math.max(1, trimmed.length)
  if (density > 0.06) return true

  const lines = trimmed.split(/\r?\n/)
  const indentedLines = lines.filter((line) => /^(\s{2,}|\t+)/.test(line)).length
  if (lines.length >= 3 && indentedLines / lines.length > 0.4) return true

  return false
}

function looksLikeCommand(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  const lines = trimmed.split(/\r?\n/)

  if (lines.some((line) => /^\s*[$#>]\s/.test(line))) return true

  const commandRegex =
    /^\s*(sudo|apt-get|apt|yum|dnf|brew|pip|pip3|npm|pnpm|yarn|git|curl|wget|docker|kubectl|python|python3|node|go|cargo|make|chmod|chown|ls|cd|mkdir|rm)\b/i
  if (lines.some((line) => commandRegex.test(line))) return true

  if (trimmed.includes('&&') || trimmed.includes('||')) return true

  return false
}

export function classifyPreElement(el: Element): PreTranslationClass {
  if (el.tagName !== 'PRE') return 'unknown'
  if (el.querySelector('code')) return 'code'
  const text = el.textContent ?? ''
  if (!text.trim()) return 'code'

  if (el.children.length > 0) return 'unknown'
  if (looksLikeCode(text)) return 'code'
  if (looksLikeCommand(text)) return 'unknown'

  return 'text'
}
