"""
MCP API Token authentication.

Provides token verification for MCP server authentication using Glean API tokens.
"""

from mcp.server.auth.provider import AccessToken, TokenVerifier

from glean_core import get_logger
from glean_database.session import get_session_context

logger = get_logger(__name__)


class APITokenVerifier(TokenVerifier):
    """
    Verify API tokens for MCP authentication.

    Uses Glean's API token system for authentication instead of JWT.
    """

    async def verify_token(self, token: str) -> AccessToken | None:
        """
        Verify an API token and return access information.

        Args:
            token: The bearer token from the Authorization header.

        Returns:
            AccessToken if valid, None otherwise.
        """
        # Import here to avoid circular imports
        from glean_core.services import APITokenService

        try:
            async with get_session_context() as session:
                service = APITokenService(session)
                api_token = await service.verify_token(token)

                if not api_token:
                    logger.debug("MCP token verification failed: invalid token")
                    return None

                # Update last used timestamp
                await service.update_last_used(api_token.id)

                logger.debug(
                    "MCP token verified successfully",
                    extra={"user_id": api_token.user_id, "token_prefix": api_token.token_prefix},
                )

                # Return access token with user scope
                return AccessToken(
                    token=token,
                    client_id="glean-mcp",
                    scopes=[f"user:{api_token.user_id}"],
                    expires_at=int(api_token.expires_at.timestamp())
                    if api_token.expires_at
                    else None,
                )

        except Exception:
            logger.exception("MCP token verification error")
            return None


def extract_user_id_from_scopes(scopes: list[str]) -> str | None:
    """
    Extract user ID from access token scopes.

    Args:
        scopes: List of scopes from the access token.

    Returns:
        User ID if found, None otherwise.
    """
    for scope in scopes:
        if scope.startswith("user:"):
            return scope[5:]  # Remove "user:" prefix
    return None
