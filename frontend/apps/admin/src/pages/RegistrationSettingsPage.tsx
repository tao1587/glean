import { useEffect, useState } from 'react'
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Label,
  Switch,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@glean/ui'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useTranslation } from '@glean/i18n'
import type { AIIntegrationConfigResponse, AIIntegrationConfigUpdateRequest } from '@glean/types'
import api from '../lib/api'

interface RSSHubSettings {
  enabled: boolean
  base_url: string | null
  auto_convert_on_subscribe: boolean
  fallback_on_fetch: boolean
  builtin_rules: Record<string, boolean>
  custom_rules: Array<Record<string, string | boolean>>
}

export default function RegistrationSettingsPage() {
  const { t } = useTranslation(['admin', 'common'])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [registrationEnabled, setRegistrationEnabled] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [savingRsshub, setSavingRsshub] = useState(false)
  const [savingAIIntegration, setSavingAIIntegration] = useState(false)
  const [rsshubSettings, setRsshubSettings] = useState<RSSHubSettings>({
    enabled: false,
    base_url: '',
    auto_convert_on_subscribe: true,
    fallback_on_fetch: true,
    builtin_rules: {
      bilibili_space: true,
      bilibili_video: true,
      youtube_channel: true,
      youtube_playlist: true,
      zhihu_column: true,
      zhihu_people: true,
      zhihu_question: true,
      x_user: true,
      github_repo: true,
      reddit_subreddit: true,
      reddit_user: true,
      telegram_channel: true,
      weibo_user: true,
      medium_user: true,
      medium_publication: true,
      pixiv_user: true,
    },
    custom_rules: [],
  })
  const [rsshubCustomRulesText, setRsshubCustomRulesText] = useState('[]')
  const [aiIntegrationSettings, setAIIntegrationSettings] = useState<AIIntegrationConfigResponse>({
    enabled: false,
    allow_today_synthesis: true,
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const [registrationRes, rsshubRes, aiIntegrationRes] = await Promise.all([
        api.get('/settings/registration'),
        api.get('/settings/rsshub'),
        api.get('/settings/ai-integration'),
      ])
      setRegistrationEnabled(registrationRes.data.enabled)
      const nextRsshub = rsshubRes.data as RSSHubSettings
      setRsshubSettings(nextRsshub)
      setRsshubCustomRulesText(JSON.stringify(nextRsshub.custom_rules ?? [], null, 2))
      setAIIntegrationSettings(aiIntegrationRes.data as AIIntegrationConfigResponse)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch settings:', err)
      setError('Failed to load system settings')
    } finally {
      setLoading(false)
    }
  }

  const handleRegistrationToggle = async (checked: boolean) => {
    try {
      setUpdating(true)
      await api.post(`/settings/registration?enabled=${checked}`)
      setRegistrationEnabled(checked)
      setError(null)
    } catch (err) {
      console.error('Failed to update setting:', err)
      setError('Failed to update registration setting')
      // Revert switch state
      setRegistrationEnabled(!checked)
    } finally {
      setUpdating(false)
    }
  }

  const handleSaveRsshubSettings = async () => {
    try {
      setSavingRsshub(true)
      let customRules: Array<Record<string, string | boolean>> = []
      try {
        const parsed = JSON.parse(rsshubCustomRulesText || '[]')
        if (Array.isArray(parsed)) {
          customRules = parsed as Array<Record<string, string | boolean>>
        } else {
          setError('RSSHub custom rules must be a JSON array')
          return
        }
      } catch {
        setError('Invalid RSSHub custom rules JSON')
        return
      }
      await api.post('/settings/rsshub', {
        ...rsshubSettings,
        custom_rules: customRules,
      })
      setError(null)
    } catch (err) {
      console.error('Failed to update RSSHub settings:', err)
      setError('Failed to update RSSHub settings')
    } finally {
      setSavingRsshub(false)
    }
  }

  const handleSaveAIIntegrationSettings = async () => {
    try {
      setSavingAIIntegration(true)
      const payload: AIIntegrationConfigUpdateRequest = aiIntegrationSettings
      const response = await api.post('/settings/ai-integration', payload)
      setAIIntegrationSettings(response.data as AIIntegrationConfigResponse)
      setError(null)
    } catch (err) {
      console.error('Failed to update local AI settings:', err)
      setError('Failed to update local AI settings')
    } finally {
      setSavingAIIntegration(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="text-primary h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-border bg-card border-b px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-bold">
              {t('admin:settings.system.title', 'System Settings')}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {t(
                'admin:settings.system.subtitle',
                'Manage global configuration for your Glean instance.'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="space-y-8">
          {error && (
            <Alert variant="error">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('common:error', 'Error')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('admin:settings.registration.title', 'User Registration')}</CardTitle>
              <CardDescription>
                {t(
                  'admin:settings.registration.description',
                  'Control whether new users can sign up for an account. Existing users will still be able to log in.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between space-x-2">
              <Label htmlFor="registration-mode" className="flex flex-col items-start space-y-1">
                <span>{t('admin:settings.registration.enableLabel', 'Enable Registration')}</span>
                <span className="text-muted-foreground font-normal">
                  {registrationEnabled
                    ? t('admin:settings.registration.enabled', 'New users can sign up.')
                    : t('admin:settings.registration.disabled', 'Sign up is disabled.')}
                </span>
              </Label>
              <Switch
                id="registration-mode"
                checked={registrationEnabled}
                onCheckedChange={handleRegistrationToggle}
                disabled={updating}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>RSSHub Auto-Conversion</CardTitle>
              <CardDescription>
                Configure URL-to-RSSHub auto-conversion rules for sources that cannot be subscribed
                to directly. This is not the full RSSHub route catalog.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="rsshub-enabled" className="flex flex-col items-start space-y-1">
                  <span>Enable RSSHub</span>
                  <span className="text-muted-foreground font-normal">
                    Allow subscription and fetch fallback to convert source URLs into RSSHub paths.
                  </span>
                </Label>
                <Switch
                  id="rsshub-enabled"
                  checked={rsshubSettings.enabled}
                  onCheckedChange={(checked) =>
                    setRsshubSettings((prev) => ({ ...prev, enabled: checked }))
                  }
                  disabled={savingRsshub}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between space-x-2 rounded-md border p-3">
                  <Label htmlFor="rsshub-auto-convert" className="text-sm">
                    Auto convert on subscribe
                  </Label>
                  <Switch
                    id="rsshub-auto-convert"
                    checked={rsshubSettings.auto_convert_on_subscribe}
                    onCheckedChange={(checked) =>
                      setRsshubSettings((prev) => ({ ...prev, auto_convert_on_subscribe: checked }))
                    }
                    disabled={savingRsshub}
                  />
                </div>
                <div className="flex items-center justify-between space-x-2 rounded-md border p-3">
                  <Label htmlFor="rsshub-fetch-fallback" className="text-sm">
                    Fallback on scheduled fetch
                  </Label>
                  <Switch
                    id="rsshub-fetch-fallback"
                    checked={rsshubSettings.fallback_on_fetch}
                    onCheckedChange={(checked) =>
                      setRsshubSettings((prev) => ({ ...prev, fallback_on_fetch: checked }))
                    }
                    disabled={savingRsshub}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Built-in auto-conversion rules</Label>
                <p className="text-muted-foreground text-xs">
                  These rules only control Glean&apos;s automatic URL mapping. For unsupported
                  sites, add a custom rule here or subscribe directly with an RSSHub path in the
                  reader UI.
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {Object.entries(rsshubSettings.builtin_rules || {}).map(([ruleName, enabled]) => (
                    <div
                      key={ruleName}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <span className="text-sm">{ruleName}</span>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(checked) =>
                          setRsshubSettings((prev) => ({
                            ...prev,
                            builtin_rules: {
                              ...(prev.builtin_rules || {}),
                              [ruleName]: checked,
                            },
                          }))
                        }
                        disabled={savingRsshub}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rsshub-base-url">RSSHub base URL</Label>
                <Input
                  id="rsshub-base-url"
                  type="url"
                  placeholder="https://rsshub.example.com"
                  value={rsshubSettings.base_url || ''}
                  onChange={(e) =>
                    setRsshubSettings((prev) => ({ ...prev, base_url: e.target.value }))
                  }
                  disabled={savingRsshub}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rsshub-custom-rules">Custom rules (JSON array)</Label>
                <p className="text-muted-foreground text-xs">
                  Use custom rules when a site is supported by RSSHub but does not appear in the
                  built-in auto-conversion list.
                </p>
                <textarea
                  id="rsshub-custom-rules"
                  className="border-input bg-background min-h-[140px] w-full rounded-md border p-2 text-sm"
                  value={rsshubCustomRulesText}
                  onChange={(e) => setRsshubCustomRulesText(e.target.value)}
                  disabled={savingRsshub}
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveRsshubSettings} disabled={savingRsshub}>
                  {savingRsshub ? 'Saving...' : 'Save RSSHub Settings'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Local AI Integration</CardTitle>
              <CardDescription>
                Generate daily and weekly reading summaries on the Today Board, powered by
                an OpenAI-compatible LLM (DeepSeek by default). Configure the API key via the
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">LLM_API_KEY</code>
                environment variable on the backend.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between space-x-2">
                <Label
                  htmlFor="ai-integration-enabled"
                  className="flex flex-col items-start space-y-1"
                >
                  <span>Enable AI integration</span>
                  <span className="text-muted-foreground font-normal">
                    Master switch. When off, the AI view toggle is hidden in the reader UI
                    and the per-user setting has no effect.
                  </span>
                </Label>
                <Switch
                  id="ai-integration-enabled"
                  checked={aiIntegrationSettings.enabled}
                  onCheckedChange={(checked) =>
                    setAIIntegrationSettings((prev) => ({ ...prev, enabled: checked }))
                  }
                  disabled={savingAIIntegration}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between space-x-2 rounded-md border p-3">
                  <Label htmlFor="ai-today-synthesis" className="text-sm">
                    Today synthesis (daily reduce)
                  </Label>
                  <Switch
                    id="ai-today-synthesis"
                    checked={aiIntegrationSettings.allow_today_synthesis}
                    onCheckedChange={(checked) =>
                      setAIIntegrationSettings((prev) => ({
                        ...prev,
                        allow_today_synthesis: checked,
                      }))
                    }
                    disabled={savingAIIntegration}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveAIIntegrationSettings} disabled={savingAIIntegration}>
                  {savingAIIntegration ? 'Saving...' : 'Save Local AI Settings'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
