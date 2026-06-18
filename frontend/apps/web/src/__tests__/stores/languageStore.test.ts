import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@glean/i18n', () => ({
  changeLanguage: vi.fn(),
}))

import { useLanguageStore } from '@/stores/languageStore'
import { changeLanguage } from '@glean/i18n'

describe('languageStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useLanguageStore.setState({ language: 'en' })
  })

  it('should have correct initial state', () => {
    expect(useLanguageStore.getState().language).toBe('en')
  })

  it('should set language to zh-CN', () => {
    useLanguageStore.getState().setLanguage('zh-CN')

    expect(useLanguageStore.getState().language).toBe('zh-CN')
    expect(changeLanguage).toHaveBeenCalledWith('zh-CN')
    expect(localStorage.getItem('glean-language')).toBe('zh-CN')
  })

  it('should set language to en', () => {
    useLanguageStore.getState().setLanguage('zh-CN')
    useLanguageStore.getState().setLanguage('en')

    expect(useLanguageStore.getState().language).toBe('en')
    expect(changeLanguage).toHaveBeenCalledWith('en')
    expect(localStorage.getItem('glean-language')).toBe('en')
  })

  describe('initializeLanguage', () => {
    it('should initialize from valid localStorage value', () => {
      localStorage.setItem('glean-language', 'zh-CN')

      useLanguageStore.getState().initializeLanguage()

      expect(useLanguageStore.getState().language).toBe('zh-CN')
      expect(changeLanguage).toHaveBeenCalledWith('zh-CN')
    })

    it('should not change language for invalid localStorage value', () => {
      localStorage.setItem('glean-language', 'invalid')

      useLanguageStore.getState().initializeLanguage()

      expect(useLanguageStore.getState().language).toBe('en')
    })

    it('should not change language when localStorage is empty', () => {
      useLanguageStore.getState().initializeLanguage()

      expect(useLanguageStore.getState().language).toBe('en')
      expect(changeLanguage).not.toHaveBeenCalled()
    })

    it('should skip JSON-like values (guard against zustand persist format)', () => {
      localStorage.setItem('glean-language', '{"state":{"language":"zh-CN"}}')

      useLanguageStore.getState().initializeLanguage()

      expect(useLanguageStore.getState().language).toBe('en')
      expect(changeLanguage).not.toHaveBeenCalled()
    })
  })
})
