from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Any

from handlers.dependencies import get_app_settings_storage
from lib.llm import get_active_llm_settings
from lib.storage.app_settings import AppSettingsStorage

router = APIRouter()


class UpdateLLMSettingsRequest(BaseModel):
    provider: str
    model: str


def _serialize_settings(storage: AppSettingsStorage) -> Dict[str, Any]:
    active = get_active_llm_settings(db=storage.db)
    return {
        "llm_provider": active["provider"],
        "llm_model": active["model"],
        "llm_applies_on_next_task": True,
        "llm_available_providers": active["available_providers"],
    }


@router.get("/settings")
def get_settings(
    storage: AppSettingsStorage = Depends(get_app_settings_storage),
) -> Dict[str, Any]:
    return _serialize_settings(storage)


@router.put("/settings/llm")
def update_llm_settings(
    payload: UpdateLLMSettingsRequest,
    storage: AppSettingsStorage = Depends(get_app_settings_storage),
) -> Dict[str, Any]:
    active = get_active_llm_settings(db=storage.db)

    # Custom providers are identified by their key ("custom:..."),
    # while built-in providers are identified by display name.
    # Try matching by key first (for custom providers), then by name.
    provider = next(
        (
            p
            for p in active["available_providers"]
            if p.get("key") == payload.provider or p["name"] == payload.provider
        ),
        None,
    )

    if provider is None:
        raise HTTPException(
            status_code=400, detail="Selected LLM provider is not available"
        )
    if payload.model not in provider["models"]:
        raise HTTPException(
            status_code=400, detail="Selected model is not allowed for this provider"
        )

    # For custom providers, store the key (custom:id) as the provider identifier
    provider_identifier = payload.provider
    if provider.get("is_custom") and payload.provider == provider["name"]:
        provider_identifier = provider["key"]

    storage.set_llm_runtime_config(provider=provider_identifier, model=payload.model)
    return _serialize_settings(storage)
