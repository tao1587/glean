import { useEffect, useRef } from 'react'
import type { LightGallery } from 'lightgallery/lightgallery'
import { loadHighlightCore } from '../lib/highlightLoader'

/**
 * Hook to enhance content rendering with syntax highlighting and image gallery.
 *
 * Integrates:
 * - highlight.js for code syntax highlighting
 * - lightgallery.js for image viewing
 *
 * @param content - The HTML content to render (used as dependency for re-initialization)
 */
export function useContentRenderer(content?: string) {
  const contentRef = useRef<HTMLDivElement>(null)
  const galleryRef = useRef<LightGallery | null>(null)

  useEffect(() => {
    const container = contentRef.current
    if (!container) return
    let disposed = false

    const codeBlocks = container.querySelectorAll('pre code')
    const images = container.querySelectorAll('img')

    const run = async () => {
      if (codeBlocks.length > 0) {
        const hljs = await loadHighlightCore()
        if (disposed) return
        codeBlocks.forEach((block) => {
          delete (block as HTMLElement).dataset.highlighted
          hljs.highlightElement(block as HTMLElement)
        })
      }

      if (images.length > 0) {
        await Promise.all([
          import('lightgallery'),
          import('lightgallery/css/lightgallery.css'),
        ]).then(([{ default: lightGallery }]) => {
          if (disposed) return

          images.forEach((img) => {
            if (img.parentElement?.tagName !== 'A') {
              const anchor = document.createElement('a')
              anchor.href = img.src
              anchor.setAttribute('data-src', img.src)
              if (img.alt) {
                const escapedAlt = document.createElement('span')
                escapedAlt.textContent = img.alt
                anchor.setAttribute('data-sub-html', `<h4>${escapedAlt.innerHTML}</h4>`)
              }
              img.parentNode?.insertBefore(anchor, img)
              anchor.appendChild(img)
            }
          })

          galleryRef.current = lightGallery(container, {
            selector: 'a[data-src]',
            speed: 500,
            download: true,
            counter: true,
          })
        })
      }
    }

    void run()

    // Cleanup function
    return () => {
      disposed = true
      if (galleryRef.current) {
        galleryRef.current.destroy()
        galleryRef.current = null
      }
    }
  }, [content])

  return contentRef
}
