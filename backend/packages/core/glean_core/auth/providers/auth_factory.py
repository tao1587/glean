"""
Authentication provider factory.

This module provides a factory for creating and registering authentication providers.
"""

from typing import Any

from .base import AuthProvider
from .local_provider import LocalAuthProvider
from .oidc_provider import OIDCProvider


class AuthProviderFactory:
    """
    Factory for creating authentication providers.

    Supports provider registration and instantiation.
    """

    _PROVIDERS: dict[str, type[AuthProvider]] = {
        "local": LocalAuthProvider,
        "oidc": OIDCProvider,  # Generic OIDC provider for any compliant IdP
    }

    @classmethod
    def create(cls, provider_id: str, config: dict[str, Any] | None = None) -> AuthProvider:
        """
        Create authentication provider instance.

        Args:
            provider_id: Provider identifier (e.g., 'local', 'oidc').
            config: Provider-specific configuration (optional).

        Returns:
            Instantiated authentication provider.

        Raises:
            ValueError: If provider_id is unknown.
        """
        provider_class = cls._PROVIDERS.get(provider_id.lower())

        if provider_class is None:
            available = ", ".join(cls._PROVIDERS.keys())
            raise ValueError(f"Unknown provider: {provider_id}. Available: {available}")

        return provider_class(provider_id, config or {})

    @classmethod
    def register_provider(cls, provider_id: str, provider_class: type[AuthProvider]) -> None:
        """
        Register custom authentication provider.

        Args:
            provider_id: Unique provider identifier.
            provider_class: Provider class (must inherit from AuthProvider).
        """
        cls._PROVIDERS[provider_id.lower()] = provider_class

    @classmethod
    def list_providers(cls) -> list[str]:
        """
        List all registered providers.

        Returns:
            List of provider identifiers.
        """
        return list(cls._PROVIDERS.keys())
