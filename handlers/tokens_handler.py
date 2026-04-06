"""Token management handler for superusers."""

import hashlib
import secrets
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from handlers.auth_handler import require_superuser
from handlers.dependencies import get_token_storage
from lib.storage.tokens import TokenStorage

router = APIRouter()

TOKEN_LENGTH = 32


class CreateTokenRequest(BaseModel):
    alias: str
    notes: str = ""


class CreateTokenResponse(BaseModel):
    token: str
    alias: str
    notes: str
    created_at: str


class TokenResponse(BaseModel):
    id: str
    alias: str
    notes: str
    created_at: str
    created_by: str


class TokenListResponse(BaseModel):
    tokens: list[TokenResponse]


class DeleteTokenResponse(BaseModel):
    success: bool


def _generate_token(length: int = TOKEN_LENGTH) -> str:
    """Generate a secure random token."""
    # Use token_urlsafe and return the full output for maximum entropy.
    # token_urlsafe(32) produces ~43 base64url chars (256 bits of entropy).
    return secrets.token_urlsafe(length)


@router.get("/tokens")
def list_tokens(
    session: dict[str, Any] = Depends(require_superuser),
    storage: TokenStorage = Depends(get_token_storage),
) -> TokenListResponse:
    """List all user tokens (without hashes)."""
    tokens = storage.get_all_tokens()

    return TokenListResponse(
        tokens=[
            TokenResponse(
                id=str(t["_id"]),
                alias=t.get("alias", ""),
                notes=t.get("notes", ""),
                created_at=t["created_at"].isoformat() if "created_at" in t else "",
                created_by=t.get("created_by", ""),
            )
            for t in tokens
        ]
    )


@router.post("/tokens")
def create_token(
    body: CreateTokenRequest,
    session: dict[str, Any] = Depends(require_superuser),
    storage: TokenStorage = Depends(get_token_storage),
) -> CreateTokenResponse:
    """Create a new user token. Returns plaintext token (shown only once)."""
    plaintext_token = _generate_token()
    token_hash = hashlib.sha256(plaintext_token.encode()).hexdigest()

    created_by = session.get("alias") or "superuser"

    result = storage.create_token(
        token_hash=token_hash,
        alias=body.alias,
        notes=body.notes,
        created_by=created_by,
    )

    return CreateTokenResponse(
        token=plaintext_token,
        alias=result["alias"],
        notes=result["notes"],
        created_at=result["created_at"].isoformat(),
    )


@router.delete("/tokens/{token_id}")
def delete_token(
    token_id: str,
    session: dict[str, Any] = Depends(require_superuser),
    storage: TokenStorage = Depends(get_token_storage),
) -> DeleteTokenResponse:
    """Delete a user token."""
    success = storage.delete_token(token_id)
    return DeleteTokenResponse(success=success)
