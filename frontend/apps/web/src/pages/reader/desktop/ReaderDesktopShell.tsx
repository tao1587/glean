import { ReaderCore } from '../shared/ReaderCore'

/**
 * Desktop-only reader shell.
 */
export function ReaderDesktopShell() {
  return <ReaderCore isMobile={false} />
}
