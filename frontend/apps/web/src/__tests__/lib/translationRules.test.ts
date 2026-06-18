import { describe, expect, it } from 'vitest'
import {
  collectTranslatableBlocks,
  normalizeLooseTextNodes,
  splitBlockByBreaks,
} from '@/lib/translationRules'

describe('translationRules', () => {
  it('skips blockquote wrapper when it contains structured blocks', () => {
    const root = document.createElement('article')
    root.innerHTML = `
      <blockquote>
        <p>First paragraph.</p>
        <p>Second paragraph.</p>
      </blockquote>
    `

    const blocks = collectTranslatableBlocks(root, false, () => 'text')
    const tags = blocks.map((el) => el.tagName)

    expect(tags).toEqual(['P', 'P'])
  })

  it('keeps only leaf-most blocks for nested list content', () => {
    const root = document.createElement('article')
    root.innerHTML = `
      <ul>
        <li><p>Item one.</p></li>
        <li><p>Item two.</p></li>
      </ul>
    `

    const blocks = collectTranslatableBlocks(root, false, () => 'text')
    const tags = blocks.map((el) => el.tagName)

    expect(tags).toEqual(['P', 'P'])
  })

  it('still translates blockquote with inline-only children', () => {
    const root = document.createElement('article')
    root.innerHTML = `
      <blockquote><span>Inline quote text.</span></blockquote>
    `

    const blocks = collectTranslatableBlocks(root, false, () => 'text')
    const tags = blocks.map((el) => el.tagName)

    expect(tags).toEqual(['BLOCKQUOTE'])
  })

  it('wraps loose text with inline content into paragraphs by default', () => {
    const root = document.createElement('article')
    root.innerHTML = `
      <blockquote>
        Outer text.
        <p>Inner paragraph.</p>
      </blockquote>
    `

    normalizeLooseTextNodes(root, 'data-original-html')
    const blocks = collectTranslatableBlocks(root, false, () => 'text')
    const tags = blocks.map((el) => el.tagName)
    const texts = blocks.map((el) => (el.textContent ?? '').trim())

    expect(tags).toEqual(['P', 'P'])
    expect(texts).toContain('Outer text.')
    expect(texts).toContain('Inner paragraph.')
  })

  it('ignores rendered bilingual sentence spans when splitting text', () => {
    const block = document.createElement('p')
    block.innerHTML = `
      <span class="glean-original-sentence">Original text.</span>
      <span class="glean-translated-sentence">原文翻译。</span>
      <span>Fresh text.</span>
    `

    const parts = splitBlockByBreaks(block)
    expect(parts).toEqual(['Fresh text.'])
  })

  it('merges short soft-break fragments into one translatable segment', () => {
    const block = document.createElement('p')
    block.innerHTML = `
      Gemini 3.1 Flash-Lite shipped as fastest endpoint, emphasizing<br>
      latency<br>
      and<br>
      throughput<br>
      for high-volume workloads.
    `

    const parts = splitBlockByBreaks(block)
    expect(parts).toEqual([
      'Gemini 3.1 Flash-Lite shipped as fastest endpoint, emphasizing latency and throughput for high-volume workloads.',
    ])
  })

  it('keeps hard sentence boundaries split across breaks', () => {
    const block = document.createElement('p')
    block.innerHTML = `
      First sentence.<br>
      Second sentence.
    `

    const parts = splitBlockByBreaks(block)
    expect(parts).toEqual(['First sentence.', 'Second sentence.'])
  })

  it('merges markdown-like emphasis fragments split by breaks', () => {
    const block = document.createElement('p')
    block.innerHTML = `
      <strong>Anthropic's claim</strong>: Anthropic says it detected<br>
      <strong>industrial-scale</strong><br>
      Claude distillation by<br>
      <strong>DeepSeek</strong>,<br>
      <strong>Moonshot AI</strong>, and<br>
      <strong>MiniMax</strong>:<br>
      ~24,000 fraudulent accounts generating<br>
      <strong>&gt;16M Claude exchanges</strong>, allegedly to extract capabilities.
    `

    const parts = splitBlockByBreaks(block)
    expect(parts).toEqual([
      "Anthropic's claim: Anthropic says it detected industrial-scale Claude distillation by DeepSeek, Moonshot AI, and MiniMax: ~24,000 fraudulent accounts generating >16M Claude exchanges, allegedly to extract capabilities.",
    ])
  })

  it('does not split list items with inline emphasis into standalone punctuation/text nodes', () => {
    const root = document.createElement('article')
    root.innerHTML = `
      <ul>
        <li>
          <strong>Anthropic's claim</strong>: Anthropic says it detected
          <em>industrial-scale</em> Claude distillation by
          <strong>DeepSeek</strong>, <strong>Moonshot AI</strong>, and <strong>MiniMax</strong>:
          <strong>&gt;16M Claude exchanges</strong>.
        </li>
      </ul>
    `

    normalizeLooseTextNodes(root, 'data-original-html')
    const blocks = collectTranslatableBlocks(root, false, () => 'text')
    expect(blocks.map((el) => el.tagName)).toEqual(['P'])

    const parts = splitBlockByBreaks(blocks[0])
    const normalized = parts.map((part) => part.replace(/\s+/g, ' ').trim())
    expect(normalized).toEqual([
      "Anthropic's claim: Anthropic says it detected industrial-scale Claude distillation by DeepSeek, Moonshot AI, and MiniMax: >16M Claude exchanges.",
    ])
  })

  it('keeps loose text in mixed list item with nested paragraph translatable', () => {
    const root = document.createElement('article')
    root.innerHTML = `
      <ul>
        <li>
          Intro text
          <p>Details paragraph.</p>
        </li>
      </ul>
    `

    normalizeLooseTextNodes(root, 'data-original-html')
    const blocks = collectTranslatableBlocks(root, false, () => 'text')
    const texts = blocks.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())

    expect(blocks.map((el) => el.tagName)).toEqual(['P', 'P'])
    expect(texts).toContain('Intro text')
    expect(texts).toContain('Details paragraph.')
  })

  it('keeps numbered blockquote lines with inline links and emphasis intact', () => {
    const root = document.createElement('article')
    root.innerHTML = `
      <blockquote>
        1. Support organizations you feel are&nbsp;<a href="https://www.charitynavigator.org/">effectively helping</a>&nbsp;those most in need across America <strong>right now</strong>.<br><br>
        2. Within the next five years, also contribute&nbsp;<strong>public dedications of time or funds towards longer term efforts&nbsp;</strong>to keep the American Dream fair and attainable for all our children.<br><br>
        <a href="https://blog.codinghorror.com/stay-gold-america/">Stay gold, America.</a> 💛
      </blockquote>
    `

    normalizeLooseTextNodes(root, 'data-original-html')
    const blocks = collectTranslatableBlocks(root, false, () => 'text')

    expect(blocks.map((el) => el.tagName)).toEqual(['P'])

    const parts = splitBlockByBreaks(blocks[0]).map((part) => part.replace(/\s+/g, ' ').trim())
    expect(parts).toEqual([
      '1. Support organizations you feel are effectively helping those most in need across America right now.',
      '2. Within the next five years, also contribute public dedications of time or funds towards longer term efforts to keep the American Dream fair and attainable for all our children.',
      'Stay gold, America. 💛',
    ])
  })

  it('keeps blockquote quote text and attribution link in one segment', () => {
    const root = document.createElement('article')
    root.innerHTML = `
      <blockquote class="kg-blockquote-alt">
        “From those to whom much is given, much is expected.” —
        <a href="https://rgmii.org/mary-gates-philanthropic-quote/">Mary Gates</a>
      </blockquote>
    `

    normalizeLooseTextNodes(root, 'data-original-html')
    const blocks = collectTranslatableBlocks(root, false, () => 'text')

    expect(blocks.map((el) => el.tagName)).toEqual(['P'])
    expect(splitBlockByBreaks(blocks[0]).map((part) => part.replace(/\s+/g, ' ').trim())).toEqual([
      '“From those to whom much is given, much is expected.” — Mary Gates',
    ])
  })

  it('keeps parser-fragmented blockquote content at blockquote level to preserve quote styling', () => {
    const root = document.createElement('article')
    root.innerHTML = `
      <blockquote>
        <p>At Uber, high availability is non-negotiable.</p>
        <a href="https://example.com">Source</a>
        <p>Reliability comes first.</p>
      </blockquote>
    `

    const blocks = collectTranslatableBlocks(root, false, () => 'text')

    expect(blocks.map((el) => el.tagName)).toEqual(['BLOCKQUOTE'])
    expect(splitBlockByBreaks(blocks[0]).map((part) => part.replace(/\s+/g, ' ').trim())).toEqual([
      'At Uber, high availability is non-negotiable. Source Reliability comes first.',
    ])
  })

  it('keeps mixed ghost-style list item content as complete segments', () => {
    const root = document.createElement('article')
    root.innerHTML = `
      <ul>
        <li>
          Almost every
          <strong>existing UBI/GMI study result data we could find indicates <em>cash generally works</em></strong>.
          For example, OpenResearch
          <a href="https://rgmii.org/openresearch-ubi-study-2018-2023-analysis/">data showed</a>
          the greatest increase in spending among study participants was in meeting basic needs.
        </li>
      </ul>
    `

    normalizeLooseTextNodes(root, 'data-original-html')
    const blocks = collectTranslatableBlocks(root, false, () => 'text')

    expect(blocks.map((el) => el.tagName)).toEqual(['P'])
    expect(splitBlockByBreaks(blocks[0]).map((part) => part.replace(/\s+/g, ' ').trim())).toEqual([
      'Almost every existing UBI/GMI study result data we could find indicates cash generally works. For example, OpenResearch data showed the greatest increase in spending among study participants was in meeting basic needs.',
    ])
  })
})
