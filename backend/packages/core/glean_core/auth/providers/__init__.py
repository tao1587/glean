"""
Authentication providers package.

This package provides authentication provider implementations for different auth methods.
"""

from .auth_factory import AuthProviderFactory
from .base import AuthProvider, AuthResult
from .local_provider import LocalAuthProvider
from .oidc_provider import OIDCProvider

__all__ = [
    "AuthProvider",
    "AuthResult",
    "AuthProviderFactory",
    "LocalAuthProvider",
    "OIDCProvider",
]
