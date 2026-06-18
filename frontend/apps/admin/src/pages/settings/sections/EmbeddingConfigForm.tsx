import { useTranslation } from '@glean/i18n'
import {
  Button,
  Input,
  Label,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Alert,
  AlertTitle,
  AlertDescription,
  Switch,
} from '@glean/ui'
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  PowerOff,
  Square,
  Zap,
  Download,
} from 'lucide-react'
import {
  useEmbeddingConfig,
  useEmbeddingStatus,
  useUpdateEmbeddingConfig,
  useEnableEmbedding,
  useDisableEmbedding,
  useTestEmbedding,
  useRebuildEmbedding,
  useCancelRebuild,
  useDownloadModel,
  useModelDownloadStatus,
  type VectorizationStatus,
} from '../../../hooks/useEmbeddingConfig'
import {
  useEmbeddingForm,
  PROVIDERS,
  SENTENCE_TRANSFORMER_MODELS,
  OPENAI_MODELS,
  DEFAULT_PROVIDER,
} from '../hooks/useEmbeddingForm'

function StatusBadge({ status }: { status?: VectorizationStatus }) {
  const { t } = useTranslation('admin')

  const statusConfig: Record<
    VectorizationStatus,
    { icon: React.ReactNode; color: string; label: string }
  > = {
    disabled: {
      icon: <PowerOff className="h-3.5 w-3.5" />,
      color: 'bg-muted text-muted-foreground',
      label: t('settings.embedding.status.disabled', 'Disabled'),
    },
    idle: {
      icon: <CheckCircle className="h-3.5 w-3.5" />,
      color: 'bg-success/10 text-success ring-1 ring-success/20',
      label: t('settings.embedding.status.idle', 'Operational'),
    },
    validating: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      color: 'bg-warning/10 text-warning ring-1 ring-warning/20',
      label: t('settings.embedding.status.validating', 'Validating...'),
    },
    rebuilding: {
      icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" />,
      color: 'bg-info/10 text-info ring-1 ring-info/20',
      label: t('settings.embedding.status.rebuilding', 'Rebuilding...'),
    },
    error: {
      icon: <XCircle className="h-3.5 w-3.5" />,
      color: 'bg-destructive/10 text-destructive ring-1 ring-destructive/20',
      label: t('settings.embedding.status.error', 'Error'),
    },
  }

  const effectiveStatus = status && status in statusConfig ? status : 'disabled'
  const { icon, color, label } = statusConfig[effectiveStatus]

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${color}`}
    >
      {icon}
      {label}
    </span>
  )
}

export function EmbeddingConfigForm() {
  const { t } = useTranslation(['admin', 'common'])
  const { data: config } = useEmbeddingConfig()

  // Status polling only when rebuilding/validating
  useEmbeddingStatus(config?.status === 'rebuilding' || config?.status === 'validating')

  const updateMutation = useUpdateEmbeddingConfig()
  const enableMutation = useEnableEmbedding()
  const disableMutation = useDisableEmbedding()
  const testMutation = useTestEmbedding()
  const rebuildMutation = useRebuildEmbedding()
  const cancelMutation = useCancelRebuild()
  const downloadModelMutation = useDownloadModel()

  const {
    form,
    useCustomModel,
    isPredefinedModel,
    handleChange,
    handleProviderChange,
    handleModelSelect,
    handleRateLimitChange,
    handleToggleEnabled,
  } = useEmbeddingForm(config)

  const isSentenceTransformers = form.provider === 'sentence-transformers'
  const modelToCheck = isSentenceTransformers && form.model ? form.model : undefined
  const { data: downloadStatus } = useModelDownloadStatus(modelToCheck)

  const isAnyLoading =
    updateMutation.isPending ||
    enableMutation.isPending ||
    disableMutation.isPending ||
    testMutation.isPending ||
    rebuildMutation.isPending ||
    cancelMutation.isPending ||
    downloadModelMutation.isPending

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const enabledChanged = form.enabled !== undefined && form.enabled !== config?.enabled
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { enabled: _enabled, ...configUpdates } = form

    if (Object.keys(configUpdates).length > 0) {
      try {
        await updateMutation.mutateAsync(configUpdates)
      } catch {
        return
      }
    }

    if (enabledChanged && form.enabled) {
      await enableMutation.mutateAsync()
    } else if (enabledChanged && !form.enabled) {
      await disableMutation.mutateAsync()
    }
  }

  const handleValidate = async () => {
    await testMutation.mutateAsync(form)
  }

  const handleRebuild = async () => {
    await rebuildMutation.mutateAsync()
  }

  const handleCancelRebuild = async () => {
    await cancelMutation.mutateAsync()
  }

  const handleDownloadModel = async () => {
    if (!form.model) return
    await downloadModelMutation.mutateAsync({ model: form.model, dimension: config?.dimension })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin:settings.embedding.config', 'Configuration')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit}>
          {/* Enable/Disable Toggle */}
          <div className="border-border bg-muted/40 flex items-center justify-between rounded-lg border p-4">
            <div className="flex-1 space-y-0.5">
              <Label htmlFor="enabled" className="text-base font-medium">
                {t('admin:settings.embedding.enabled', 'Enable Vectorization')}
              </Label>
              <p className="text-muted-foreground text-sm">
                {t(
                  'admin:settings.embedding.enabledDesc',
                  'Turn on AI-powered recommendations using vector embeddings.'
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {config && <StatusBadge status={config.status} />}
              <Switch
                id="enabled"
                checked={form.enabled ?? false}
                onCheckedChange={handleToggleEnabled}
                disabled={isAnyLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider">{t('admin:settings.embedding.provider', 'Provider')}</Label>
            <select
              id="provider"
              className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
              value={form.provider || DEFAULT_PROVIDER}
              onChange={(e) => handleProviderChange(e.target.value)}
              disabled={isAnyLoading}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">{t('admin:settings.embedding.model', 'Model')}</Label>
            {form.provider === 'sentence-transformers' ? (
              <div className="space-y-2">
                <select
                  id="model"
                  className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
                  value={useCustomModel ? 'custom' : isPredefinedModel ? form.model : 'custom'}
                  onChange={(e) => handleModelSelect(e.target.value)}
                  disabled={isAnyLoading}
                >
                  {SENTENCE_TRANSFORMER_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {(useCustomModel || !isPredefinedModel) && (
                  <Input
                    id="custom-model"
                    placeholder={t(
                      'admin:settings.embedding.customModelPlaceholder',
                      'Enter custom model name'
                    )}
                    value={form.model || ''}
                    onChange={(e) => handleChange('model', e.target.value)}
                    disabled={isAnyLoading}
                  />
                )}
              </div>
            ) : form.provider === 'openai' ? (
              <div className="space-y-2">
                <select
                  id="model"
                  className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
                  value={useCustomModel || !isPredefinedModel ? 'custom' : form.model || ''}
                  onChange={(e) => handleModelSelect(e.target.value)}
                  disabled={isAnyLoading}
                >
                  {OPENAI_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {(useCustomModel || !isPredefinedModel) && (
                  <Input
                    id="custom-model-openai"
                    placeholder={t(
                      'admin:settings.embedding.customModelPlaceholder',
                      'Enter custom model name'
                    )}
                    value={form.model || ''}
                    onChange={(e) => handleChange('model', e.target.value)}
                    disabled={isAnyLoading}
                  />
                )}
              </div>
            ) : (
              <Input
                id="model"
                value={form.model || ''}
                onChange={(e) => handleChange('model', e.target.value)}
                disabled={isAnyLoading}
              />
            )}
          </div>

          {/* Model Download Card — only for sentence-transformers */}
          {form.provider === 'sentence-transformers' && form.model && (
            <div className="border-border rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {t('admin:settings.embedding.modelDownload.title', 'Model Download')}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {t(
                      'admin:settings.embedding.modelDownload.desc',
                      'Download the model to the server before enabling vectorization.'
                    )}
                  </p>
                </div>

                {downloadStatus?.status === 'done' ? (
                  <span className="bg-success/10 text-success ring-success/20 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {t('admin:settings.embedding.modelDownload.ready', 'Ready')}
                  </span>
                ) : downloadStatus?.status === 'error' ? (
                  <span className="bg-destructive/10 text-destructive ring-destructive/20 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1">
                    <XCircle className="h-3.5 w-3.5" />
                    {t('admin:settings.embedding.modelDownload.failed', 'Failed')}
                  </span>
                ) : downloadStatus?.status === 'downloading' ||
                  downloadStatus?.status === 'pending' ? (
                  <span className="bg-info/10 text-info ring-info/20 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('admin:settings.embedding.modelDownload.downloading', 'Downloading...')}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {t('admin:settings.embedding.modelDownload.notStarted', 'Not downloaded')}
                  </span>
                )}
              </div>

              {(downloadStatus?.status === 'downloading' ||
                downloadStatus?.status === 'pending') && (
                <div className="bg-muted mb-3 rounded-md p-3">
                  <div className="animate-progress-indeterminate bg-primary h-1.5 rounded-full" />
                  <p className="text-muted-foreground mt-2 text-xs">
                    {t(
                      'admin:settings.embedding.modelDownload.downloadingNote',
                      'Downloading from HuggingFace. This may take several minutes depending on your network speed.'
                    )}
                  </p>
                </div>
              )}

              {downloadStatus?.status === 'error' && downloadStatus.error && (
                <p className="text-destructive mb-3 text-xs">{downloadStatus.error}</p>
              )}

              {downloadStatus?.status !== 'done' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadModel}
                  disabled={
                    isAnyLoading ||
                    downloadStatus?.status === 'downloading' ||
                    downloadStatus?.status === 'pending'
                  }
                >
                  {downloadStatus?.status === 'downloading' ||
                  downloadStatus?.status === 'pending' ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      {t('admin:settings.embedding.modelDownload.inProgress', 'Downloading...')}
                    </>
                  ) : downloadStatus?.status === 'error' ? (
                    <>
                      <RefreshCw className="mr-2 h-3.5 w-3.5" />
                      {t('admin:settings.embedding.modelDownload.retry', 'Retry Download')}
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-3.5 w-3.5" />
                      {t('admin:settings.embedding.modelDownload.start', 'Download Model')}
                    </>
                  )}
                </Button>
              )}
            </div>
          )}

          {/* API Key and Base URL — only for providers that need them */}
          {form.provider !== 'sentence-transformers' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="api_key">
                  {t('admin:settings.embedding.apiKey', 'API Key')}
                  {config?.api_key_set && (
                    <span className="text-success ml-2 text-xs">
                      ({t('admin:settings.embedding.apiKeySet', 'configured')})
                    </span>
                  )}
                </Label>
                <Input
                  id="api_key"
                  type="password"
                  value={form.api_key ?? ''}
                  onChange={(e) => handleChange('api_key', e.target.value || null)}
                  placeholder={t(
                    'admin:settings.embedding.apiKeyPlaceholder',
                    'Enter new API key to update'
                  )}
                  disabled={isAnyLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="base_url">
                  {t('admin:settings.embedding.baseUrl', 'Base URL')}
                  {form.provider === 'volc-engine' && (
                    <span className="text-muted-foreground ml-1 text-xs">
                      ({t('admin:settings.embedding.required', 'required')})
                    </span>
                  )}
                </Label>
                <Input
                  id="base_url"
                  value={form.base_url || ''}
                  onChange={(e) => handleChange('base_url', e.target.value || null)}
                  placeholder={
                    form.provider === 'volc-engine'
                      ? 'https://ark.cn-beijing.volces.com/api/v3/'
                      : form.provider === 'openai'
                        ? 'https://api.openai.com/v1'
                        : ''
                  }
                  disabled={isAnyLoading}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>{t('admin:settings.embedding.rateLimit', 'Rate limit (rpm)')}</Label>
            <Input
              type="number"
              value={form.rate_limit?.default || 10}
              onChange={(e) => handleRateLimitChange(Number(e.target.value))}
              disabled={isAnyLoading}
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" disabled={isAnyLoading}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common:states.saving', 'Saving...')}
                </>
              ) : (
                t('common:actions.save', 'Save')
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleValidate}
              disabled={isAnyLoading}
            >
              {testMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('admin:settings.embedding.validating', 'Validating...')}
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  {t('admin:settings.embedding.testConnection', 'Test Connection')}
                </>
              )}
            </Button>

            {config?.enabled && config?.status === 'idle' && (
              <Button
                type="button"
                variant="outline"
                onClick={handleRebuild}
                disabled={isAnyLoading}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('admin:settings.embedding.rebuild', 'Rebuild All')}
              </Button>
            )}

            {config?.status === 'rebuilding' && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleCancelRebuild}
                disabled={isAnyLoading}
              >
                <Square className="mr-2 h-4 w-4" />
                {t('admin:settings.embedding.cancelRebuild', 'Cancel Rebuild')}
              </Button>
            )}
          </div>

          {testMutation.isPending && form.provider === 'sentence-transformers' && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>
                {t('admin:settings.embedding.validatingInProgress', 'Validation in Progress')}
              </AlertTitle>
              <AlertDescription>
                <p className="text-sm">
                  {t(
                    'admin:settings.embedding.modelDownloadNotice',
                    'If this is your first time using this model, it may take several minutes to download from HuggingFace. Please be patient.'
                  )}
                </p>
                <p className="text-muted-foreground mt-2 text-xs">
                  {t(
                    'admin:settings.embedding.downloadTimeout',
                    'The validation will timeout after 10 minutes. If validation fails due to timeout, the model may still be downloading in the background.'
                  )}
                </p>
              </AlertDescription>
            </Alert>
          )}

          {testMutation.isError && (
            <Alert variant="error">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>
                {t('admin:settings.embedding.validationError', 'Validation Error')}
              </AlertTitle>
              <AlertDescription>
                {String(testMutation.error)}
                {form.provider === 'sentence-transformers' && (
                  <p className="mt-2 text-xs">
                    {t(
                      'admin:settings.embedding.modelDownloadTip',
                      'Tip: If the error is timeout-related, the model might still be downloading. Try again after a few minutes.'
                    )}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {testMutation.isSuccess && (
            <Alert variant={testMutation.data.success ? 'success' : 'error'}>
              <AlertTitle>
                {testMutation.data.success
                  ? t('admin:settings.embedding.validationSuccess', 'Connection Successful')
                  : t('admin:settings.embedding.validationFailed', 'Connection Failed')}
              </AlertTitle>
              <AlertDescription>{testMutation.data.message}</AlertDescription>
            </Alert>
          )}

          {updateMutation.isSuccess && (
            <Alert variant="success">
              <AlertTitle>{t('admin:settings.embedding.saved', 'Settings Saved')}</AlertTitle>
              <AlertDescription>
                {t('admin:settings.embedding.saveSuccess', 'Configuration saved successfully.')}
              </AlertDescription>
            </Alert>
          )}

          {(updateMutation.isError || enableMutation.isError || disableMutation.isError) && (
            <Alert variant="error">
              <AlertTitle>{t('common:states.error', 'Error')}</AlertTitle>
              <AlertDescription>
                {t('admin:settings.embedding.saveError', 'Failed to save configuration.')}
              </AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
