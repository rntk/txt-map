"""Additional unit tests for lib.llm module."""

from unittest.mock import MagicMock, patch

import pytest

from lib.llm import _create_custom_llm_client, create_llm_client_from_config


def test_create_llm_client_from_config_llamacpp() -> None:
    with patch.dict("os.environ", {"LLAMACPP_URL": "http://localhost:8080"}):
        llm = create_llm_client_from_config("llamacpp", "moonshotai/Kimi-K2.5")
        assert llm.provider_key == "llamacpp"


def test_create_llm_client_from_config_openai() -> None:
    with patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test"}):
        llm = create_llm_client_from_config("openai", "gpt-5-mini")
        assert llm.provider_key == "openai"


def test_create_llm_client_from_config_anthropic() -> None:
    with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
        llm = create_llm_client_from_config("anthropic", "claude-sonnet-4-6")
        assert llm.provider_key == "anthropic"


def test_create_llm_client_from_config_no_constructor() -> None:
    with patch.dict("os.environ", {"LLAMACPP_URL": "http://localhost:8080"}):
        # Patch provider key to something unexpected
        with patch("lib.llm.PROVIDER_DEFINITION_BY_KEY") as mock_defs:
            provider = MagicMock()
            provider.key = "unknown"
            provider.display_name = "Unknown"
            provider.models = {"model-a"}
            provider.default_model = "model-a"
            mock_defs.get.return_value = provider
            with pytest.raises(RuntimeError, match="No LLM client constructor"):
                create_llm_client_from_config("unknown", "model-a")


def test_create_custom_llm_client_openai_comp() -> None:
    db = MagicMock()
    storage = MagicMock()
    storage.get_provider.return_value = {
        "_id": "abc",
        "name": "Custom",
        "type": "openai_comp",
        "model": "custom-model",
        "url": "http://custom",
        "token_encrypted": None,
    }
    with patch("lib.llm.LlmProvidersStorage", return_value=storage):
        llm = _create_custom_llm_client("abc", "custom-model", db)
        assert llm.provider_key == "custom:abc"


def test_create_custom_llm_client_openai() -> None:
    db = MagicMock()
    storage = MagicMock()
    storage.get_provider.return_value = {
        "_id": "abc",
        "name": "Custom",
        "type": "openai",
        "model": "custom-model",
        "url": None,
        "token_encrypted": "enc",
    }
    with (
        patch("lib.llm.LlmProvidersStorage", return_value=storage),
        patch("lib.llm.decrypt_token", return_value="token"),
    ):
        llm = _create_custom_llm_client("abc", "custom-model", db)
        assert llm.provider_key == "custom:abc"


def test_create_custom_llm_client_anthropic() -> None:
    db = MagicMock()
    storage = MagicMock()
    storage.get_provider.return_value = {
        "_id": "abc",
        "name": "Custom",
        "type": "anthropic",
        "model": "custom-model",
        "url": None,
        "token_encrypted": "enc",
    }
    with (
        patch("lib.llm.LlmProvidersStorage", return_value=storage),
        patch("lib.llm.decrypt_token", return_value="token"),
    ):
        llm = _create_custom_llm_client("abc", "custom-model", db)
        assert llm.provider_key == "custom:abc"


def test_create_custom_llm_client_not_found() -> None:
    db = MagicMock()
    storage = MagicMock()
    storage.get_provider.return_value = None
    with patch("lib.llm.LlmProvidersStorage", return_value=storage):
        with pytest.raises(RuntimeError, match="Custom LLM provider not found"):
            _create_custom_llm_client("abc", "model", db)


def test_create_custom_llm_client_unknown_type() -> None:
    db = MagicMock()
    storage = MagicMock()
    storage.get_provider.return_value = {
        "_id": "abc",
        "name": "Custom",
        "type": "unknown",
        "model": "custom-model",
    }
    with patch("lib.llm.LlmProvidersStorage", return_value=storage):
        with pytest.raises(RuntimeError, match="Unknown custom provider type"):
            _create_custom_llm_client("abc", "model", db)
