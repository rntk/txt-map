import json
import sys
import types
from pathlib import Path
from typing import Any

import pytest

from lib.llm.provider_config import load_remote_provider_config


def _write_config(tmp_path: Path, payload: dict[str, Any]) -> str:
    path = tmp_path / "llm-providers.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return str(path)


def test_load_remote_provider_config_derives_supported_model_ids(
    tmp_path: Path,
) -> None:
    path = _write_config(
        tmp_path,
        {
            "providers": [
                {
                    "id": "custom:abc123",
                    "name": "Remote Llama",
                    "type": "openai_comp",
                    "model": "llama-3.3",
                    "token": "secret",
                    "url": "https://llm.example/v1",
                }
            ]
        },
    )

    config = load_remote_provider_config(path)

    assert config.supported_model_ids == ["custom:abc123:llama-3.3"]


def test_load_remote_provider_config_requires_url_for_openai_compatible(
    tmp_path: Path,
) -> None:
    path = _write_config(
        tmp_path,
        {
            "providers": [
                {
                    "id": "custom:abc123",
                    "name": "Remote Llama",
                    "type": "openai_comp",
                    "model": "llama-3.3",
                    "token": "secret",
                }
            ]
        },
    )

    with pytest.raises(ValueError, match="url is required"):
        load_remote_provider_config(path)


def test_create_client_preserves_remote_provider_identity(tmp_path: Path) -> None:
    path = _write_config(
        tmp_path,
        {
            "providers": [
                {
                    "id": "custom:abc123",
                    "name": "Remote Llama",
                    "type": "openai_comp",
                    "model": "llama-3.3",
                    "token": "secret",
                    "url": "https://llm.example/v1",
                }
            ]
        },
    )
    config = load_remote_provider_config(path)

    client = config.create_client("custom:abc123", "llama-3.3")

    assert client.provider_key == "custom:abc123"
    assert client.provider_name == "Remote Llama"
    assert client.model_id == "custom:abc123:llama-3.3"


def test_create_openai_and_anthropic_clients_preserve_remote_identity(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    openai_module = types.SimpleNamespace(
        OpenAI=lambda api_key: types.SimpleNamespace(api_key=api_key)
    )
    anthropic_module = types.SimpleNamespace(
        Anthropic=lambda api_key: types.SimpleNamespace(api_key=api_key)
    )
    monkeypatch.setitem(sys.modules, "openai", openai_module)
    monkeypatch.setitem(sys.modules, "anthropic", anthropic_module)
    path = _write_config(
        tmp_path,
        {
            "providers": [
                {
                    "id": "openai-remote",
                    "name": "Remote OpenAI",
                    "type": "openai",
                    "model": "gpt-5.4",
                    "token": "secret-1",
                },
                {
                    "id": "anthropic-remote",
                    "name": "Remote Anthropic",
                    "type": "anthropic",
                    "model": "claude-haiku-4-5",
                    "token": "secret-2",
                },
            ]
        },
    )
    config = load_remote_provider_config(path)

    openai_client = config.create_client("openai-remote", "gpt-5.4")
    anthropic_client = config.create_client(
        "anthropic-remote",
        "claude-haiku-4-5",
    )

    assert openai_client.model_id == "openai-remote:gpt-5.4"
    assert anthropic_client.model_id == "anthropic-remote:claude-haiku-4-5"
