import { useState } from 'react'
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@glean/ui'
import { CheckCircle, Info, Loader2 } from 'lucide-react'
import { useTranslation } from '@glean/i18n'
import { useAIIntegrationStatus } from '../../hooks/useAIIntegration'
import { useAuthStore } from '../../stores/authStore'

type TodayBoardDefaultView = 'list' | 'ai_summary'

export function AIIntegrationTab() {
  const { t } = useTranslation('settings')
  const { user, updateSettings, isLoading } = useAuthStore()
  const { data: aiIntegrationStatus } = useAIIntegrationStatus()

  const systemEnabled = aiIntegrationStatus?.enabled ?? false
  const currentEnabled = user?.settings?.ai_integration_enabled ?? false
  const currentDefaultView = (user?.settings?.today_board_default_view ??
    'list') as TodayBoardDefaultView

  const [enabled, setEnabled] = useState(currentEnabled)
  const [defaultView, setDefaultView] = useState<TodayBoardDefaultView>(currentDefaultView)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const hasChanges = enabled !== currentEnabled || defaultView !== currentDefaultView
  // The switch + selector remain interactive even when the system is currently
  // disabled — the user's preference persists, so when an admin/operator sets
  // LLM_API_KEY on the backend the feature lights up without the user having
  // to revisit this page. We only disable controls during the actual save call.
  const controlsDisabled = isSaving || isLoading

  const handleSave = async () => {
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      await updateSettings({
        ...user?.settings,
        ai_integration_enabled: enabled,
        today_board_default_view: defaultView,
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch {
      // Error is handled by the store.
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {!systemEnabled ? (
        <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('aiIntegration.systemDisabled')}</span>
        </div>
      ) : null}

      <div className="border-border/50 from-muted/30 to-muted/10 ring-border/20 rounded-xl border bg-gradient-to-br p-5 ring-1">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Label className="text-foreground block text-sm font-medium">
              {t('aiIntegration.enableLabel')}
            </Label>
            <p className="text-muted-foreground text-xs">{t('aiIntegration.enableDesc')}</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={controlsDisabled} />
        </div>
      </div>

      <div>
        <Label className="text-muted-foreground mb-2 block text-sm font-medium">
          {t('aiIntegration.defaultView')}
        </Label>
        <p className="text-muted-foreground/80 mb-4 text-sm">
          {t('aiIntegration.defaultViewDesc')}
        </p>
        <Select
          value={defaultView}
          onValueChange={(value) => setDefaultView(value as TodayBoardDefaultView)}
          disabled={controlsDisabled || !enabled}
        >
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue>{t(`aiIntegration.defaultViewOptions.${defaultView}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="list">{t('aiIntegration.defaultViewOptions.list')}</SelectItem>
            <SelectItem value="ai_summary">
              {t('aiIntegration.defaultViewOptions.ai_summary')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving || isLoading || !hasChanges}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4" />}
          {t('common:actions.save')}
        </Button>
        {saveSuccess && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" />
            {t('aiIntegration.settingsSaved')}
          </span>
        )}
      </div>
    </div>
  )
}
