import { Rss, Bookmark, Settings, X } from 'lucide-react'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from '@glean/i18n'
import { useDigestSidebarStore } from '../../../../../stores/digestSidebarStore'
import type { DigestSidebarPanel } from '../../../../../stores/digestSidebarStore'
import { FeedsPanel } from './FeedsPanel'
import { SavedPanel } from './SavedPanel'
import { SettingsPanel } from './SettingsPanel'
import type { EntryWithState } from '@glean/types'

interface DigestSidebarProps {
  onAddFeed: () => void
  onSelectEntry: (entry: EntryWithState) => void
  isMobile?: boolean
}

const PANEL_WIDTH = 264 // sidebar-expanded - sidebar-collapsed = 320-56

export function DigestSidebar({
  onAddFeed,
  onSelectEntry,
  isMobile = false,
}: DigestSidebarProps) {
  const { t } = useTranslation('digest')
  const { activePanel, togglePanel, setActivePanel } = useDigestSidebarStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedFeedId = searchParams.get('feed')
  const selectedFolderId = searchParams.get('folder')

  const handleSelectFeed = useCallback(
    (feedId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('feed', feedId)
          next.delete('folder')
          next.delete('entry')
          return next
        },
        { replace: false }
      )
    },
    [setSearchParams]
  )

  const handleSelectFolder = useCallback(
    (folderId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('folder', folderId)
          next.delete('feed')
          next.delete('entry')
          return next
        },
        { replace: false }
      )
    },
    [setSearchParams]
  )

  const handleClearStreamScope = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('feed')
        next.delete('folder')
        next.delete('entry')
        return next
      },
      { replace: false }
    )
  }, [setSearchParams])

  // When the "Feeds" activity rail button is clicked while a feed/folder stream is active,
  // clear the scope — this returns the user to the digest.
  const handleActivityButtonClick = useCallback(
    (id: Exclude<DigestSidebarPanel, null>) => {
      if (id === 'feeds' && (selectedFeedId || selectedFolderId)) {
        handleClearStreamScope()
      }
      togglePanel(id)
    },
    [handleClearStreamScope, selectedFeedId, selectedFolderId, togglePanel]
  )

  const activityButtons: {
    id: Exclude<DigestSidebarPanel, null>
    icon: React.ReactNode
    label: string
  }[] = [
    { id: 'feeds', icon: <Rss className="h-4 w-4" />, label: t('sidebar.feeds') },
    { id: 'saved', icon: <Bookmark className="h-4 w-4" />, label: t('sidebar.saved') },
    { id: 'settings', icon: <Settings className="h-4 w-4" />, label: t('sidebar.settings') },
  ]

  if (isMobile) {
    return (
      <>
        {/* Mobile bottom tab bar */}
        <div
          className="fixed bottom-0 left-0 right-0 z-40 flex h-14 flex-row items-center justify-around border-t"
          style={{
            background: 'var(--digest-bg-sidebar, #F5F2EA)',
            borderColor: 'var(--digest-divider, #E5E0D2)',
          }}
        >
          {activityButtons.map((btn) => (
            <button
              key={btn.id}
              onClick={() => handleActivityButtonClick(btn.id)}
              className="relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors"
              style={{
                color:
                  activePanel === btn.id
                    ? 'var(--digest-text, #1A1A1A)'
                    : 'var(--digest-text-tertiary, #9A968C)',
                background:
                  activePanel === btn.id ? 'var(--digest-bg-card, #FFFFFF)' : undefined,
              }}
              aria-label={btn.label}
            >
              {activePanel === btn.id && (
                <div
                  className="absolute inset-x-1/2 top-[-8px] h-0.5 w-4.5 -translate-x-1/2 rounded"
                  style={{ background: 'var(--digest-accent, #B8312F)' }}
                />
              )}
              {btn.icon}
            </button>
          ))}
        </div>

        {/* Mobile panel: bottom sheet */}
        {activePanel && (
          <div
            className="fixed bottom-14 left-0 right-0 z-50 flex flex-col overflow-hidden rounded-t-2xl border-t"
            style={{
              height: '70vh',
              background: 'var(--digest-bg-card, #FFFFFF)',
              borderColor: 'var(--digest-divider, #E5E0D2)',
            }}
          >
            <button
              onClick={() => setActivePanel(null)}
              className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full"
              style={{
                background: 'var(--digest-bg-hover, #F1EDE2)',
                color: 'var(--digest-text-tertiary, #9A968C)',
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <PanelContent
              activePanel={activePanel}
              onAddFeed={onAddFeed}
              onSelectFeed={handleSelectFeed}
              onSelectFolder={handleSelectFolder}
              selectedFeedId={selectedFeedId}
              selectedFolderId={selectedFolderId}
              onSelectEntry={onSelectEntry}
            />
          </div>
        )}
      </>
    )
  }

  // Desktop sidebar
  return (
    <>
      {/* Slide-out panel — clipped by fixed wrapper to prevent body horizontal overflow */}
      <div
        aria-hidden={!activePanel}
        className="pointer-events-none fixed right-14 top-0 z-[39] overflow-hidden transition-[width] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          height: '100vh',
          width: activePanel ? `${PANEL_WIDTH}px` : 0,
        }}
      >
        <div
          className="pointer-events-auto flex h-full flex-col border-l transition-transform duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            width: `${PANEL_WIDTH}px`,
            background: 'var(--digest-bg-card, #FFFFFF)',
            borderColor: 'var(--digest-divider, #E5E0D2)',
            transform: activePanel ? 'translateX(0)' : 'translateX(100%)',
          }}
        >
          {activePanel && (
            <PanelContent
              activePanel={activePanel}
              onAddFeed={onAddFeed}
              onSelectFeed={handleSelectFeed}
              onSelectFolder={handleSelectFolder}
              selectedFeedId={selectedFeedId}
              selectedFolderId={selectedFolderId}
              onSelectEntry={onSelectEntry}
            />
          )}
        </div>
      </div>

      {/* Activity rail */}
      <div
        className="sticky top-0 z-40 flex w-14 flex-shrink-0 flex-col items-center self-start border-l py-3.5"
        style={{
          height: '100vh',
          background: 'var(--digest-bg-sidebar, #F5F2EA)',
          borderColor: 'var(--digest-divider, #E5E0D2)',
        }}
      >
        {activityButtons.map((btn) => (
          <button
            key={btn.id}
            onClick={() => togglePanel(btn.id)}
            title={btn.label}
            className="relative mb-1 flex h-9 w-9 items-center justify-center rounded-lg transition-all"
            style={{
              color:
                activePanel === btn.id
                  ? 'var(--digest-text, #1A1A1A)'
                  : 'var(--digest-text-tertiary, #9A968C)',
              background:
                activePanel === btn.id ? 'var(--digest-bg-card, #FFFFFF)' : undefined,
              boxShadow: activePanel === btn.id ? '0 2px 8px rgba(0,0,0,0.04)' : undefined,
            }}
          >
            {/* Active indicator: left red bar */}
            {activePanel === btn.id && (
              <div
                className="absolute left-[-10px] h-[18px] w-0.5 -translate-y-1/2 rounded top-1/2"
                style={{ background: 'var(--digest-accent, #B8312F)' }}
              />
            )}
            {btn.icon}
          </button>
        ))}

        <div className="flex-1" />
      </div>
    </>
  )
}

function PanelContent({
  activePanel,
  onAddFeed,
  onSelectFeed,
  onSelectFolder,
  selectedFeedId,
  selectedFolderId,
  onSelectEntry,
}: {
  activePanel: Exclude<DigestSidebarPanel, null>
  onAddFeed: () => void
  onSelectFeed?: (feedId: string) => void
  onSelectFolder?: (folderId: string) => void
  selectedFeedId?: string | null
  selectedFolderId?: string | null
  onSelectEntry: (entry: EntryWithState) => void
}) {
  switch (activePanel) {
    case 'feeds':
      return (
        <FeedsPanel
          onAddFeed={onAddFeed}
          onSelectFeed={onSelectFeed}
          onSelectFolder={onSelectFolder}
          selectedFeedId={selectedFeedId}
          selectedFolderId={selectedFolderId}
        />
      )
    case 'saved':
      return <SavedPanel onSelectEntry={onSelectEntry} />
    case 'settings':
      return <SettingsPanel />
    default:
      return null
  }
}
