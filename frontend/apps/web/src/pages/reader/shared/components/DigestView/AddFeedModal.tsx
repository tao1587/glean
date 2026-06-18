import { useState, useRef } from 'react'
import { X, Loader2, CheckCircle } from 'lucide-react'
import { useTranslation } from '@glean/i18n'
import { useDiscoverFeed } from '../../../../../hooks/useSubscriptions'

interface AddFeedModalProps {
  open: boolean
  onClose: () => void
}

type FeedMode = 'url' | 'rsshub'

export function AddFeedModal({ open, onClose }: AddFeedModalProps) {
  const { t } = useTranslation('digest')
  const [mode, setMode] = useState<FeedMode>('url')
  const [url, setUrl] = useState('')
  const [rsshubPath, setRsshubPath] = useState('')
  const [success, setSuccess] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { mutate: discoverFeed, isPending, error, reset } = useDiscoverFeed()

  const activeValue = mode === 'url' ? url : rsshubPath
  const activeTrimmed = activeValue.trim()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeTrimmed) return

    const payload =
      mode === 'url' ? { url: activeTrimmed } : { rsshub_path: activeTrimmed }

    discoverFeed(payload, {
      onSuccess: () => {
        setSuccess(true)
        setTimeout(() => {
          setUrl('')
          setRsshubPath('')
          setSuccess(false)
          reset()
          onClose()
        }, 1500)
      },
    })
  }

  const handleClose = () => {
    setUrl('')
    setRsshubPath('')
    setSuccess(false)
    reset()
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        className="w-full max-w-[calc(100vw-32px)] rounded-[14px] p-7 sm:max-w-[500px]"
        style={{ background: 'var(--digest-bg-card, #FFFFFF)', boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="mb-1 flex items-start justify-between">
          <h2
            className="text-xl font-bold"
            style={{
              fontFamily: "'Noto Serif SC', Georgia, serif",
              color: 'var(--digest-text, #1A1A1A)',
            }}
          >
            {t('addFeed.title')}
          </h2>
          <button
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
            style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-[13px]" style={{ color: 'var(--digest-text-secondary, #5E5A52)' }}>
          {mode === 'url' ? t('addFeed.description') : t('addFeed.rsshubDescription')}
        </p>

        {/* Mode tabs */}
        <div
          className="mb-3 inline-flex gap-0.5 rounded-md p-0.5"
          style={{ background: 'var(--digest-bg-hover, #F1EDE2)' }}
        >
          {(['url', 'rsshub'] as FeedMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className="rounded px-3 py-1 text-[12px] transition-all"
              style={
                mode === m
                  ? {
                      background: 'var(--digest-bg-card, #FFFFFF)',
                      color: 'var(--digest-text, #1A1A1A)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                    }
                  : { color: 'var(--digest-text-secondary, #5E5A52)' }
              }
            >
              {m === 'url' ? t('addFeed.modeUrl') : t('addFeed.modeRsshub')}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'url' ? (
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/feed"
              autoFocus
              className="w-full rounded-lg px-3.5 py-3 text-[14px] outline-none transition-colors"
              style={{
                background: 'var(--digest-bg, #FAF8F3)',
                border: '1px solid var(--digest-divider, #E5E0D2)',
                color: 'var(--digest-text, #1A1A1A)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--digest-accent, #B8312F)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--digest-divider, #E5E0D2)'
              }}
            />
          ) : (
            <input
              key="rsshub"
              type="text"
              value={rsshubPath}
              onChange={(e) => setRsshubPath(e.target.value)}
              placeholder="/bilibili/user/dynamic/946974"
              autoFocus
              className="w-full rounded-lg px-3.5 py-3 font-mono text-[13px] outline-none transition-colors"
              style={{
                background: 'var(--digest-bg, #FAF8F3)',
                border: '1px solid var(--digest-divider, #E5E0D2)',
                color: 'var(--digest-text, #1A1A1A)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--digest-accent, #B8312F)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--digest-divider, #E5E0D2)'
              }}
            />
          )}

          {error && (
            <p className="mt-2 text-[12px]" style={{ color: 'var(--digest-accent, #B8312F)' }}>
              {(error as Error).message || t('addFeed.errorFallback')}
            </p>
          )}

          {success && (
            <div className="mt-2 flex items-center gap-1.5 text-[12px] text-green-600">
              <CheckCircle className="h-3.5 w-3.5" />
              {t('addFeed.success')}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg px-4 py-2 text-[13px] transition-colors"
              style={{
                border: '1px solid var(--digest-divider, #E5E0D2)',
                color: 'var(--digest-text, #1A1A1A)',
              }}
            >
              {t('addFeed.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending || !activeTrimmed}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium transition-opacity disabled:opacity-50"
              style={{
                background: 'var(--digest-text, #1A1A1A)',
                color: 'var(--digest-bg, #FAF8F3)',
              }}
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isPending ? t('addFeed.submitting') : t('addFeed.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
