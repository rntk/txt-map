from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from handlers.auth_handler import require_superuser
from handlers.dependencies import get_llm_providers_storage
from lib.crypto import encrypt_token, is_encryption_available
from lib.storage.llm_providers import VALID_TYPES, LlmProvidersStorage

router = APIRouter()


class CreateProviderRequest(BaseModel):
    name: str
    type: str
    model: str
    url: str | None = None
    token: str | None = None


@router.get("/llm-providers")
def list_providers(
    session: dict[str, Any] = Depends(require_superuser),
    storage: LlmProvidersStorage = Depends(get_llm_providers_storage),
) -> dict[str, Any]:
    encryption_available = is_encryption_available()
    providers = storage.list_providers() if encryption_available else []
    return {
        "providers": providers,
        "encryption_available": encryption_available,
    }


@router.post("/llm-providers")
def create_provider(
    payload: CreateProviderRequest,
    session: dict[str, Any] = Depends(require_superuser),
    storage: LlmProvidersStorage = Depends(get_llm_providers_storage),
) -> dict[str, Any]:
    if not is_encryption_available():
        raise HTTPException(
            status_code=503,
            detail="LLM_PROVIDERS_SECRET environment variable is not set. "
            "Cannot store provider tokens without encryption.",
        )

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Provider name is required")

    if payload.type not in VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type. Must be one of: {', '.join(VALID_TYPES)}",
        )

    model = payload.model.strip()
    if not model:
        raise HTTPException(status_code=400, detail="Model name is required")

    token = payload.token.strip() if payload.token else None
    url = payload.url.strip() if payload.url else None

    token_encrypted = encrypt_token(token) if token else None
    doc = storage.create_provider(
        name=name,
        provider_type=payload.type,
        model=model,
        url=url,
        token_encrypted=token_encrypted,
    )
    # Don't return encrypted token
    doc.pop("token_encrypted", None)
    return doc


@router.delete("/llm-providers/{provider_id}")
def delete_provider(
    provider_id: str,
    session: dict[str, Any] = Depends(require_superuser),
    storage: LlmProvidersStorage = Depends(get_llm_providers_storage),
) -> dict[str, str]:
    deleted = storage.delete_provider(provider_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Provider not found")
    return {"status": "deleted"}
