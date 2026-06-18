import { ReaderDesktopShell } from './desktop/ReaderDesktopShell'
import { ReaderMobileShell } from './mobile/ReaderMobileShell'
import { useIsMobileViewport } from './shared/useIsMobileViewport'

/**
 * Reader route orchestrator.
 * Keeps a single route while delegating interaction layout to dedicated shells.
 */
export default function ReaderRoute() {
  const isMobile = useIsMobileViewport(768)

  return isMobile ? <ReaderMobileShell /> : <ReaderDesktopShell />
}
