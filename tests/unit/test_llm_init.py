"""Unit tests for lib.llm module."""

from unittest.mock import MagicMock, patch

import pytest

from lib.llm import (
    _get_env_model,
    _provider_available,
    create_llm_client,
    create_llm_client_from_config,
    get_active_llm_settings,
    get_active_provider_name,
    get_available_provider_definitions,
)
from llm_workers import _parse_supported_model_ids
from lib.llm.base import PROVIDER_DEFINITION_BY_KEY


def test_provider_available_llamacpp_with_env() -> None:
    with patch.dict("os.environ", {"LLAMACPP_URL": "http://localhost:8080"}):
        provider = PROVIDER_DEFINITION_BY_KEY["llamacpp"]
        assert _provider_available(provider) is True


def test_provider_available_llamacpp_without_env() -> None:
    with patch.dict("os.environ", {}, clear=True):
        provider = PROVIDER_DEFINITION_BY_KEY["llamacpp"]
        assert _provider_available(provider) is False


def test_provider_available_openai_with_env() -> None:
    with patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test"}):
        provider = PROVIDER_DEFINITION_BY_KEY["openai"]
        assert _provider_available(provider) is True


def test_provider_available_anthropic_with_env() -> None:
    with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
        provider = PROVIDER_DEFINITION_BY_KEY["anthropic"]
        assert _provider_available(provider) is True


def test_get_available_provider_definitions_empty() -> None:
    with patch.dict("os.environ", {}, clear=True):
        result = get_available_provider_definitions()
        assert result == []


def test_get_env_model_openai() -> None:
    with patch.dict("os.environ", {"OPENAI_MODEL": "gpt-4-turbo"}):
        provider = PROVIDER_DEFINITION_BY_KEY["openai"]
        assert _get_env_model(provider) == "gpt-4-turbo"


def test_get_env_model_fallback() -> None:
    with patch.dict("os.environ", {}, clear=True):
        provider = PROVIDER_DEFINITION_BY_KEY["openai"]
        assert _get_env_model(provider) == provider.default_model


def test_get_active_llm_settings_no_providers() -> None:
    with patch.dict("os.environ", {}, clear=True):
        result = get_active_llm_settings()
        assert result["provider"] == "None"
        assert result["model"] is None
        assert result["available_providers"] == []


def test_get_active_llm_settings_with_builtin_provider() -> None:
    with patch.dict("os.environ", {"LLAMACPP_URL": "http://localhost:8080"}):
        result = get_active_llm_settings()
        assert result["provider_key"] == "llamacpp"
        assert result["model"] is not None
        assert len(result["available_providers"]) >= 1


def test_get_active_llm_settings_with_runtime_config() -> None:
    with patch.dict("os.environ", {"LLAMACPP_URL": "http://localhost:8080"}):
        db = MagicMock()
        db.app_settings.find_one.return_value = {
            "provider": "LlamaCPP",
            "model": "moonshotai/Kimi-K2.5",
        }
        result = get_active_llm_settings(db=db)
        assert result["provider_key"] == "llamacpp"
        assert result["model"] == "moonshotai/Kimi-K2.5"


def test_get_active_llm_settings_with_custom_provider() -> None:
    with (
        patch.dict("os.environ", {"LLAMACPP_URL": "http://localhost:8080"}),
        patch("lib.llm.is_encryption_available", return_value=True),
    ):
        db = MagicMock()
        db.app_settings.find_one.return_value = {
            "provider": "custom:abc123",
            "model": "custom-model",
        }
        db.llm_providers.find.return_value.sort.return_value = [
            {
                "_id": "abc123",
                "name": "MyProvider",
                "model": "custom-model",
                "type": "openai_comp",
                "created_at": "now",
                "url": "http://example.com",
                "token_encrypted": "enc",
            }
        ]
        result = get_active_llm_settings(db=db)
        assert result["provider_key"] == "custom:abc123"
        assert result["model"] == "custom-model"


def test_get_active_provider_name() -> None:
    with patch.dict("os.environ", {"LLAMACPP_URL": "http://localhost:8080"}):
        assert get_active_provider_name() == "LlamaCPP"


def test_create_llm_client_no_provider() -> None:
    with patch.dict("os.environ", {}, clear=True):
        with pytest.raises(RuntimeError, match="No LLM provider configured"):
            create_llm_client()


