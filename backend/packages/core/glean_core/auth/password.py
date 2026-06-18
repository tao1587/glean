"""
Password hashing and verification utilities.

Uses bcrypt for secure password hashing with configurable cost factor.
"""

import bcrypt


def hash_password(password: str, rounds: int = 12) -> str:
    """
    Hash a password using bcrypt.

    Args:
        password: Plain text password to hash.
        rounds: Cost factor for bcrypt (default: 12).

    Returns:
        Hashed password string.
    """
    # Convert password to bytes
    password_bytes = password.encode("utf-8")

    # Generate salt and hash
    salt = bcrypt.gensalt(rounds=rounds)
    hashed = bcrypt.hashpw(password_bytes, salt)

    # Return as string
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against its hash.

    Args:
        plain_password: Plain text password to verify.
        hashed_password: Previously hashed password.

    Returns:
        True if password matches, False otherwise.
    """
    try:
        password_bytes = plain_password.encode("utf-8")
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception:
        return False
