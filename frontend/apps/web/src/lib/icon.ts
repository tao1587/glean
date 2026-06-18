export function iconProxyUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return `/api/icons?url=${encodeURIComponent(url)}`
}
