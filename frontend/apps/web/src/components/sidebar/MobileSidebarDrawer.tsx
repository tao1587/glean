import type { ReactNode } from 'react'

interface MobileSidebarDrawerProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

/**
 * Mobile-only sidebar drawer shell.
 * Keeps mobile width, overlay, and slide animation isolated from desktop sidebar logic.
 */
export function MobileSidebarDrawer({ open, onClose, children }: MobileSidebarDrawerProps) {
  return (
    <>
      <button
        type="button"
        aria-label="Close sidebar"
        className={`bg-background/80 fixed inset-0 z-40 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`border-border bg-card fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col border-r transition-transform duration-300 ease-out md:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {children}
      </aside>
    </>
  )
}
