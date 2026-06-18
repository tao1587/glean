import { describe, it, expect } from 'vitest'
import {
  detectTranslationLanguageCategory,
  resolveAutoTranslationTargetLanguage,
  shouldAutoTranslate,
} from '@/lib/translationLanguagePolicy'

describe('translationLanguagePolicy', () => {
  it('marks Chinese text as chinese and does not auto-translate', () => {
    const text = '这是一个中文段落，用于验证中文内容保持不变。'
    expect(detectTranslationLanguageCategory(text)).toBe('chinese')
    expect(resolveAutoTranslationTargetLanguage(text)).toBeNull()
    expect(shouldAutoTranslate(text, 'zh-CN')).toBe(false)
  })

  it('marks English text as non_chinese and targets zh-CN', () => {
    const text = 'This is an English paragraph for translation.'
    expect(detectTranslationLanguageCategory(text)).toBe('non_chinese')
    expect(resolveAutoTranslationTargetLanguage(text)).toBe('zh-CN')
    expect(shouldAutoTranslate(text, 'zh-CN')).toBe(true)
  })

  it('marks Japanese text as non_chinese and targets zh-CN', () => {
    const text = 'これは日本語の記事です。ニュースを翻訳します。'
    expect(detectTranslationLanguageCategory(text)).toBe('non_chinese')
    expect(resolveAutoTranslationTargetLanguage(text)).toBe('zh-CN')
    expect(shouldAutoTranslate(text, 'zh-CN')).toBe(true)
  })

  it('marks Korean text as non_chinese and targets zh-CN', () => {
    const text = '이 문장은 한국어로 작성되었습니다.'
    expect(detectTranslationLanguageCategory(text)).toBe('non_chinese')
    expect(resolveAutoTranslationTargetLanguage(text)).toBe('zh-CN')
    expect(shouldAutoTranslate(text, 'zh-CN')).toBe(true)
  })

  it('does not translate Chinese tech articles that contain English terms/code', () => {
    // Common pattern: Chinese article with embedded English words, variable names, etc.
    const mixedTechText =
      '本文介绍如何在 React 中使用 TypeScript，包括 useState、useEffect 等 Hook 的用法。' +
      '我们还会讨论 API 设计和 HTTP 请求的最佳实践，以及如何配置 webpack 和 Vite 构建工具。'
    expect(detectTranslationLanguageCategory(mixedTechText)).toBe('chinese')
    expect(shouldAutoTranslate(mixedTechText, 'zh-CN')).toBe(false)

    // Article starting with an English term should still be classified as Chinese
    const startsWithEnglish = 'GPT-4 发布之后，业界对大语言模型的讨论更加热烈，很多中文开发者开始关注 AI 应用开发。'
    expect(detectTranslationLanguageCategory(startsWithEnglish)).toBe('chinese')
    expect(shouldAutoTranslate(startsWithEnglish, 'zh-CN')).toBe(false)
  })

  it('when target is English, only Chinese content is auto-translated', () => {
    const zhText = '这是中文内容，应该翻译成英文。'
    const enText = 'This English sentence should stay unchanged.'

    expect(resolveAutoTranslationTargetLanguage(zhText, 'en')).toBe('en')
    expect(resolveAutoTranslationTargetLanguage(enText, 'en')).toBeNull()
    expect(shouldAutoTranslate(zhText, 'en')).toBe(true)
    expect(shouldAutoTranslate(enText, 'en')).toBe(false)
  })
})
