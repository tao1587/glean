import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import { useLanguageStore } from '../stores/languageStore'
import {
  User,
  Mail,
  Shield,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Eye,
  Sun,
  Moon,
  Monitor,
  ListChecks,
  Sparkles,
  Languages,
  Key,
} from 'lucide-react'
import {
  Label,
  Button,
  Tabs,
  TabsList,
  TabsTab,
  TabsPanel,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Switch,
} from '@glean/ui'
import { SubscriptionsTab } from '../components/tabs/SubscriptionsTab'
import { APITokensTab } from '../components/tabs/APITokensTab'
import { TranslationTab } from '../components/tabs/TranslationTab'
import { AIIntegrationTab } from '../components/tabs/AIIntegrationTab'
import { useTranslation } from '@glean/i18n'

/**
 * Settings page.
 *
 * User profile and application settings with tabs layout.
 */
export default function SettingsPage() {
  const { t } = useTranslation('settings')
  const { user, updateSettings, isLoading } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const { language, setLanguage } = useLanguageStore()
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const VALID_TABS = [
    'profile',
    'read-later',
    'appearance',
    'translation',
    'manage-feeds',
    'api-tokens',
    'ai-integration',
  ] as const
  const tabParam = searchParams.get('tab')
  const activeTab = VALID_TABS.includes(tabParam as (typeof VALID_TABS)[number])
    ? (tabParam as (typeof VALID_TABS)[number])
    : 'profile'
  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'profile') {
      next.delete('tab')
    } else {
      next.set('tab', value)
    }
    setSearchParams(next, { replace: true })
  }

  // Read later expiration options
  const READ_LATER_OPTIONS = [
    { value: 1, label: t('readLater.cleanupPeriod.1day') },
    { value: 7, label: t('readLater.cleanupPeriod.7days') },
    { value: 30, label: t('readLater.cleanupPeriod.30days') },
    { value: 0, label: t('readLater.cleanupPeriod.never') },
  ]

  // Get current read_later_days from user settings, default to 7
  const currentReadLaterDays = user?.settings?.read_later_days ?? 7
  const showReadLaterRemaining = user?.settings?.show_read_later_remaining ?? true
  const handleReadLaterDaysChange = async (days: number) => {
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      await updateSettings({ read_later_days: days })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch {
      // Error is handled by the store
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleShowRemaining = async () => {
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      await updateSettings({ show_read_later_remaining: !showReadLaterRemaining })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch {
      // Error is handled by the store
    } finally {
      setIsSaving(false)
    }
  }

  const ProfileContent = () => {
    // Display priority: username > name for display name
    const displayName = user?.username || user?.name || t('profile.notSet')
    // Display priority: email > phone for contact info
    const contactInfo = user?.email || user?.phone || t('profile.notSet')

    return (
      <div className="space-y-5">
        {/* Name */}
        <div>
          <Label className="text-muted-foreground mb-2 block text-sm font-medium">
            {t('profile.name')}
          </Label>
          <div className="from-muted/50 to-muted/30 ring-border/50 hover:ring-primary/20 flex items-center gap-3 rounded-xl bg-gradient-to-br p-4 ring-1 transition-all">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
              <User className="text-primary h-5 w-5" />
            </div>
            <span className="text-foreground font-medium">{displayName}</span>
          </div>
        </div>

        {/* Contact Info (Email or Phone) */}
        <div>
          <Label className="text-muted-foreground mb-2 block text-sm font-medium">
            {user?.email ? t('profile.email') : t('profile.phone')}
          </Label>
          <div className="from-muted/50 to-muted/30 ring-border/50 hover:ring-primary/20 flex items-center gap-3 rounded-xl bg-gradient-to-br p-4 ring-1 transition-all">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
              <Mail className="text-primary h-5 w-5" />
            </div>
            <span className="text-foreground font-medium">{contactInfo}</span>
          </div>
        </div>

        {/* Account Status */}
        <div>
          <Label className="text-muted-foreground mb-2 block text-sm font-medium">
            {t('profile.accountStatus')}
          </Label>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium shadow-sm ring-1 transition-all ${
                user?.is_active
                  ? 'bg-success/10 text-success ring-success/20 hover:bg-success/20'
                  : 'bg-destructive/10 text-destructive ring-destructive/20 hover:bg-destructive/20'
              }`}
            >
              {user?.is_active ? (
                <CheckCircle className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
              {user?.is_active ? t('profile.active') : t('profile.inactive')}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium shadow-sm ring-1 transition-all ${
                user?.is_verified
                  ? 'bg-primary/10 text-primary ring-primary/20 hover:bg-primary/20'
                  : 'bg-muted/50 text-muted-foreground ring-border/50 hover:bg-muted'
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              {user?.is_verified ? t('profile.verified') : t('profile.notVerified')}
            </span>
          </div>
        </div>

        {/* Language */}
        <div>
          <Label className="text-muted-foreground mb-2 block text-sm font-medium">
            {t('profile.language')}
          </Label>
          <div className="from-muted/50 to-muted/30 ring-border/50 hover:ring-primary/20 flex items-center gap-3 rounded-xl bg-gradient-to-br p-4 ring-1 transition-all">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
              <Languages className="text-primary h-5 w-5" />
            </div>
            <Select
              value={language}
              onValueChange={(value) => setLanguage(value as 'en' | 'zh-CN')}
            >
              <SelectTrigger className="flex-1">
                <SelectValue>{language === 'en' ? '🇺🇸 English' : '🇨🇳 简体中文'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">🇺🇸 English</SelectItem>
                <SelectItem value="zh-CN">🇨🇳 简体中文</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    )
  }

  const ReadLaterContent = () => (
    <div className="space-y-6">
      <div>
        <Label className="text-muted-foreground mb-2 block text-sm font-medium">
          {t('readLater.autoCleanup')}
        </Label>
        <p className="text-muted-foreground/80 mb-4 text-sm">{t('readLater.autoCleanupDesc')}</p>
        <div className="flex flex-wrap gap-2">
          {READ_LATER_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={currentReadLaterDays === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleReadLaterDaysChange(option.value)}
              disabled={isSaving || isLoading}
              className="min-w-[100px]"
            >
              {isSaving && currentReadLaterDays !== option.value ? null : currentReadLaterDays ===
                  option.value && isSaving ? (
                <Loader2 className="mr-2 h-4 w-4" />
              ) : null}
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Show remaining time toggle */}
      <div
        className="border-border/50 from-muted/30 to-muted/10 ring-border/20 rounded-xl border bg-gradient-to-br p-5 ring-1"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-3">
            <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
              <Eye className="text-primary h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <Label className="text-foreground block text-sm font-medium">
                {t('readLater.showRemainingTime')}
              </Label>
              <p className="text-muted-foreground text-xs">
                {t('readLater.showRemainingTimeDesc')}
              </p>
            </div>
          </div>
          <Switch
            checked={showReadLaterRemaining}
            onCheckedChange={handleToggleShowRemaining}
            disabled={isSaving || isLoading}
          />
        </div>
      </div>

      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-sm text-success ring-1 ring-success/20">
          <CheckCircle className="h-4 w-4" />
          {t('readLater.settingsSaved')}
        </div>
      )}
    </div>
  )

  const AppearanceContent = () => {
    const themeOptions = [
      {
        value: 'dark' as const,
        icon: Moon,
        label: t('appearance.themes.night'),
        description: t('appearance.themes.nightDesc'),
        preview: {
          bg: 'bg-[hsl(220_20%_10%)]',
          card: 'bg-[hsl(220_18%_13%)]',
          primary: 'bg-primary',
          text: 'bg-[hsl(45_30%_96%)]',
        },
      },
      {
        value: 'light' as const,
        icon: Sun,
        label: t('appearance.themes.day'),
        description: t('appearance.themes.dayDesc'),
        preview: {
          bg: 'bg-[hsl(45_30%_97%)]',
          card: 'bg-[hsl(0_0%_100%)]',
          primary: 'bg-primary',
          text: 'bg-[hsl(220_20%_15%)]',
        },
      },
      {
        value: 'system' as const,
        icon: Monitor,
        label: t('appearance.themes.auto'),
        description: t('appearance.themes.autoDesc'),
        preview: {
          bg: 'bg-gradient-to-br from-[hsl(220_20%_10%)] to-[hsl(45_30%_97%)]',
          card: 'bg-gradient-to-br from-[hsl(220_18%_13%)] to-[hsl(0_0%_100%)]',
          primary: 'bg-primary',
          text: 'bg-gradient-to-br from-[hsl(45_30%_96%)] to-[hsl(220_20%_15%)]',
        },
      },
    ]

    return (
      <div className="w-full space-y-6">
        <div className="w-full">
          <Label className="text-muted-foreground mb-4 block text-sm font-medium">
            {t('appearance.chooseTheme')}
          </Label>
          <div className="grid w-full grid-cols-3 gap-2 md:gap-6">
            {themeOptions.map(({ value, icon: Icon, label, description, preview }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`group relative flex flex-col items-center gap-2 rounded-xl border p-2 text-center md:gap-4 md:rounded-2xl md:p-6 ${
                  theme === value
                    ? 'border-primary/50 from-primary/10 to-primary/5 ring-primary/30 bg-gradient-to-br shadow-lg ring-2 md:scale-105'
                    : 'border-border/50 from-muted/30 to-muted/10 hover:border-primary/30 bg-gradient-to-br hover:shadow-lg md:hover:scale-105'
                }`}
              >
                {/* Selected indicator */}
                {theme === value && (
                  <div className="bg-primary ring-background absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full shadow-md ring-2 md:-top-2 md:-right-2 md:h-7 md:w-7">
                    <CheckCircle className="text-primary-foreground h-3 w-3 md:h-4 md:w-4" />
                  </div>
                )}

                {/* Theme preview with color blocks */}
                <div className="ring-border/50 relative h-16 w-full overflow-hidden rounded-lg shadow-sm ring-1 md:h-24 md:rounded-xl">
                  {/* Background */}
                  <div className={`absolute inset-0 ${preview.bg}`} />

                  {/* Card overlay */}
                  <div className="absolute inset-x-2 top-2 bottom-2 flex flex-col gap-1 md:inset-x-3 md:top-3 md:bottom-3 md:gap-1.5">
                    <div
                      className={`h-5 rounded-md md:h-8 md:rounded-lg ${preview.card} shadow-sm`}
                    />
                    <div className="flex flex-1 gap-1 md:gap-1.5">
                      <div
                        className={`flex-1 rounded-sm md:rounded-md ${preview.card} shadow-sm`}
                      />
                      <div
                        className={`w-1/3 rounded-sm md:rounded-md ${preview.primary} shadow-sm`}
                      />
                    </div>
                  </div>

                  {/* Text indicator dots */}
                  <div className="absolute top-3 left-3 hidden gap-1 md:flex">
                    <div className={`h-1.5 w-8 rounded-full ${preview.text} opacity-40`} />
                    <div className={`h-1.5 w-4 rounded-full ${preview.text} opacity-30`} />
                  </div>
                </div>

                {/* Icon */}
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all md:h-10 md:w-10 md:rounded-lg ${
                    theme === value
                      ? 'bg-primary/20 text-primary md:scale-110'
                      : 'bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary md:group-hover:scale-110'
                  }`}
                >
                  <Icon className="h-4 w-4 md:h-5 md:w-5" />
                </div>

                {/* Label and description */}
                <div className="space-y-0.5 md:space-y-1">
                  <div
                    className={`text-xs font-semibold transition-colors md:text-base ${
                      theme === value ? 'text-primary' : 'text-foreground group-hover:text-primary'
                    }`}
                  >
                    {label}
                  </div>
                  <div className="text-muted-foreground hidden text-xs leading-snug md:block">
                    {description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const settingsRootClass = 'h-full w-full px-4 py-4 md:px-8 md:py-6'
  // Inner frame: no border/shadow/backdrop-blur — those create the "viewport-hugging
  // card" look. Just a flex container that lets the tabs region fill remaining height.
  const settingsFrameClass = 'min-h-0 flex-1 overflow-hidden'
  const tabsRailClass =
    'w-full shrink-0 border-b bg-muted/20 md:w-56 md:overflow-y-auto md:border-r md:border-b-0'
  const tabsListClass =
    'no-scrollbar flex h-auto w-full !flex-row gap-0 overflow-x-auto bg-transparent md:!flex-col md:gap-1 md:overflow-x-visible md:p-3 [&_[data-slot=tab-indicator]]:hidden md:[&_[data-slot=tab-indicator]]:block'
  const tabsTabClass =
    'flex-1 flex-col gap-0.5 border-b-2 border-transparent px-2 py-2.5 md:w-full md:flex-none md:flex-row md:justify-start md:gap-2.5 md:rounded-md md:border-b-0 md:px-3 md:py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-medium'
  const panelClass = 'h-full w-full min-w-0 p-6'
  const panelHeaderClass = 'mb-8'

  return (
    <div className={settingsRootClass}>
      <div className="flex h-full flex-col">
        <div className={settingsFrameClass}>
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            orientation="vertical"
            className="h-full w-full"
          >
            <div className="flex h-full min-h-0 w-full flex-1 flex-col md:flex-row">
              <div className={tabsRailClass}>
                <TabsList variant="underline" className={tabsListClass}>
                  <TabsTab value="profile" className={tabsTabClass}>
                    <User className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
                    <span className="text-[10px] md:text-sm">{t('tabs.profile')}</span>
                  </TabsTab>
                  <TabsTab value="read-later" className={tabsTabClass}>
                    <Clock className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
                    <span className="text-[10px] md:text-sm">{t('tabs.readLater')}</span>
                  </TabsTab>
                  <TabsTab value="appearance" className={tabsTabClass}>
                    <Sun className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
                    <span className="text-[10px] md:text-sm">{t('tabs.appearance')}</span>
                  </TabsTab>
                  <TabsTab value="translation" className={tabsTabClass}>
                    <Languages className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
                    <span className="text-[10px] md:text-sm">{t('tabs.translation')}</span>
                  </TabsTab>
                  <TabsTab value="manage-feeds" className={tabsTabClass}>
                    <ListChecks className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
                    <span className="text-[10px] md:text-sm">{t('tabs.manageFeeds')}</span>
                  </TabsTab>
                  <TabsTab value="api-tokens" className={tabsTabClass}>
                    <Key className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
                    <span className="text-[10px] md:text-sm">{t('tabs.apiTokens')}</span>
                  </TabsTab>
                  <TabsTab value="ai-integration" className={tabsTabClass}>
                    <Sparkles className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
                    <span className="text-[10px] md:text-sm">{t('tabs.aiIntegration')}</span>
                  </TabsTab>
                </TabsList>
              </div>

              <div className="w-full min-h-0 min-w-0 flex-1 overflow-y-auto">
                <TabsPanel value="profile" className={panelClass}>
                  <div className={panelHeaderClass}>
                    <div className="mb-2 flex items-center gap-3">
                      <div className="bg-primary/10 ring-primary/20 flex h-10 w-10 items-center justify-center rounded-xl ring-1">
                        <User className="text-primary h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="font-display text-foreground text-2xl font-semibold">
                          {t('profile.title')}
                        </h2>
                        <p className="text-muted-foreground text-sm">{t('profile.desc')}</p>
                      </div>
                    </div>
                  </div>
                  <ProfileContent />
                </TabsPanel>

                <TabsPanel value="read-later" className={panelClass}>
                  <div className={panelHeaderClass}>
                    <div className="mb-2 flex items-center gap-3">
                      <div className="bg-primary/10 ring-primary/20 flex h-10 w-10 items-center justify-center rounded-xl ring-1">
                        <Clock className="text-primary h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="font-display text-foreground text-2xl font-semibold">
                          {t('readLater.title')}
                        </h2>
                        <p className="text-muted-foreground text-sm">{t('readLater.desc')}</p>
                      </div>
                    </div>
                  </div>
                  <ReadLaterContent />
                </TabsPanel>

                <TabsPanel value="appearance" className={panelClass}>
                  <div className={panelHeaderClass}>
                    <div className="mb-2 flex items-center gap-3">
                      <div className="bg-primary/10 ring-primary/20 flex h-10 w-10 items-center justify-center rounded-xl ring-1">
                        <Sun className="text-primary h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="font-display text-foreground text-2xl font-semibold">
                          {t('appearance.title')}
                        </h2>
                        <p className="text-muted-foreground text-sm">{t('appearance.desc')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="w-full">
                    <AppearanceContent />
                  </div>
                </TabsPanel>

                <TabsPanel value="translation" className={panelClass}>
                  <div className={panelHeaderClass}>
                    <div className="mb-2 flex items-center gap-3">
                      <div className="bg-primary/10 ring-primary/20 flex h-10 w-10 items-center justify-center rounded-xl ring-1">
                        <Languages className="text-primary h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="font-display text-foreground text-2xl font-semibold">
                          {t('translation.title')}
                        </h2>
                        <p className="text-muted-foreground text-sm">{t('translation.desc')}</p>
                      </div>
                    </div>
                  </div>
                  <TranslationTab />
                </TabsPanel>

                <TabsPanel
                  value="manage-feeds"
                  className="flex h-full w-full min-w-0 flex-col overflow-hidden"
                >
                  <div className="min-h-0 w-full flex-1 p-4">
                    <SubscriptionsTab />
                  </div>
                </TabsPanel>

                <TabsPanel value="api-tokens" className={panelClass}>
                  <div className={panelHeaderClass}>
                    <div className="mb-2 flex items-center gap-3">
                      <div className="bg-primary/10 ring-primary/20 flex h-10 w-10 items-center justify-center rounded-xl ring-1">
                        <Key className="text-primary h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="font-display text-foreground text-2xl font-semibold">
                          {t('apiTokens.title')}
                        </h2>
                        <p className="text-muted-foreground text-sm">{t('apiTokens.desc')}</p>
                      </div>
                    </div>
                  </div>
                  <APITokensTab />
                </TabsPanel>

                <TabsPanel value="ai-integration" className={panelClass}>
                  <div className={panelHeaderClass}>
                    <div className="mb-2 flex items-center gap-3">
                      <div className="bg-primary/10 ring-primary/20 flex h-10 w-10 items-center justify-center rounded-xl ring-1">
                        <Sparkles className="text-primary h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="font-display text-foreground text-2xl font-semibold">
                          {t('aiIntegration.title')}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                          {t('aiIntegration.desc')}
                        </p>
                      </div>
                    </div>
                  </div>
                  <AIIntegrationTab />
                </TabsPanel>
              </div>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
