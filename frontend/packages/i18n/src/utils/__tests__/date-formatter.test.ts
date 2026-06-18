import { describe, it, expect } from 'vitest'
import { getDateLocale, formatDate, formatRelativeTime } from '../date-formatter'
import { enUS, zhCN } from 'date-fns/locale'

describe('date-formatter', () => {
  describe('getDateLocale', () => {
    it('should return enUS for "en" locale', () => {
      expect(getDateLocale('en')).toBe(enUS)
    })

    it('should return zhCN for "zh-CN" locale', () => {
      expect(getDateLocale('zh-CN')).toBe(zhCN)
    })

    it('should fall back to enUS for unknown locale', () => {
      // @ts-expect-error testing invalid locale
      expect(getDateLocale('fr')).toBe(enUS)
    })
  })

  describe('formatDate', () => {
    const testDate = new Date('2024-06-15T12:00:00Z')

    it('should format a Date object', () => {
      const result = formatDate(testDate, 'yyyy-MM-dd', 'en')
      expect(result).toBe('2024-06-15')
    })

    it('should format an ISO string', () => {
      const result = formatDate('2024-06-15T12:00:00Z', 'yyyy-MM-dd', 'en')
      expect(result).toBe('2024-06-15')
    })

    it('should format a timestamp', () => {
      const result = formatDate(testDate.getTime(), 'yyyy-MM-dd', 'en')
      expect(result).toBe('2024-06-15')
    })

    it('should format with locale-aware pattern', () => {
      const result = formatDate(testDate, 'PP', 'en')
      expect(result).toContain('Jun')
    })

    it('should format with zh-CN locale', () => {
      const result = formatDate(testDate, 'PP', 'zh-CN')
      // zh-CN format uses Chinese characters
      expect(result).toContain('2024')
    })
  })

  describe('formatRelativeTime', () => {
    it('should format recent time in English', () => {
      const recentDate = new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
      const result = formatRelativeTime(recentDate, 'en')
      expect(result).toContain('ago')
    })

    it('should format recent time in Chinese', () => {
      const recentDate = new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
      const result = formatRelativeTime(recentDate, 'zh-CN')
      expect(result).toContain('前')
    })

    it('should format from ISO string', () => {
      const recentDate = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      const result = formatRelativeTime(recentDate.toISOString(), 'en')
      expect(result).toContain('ago')
    })

    it('should format from timestamp', () => {
      const recentDate = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      const result = formatRelativeTime(recentDate.getTime(), 'en')
      expect(result).toContain('ago')
    })

    it('should handle Date object input', () => {
      const result = formatRelativeTime(new Date(), 'en')
      expect(result).toContain('ago')
    })
  })
})
