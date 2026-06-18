import { describe, expect, it } from 'vitest'
import { renderBilingualSegmentsHtml } from '@/lib/bilingualMarkup'

describe('renderBilingualSegmentsHtml', () => {
  it('renders structural line breaks between original and translated text', () => {
    const html = renderBilingualSegmentsHtml([
      { original: 'Original sentence.', translated: '译文句子。' },
      { original: 'Another line.', translated: '另一行。' },
    ])

    expect(html).toContain('<span class="glean-original-sentence">Original sentence.</span><br />')
    expect(html).toContain('<span class="glean-translated-sentence">译文句子。</span><br />')
    expect(html).toContain('<br /><span class="glean-original-sentence">Another line.</span>')
  })

  it('omits translated line markup when translation text is empty', () => {
    const html = renderBilingualSegmentsHtml([
      { original: 'Original only.', translated: '' },
    ])

    expect(html).toContain('<span class="glean-original-sentence">Original only.</span>')
    expect(html).not.toContain('glean-translated-sentence')
  })
})
