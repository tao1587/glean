import { useTranslation } from '@glean/i18n'
import { Loader2 } from 'lucide-react'
import { useEmbeddingConfig } from '../../hooks/useEmbeddingConfig'
import { EmbeddingConfigForm } from './sections/EmbeddingConfigForm'
import { EmbeddingStatusPanel } from './sections/EmbeddingStatusPanel'

export default function SettingsPage() {
  const { t } = useTranslation(['admin', 'common'])
  const { isLoading } = useEmbeddingConfig()

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="border-border bg-card border-b px-8 py-6">
        <div>
          <h1 className="text-foreground text-2xl font-bold">
            {t('admin:settings.embedding.title', 'Embedding Settings')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t(
              'admin:settings.embedding.subtitle',
              'Configure vectorization for AI-powered recommendations.'
            )}
          </p>
        </div>
      </div>

      <div className="flex-1 p-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <EmbeddingConfigForm />
            <EmbeddingStatusPanel />
          </div>
        )}
      </div>
    </div>
  )
}
