import { useMemo } from 'react'
import { useTranslation } from '@glean/i18n'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@glean/ui'
import { AlertCircle } from 'lucide-react'
import { useEmbeddingConfig, useEmbeddingStatus } from '../../../hooks/useEmbeddingConfig'

export function EmbeddingStatusPanel() {
  const { t } = useTranslation('admin')
  const { data: config } = useEmbeddingConfig()
  const isPolling = config?.status === 'rebuilding' || config?.status === 'validating'
  const { data: statusData } = useEmbeddingStatus(isPolling)

  const percentDone = useMemo(() => {
    const total = statusData?.progress?.total || 0
    if (total === 0) return 0
    return Math.min(100, Math.round(((statusData?.progress?.done || 0) / total) * 100))
  }, [statusData])

  return (
    <div className="space-y-6">
      {config?.status === 'error' && config?.last_error && (
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('settings.embedding.errorOccurred', 'Error Occurred')}</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="text-sm">{config.last_error}</p>
            {config.error_count > 0 && (
              <p className="text-muted-foreground mt-1 text-xs">
                {t('settings.embedding.errorCount', 'Error count: {{count}}', {
                  count: config.error_count,
                })}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {(config?.status === 'rebuilding' || config?.status === 'validating') && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.embedding.progress', 'Progress')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {config.status === 'validating' && (
              <>
                <p className="text-muted-foreground text-sm">
                  {t(
                    'settings.embedding.validatingConnection',
                    'Validating provider connection...'
                  )}
                </p>
                {config.provider === 'sentence-transformers' && (
                  <p className="text-warning text-xs">
                    {t(
                      'settings.embedding.downloadingModel',
                      'Note: First-time validation may take several minutes as the model needs to be downloaded from HuggingFace.'
                    )}
                  </p>
                )}
              </>
            )}

            {config.status === 'rebuilding' && statusData && (
              <div className="border-border bg-muted/40 rounded-md border p-3">
                <div className="text-foreground flex items-center justify-between text-sm">
                  <span>{t('settings.embedding.total', 'Total')}</span>
                  <span>{statusData.progress?.total ?? '-'}</span>
                </div>
                <div className="text-foreground mt-2 flex items-center justify-between text-sm">
                  <span>{t('settings.embedding.done', 'Done')}</span>
                  <span>{statusData.progress?.done ?? '-'}</span>
                </div>
                <div className="text-foreground mt-2 flex items-center justify-between text-sm">
                  <span>{t('settings.embedding.failed', 'Failed')}</span>
                  <span>{statusData.progress?.failed ?? '-'}</span>
                </div>
                <div className="bg-accent/40 mt-4 h-2 rounded-full">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${percentDone}%` }}
                  />
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  {t('settings.embedding.percent', '{{percent}}% completed', {
                    percent: percentDone,
                  })}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.embedding.info', 'Information')}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-3 text-sm">
          <p>
            {t(
              'settings.embedding.infoDesc',
              'Vectorization enables AI-powered recommendations in the Smart view by generating embeddings for article content.'
            )}
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              {t(
                'settings.embedding.infoLocal',
                'Sentence Transformers runs locally (no API key needed)'
              )}
            </li>
            <li>
              {t('settings.embedding.infoOpenAI', 'OpenAI requires an API key and incurs costs')}
            </li>
            <li>
              {t(
                'settings.embedding.infoRebuild',
                'Changing provider or model will trigger a full rebuild'
              )}
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
