import os
import time
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Tuple
import bcrypt
import jwt

# Secret key for JWT signing - reads from environment variable, with fallback for development
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "lifeline-ai-super-secret-jwt-key-2026-production-ready")
JWT_ALGORITHM = "HS256"
DEFAULT_EXPIRE_MINUTES = 60 * 24  # 24 hours
REMEMBER_ME_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# In-memory brute-force rate limiter: tracks {ip_or_email: [timestamps]}
_failed_attempts: Dict[str, list] = {}
RATE_LIMIT_MAX_ATTEMPTS = 5
RATE_LIMIT_WINDOW_SECONDS = 300  # 5 minutes window


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with salt."""
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> Tuple[str, int]:
    """
    Generate a signed JWT token with claims and expiration.
    Returns (token_string, expires_in_seconds).
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
        expires_seconds = int(expires_delta.total_seconds())
    else:
        expire = datetime.utcnow() + timedelta(minutes=DEFAULT_EXPIRE_MINUTES)
        expires_seconds = DEFAULT_EXPIRE_MINUTES * 60

    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow()
    })
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt, expires_seconds


def decode_access_token(token: str) -> Optional[dict]:
    """
    Decode and validate a JWT access token.
    Returns payload dict if valid, None if invalid or expired.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except (jwt.PyJWTError, Exception):
        return None


def check_rate_limit(key: str) -> Tuple[bool, int]:
    """
    Check if a key (e.g., client IP or email) has exceeded failed attempt rate limit.
    Returns (is_allowed, seconds_remaining).
    """
    now = time.time()
    attempts = _failed_attempts.get(key, [])
    # Filter attempts within current window
    valid_attempts = [t for t in attempts if now - t < RATE_LIMIT_WINDOW_SECONDS]
    _failed_attempts[key] = valid_attempts

    if len(valid_attempts) >= RATE_LIMIT_MAX_ATTEMPTS:
        oldest_attempt = min(valid_attempts)
        seconds_remaining = int(RATE_LIMIT_WINDOW_SECONDS - (now - oldest_attempt))
        return False, max(1, seconds_remaining)

    return True, 0


def record_login_failure(key: str):
    """Record a failed login attempt for brute force mitigation."""
    now = time.time()
    attempts = _failed_attempts.get(key, [])
    attempts.append(now)
    _failed_attempts[key] = attempts


def reset_login_failures(key: str):
    """Clear failed attempts upon successful authentication."""
    if key in _failed_attempts:
        del _failed_attempts[key]


def generate_reset_token() -> str:
    """Generate a cryptographically secure, random URL-safe token for password resets."""
    return secrets.token_urlsafe(32)
