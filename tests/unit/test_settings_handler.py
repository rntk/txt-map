import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch


@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("MONGODB_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("LLAMACPP_URL", "http://localhost:8080")
    with patch("lifespan.MongoClient"):
        yield


@pytest.fixture
def app():
    from main import app
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def mock_settings_storage():
    storage = MagicMock()
    storage.db = MagicMock()
    return storage


@pytest.fixture(autouse=True)
def setup_overrides(app, mock_settings_storage):
    from handlers.dependencies import get_app_settings_storage

    app.dependency_overrides[get_app_settings_storage] = lambda: mock_settings_storage
    yield
    app.dependency_overrides = {}


def test_get_settings_returns_active_llm_state(client, mock_settings_storage):
    payload = {
        "provider": "OpenAI",
        "model": "gpt-5-mini",
        "available_providers": [
            {
                "key": "openai",
                "name": "OpenAI",
                "models": ["gpt-4o", "gpt-5-mini"],
                "default_model": "gpt-4o",
            }
        ],
    }

    with patch("handlers.settings_handler.get_active_llm_settings", return_value=payload):
        response = client.get("/api/settings")

    assert response.status_code == 200
    assert response.json()["llm_provider"] == "OpenAI"
    assert response.json()["llm_model"] == "gpt-5-mini"
    assert response.json()["llm_available_providers"][0]["name"] == "OpenAI"


def test_put_settings_updates_runtime_config(client, mock_settings_storage):
    with patch(
        "handlers.settings_handler.get_active_llm_settings",
        side_effect=[
            {
                "provider": "OpenAI",
                "model": "gpt-4o",
                "available_providers": [
                    {
                        "key": "openai",
                        "name": "OpenAI",
                        "models": ["gpt-4o", "gpt-5-mini"],
                        "default_model": "gpt-4o",
                    }
                ],
            },
            {
                "provider": "OpenAI",
                "model": "gpt-5-mini",
                "available_providers": [
                    {
                        "key": "openai",
                        "name": "OpenAI",
                        "models": ["gpt-4o", "gpt-5-mini"],
                        "default_model": "gpt-4o",
                    }
                ],
            },
        ],
    ):
        response = client.put(
            "/api/settings/llm",
            json={"provider": "OpenAI", "model": "gpt-5-mini"},
        )

    assert response.status_code == 200
    mock_settings_storage.set_llm_runtime_config.assert_called_once_with(
        provider="OpenAI",
        model="gpt-5-mini",
    )
    assert response.json()["llm_model"] == "gpt-5-mini"


def test_put_settings_rejects_unavailable_provider(client):
    with patch(
        "handlers.settings_handler.get_active_llm_settings",
        return_value={
            "provider": "LlamaCPP",
            "model": "moonshotai/Kimi-K2.5",
            "available_providers": [
                {
                    "key": "llamacpp",
                    "name": "LlamaCPP",
                    "models": ["moonshotai/Kimi-K2.5"],
                    "default_model": "moonshotai/Kimi-K2.5",
                }
            ],
        },
    ):
        response = client.put(
            "/api/settings/llm",
            json={"provider": "OpenAI", "model": "gpt-5-mini"},
        )

    assert response.status_code == 400
    assert "not available" in response.json()["detail"]


def test_put_settings_rejects_model_not_in_allowlist(client):
    with patch(
        "handlers.settings_handler.get_active_llm_settings",
        return_value={
            "provider": "OpenAI",
            "model": "gpt-4o",
            "available_providers": [
                {
                    "key": "openai",
                    "name": "OpenAI",
                    "models": ["gpt-4o"],
                    "default_model": "gpt-4o",
                }
            ],
        },
    ):
        response = client.put(
            "/api/settings/llm",
            json={"provider": "OpenAI", "model": "gpt-5-mini"},
        )

    assert response.status_code == 400
    assert "not allowed" in response.json()["detail"]
