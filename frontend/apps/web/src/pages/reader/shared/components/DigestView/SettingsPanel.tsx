import { Switch } from '@glean/ui'
import { useNavigate } from 'react-router-dom'
import { ListChecks, Languages, Key, type LucideIcon } from 'lucide-react'
import { useTranslation, type Locale } from '@glean/i18n'
import { useAuthStore } from '../../../../../stores/authStore'
import { useThemeStore } from '../../../../../stores/themeStore'
import { useLanguageStore } from '../../../../../stores/languageStore'
import { useDigestSettingsStore } from '../../../../../stores/digestSettingsStore'
import { useImportOPML, useExportOPML } from '../../../../../hooks/useSubscriptions'
import { useRef } from 'react'
import type { TranslationTargetLanguage } from '@glean/types'

export function SettingsPanel() {
  const { t } = useTranslation('digest')
  const navigate = useNavigate()
  // Silent variant — avoids toggling the global authStore.isLoading flag that
  // ProtectedRoute watches, which otherwise flashes a full-page loading screen
  // on every setting toggle.
  const { user, updateSettingsSilently: updateSettings } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const { language, setLanguage } = useLanguageStore()
  const { autoMarkRead, setAutoMarkRead } = useDigestSettingsStore()
  const { mutate: importOPML } = useImportOPML()
  const { mutate: exportOPML } = useExportOPML()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentReadLaterDays = user?.settings?.read_later_days ?? 7
  const currentTargetLanguage: TranslationTargetLanguage =
    user?.settings?.translation_target_language ?? 'zh-CN'
  const listTranslationAutoEnabled = user?.settings?.list_translation_auto_enabled ?? false
  const translationDropdownValue: 'off' | TranslationTargetLanguage =
    listTranslationAutoEnabled ? currentTargetLanguage : 'off'

  const handleTranslationChange = (value: 'off' | TranslationTargetLanguage) => {
    if (value === 'off') {
      void updateSettings({ list_translation_auto_enabled: false })
    } else {
      void updateSettings({
        list_translation_auto_enabled: true,
        translation_target_language: value,
      })
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      importOPML(file)
      e.target.value = ''
    }
  }

  const READ_LATER_OPTIONS = [
    { value: 1, label: t('settings.reading.days1') },
    { value: 7, label: t('settings.reading.days7') },
    { value: 30, label: t('settings.reading.days30') },
    { value: 0, label: t('settings.reading.never') },
  ]

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {/* Header */}
      <div
        className="flex shrink-0 items-start justify-between border-b px-4 pb-3 pt-4"
        style={{ borderColor: 'var(--digest-divider, #E5E0D2)' }}
      >
        <div>
          <div
            className="text-[15px] font-semibold"
            style={{
              fontFamily: "'Noto Serif SC', Georgia, serif",
              color: 'var(--digest-text, #1A1A1A)',
            }}
          >
            {t('settings.title')}
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
            {t('settings.subtitle')}
          </div>
        </div>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {/* Appearance */}
        <SettingsGroup title={t('settings.appearance.title')}>
          <SettingsRow
            label={t('settings.appearance.theme')}
            control={
              <div className="flex gap-0.5 rounded-md p-0.5" style={{ background: 'var(--digest-bg-hover, #F1EDE2)' }}>
                {(['light', 'dark', 'system'] as const).map((themeOption) => (
                  <button
                    key={themeOption}
                    onClick={() => setTheme(themeOption)}
                    className="rounded px-2 py-0.5 text-[11px] transition-all"
                    style={
                      theme === themeOption
                        ? {
                            background: 'var(--digest-bg-card, #FFFFFF)',
                            color: 'var(--digest-text, #1A1A1A)',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                          }
                        : { color: 'var(--digest-text-secondary, #5E5A52)' }
                    }
                  >
                    {themeOption === 'light'
                      ? t('settings.appearance.light')
                      : themeOption === 'dark'
                        ? t('settings.appearance.dark')
                        : t('settings.appearance.system')}
                  </button>
                ))}
              </div>
            }
          />
        </SettingsGroup>

        {/* Language */}
        <SettingsGroup title={t('settings.language.title')}>
          <SettingsRow
            label={t('settings.language.uiLanguage')}
            control={
              <div className="flex gap-0.5 rounded-md p-0.5" style={{ background: 'var(--digest-bg-hover, #F1EDE2)' }}>
                {(['en', 'zh-CN'] as Locale[]).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className="rounded px-2 py-0.5 text-[11px] transition-all"
                    style={
                      language === lang
                        ? {
                            background: 'var(--digest-bg-card, #FFFFFF)',
                            color: 'var(--digest-text, #1A1A1A)',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                          }
                        : { color: 'var(--digest-text-secondary, #5E5A52)' }
                    }
                  >
                    {lang === 'en' ? 'EN' : '中文'}
                  </button>
                ))}
              </div>
            }
          />
        </SettingsGroup>

        {/* Translation */}
        <SettingsGroup title={t('settings.translation.title')}>
          <SettingsRow
            label={t('settings.translation.targetLanguage')}
            control={
              <select
                value={translationDropdownValue}
                onChange={(e) =>
                  handleTranslationChange(e.target.value as 'off' | TranslationTargetLanguage)
                }
                className="rounded px-2 py-1 text-[11px] transition-colors focus:outline-none"
                style={{
                  background: 'var(--digest-bg-card, #FFFFFF)',
                  color: 'var(--digest-text, #1A1A1A)',
                  border: '1px solid var(--digest-divider, #E5E0D2)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <option value="off">{t('settings.translation.off')}</option>
                <option value="zh-CN">{t('settings.translation.zh')}</option>
                <option value="en">{t('settings.translation.en')}</option>
              </select>
            }
          />
        </SettingsGroup>

        {/* Reading */}
        <SettingsGroup title={t('settings.reading.title')}>
          <SettingsRow
            label={t('settings.reading.autoMarkRead')}
            sub={t('settings.reading.autoMarkReadSub')}
            control={
              <Switch
                checked={autoMarkRead}
                onCheckedChange={setAutoMarkRead}
              />
            }
          />
          <div className="px-2.5 pb-1">
            <div className="mb-1 text-[11px]" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
              {t('settings.reading.readLaterCleanup')}
            </div>
            <div className="flex flex-wrap gap-1">
              {READ_LATER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => void updateSettings({ read_later_days: opt.value })}
                  className="rounded px-2 py-0.5 text-[11px] transition-all"
                  style={
                    currentReadLaterDays === opt.value
                      ? {
                          background: 'var(--digest-accent, #B8312F)',
                          color: '#FFFFFF',
                        }
                      : {
                          background: 'var(--digest-bg-hover, #F1EDE2)',
                          color: 'var(--digest-text-secondary, #5E5A52)',
                        }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </SettingsGroup>

        {/* Data */}
        <SettingsGroup title={t('settings.data.title')}>
          <div className="px-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".opml,.xml"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={handleImportClick}
              className="mb-1.5 w-full rounded-[5px] px-2.5 py-1.5 text-left text-[12px] transition-colors"
              style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--digest-accent, #B8312F)'
                e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--digest-text-tertiary, #9A968C)'
                e.currentTarget.style.background = ''
              }}
            >
              {t('settings.data.importOpml')}
            </button>
            <button
              onClick={() => exportOPML()}
              className="w-full rounded-[5px] px-2.5 py-1.5 text-left text-[12px] transition-colors"
              style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--digest-accent, #B8312F)'
                e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--digest-text-tertiary, #9A968C)'
                e.currentTarget.style.background = ''
              }}
            >
              {t('settings.data.exportOpml')}
            </button>
          </div>
        </SettingsGroup>

        {/* Account */}
        <SettingsGroup title={t('settings.account.title')}>
          <div
            className="mx-1 mb-1 rounded-lg p-3.5"
            style={{ background: 'var(--digest-bg-hover, #F1EDE2)' }}
          >
            <div className="break-all text-[13px] font-medium" style={{ color: 'var(--digest-text, #1A1A1A)' }}>
              {user?.email || user?.name || t('settings.account.notLoggedIn')}
            </div>
          </div>
        </SettingsGroup>
      </div>

      {/* Footer — link grid to full settings tabs */}
      <div
        className="shrink-0 border-t px-3 py-3"
        style={{ borderColor: 'var(--digest-divider, #E5E0D2)' }}
      >
        <div className="grid grid-cols-2 gap-2">
          <SettingsLinkCard
            icon={ListChecks}
            label={t('settings.links.manageFeeds')}
            subLabel={t('settings.links.manageFeedsSub')}
            onClick={() => navigate('/settings?tab=manage-feeds')}
          />
          <SettingsLinkCard
            icon={Languages}
            label={t('settings.links.translation')}
            subLabel={t('settings.links.translationSub')}
            onClick={() => navigate('/settings?tab=translation')}
          />
          <SettingsLinkCard
            icon={Key}
            label={t('settings.links.apiTokens')}
            subLabel={t('settings.links.apiTokensSub')}
            onClick={() => navigate('/settings?tab=api-tokens')}
          />
        </div>
      </div>
    </div>
  )
}

