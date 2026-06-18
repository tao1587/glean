import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { AlertCircle, Server } from 'lucide-react'
import { Input, Label, Alert, AlertTitle, AlertDescription } from '@glean/ui'
import { useTranslation } from '@glean/i18n'
import { ApiConfigDialog } from '../components/ApiConfigDialog'
import { OIDCLoginButton } from '../components/auth/OIDCLoginButton'
import { useThemeStore } from '../stores/themeStore'
import { DIGEST_LIGHT_VARS, DIGEST_DARK_VARS } from '../styles/digestTokens'

/**
 * Login page.
 *
 * Provides user authentication form with email and password.
 */
export default function LoginPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isLoading, error, clearError } = useAuthStore()
  const { resolvedTheme } = useThemeStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [validationError, setValidationError] = useState('')

  const fromLocation = (location.state as { from?: { pathname: string; search?: string } })?.from
  const from = fromLocation
    ? `${fromLocation.pathname}${fromLocation.search ?? ''}`
    : '/reader?tab=unread'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError('')
    clearError()

    if (!email || !password) {
      setValidationError(t('validation.required'))
      return
    }

    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch {
      // Error is handled by store
    }
  }

  const displayError = validationError || error
  const themeVars = resolvedTheme === 'dark' ? DIGEST_DARK_VARS : DIGEST_LIGHT_VARS

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{
        ...themeVars,
        background: 'var(--digest-bg)',
        color: 'var(--digest-text)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
      }}
    >
      <div className="relative z-10 w-full max-w-sm">
        {/* Logo and title */}
        <div className="mb-8 text-center">
          <div
            className="mb-3 text-5xl font-bold"
            style={{
              fontFamily: "'Noto Serif SC', Georgia, serif",
              color: 'var(--digest-text)',
              letterSpacing: '-0.02em',
            }}
          >
            <span style={{ color: 'var(--digest-accent)' }}>◆ </span>Glean
          </div>
          <p
            className="text-sm"
            style={{ color: 'var(--digest-text-tertiary)', letterSpacing: '0.06em' }}
          >
            {t('login.subtitle')}
          </p>
        </div>

        {/* Login card */}
        <div
          className="rounded-[14px] p-8"
          style={{
            background: 'var(--digest-bg-card)',
            boxShadow: 'var(--digest-shadow-lg)',
            border: '1px solid var(--digest-divider)',
          }}
        >
          <h2
            className="mb-6 text-xl font-semibold"
            style={{ color: 'var(--digest-text)', fontFamily: "'Noto Serif SC', Georgia, serif" }}
          >
            {t('login.title')}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error message */}
            {displayError && (
              <Alert variant="error">
                <AlertCircle />
                <AlertTitle>{t('errors.loginFailed')}</AlertTitle>
                <AlertDescription>{displayError}</AlertDescription>
              </Alert>
            )}

            {/* Email field */}
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-sm font-medium"
                style={{ color: 'var(--digest-text-secondary)' }}
              >
                {t('login.email')}
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={isLoading}
                className="w-full transition-all duration-200"
                style={
                  {
                    '--tw-ring-color': 'var(--digest-accent)',
                    borderColor: 'var(--digest-divider)',
                    background: 'var(--digest-bg)',
                    color: 'var(--digest-text)',
                  } as React.CSSProperties
                }
              />
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-sm font-medium"
                style={{ color: 'var(--digest-text-secondary)' }}
              >
                {t('login.password')}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.password')}
                disabled={isLoading}
                className="w-full transition-all duration-200"
                style={
                  {
                    '--tw-ring-color': 'var(--digest-accent)',
                    borderColor: 'var(--digest-divider)',
                    background: 'var(--digest-bg)',
                    color: 'var(--digest-text)',
                  } as React.CSSProperties
                }
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-[7px] py-2.5 text-sm font-semibold transition-opacity duration-150 disabled:opacity-60"
              style={{
                background: 'var(--digest-accent)',
                color: '#FFFFFF',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.85'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1'
              }}
            >
              {isLoading ? t('login.signingIn') : t('login.signIn')}
            </button>
          </form>

          {/* OAuth divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: 'var(--digest-divider)' }} />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span
                className="px-2"
                style={{
                  background: 'var(--digest-bg-card)',
                  color: 'var(--digest-text-tertiary)',
                  letterSpacing: '0.08em',
                }}
              >
                Or continue with
              </span>
            </div>
          </div>

          {/* OIDC login button */}
          <OIDCLoginButton />

          {/* Register link */}
          <div className="mt-6">
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" style={{ borderColor: 'var(--digest-divider)' }} />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span
                  className="px-2"
                  style={{
                    background: 'var(--digest-bg-card)',
                    color: 'var(--digest-text-tertiary)',
                    letterSpacing: '0.08em',
                  }}
                >
                  {t('login.noAccount')}
                </span>
              </div>
            </div>
            <div className="text-center">
              <Link
                to="/register"
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150"
                style={{ color: 'var(--digest-accent)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--digest-accent-soft)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {t('register.createAccount')}
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          {/* Server configuration - Electron only */}
          {window.electronAPI?.isElectron && (
            <div className="mt-6 flex justify-center border-t pt-6" style={{ borderColor: 'var(--digest-divider)' }}>
              <ApiConfigDialog>
                <button
                  className="inline-flex items-center gap-2 text-xs transition-colors duration-150"
                  style={{ color: 'var(--digest-text-tertiary)' }}
                >
                  <Server className="h-3.5 w-3.5" />
                  {t('config.configureServer')}
                </button>
              </ApiConfigDialog>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs" style={{ color: 'var(--digest-text-tertiary)' }}>
          Glean — Your personal knowledge sanctuary
        </p>
      </div>
    </div>
  )
}
