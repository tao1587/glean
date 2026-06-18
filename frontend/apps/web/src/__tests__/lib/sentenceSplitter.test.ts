import { describe, expect, it } from 'vitest'
import { splitIntoSentences } from '@/lib/sentenceSplitter'

describe('sentenceSplitter', () => {
  it('keeps paragraph as one unit when total length is <= 400', () => {
    const text =
      'I think AI coding has started to come to the point where I run a job and get a bug, I almost do not look at the bug. I paste it into Antigravity and let it fix the bug for me. And then I relaunch the job.'

    const result = splitIntoSentences(text)
    expect(result).toEqual([text])
  })

  it('keeps short multi-sentence chinese paragraph as one unit', () => {
    const text = '我今天跑了一个任务。然后看到报错。最后我直接让 AI 修复。'

    const result = splitIntoSentences(text)
    expect(result).toEqual([text])
  })

  it('splits medium-long paragraph into 2-3 segments when length is 401-800', () => {
    const sentence =
      'This is a medium length sentence that keeps natural punctuation boundaries for grouped translation readability.'
    const text = `${sentence} ${sentence} ${sentence} ${sentence} ${sentence}`

    const result = splitIntoSentences(text)
    expect(result.length).toBeGreaterThan(1)
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('splits two long sentences into two segments for 401-800 length', () => {
    const sentenceA =
      'This first sentence is intentionally verbose so the medium-length grouping logic has to evaluate a boundary and avoid collapsing chunks unexpectedly while preserving readability and punctuation-aware grouping behavior in translation workflows.'
    const sentenceB =
      'This second sentence is similarly long to ensure the total paragraph length exceeds four hundred characters while still naturally mapping to two groups and avoiding accidental merge behavior in a realistic two-sentence paragraph scenario.'
    const text = `${sentenceA} ${sentenceB}`
    expect(text.length).toBeGreaterThan(400)
    expect(text.length).toBeLessThanOrEqual(800)

    const result = splitIntoSentences(text)
    expect(result.length).toBe(2)
    expect(result).toEqual([sentenceA, sentenceB])
  })

  it('splits very long paragraph at punctuation boundaries without hard cutting', () => {
    const sentence =
      'This is a long sentence used to verify that overlong paragraphs are chunked only on sentence punctuation boundaries.'
    const text = `${sentence} ${sentence} ${sentence} ${sentence} ${sentence} ${sentence} ${sentence} ${sentence} ${sentence}`

    const result = splitIntoSentences(text)
    expect(result.length).toBeGreaterThan(3)
    expect(result.every((segment) => /[。！？；.!?;]$/.test(segment))).toBe(true)
  })

  it('does not hard split extremely long text with no punctuation', () => {
    const text = 'a'.repeat(1200)
    const result = splitIntoSentences(text)
    expect(result).toEqual([text])
  })
})
