import logging
import os
from typing import Any

from lib.llm.base import (
    LLMClient,
    PROVIDER_DEFINITION_BY_KEY,
    PROVIDER_DEFINITION_BY_NAME,
    ProviderDefinition,
)
from lib.storage.app_settings import AppSettingsStorage

logger = logging.getLogger(__name__)

_CUSTOM_PREFIX = "custom:"


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


def _get_custom_providers(db: Any) -> list[dict[str, Any]]:
    """Load custom providers from DB. Returns empty list on any failure."""
    from lib.crypto import is_encryption_available

    if not is_encryption_available():
        return []
    try:
        from lib.storage.llm_providers import LlmProvidersStorage

        storage = LlmProvidersStorage(db)
        return storage.list_providers()
    except Exception:
        logger.debug("Failed to load custom LLM providers", exc_info=True)
        return []


def get_active_llm_settings(db: Any = None) -> dict[str, Any]:
    available = get_available_provider_definitions()

    serialized_providers = [
        {
            "key": provider.key,
            "name": provider.display_name,
            "models": list(provider.models),
            "default_model": provider.default_model,
        }
        for provider in available
    ]

    # Append custom providers from DB
    custom_providers: list[dict[str, Any]] = []
    if db is not None:
        custom_providers = _get_custom_providers(db)
        for cp in custom_providers:
            serialized_providers.append(
                {
                    "key": f"{_CUSTOM_PREFIX}{cp['_id']}",
                    "name": cp["name"],
                    "models": [cp["model"]],
                    "default_model": cp["model"],
                    "is_custom": True,
                }
            )

    if not serialized_providers:
        return {
            "provider": "None",
            "model": None,
            "available_providers": [],
        }

    # Build lookup maps for resolving the active provider
    provider_by_name = {provider.display_name: provider for provider in available}
    custom_by_key = {f"{_CUSTOM_PREFIX}{cp['_id']}": cp for cp in custom_providers}

    runtime_config = None
    if db is not None:
        runtime_config = AppSettingsStorage(db).get_llm_runtime_config()

    active_provider_key: str | None = None
    active_provider_name: str | None = None
    active_model: str | None = None

    if runtime_config:
        cfg_provider = runtime_config.get("provider", "")
        cfg_model = runtime_config.get("model", "")

        if cfg_provider.startswith(_CUSTOM_PREFIX):
            # Custom provider selected
            cp = custom_by_key.get(cfg_provider)
            if cp and cfg_model == cp["model"]:
                active_provider_key = cfg_provider
                active_provider_name = cp["name"]
                active_model = cp["model"]
        else:
            # Built-in provider selected
            builtin = provider_by_name.get(cfg_provider)
            if builtin is None:
                builtin = PROVIDER_DEFINITION_BY_KEY.get(cfg_provider)
            if builtin and cfg_model in builtin.models:
                active_provider_key = builtin.key
                active_provider_name = builtin.display_name
                active_model = cfg_model

    # Fallback to first available built-in provider
    if active_provider_name is None:
        if available:
            fallback = available[0]
            active_provider_key = fallback.key
            active_provider_name = fallback.display_name
            active_model = _get_env_model(fallback)
            if active_model not in fallback.models:
                active_model = fallback.default_model
        elif serialized_providers:
            # Only custom providers exist
            first = serialized_providers[0]
            active_provider_key = first["key"]
            active_provider_name = first["name"]
            active_model = first["default_model"]
        else:
            active_provider_key = "none"
            active_provider_name = "None"
            active_model = None

    return {
        "provider_key": active_provider_key,
        "provider": active_provider_name,
        "model": active_model,
        "available_providers": serialized_providers,
    }


def get_active_provider_name(db: Any = None) -> str:
    return get_active_llm_settings(db=db)["provider"]


def _create_custom_llm_client(provider_id: str, model: str, db: Any) -> LLMClient:
    """Create an LLM client from a custom provider stored in the database."""
    from lib.crypto import decrypt_token
    from lib.storage.llm_providers import LlmProvidersStorage

    storage = LlmProvidersStorage(db)
    provider_doc = storage.get_provider(provider_id)
    if provider_doc is None:
        raise RuntimeError(f"Custom LLM provider not found: {provider_id}")

    token_encrypted = provider_doc.get("token_encrypted")
    token: str | None = decrypt_token(token_encrypted) if token_encrypted else None
    provider_type = provider_doc["type"]
    provider_key = f"{_CUSTOM_PREFIX}{provider_doc['_id']}"
    provider_name = provider_doc["name"]
    url = provider_doc.get("url") or None

    if provider_type == "openai_comp":
        from lib.llm.llamacpp import LLamaCPP

        return LLamaCPP(
            host=url or "",
            token=token,
            model=model,
            provider_name=provider_name,
            provider_key=provider_key,
            max_retries=5,
            retry_delay=2.0,
        )

    if provider_type == "openai":
        from lib.llm.openai_client import OpenAIClient

        return OpenAIClient(
            api_key=token,
            model=model,
            provider_name=provider_name,
            provider_key=provider_key,
        )

    if provider_type == "anthropic":
        from lib.llm.anthropic_client import AnthropicClient

        return AnthropicClient(
            api_key=token,
            model=model,
            provider_name=provider_name,
            provider_key=provider_key,
        )

    raise RuntimeError(f"Unknown custom provider type: {provider_type}")


def create_llm_client_from_config(
    provider_name: str, model: str, db: Any = None
) -> LLMClient:
    """Create an LLM client for an explicit provider/model snapshot."""

    # Handle custom providers
    if provider_name.startswith(_CUSTOM_PREFIX):
        provider_id = provider_name[len(_CUSTOM_PREFIX) :]
        if db is None:
            raise RuntimeError(
                "Database connection required to create client for custom provider"
            )
        return _create_custom_llm_client(provider_id, model, db)

    provider = PROVIDER_DEFINITION_BY_NAME.get(provider_name)
    if provider is None:
        provider = PROVIDER_DEFINITION_BY_KEY.get(provider_name.lower())

    if provider is None:
        raise RuntimeError(f"Unknown LLM provider: {provider_name}")

    if model not in provider.models:
        raise RuntimeError(
            f"Model {model!r} is not supported for provider {provider.display_name}"
        )

    if provider.display_name == "LlamaCPP":
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

    if provider.display_name == "OpenAI":
        from lib.llm.openai_client import OpenAIClient

        openai_key = os.getenv("OPENAI_API_KEY")
        return OpenAIClient(api_key=openai_key, model=model)

    if provider.display_name == "Anthropic":
        from lib.llm.anthropic_client import AnthropicClient

        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        return AnthropicClient(api_key=anthropic_key, model=model)

    raise RuntimeError(
        f"No LLM client constructor configured for provider {provider.display_name}"
    )


def create_llm_client(db: Any = None) -> LLMClient:
    """Factory function that resolves the active provider/model and returns the client."""
    active_settings = get_active_llm_settings(db=db)
    provider_name = active_settings.get("provider_key") or active_settings["provider"]
    model = active_settings["model"]

    if provider_name == "None" or model is None:
        raise RuntimeError(
            "No LLM provider configured. Set one of: LLAMACPP_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY"
        )

    return create_llm_client_from_config(provider_name, model, db=db)
