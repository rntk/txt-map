from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from handlers.dependencies import get_app_settings_storage
from lib.llm import get_active_llm_settings
from lib.storage.app_settings import AppSettingsStorage

router = APIRouter()


class UpdateLLMSettingsRequest(BaseModel):
    provider: str
    model: str


def _serialize_settings(storage: AppSettingsStorage) -> dict:
    active = get_active_llm_settings(db=storage.db)
    return {
        "llm_provider": active["provider"],
        "llm_model": active["model"],
        "llm_applies_on_next_task": True,
        "llm_available_providers": active["available_providers"],
    }


@router.get("/settings")
def get_settings(storage: AppSettingsStorage = Depends(get_app_settings_storage)):
    return _serialize_settings(storage)


@router.put("/settings/llm")
def update_llm_settings(
    payload: UpdateLLMSettingsRequest,
    storage: AppSettingsStorage = Depends(get_app_settings_storage),
):
    active = get_active_llm_settings(db=storage.db)
    available_providers = {
        provider["name"]: provider for provider in active["available_providers"]
    }
    provider = available_providers.get(payload.provider)
    if provider is None:
        raise HTTPException(status_code=400, detail="Selected LLM provider is not available")
    if payload.model not in provider["models"]:
        raise HTTPException(status_code=400, detail="Selected model is not allowed for this provider")

    storage.set_llm_runtime_config(provider=payload.provider, model=payload.model)
    return _serialize_settings(storage)
