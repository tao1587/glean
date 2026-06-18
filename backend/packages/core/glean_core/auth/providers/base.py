"""
Base authentication provider interface.

This module defines the abstract base class for all authentication providers.
"""

from abc import ABC, abstractmethod
from typing import Any, NotRequired, TypedDict


class AuthResult(TypedDict):
    """Standard authentication result returned by all providers."""

    user_info: dict[str, Any]
    provider_user_id: str
    email: str | None  # Email can be None for OAuth providers without email scope
    name: str | None
    username: NotRequired[str | None]  # Username (e.g., preferred_username from OIDC)
    phone: NotRequired[str | None]  # Phone number (e.g., phone_number from OIDC)
    avatar_url: str | None
    metadata: dict[str, Any]


class AuthProvider(ABC):
    """
    Abstract base class for authentication providers.

    All authentication providers (local, OIDC, OAuth) must implement this interface.
    """

    def __init__(self, provider_id: str, config: dict[str, Any]) -> None:
        """
        Initialize authentication provider.

        Args:
            provider_id: Unique provider identifier (e.g., 'local', 'oidc', 'google').
            config: Provider-specific configuration dictionary.
        """
        self.provider_id = provider_id
        self.config = config

    @abstractmethod
    async def authenticate(self, credentials: dict[str, Any]) -> AuthResult:
        """
        Authenticate user with provider-specific credentials.

        Args:
            credentials: Provider-specific credentials (e.g., email/password, OAuth code).

        Returns:
            AuthResult containing user information and metadata.

        Raises:
            ValueError: If credentials are invalid or authentication fails.
        """
        pass

    @abstractmethod
    async def validate_config(self) -> bool:
        """
        Validate provider configuration.

        Returns:
            True if configuration is valid.

        Raises:
            ValueError: If configuration is invalid.
        """
        pass

    async def prepare(self) -> None:
        """
        Prepare provider state before synchronous authorization URL generation.

        OAuth/OIDC providers can override this to preload discovery metadata.
        """
        return None

    @abstractmethod
    def get_authorization_url(
        self,
        state: str,
        redirect_uri: str,
        nonce: str | None = None,
        code_challenge: str | None = None,
    ) -> str | None:
        """
        Get OAuth authorization URL (None for non-OAuth providers).

        Note: For OIDC, caller must ensure _get_oidc_config() was called first
        to populate _oidc_config. This is a sync method for convenience.

        Args:
            state: CSRF protection state parameter.
            redirect_uri: OAuth callback URL.
            nonce: Nonce for replay attack prevention (required for OIDC).
            code_challenge: PKCE challenge (required for OIDC authorization code flow).

        Returns:
            Authorization URL for OAuth providers, None for non-OAuth providers.
        """
        pass

    @property
    def supports_registration(self) -> bool:
        """
        Whether this provider supports new user registration.

        Returns:
            True if provider supports registration, False otherwise.
        """
        return False
