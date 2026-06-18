import { useEffect, useMemo, useState } from 'react'
import type {
  EmbeddingConfigResponse,
  EmbeddingConfigUpdatePayload,
} from '../../../hooks/useEmbeddingConfig'

export const PROVIDERS = [
  { value: 'sentence-transformers', label: 'Sentence Transformers (Local)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'volc-engine', label: 'VolcEngine' },
]

export const SENTENCE_TRANSFORMER_MODELS = [
  { value: 'all-MiniLM-L6-v2', label: 'all-MiniLM-L6-v2' },
  { value: 'all-mpnet-base-v2', label: 'all-mpnet-base-v2' },
  {
    value: 'paraphrase-multilingual-MiniLM-L12-v2',
    label: 'paraphrase-multilingual-MiniLM-L12-v2',
  },
  {
    value: 'paraphrase-multilingual-mpnet-base-v2',
    label: 'paraphrase-multilingual-mpnet-base-v2',
  },
  { value: 'distiluse-base-multilingual-cased-v2', label: 'distiluse-base-multilingual-cased-v2' },
  { value: 'custom', label: 'Custom Model...' },
]

export const OPENAI_MODELS = [
  { value: 'text-embedding-3-small', label: 'text-embedding-3-small' },
  { value: 'text-embedding-3-large', label: 'text-embedding-3-large' },
  { value: 'text-embedding-ada-002', label: 'text-embedding-ada-002' },
  { value: 'custom', label: 'Custom Model...' },
]

export const DEFAULT_PROVIDER = 'sentence-transformers'
export const DEFAULT_SENTENCE_MODEL = SENTENCE_TRANSFORMER_MODELS[0]
export const DEFAULT_OPENAI_MODEL =
  OPENAI_MODELS.find((m) => m.value !== 'custom') ?? OPENAI_MODELS[0]

const INITIAL_FORM: EmbeddingConfigUpdatePayload = {
  provider: DEFAULT_PROVIDER,
  model: DEFAULT_SENTENCE_MODEL.value,
}

export function useEmbeddingForm(config: EmbeddingConfigResponse | undefined) {
  const [form, setForm] = useState<EmbeddingConfigUpdatePayload>(INITIAL_FORM)
  const [useCustomModel, setUseCustomModel] = useState(false)

  useEffect(() => {
    if (!config) return
    const provider = config.provider || DEFAULT_PROVIDER

    let baseUrl = config.base_url
    if (provider === 'volc-engine' && !baseUrl) {
      baseUrl = 'https://ark.cn-beijing.volces.com/api/v3/'
    }

    setForm({
      enabled: config.enabled,
      provider,
      model: config.model || DEFAULT_SENTENCE_MODEL.value,
      base_url: baseUrl,
      rate_limit: config.rate_limit,
    })

    if (provider === 'sentence-transformers') {
      const isPredefined = SENTENCE_TRANSFORMER_MODELS.some(
        (m) => m.value === config.model && m.value !== 'custom'
      )
      setUseCustomModel(!isPredefined)
    } else if (provider === 'openai') {
      const isPredefined = OPENAI_MODELS.some(
        (m) => m.value === config.model && m.value !== 'custom'
      )
      setUseCustomModel(!isPredefined)
    } else {
      setUseCustomModel(false)
    }
  }, [config])

  const isPredefinedModel = useMemo(() => {
    if (form.provider === 'sentence-transformers') {
      return SENTENCE_TRANSFORMER_MODELS.some((m) => m.value === form.model && m.value !== 'custom')
    }
    if (form.provider === 'openai') {
      return OPENAI_MODELS.some((m) => m.value === form.model && m.value !== 'custom')
    }
    return false
  }, [form.provider, form.model])

  const handleChange = (key: keyof EmbeddingConfigUpdatePayload, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleProviderChange = (provider: string) => {
    setUseCustomModel(false)
    if (provider === 'sentence-transformers') {
      setForm((prev) => ({
        ...prev,
        provider,
        model: DEFAULT_SENTENCE_MODEL.value,
        base_url: null,
      }))
      return
    }
    if (provider === 'openai') {
      setForm((prev) => ({ ...prev, provider, model: DEFAULT_OPENAI_MODEL.value, base_url: null }))
      return
    }
    if (provider === 'volc-engine') {
      setForm((prev) => ({
        ...prev,
        provider,
        model: '',
        base_url: 'https://ark.cn-beijing.volces.com/api/v3/',
      }))
      return
    }
    setForm((prev) => ({ ...prev, provider }))
  }

  const handleModelSelect = (modelValue: string) => {
    if (modelValue === 'custom') {
      setUseCustomModel(true)
      setForm((prev) => ({ ...prev, model: '' }))
      return
    }
    setUseCustomModel(false)
    setForm((prev) => ({ ...prev, model: modelValue }))
  }

  const handleRateLimitChange = (value: number) => {
    setForm((prev) => ({
      ...prev,
      rate_limit: {
        ...prev.rate_limit,
        default: value,
        providers: prev.rate_limit?.providers || {},
      },
    }))
  }

  const handleToggleEnabled = (checked: boolean) => {
    setForm((prev) => ({ ...prev, enabled: checked }))
  }

  return {
    form,
    useCustomModel,
    isPredefinedModel,
    handleChange,
    handleProviderChange,
    handleModelSelect,
    handleRateLimitChange,
    handleToggleEnabled,
  }
}
