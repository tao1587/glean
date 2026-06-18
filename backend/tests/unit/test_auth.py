"""Unit tests for authentication module."""

from datetime import UTC, datetime

import pytest

from glean_core.auth.jwt import (
    JWTConfig,
    create_access_token,
    create_refresh_token,
    verify_token,
)
from glean_core.auth.password import hash_password, verify_password


class TestPasswordHashing:
    """Test password hashing functions."""

    def test_hash_password_creates_hash(self):
        """Test that hash_password creates a hash."""
        password = "TestPassword123"
        hashed = hash_password(password)

        assert hashed != password
        assert len(hashed) > 0
        assert hashed.startswith("$2b$")  # bcrypt identifier

    def test_hash_password_different_hashes(self):
        """Test that same password produces different hashes (salt)."""
        password = "TestPassword123"
        hash1 = hash_password(password)
        hash2 = hash_password(password)

        assert hash1 != hash2

    def test_verify_password_correct(self):
        """Test verifying correct password."""
        password = "TestPassword123"
        hashed = hash_password(password)

        assert verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        """Test verifying incorrect password."""
        password = "TestPassword123"
        hashed = hash_password(password)

        assert verify_password("WrongPassword", hashed) is False

    def test_verify_password_empty(self):
        """Test verifying empty password."""
        hashed = hash_password("TestPassword123")

        assert verify_password("", hashed) is False


class TestJWTTokens:
    """Test JWT token creation and verification."""

    @pytest.fixture
    def jwt_config(self):
        """Create JWT config for testing."""
        return JWTConfig(
            secret_key="test_secret_key_12345678901234567890123456789012",
            algorithm="HS256",
            access_token_expire_minutes=15,
            refresh_token_expire_days=7,
        )

    def test_create_access_token(self, jwt_config):
        """Test creating access token."""
        user_id = "test-user-id"
        token = create_access_token(user_id, jwt_config)

        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0

    def test_create_refresh_token(self, jwt_config):
        """Test creating refresh token."""
        user_id = "test-user-id"
        token = create_refresh_token(user_id, jwt_config)

        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0

    def test_verify_access_token(self, jwt_config):
        """Test verifying access token."""
        user_id = "test-user-id"
        token = create_access_token(user_id, jwt_config)

        token_data = verify_token(token, jwt_config)

        assert token_data is not None
        assert token_data.sub == user_id
        assert token_data.type == "access"

    def test_verify_refresh_token(self, jwt_config):
        """Test verifying refresh token."""
        user_id = "test-user-id"
        token = create_refresh_token(user_id, jwt_config)

        token_data = verify_token(token, jwt_config)

        assert token_data is not None
        assert token_data.sub == user_id
        assert token_data.type == "refresh"

    def test_verify_invalid_token(self, jwt_config):
        """Test verifying invalid token."""
        token_data = verify_token("invalid.token.here", jwt_config)

        assert token_data is None

    def test_verify_tampered_token(self, jwt_config):
        """Test verifying tampered token."""
        user_id = "test-user-id"
        token = create_access_token(user_id, jwt_config)

        # Tamper with the token
        tampered_token = token + "tampered"

        token_data = verify_token(tampered_token, jwt_config)

        assert token_data is None

    def test_token_contains_expiration(self, jwt_config):
        """Test that token contains expiration."""
        user_id = "test-user-id"
        token = create_access_token(user_id, jwt_config)

        token_data = verify_token(token, jwt_config)

        assert token_data is not None
        assert token_data.exp > 0

        # Check expiration is in the future
        now = datetime.now(UTC)
        exp_time = datetime.fromtimestamp(token_data.exp, tz=UTC)
        assert exp_time > now

    def test_token_contains_issued_at(self, jwt_config):
        """Test that token contains issued at timestamp."""
        user_id = "test-user-id"
        token = create_access_token(user_id, jwt_config)

        token_data = verify_token(token, jwt_config)

        assert token_data is not None
        assert token_data.iat > 0

        # Check issued at is in the past or present
        now = datetime.now(UTC)
        iat_time = datetime.fromtimestamp(token_data.iat, tz=UTC)
        assert iat_time <= now

    def test_verify_with_wrong_secret(self):
        """Test verifying token with wrong secret."""
        config1 = JWTConfig(secret_key="secret1" + "0" * 24)
        config2 = JWTConfig(secret_key="secret2" + "0" * 24)

        token = create_access_token("user-id", config1)
        token_data = verify_token(token, config2)

        assert token_data is None
