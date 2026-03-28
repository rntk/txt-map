import os
from typing import Any

from lib.llm.base import (
    LLMClient,
    PROVIDER_DEFINITION_BY_NAME,
    ProviderDefinition,
)
from lib.storage.app_settings import AppSettingsStorage


def _provider_available(provider: ProviderDefinition) -> bool:
    if provider.display_name == "LlamaCPP":
        return bool(os.getenv("LLAMACPP_URL"))
    if provider.display_name == "OpenAI":
        return bool(os.getenv("OPENAI_API_KEY"))
    if provider.display_name == "Anthropic":
        return bool(os.getenv("ANTHROPIC_API_KEY"))
    return False


def get_available_provider_definitions() -> list[ProviderDefinition]:
    return [
        provider
        for provider in PROVIDER_DEFINITION_BY_NAME.values()
        if _provider_available(provider)
    ]


def _get_env_model(provider: ProviderDefinition) -> str:
    if provider.display_name == "OpenAI":
        return os.getenv("OPENAI_MODEL", provider.default_model)
    if provider.display_name == "Anthropic":
        return os.getenv("ANTHROPIC_MODEL", provider.default_model)
    return provider.default_model


def get_active_llm_settings(db: Any = None) -> dict[str, Any]:
    available = get_available_provider_definitions()
    if not available:
        return {
            "provider": "None",
            "model": None,
            "available_providers": [],
        }

    provider_by_name = {provider.display_name: provider for provider in available}
    runtime_config = None
    if db is not None:
        runtime_config = AppSettingsStorage(db).get_llm_runtime_config()

    if runtime_config:
        provider_name = runtime_config.get("provider")
        model_name = runtime_config.get("model")
        provider = provider_by_name.get(provider_name)
        if provider and model_name in provider.models:
            active_provider = provider
            active_model = model_name
        else:
            active_provider = available[0]
            active_model = _get_env_model(active_provider)
    else:
        active_provider = available[0]
        active_model = _get_env_model(active_provider)

    if active_model not in active_provider.models:
        active_model = active_provider.default_model

    return {
        "provider": active_provider.display_name,
        "model": active_model,
        "available_providers": [
            {
                "key": provider.key,
                "name": provider.display_name,
                "models": list(provider.models),
                "default_model": provider.default_model,
            }
            for provider in available
        ],
    }


def get_active_provider_name(db: Any = None) -> str:
    return get_active_llm_settings(db=db)["provider"]


def create_llm_client(db: Any = None) -> LLMClient:
    """Factory function that resolves the active provider/model and returns the client."""
    active_settings = get_active_llm_settings(db=db)
    provider_name = active_settings["provider"]
    model = active_settings["model"]

    if provider_name == "LlamaCPP":
        from lib.llm.llamacpp import LLamaCPP

        token = os.getenv("TOKEN")
        llamacpp_url = os.getenv("LLAMACPP_URL")
        return LLamaCPP(
            host=llamacpp_url,
            token=token,
            model=model,
            max_retries=5,
            retry_delay=2.0,
        )

    if provider_name == "OpenAI":
        from lib.llm.openai_client import OpenAIClient

        openai_key = os.getenv("OPENAI_API_KEY")
        return OpenAIClient(api_key=openai_key, model=model)

    if provider_name == "Anthropic":
        from lib.llm.anthropic_client import AnthropicClient

        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        return AnthropicClient(api_key=anthropic_key, model=model)

    raise RuntimeError(
        "No LLM provider configured. Set one of: LLAMACPP_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY"
    )
