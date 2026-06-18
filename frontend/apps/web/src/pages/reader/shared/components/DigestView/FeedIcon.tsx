import { useState } from 'react'
import { iconProxyUrl } from '@/lib/icon'
import { getFeedColor } from './digestHelpers'

interface FeedIconProps {
  feedId: string
  feedIconUrl?: string | null
  feedTitle?: string | null
  /** Tailwind size classes (must include both width + height + rounded). */
  className?: string
  /** Optional inline style override (used for the colored fallback swatch). */
  fallbackStyle?: React.CSSProperties
  /**
   * Render style for the fallback when no icon (or icon failed):
   *   - 'swatch'  → solid colored square (matches existing 2x2 badges)
   *   - 'letter'  → colored square with first letter centered
   */
  fallback?: 'swatch' | 'letter'
}

function isLikelyImageUrl(url: string): boolean {
  const lower = url.toLowerCase()
  if (
    lower.includes('.mp4') ||
    lower.includes('.webm') ||
    lower.includes('.mov') ||
    lower.includes('.m3u8')
  ) {
    return false
  }
  return true
}

/**
 * Small feed icon with graceful fallback to a colored swatch / first-letter badge.
 * Keeps the same width/height as the legacy color swatch so layout stays stable.
 */
export function FeedIcon({
  feedId,
  feedIconUrl,
  feedTitle,
  className = 'h-4 w-4 rounded-sm',
  fallbackStyle,
  fallback = 'swatch',
}: FeedIconProps) {
  const [failed, setFailed] = useState(false)
  const color = getFeedColor(feedId)

  const showImage = feedIconUrl && !failed && isLikelyImageUrl(feedIconUrl)

  if (showImage) {
    return (
      <img
        src={iconProxyUrl(feedIconUrl) ?? undefined}
        alt=""
        className={`shrink-0 object-cover ${className}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    )
  }

  if (fallback === 'letter') {
    const letter = (feedTitle ?? '').trim().charAt(0).toUpperCase() || '?'
    return (
      <span
        className={`flex shrink-0 items-center justify-center text-[10px] font-semibold text-white ${className}`}
        style={{ background: color, ...fallbackStyle }}
        aria-hidden="true"
      >
        {letter}
      </span>
    )
  }

  return (
    <span
      className={`inline-block shrink-0 ${className}`}
      style={{ background: color, ...fallbackStyle }}
      aria-hidden="true"
    />
  )
}
