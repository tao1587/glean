import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle, Button } from '@glean/ui'
import { AlertCircle } from 'lucide-react'
import { authService } from '@glean/api-client'
import { logger } from '@glean/logger'
import { useTranslation } from '@glean/i18n'

/**
 * OIDC login button component.
 *
 * Initiates OAuth/OIDC authentication flow by redirecting to provider.
 */
export function OIDCLoginButton() {
  const { t } = useTranslation('auth')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleOIDCLogin = async () => {
    try {
      setLoading(true)
      setErrorMessage('')

      // Get authorization URL from backend
      const { authorization_url } = await authService.getOIDCAuthUrl()

      // Redirect to OIDC provider
      window.location.href = authorization_url
    } catch (error) {
      logger.error('Failed to initiate OIDC login', { error })
      if (error instanceof Error && error.message.trim()) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage(t('errors.networkError'))
      }
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        onClick={handleOIDCLogin}
        disabled={loading}
        className="w-full"
      >
        {loading ? (
          <span>Redirecting...</span>
        ) : (
          <>
            <svg
              className="mr-2 h-5 w-5"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Generic OAuth icon */}
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
            </svg>
            <span>Sign in with SSO</span>
          </>
        )}
      </Button>
      {errorMessage && (
        <Alert variant="error">
          <AlertCircle />
          <AlertTitle>{t('errors.loginFailed')}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