def test_create_llm_client_from_config_unknown_provider() -> None:
    with pytest.raises(RuntimeError, match="Unknown LLM provider"):
        create_llm_client_from_config("unknown_provider", "model")


def test_create_llm_client_from_config_unsupported_model() -> None:
    with patch.dict("os.environ", {"LLAMACPP_URL": "http://localhost:8080"}):
        with pytest.raises(RuntimeError, match="is not supported"):
            create_llm_client_from_config("llamacpp", "unsupported-model")


def test_create_llm_client_from_config_custom_without_db() -> None:
    with pytest.raises(RuntimeError, match="Database connection required"):
        create_llm_client_from_config("custom:abc", "model")


def test_parse_supported_model_ids() -> None:
    assert _parse_supported_model_ids("m1,m2,m3") == ["m1", "m2", "m3"]
    assert _parse_supported_model_ids("  m1 , m2  ") == ["m1", "m2"]
    assert _parse_supported_model_ids("") is None
    assert _parse_supported_model_ids("   ") is None


def test_provider_available_unknown_key_returns_false() -> None:
    from lib.llm.base import ProviderDefinition

    fake = ProviderDefinition(
        key="unknown",
        display_name="Unknown",
        models=frozenset({"model-a"}),
        default_model="model-a",
    )
    assert _provider_available(fake) is False


def test_get_env_model_anthropic_env_var() -> None:
    with patch.dict("os.environ", {"ANTHROPIC_MODEL": "claude-opus-4"}):
        provider = PROVIDER_DEFINITION_BY_KEY["anthropic"]
        assert _get_env_model(provider) == "claude-opus-4"


def test_get_custom_providers_exception_returns_empty() -> None:
    from lib.llm import _get_custom_providers

    db = MagicMock()
    with (
        patch("lib.llm.is_encryption_available", return_value=True),
        patch("lib.llm.LlmProvidersStorage") as mock_storage_cls,
    ):
        mock_storage_cls.side_effect = RuntimeError("DB failure")
        result = _get_custom_providers(db)
        assert result == []


def test_get_active_llm_settings_runtime_config_by_key() -> None:
    """Runtime config stored by provider key instead of display name falls back correctly."""
    with patch.dict("os.environ", {"LLAMACPP_URL": "http://localhost:8080"}):
        db = MagicMock()
        db.app_settings.find_one.return_value = {
            "provider": "llamacpp",
            "model": "moonshotai/Kimi-K2.5",
        }
        result = get_active_llm_settings(db=db)
        assert result["provider_key"] == "llamacpp"
        assert result["model"] == "moonshotai/Kimi-K2.5"


def test_get_active_llm_settings_fallback_env_model_not_in_models() -> None:
    """When env model is not in provider models, fallback to default_model."""
    with patch.dict(
        "os.environ",
        {"LLAMACPP_URL": "http://localhost:8080", "OPENAI_API_KEY": "sk-test"},
    ):
        db = MagicMock()
        db.app_settings.find_one.return_value = None
        with patch("lib.llm._get_env_model", return_value="unsupported-model"):
            result = get_active_llm_settings(db=db)
            # Since _get_env_model returns unsupported, it should fall back to default_model
            provider = PROVIDER_DEFINITION_BY_KEY[result["provider_key"]]
            assert result["model"] == provider.default_model


def test_get_active_llm_settings_only_custom_providers() -> None:
    """When only custom providers exist, fallback to first custom provider."""
    with (
        patch.dict("os.environ", {}, clear=True),
        patch("lib.llm.is_encryption_available", return_value=True),
    ):
        db = MagicMock()
        db.app_settings.find_one.return_value = None
        db.llm_providers.find.return_value.sort.return_value = [
            {
                "_id": "custom1",
                "name": "MyCustom",
                "model": "custom-model",
                "type": "openai_comp",
                "created_at": "now",
                "url": "http://example.com",
                "token_encrypted": "enc",
            }
        ]
        result = get_active_llm_settings(db=db)
        assert result["provider_key"] == "custom:custom1"
        assert result["provider"] == "MyCustom"
        assert result["model"] == "custom-model"


def test_create_llm_client_success() -> None:
    with patch.dict("os.environ", {"LLAMACPP_URL": "http://localhost:8080"}):
        llm = create_llm_client()
        assert llm.provider_key == "llamacpp"
