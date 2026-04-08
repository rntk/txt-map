"""Authentication handler for token-based access."""

import hashlib
import hmac
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from handlers.dependencies import get_token_storage
from lib.storage.tokens import TokenStorage

router = APIRouter()

# Configuration from environment
SUPER_TOKEN = os.getenv("SUPER_TOKEN", "")
# SESSION_SECRET must be set independently from SUPER_TOKEN.
# If not set, we generate a random one (sessions will invalidate on restart).
SESSION_SECRET = os.getenv("SESSION_SECRET") or secrets.token_hex(32)
SESSION_COOKIE_NAME = "session_token"
SESSION_MAX_AGE = 86400 * 7  # 7 days


class LoginRequest(BaseModel):
    token: str


class AuthStatusResponse(BaseModel):
    authenticated: bool
    is_superuser: bool
    alias: str | None = None


class AuthConfigResponse(BaseModel):
    enabled: bool
    is_superuser: bool = False


def _hash_token(token: str) -> str:
    """Hash a token using SHA256."""
    return hashlib.sha256(token.encode()).hexdigest()


def _constant_time_compare(a: str, b: str) -> bool:
    """Compare two strings in constant time to prevent timing attacks."""
    return hmac.compare_digest(a.encode(), b.encode())


def _create_session_token(is_superuser: bool, alias: str | None = None) -> str:
    """Create a signed session token."""
    import json
    import base64

    now = datetime.now(UTC)
    expires = now + timedelta(seconds=SESSION_MAX_AGE)

    payload = {
        "type": "superuser" if is_superuser else "user",
        "alias": alias,
        "exp": expires.isoformat(),
        "iat": now.isoformat(),
        "nonce": secrets.token_hex(8),
    }

    payload_bytes = json.dumps(payload, separators=(",", ":")).encode()
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode().rstrip("=")

    signature = hmac.new(
        SESSION_SECRET.encode(), payload_b64.encode(), hashlib.sha256
    ).hexdigest()

    return f"{payload_b64}.{signature}"


def _verify_session_token(token: str) -> dict[str, Any] | None:
    """Verify a session token and return payload if valid."""
    import json
    import base64

    try:
        if "." not in token:
            return None

        payload_b64, signature = token.rsplit(".", 1)

        # Verify signature
        expected_sig = hmac.new(
            SESSION_SECRET.encode(), payload_b64.encode(), hashlib.sha256
        ).hexdigest()

        if not _constant_time_compare(signature, expected_sig):
            return None

        # Decode payload
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding

        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        payload = json.loads(payload_bytes)

        # Check expiration
        exp = datetime.fromisoformat(payload["exp"])
        if datetime.now(UTC) > exp:
            return None

        return payload
    except Exception:
        return None


def _get_session_from_cookie(request: Request) -> dict[str, Any] | None:
    """Get and verify session from cookie."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None
    return _verify_session_token(token)


def get_current_session(
    request: Request,
    storage: TokenStorage | None = None,
) -> dict[str, Any] | None:
    """Get current session from cookie or Authorization header.

    Supports both session tokens and user tokens (for API access).
    """
    # First check cookie
    session = _get_session_from_cookie(request)
    if session:
        return session

    # Then check Authorization header
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]

        # Try to verify as session token first
        session = _verify_session_token(token)
        if session:
            return session

        # If not a session token, try to verify as user token
        if storage and SUPER_TOKEN:
            token_hash = _hash_token(token)
            user_token = storage.find_by_hash(token_hash)
            if user_token:
                return {
                    "type": "user",
                    "alias": user_token.get("alias"),
                }

    return None


def require_auth(
    request: Request,
    storage: TokenStorage = Depends(get_token_storage),
) -> dict[str, Any]:
    """Dependency that requires authentication."""
    # If no super token configured, allow all (skip auth)
    if not SUPER_TOKEN:
        return {"type": "anonymous", "alias": None}

    session = get_current_session(request, storage)
    if not session:
        raise HTTPException(status_code=401, detail="Authentication required")

    return session


def require_superuser(request: Request) -> dict[str, Any]:
    """Dependency that requires superuser authentication."""
    session = require_auth(request)

    if session.get("type") != "superuser":
        raise HTTPException(status_code=403, detail="Superuser access required")

    return session


def is_authenticated(
    request: Request,
    storage: TokenStorage = Depends(get_token_storage),
) -> bool:
    """Check if request is authenticated."""
    if not SUPER_TOKEN:
        return True
    return get_current_session(request, storage) is not None


@router.post("/auth/login")
def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    storage: TokenStorage = Depends(get_token_storage),
) -> dict[str, Any]:
    """Authenticate with a token and set session cookie."""
    if not SUPER_TOKEN:
        # Auth is disabled
        return {"success": True, "is_superuser": False}

    # Check if it's the super token
    if _constant_time_compare(body.token, SUPER_TOKEN):
        session_token = _create_session_token(is_superuser=True)
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=session_token,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
            max_age=SESSION_MAX_AGE,
        )
        return {"success": True, "is_superuser": True, "session_token": session_token}

    # Check against user tokens in database
    token_hash = _hash_token(body.token)
    user_token = storage.find_by_hash(token_hash)

    if user_token:
        session_token = _create_session_token(
            is_superuser=False, alias=user_token.get("alias")
        )
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=session_token,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
            max_age=SESSION_MAX_AGE,
        )
        return {
            "success": True,
            "is_superuser": False,
            "alias": user_token.get("alias"),
            "session_token": session_token,
        }

    raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/auth/logout")
def logout(response: Response) -> dict[str, Any]:
    """Clear session cookie."""
    response.delete_cookie(key=SESSION_COOKIE_NAME)
    return {"success": True}


@router.get("/auth/verify")
def verify(
    request: Request,
    storage: TokenStorage = Depends(get_token_storage),
) -> AuthStatusResponse:
    """Check if current session is valid."""
    if not SUPER_TOKEN:
        return AuthStatusResponse(authenticated=True, is_superuser=False)

    session = get_current_session(request, storage)
    if not session:
        return AuthStatusResponse(authenticated=False, is_superuser=False)

    return AuthStatusResponse(
        authenticated=True,
        is_superuser=session.get("type") == "superuser",
        alias=session.get("alias"),
    )


@router.get("/auth/config")
def config(
    request: Request,
    storage: TokenStorage = Depends(get_token_storage),
) -> AuthConfigResponse:
    """Get auth configuration."""
    is_enabled = bool(SUPER_TOKEN)

    if not is_enabled:
        return AuthConfigResponse(enabled=False)

    session = get_current_session(request, storage)
    is_superuser = session is not None and session.get("type") == "superuser"

    return AuthConfigResponse(enabled=True, is_superuser=is_superuser)
