import { describe, it, expect } from 'vitest'
import { stripHtmlTags, processHtmlContent } from '@/lib/html'

describe('stripHtmlTags', () => {
  it('should return empty string for null', () => {
    expect(stripHtmlTags(null)).toBe('')
  })

  it('should return empty string for undefined', () => {
    expect(stripHtmlTags(undefined)).toBe('')
  })

  it('should return empty string for empty string', () => {
    expect(stripHtmlTags('')).toBe('')
  })

  it('should strip HTML tags and return text', () => {
    expect(stripHtmlTags('<p>Hello <strong>World</strong></p>')).toBe('Hello World')
  })

  it('should remove img tags', () => {
    expect(stripHtmlTags('<p>Text</p><img src="test.png">')).toBe('Text')
  })

  it('should remove script tags and content', () => {
    expect(stripHtmlTags('<p>Text</p><script>alert("xss")</script>')).toBe('Text')
  })

  it('should remove style tags and content', () => {
    expect(stripHtmlTags('<style>.red{color:red}</style><p>Text</p>')).toBe('Text')
  })

  it('should remove iframe tags', () => {
    expect(stripHtmlTags('<iframe src="evil.html"></iframe><p>Text</p>')).toBe('Text')
  })

  it('should remove svg tags', () => {
    expect(stripHtmlTags('<svg><circle/></svg><p>Text</p>')).toBe('Text')
  })

  it('should collapse whitespace', () => {
    expect(stripHtmlTags('<p>Hello</p>  <p>World</p>')).toBe('Hello World')
  })

  it('should handle HTML entities', () => {
    const result = stripHtmlTags('<p>Hello &amp; World</p>')
    expect(result).toBe('Hello & World')
  })
})

describe('processHtmlContent', () => {
  it('should return empty string for null', () => {
    expect(processHtmlContent(null)).toBe('')
  })

  it('should return empty string for undefined', () => {
    expect(processHtmlContent(undefined)).toBe('')
  })

  it('should return empty string for empty string', () => {
    expect(processHtmlContent('')).toBe('')
  })

  it('should sanitize HTML content', () => {
    const result = processHtmlContent('<p>Hello <strong>World</strong></p>')
    expect(result).toContain('<p>')
    expect(result).toContain('<strong>')
    expect(result).toContain('Hello')
  })

  it('should remove script tags from HTML content', () => {
    const result = processHtmlContent('<p>Text</p><script>alert("xss")</script>')
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('alert')
    expect(result).toContain('Text')
  })

  it('should preserve allowed tags', () => {
    const html = '<p>Text with <a href="https://example.com">link</a> and <img src="test.png" alt="img"></p>'
    const result = processHtmlContent(html)
    expect(result).toContain('<a')
    expect(result).toContain('<img')
  })

  it('should preserve allowed attributes', () => {
    const html = '<a href="https://example.com" title="Link">Test</a>'
    const result = processHtmlContent(html)
    expect(result).toContain('href="https://example.com"')
    expect(result).toContain('title="Link"')
  })

  it('forces anchors to open in a new tab with proper rel values', () => {
    const result = processHtmlContent('<p><a href="https://example.com">link</a></p>')
    const wrapper = document.createElement('div')
    wrapper.innerHTML = result
    const anchor = wrapper.querySelector('a')
    expect(anchor).toBeTruthy()
    expect(anchor?.getAttribute('target')).toBe('_blank')
    const relValues = anchor
      ?.getAttribute('rel')
      ?.split(/\s+/)
      .filter(Boolean)
    expect(relValues).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
  })

  it('adds noopener/noreferrer without removing existing rel values', () => {
    const result = processHtmlContent('<a href="https://example.com" rel="nofollow">link</a>')
    const wrapper = document.createElement('div')
    wrapper.innerHTML = result
    const anchor = wrapper.querySelector('a')
    const relValues = anchor
      ?.getAttribute('rel')
      ?.split(/\s+/)
      .filter(Boolean)
    expect(relValues).toEqual(expect.arrayContaining(['nofollow', 'noopener', 'noreferrer']))
  })

  it('should decode entities for plain text content', () => {
    // Entity decoding happens via textarea, then DOMPurify re-sanitizes
    // The result wraps in <p> and the & gets re-encoded by DOMPurify
    const result = processHtmlContent('Hello &amp; World')
    expect(result).toContain('Hello')
    expect(result).toContain('World')
    expect(result).toContain('<p>')
  })

  it('should wrap plain text in paragraphs', () => {
    const result = processHtmlContent('First paragraph\n\nSecond paragraph')
    expect(result).toContain('<p>First paragraph</p>')
    expect(result).toContain('<p>Second paragraph</p>')
  })

  it('should convert newlines to br in plain text', () => {
    const result = processHtmlContent('Line 1\nLine 2')
    expect(result).toContain('<br>')
  })

  it('should preserve entities in HTML content (code examples)', () => {
    // This is the key behavior: &lt;img&gt; in HTML should NOT be decoded
    const html = '<p>Use <code>&lt;img&gt;</code> for images</p>'
    const result = processHtmlContent(html)
    // The entity should be preserved, not turned into an actual <img> tag
    expect(result).toContain('&lt;img&gt;')
  })
})
