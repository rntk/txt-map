from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


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
def mock_llm_queue_store():
    return MagicMock()


@pytest.fixture
def mock_cache_store():
    return MagicMock()


@pytest.fixture(autouse=True)
def setup_overrides(app, mock_llm_queue_store, mock_cache_store):
    from handlers.dependencies import get_cache_store, get_llm_queue_store

    app.dependency_overrides[get_llm_queue_store] = lambda: mock_llm_queue_store
    app.dependency_overrides[get_cache_store] = lambda: mock_cache_store
    yield
    app.dependency_overrides = {}


def test_claim_returns_claimed_task(client, mock_llm_queue_store):
    mock_llm_queue_store.claim.return_value = {
        "request_id": "req-1",
        "lease_id": "lease-1",
        "lease_expires_at": datetime(2026, 4, 14, tzinfo=UTC),
        "prompt": "hello",
        "temperature": 0.2,
        "requested_provider": "OpenAI",
        "requested_model": "gpt-5.4",
        "requested_model_id": "openai:gpt-5.4",
        "cache_namespace": "summarization:openai:gpt-5.4",
        "prompt_version": "v1",
    }

    response = client.post(
        "/api/llm-workers/claim",
        json={"worker_id": "remote-1", "supported_model_ids": ["openai:gpt-5.4"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["task"]["request_id"] == "req-1"
    mock_llm_queue_store.claim.assert_called_once_with(
        "remote-1",
        worker_kind="remote",
        lease_seconds=60,
        supported_model_ids=["openai:gpt-5.4"],
        include_legacy_model_ids=False,
    )


def test_claim_without_supported_models_returns_no_task(client, mock_llm_queue_store):
    response = client.post(
        "/api/llm-workers/claim",
        json={"worker_id": "remote-1"},
    )

    assert response.status_code == 200
    assert response.json() == {"task": None}
    mock_llm_queue_store.claim.assert_not_called()


def test_complete_rejects_mismatched_model(client, mock_llm_queue_store):
    mock_llm_queue_store.get_result.return_value = {
        "request_id": "req-1",
        "requested_provider": "OpenAI",
        "requested_model": "gpt-5.4",
        "requested_model_id": "openai:gpt-5.4",
    }

    response = client.post(
        "/api/llm-workers/tasks/req-1/complete",
        json={
            "worker_id": "remote-1",
            "lease_id": "lease-1",
            "response": "done",
            "executed_provider": "OpenAI",
            "executed_model": "gpt-5.4-mini",
        },
    )

    assert response.status_code == 409
    mock_llm_queue_store.complete.assert_not_called()


def test_complete_writes_cache_after_success(
    client, mock_llm_queue_store, mock_cache_store
):
    mock_llm_queue_store.get_result.return_value = {
        "request_id": "req-1",
        "requested_provider": "OpenAI",
        "requested_model": "gpt-5.4",
        "requested_model_id": "openai:gpt-5.4",
        "cache_key": "cache-1",
        "cache_namespace": "summarization:openai:gpt-5.4",
        "prompt_version": "v1",
        "temperature": 0.0,
    }
    mock_llm_queue_store.complete.return_value = True

    response = client.post(
        "/api/llm-workers/tasks/req-1/complete",
        json={
            "worker_id": "remote-1",
            "lease_id": "lease-1",
            "response": "done",
            "executed_provider": "OpenAI",
            "executed_model": "gpt-5.4",
            "executed_model_id": "openai:gpt-5.4",
        },
    )

    assert response.status_code == 200
    mock_llm_queue_store.complete.assert_called_once()
    mock_cache_store.set.assert_called_once()


def test_heartbeat_rejects_stale_lease(client, mock_llm_queue_store):
    mock_llm_queue_store.get_result.return_value = {"request_id": "req-1"}
    mock_llm_queue_store.heartbeat.return_value = None

    response = client.post(
        "/api/llm-workers/tasks/req-1/heartbeat",
        json={"worker_id": "remote-1", "lease_id": "lease-1"},
    )

    assert response.status_code == 409


def test_claim_returns_none_when_no_task_available(client, mock_llm_queue_store):
    mock_llm_queue_store.claim.return_value = None

    response = client.post(
        "/api/llm-workers/claim",
        json={"worker_id": "remote-1", "supported_model_ids": ["openai:gpt-5.4"]},
    )

    assert response.status_code == 200
    assert response.json() == {"task": None}


def test_heartbeat_success(client, mock_llm_queue_store):
    from datetime import UTC, datetime

    mock_llm_queue_store.get_result.return_value = {"request_id": "req-1"}
    mock_llm_queue_store.heartbeat.return_value = {
        "lease_expires_at": datetime(2026, 4, 14, tzinfo=UTC),
    }

    response = client.post(
        "/api/llm-workers/tasks/req-1/heartbeat",
        json={"worker_id": "remote-1", "lease_id": "lease-1"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert "lease_expires_at" in body


def test_complete_rejects_stale_lease(client, mock_llm_queue_store):
    mock_llm_queue_store.get_result.return_value = {
        "request_id": "req-1",
        "requested_provider": "OpenAI",
        "requested_model": "gpt-5.4",
        "requested_model_id": "openai:gpt-5.4",
    }
    mock_llm_queue_store.complete.return_value = False

    response = client.post(
        "/api/llm-workers/tasks/req-1/complete",
        json={
            "worker_id": "remote-1",
            "lease_id": "lease-1",
            "response": "done",
            "executed_provider": "OpenAI",
            "executed_model": "gpt-5.4",
            "executed_model_id": "openai:gpt-5.4",
        },
    )

    assert response.status_code == 409


def test_complete_without_cache_key_skips_cache_write(
    client, mock_llm_queue_store, mock_cache_store
):
    mock_llm_queue_store.get_result.return_value = {
        "request_id": "req-1",
        "requested_provider": "OpenAI",
        "requested_model": "gpt-5.4",
        "requested_model_id": "openai:gpt-5.4",
        "cache_key": None,
    }
    mock_llm_queue_store.complete.return_value = True

    response = client.post(
        "/api/llm-workers/tasks/req-1/complete",
        json={
            "worker_id": "remote-1",
            "lease_id": "lease-1",
            "response": "done",
            "executed_provider": "OpenAI",
            "executed_model": "gpt-5.4",
            "executed_model_id": "openai:gpt-5.4",
        },
    )

    assert response.status_code == 200
    mock_cache_store.set.assert_not_called()


def test_complete_rejects_mismatched_provider_no_model_id(client, mock_llm_queue_store):
    mock_llm_queue_store.get_result.return_value = {
        "request_id": "req-1",
        "requested_provider": "OpenAI",
        "requested_model": "gpt-5.4",
        "requested_model_id": None,
    }

    response = client.post(
        "/api/llm-workers/tasks/req-1/complete",
        json={
            "worker_id": "remote-1",
            "lease_id": "lease-1",
            "response": "done",
            "executed_provider": "Anthropic",
            "executed_model": "gpt-5.4",
        },
    )

    assert response.status_code == 409
    assert "provider" in response.json()["detail"].lower()


def test_complete_rejects_mismatched_model_no_model_id(client, mock_llm_queue_store):
    mock_llm_queue_store.get_result.return_value = {
        "request_id": "req-1",
        "requested_provider": "OpenAI",
        "requested_model": "gpt-5.4",
        "requested_model_id": None,
    }

    response = client.post(
        "/api/llm-workers/tasks/req-1/complete",
        json={
            "worker_id": "remote-1",
            "lease_id": "lease-1",
            "response": "done",
            "executed_provider": "OpenAI",
            "executed_model": "gpt-5.4-mini",
        },
    )

    assert response.status_code == 409
    assert "model" in response.json()["detail"].lower()


def test_fail_rejects_stale_lease(client, mock_llm_queue_store):
    mock_llm_queue_store.get_result.return_value = {"request_id": "req-1"}
    mock_llm_queue_store.fail.return_value = False

    response = client.post(
        "/api/llm-workers/tasks/req-1/fail",
        json={"worker_id": "remote-1", "lease_id": "lease-1", "error": "boom"},
    )

    assert response.status_code == 409


def test_fail_success(client, mock_llm_queue_store):
    mock_llm_queue_store.get_result.return_value = {"request_id": "req-1"}
    mock_llm_queue_store.fail.return_value = True

    response = client.post(
        "/api/llm-workers/tasks/req-1/fail",
        json={"worker_id": "remote-1", "lease_id": "lease-1", "error": "boom"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["request_id"] == "req-1"


def test_require_task_not_found(client, mock_llm_queue_store):
    mock_llm_queue_store.get_result.return_value = None

    response = client.post(
        "/api/llm-workers/tasks/req-1/complete",
        json={
            "worker_id": "remote-1",
            "lease_id": "lease-1",
            "response": "done",
            "executed_provider": "OpenAI",
            "executed_model": "gpt-5.4",
        },
    )

    assert response.status_code == 404


def test_serialize_claimed_task_missing_lease_expires_at():
    from handlers.llm_worker_handler import _serialize_claimed_task

    with pytest.raises(ValueError, match="lease_expires_at"):
        _serialize_claimed_task(
            {"request_id": "req-1", "prompt": "hi", "temperature": 0.0}
        )