function SettingsLinkCard({
  icon: Icon,
  label,
  subLabel,
  onClick,
}: {
  icon: LucideIcon
  label: string
  subLabel: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-1 rounded-[8px] p-2.5 transition-colors"
      style={{
        border: '1px solid var(--digest-divider, #E5E0D2)',
        color: 'var(--digest-text-secondary, #5E5A52)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--digest-accent, #B8312F)'
        e.currentTarget.style.color = 'var(--digest-accent, #B8312F)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--digest-divider, #E5E0D2)'
        e.currentTarget.style.color = 'var(--digest-text-secondary, #5E5A52)'
      }}
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
      <span className="text-[12px] font-medium">{label}</span>
      <span className="text-[10px]" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
        {subLabel}
      </span>
    </button>
  )
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 px-1">
      <div
        className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.15em]"
        style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function SettingsRow({
  label,
  sub,
  control,
}: {
  label: string
  sub?: string
  control: React.ReactNode
}) {
  return (
    <div
      className="flex items-center justify-between gap-2.5 rounded-[5px] px-2.5 py-2"
      style={{ fontSize: '13px' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = ''
      }}
    >
      <div>
        <div style={{ color: 'var(--digest-text, #1A1A1A)' }}>{label}</div>
        {sub && (
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
            {sub}
          </div>
        )}
      </div>
      {control}
    </div>
  )
}
