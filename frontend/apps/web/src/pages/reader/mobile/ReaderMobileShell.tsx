import { ReaderCore } from '../shared/ReaderCore'

/**
 * Mobile-only reader shell. Keeps mobile interaction policy isolated from desktop.
 */
export function ReaderMobileShell() {
  return <ReaderCore isMobile={true} />
}
