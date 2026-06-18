function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface BilingualSegment {
  original: string
  translated: string
}

export function renderBilingualSegmentsHtml(segments: BilingualSegment[]): string {
  const htmlParts: string[] = []

  segments.forEach(({ original, translated }) => {
    htmlParts.push(`<span class="glean-original-sentence">${escapeHtml(original)}</span>`)

    if (translated.trim()) {
      htmlParts.push(
        `<span class="glean-translated-sentence">${escapeHtml(translated.trim())}</span>`,
      )
    }
  })

  return htmlParts.join('')
}
