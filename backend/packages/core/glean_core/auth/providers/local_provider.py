"""
Local password-based authentication provider.

This module implements password-based authentication for local user accounts.
"""

from typing import Any

from glean_core.auth.password import hash_password, verify_password

from .base import AuthProvider, AuthResult


class LocalAuthProvider(AuthProvider):
    """
    Local password-based authentication provider.

    Authenticates users with email and password stored in the database.
    """

    async def authenticate(self, credentials: dict[str, Any]) -> AuthResult:
        """
        Authenticate with email and password.

        Args:
            credentials: Dictionary containing 'email' and 'password'.

        Returns:
            AuthResult with user information and password in metadata for verification.

        Raises:
            ValueError: If email or password is missing.
        """
        email = credentials.get("email")
        password = credentials.get("password")

        if not email or not password:
            raise ValueError("Email and password are required")

        # Return auth result with password in metadata for service-layer verification
        # The actual password verification happens in AuthService after fetching user from DB
        return {
            "user_info": {"email": email},
            "provider_user_id": email,
            "email": email,
            "name": None,
            "username": None,
            "phone": None,
            "avatar_url": None,
            "metadata": {"password": password},  # For verification in service
        }

    async def validate_config(self) -> bool:
        """
        Validate local provider configuration.

        Local provider has no external dependencies, so always valid.

        Returns:
            True always.
        """
        return True

    def get_authorization_url(
        self,
        state: str,
        redirect_uri: str,
        nonce: str | None = None,
        code_challenge: str | None = None,
    ) -> str | None:
        """
        Get OAuth authorization URL.

        Local provider does not use OAuth, so returns None.

        Args:
            state: CSRF protection state parameter (unused).
            redirect_uri: OAuth callback URL (unused).
            nonce: Nonce for replay attack prevention (unused).
            code_challenge: PKCE challenge (unused).

        Returns:
            None (not an OAuth provider).
        """
        return None

    @property
    def supports_registration(self) -> bool:
        """
        Whether local provider supports registration.

        Returns:
            True (local provider supports user registration).
        """
        return True

    def verify_password_hash(self, plain: str, hashed: str) -> bool:
        """
        Verify password against hash.

        Args:
            plain: Plain text password.
            hashed: Hashed password from database.

        Returns:
            True if password matches, False otherwise.
        """
        return verify_password(plain, hashed)

    def hash_password_for_storage(self, password: str) -> str:
        """
        Hash password for storage.

        Args:
            password: Plain text password.

        Returns:
            Hashed password string.
        """
        return hash_password(password)
