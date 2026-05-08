"""Tests for llm_workers remote backend path."""

from unittest.mock import MagicMock, patch

import pytest
import requests

from llm_workers import RemoteQueueBackend, main


def test_remote_backend_heartbeat_raises_non_409() -> None:
    with patch("llm_workers.requests.Session") as mock_session_cls:
        session = MagicMock()
        exc = requests.HTTPError("500")
        exc.response = MagicMock()
        exc.response.status_code = 500
        session.post.side_effect = exc
        mock_session_cls.return_value = session
        backend = RemoteQueueBackend("http://api", "token")
        with pytest.raises(requests.HTTPError):
            backend.heartbeat("r1", "w1", "l1")


def test_remote_backend_complete_raises_non_409() -> None:
    with patch("llm_workers.requests.Session") as mock_session_cls:
        session = MagicMock()
        exc = requests.HTTPError("500")
        exc.response = MagicMock()
        exc.response.status_code = 500
        session.post.side_effect = exc
        mock_session_cls.return_value = session
        backend = RemoteQueueBackend("http://api", "token")
        with pytest.raises(requests.HTTPError):
            backend.complete("r1", "w1", "l1", "resp", "p", "m", "mid")


def test_remote_backend_fail_raises_non_409() -> None:
    with patch("llm_workers.requests.Session") as mock_session_cls:
        session = MagicMock()
        exc = requests.HTTPError("500")
        exc.response = MagicMock()
        exc.response.status_code = 500
        session.post.side_effect = exc
        mock_session_cls.return_value = session
        backend = RemoteQueueBackend("http://api", "token")
        with pytest.raises(requests.HTTPError):
            backend.fail("r1", "w1", "l1", "error")


@patch("llm_workers.os.getenv")
@patch("llm_workers.load_remote_provider_config")
@patch("llm_workers.RemoteQueueBackend")
@patch("llm_workers.LLMWorker")
def test_main_remote_backend(
    mock_worker_cls: MagicMock,
    mock_remote_backend: MagicMock,
    mock_load_config: MagicMock,
    mock_getenv: MagicMock,
) -> None:
    env = {
        "LLM_WORKER_BACKEND": "remote",
        "LLM_WORKER_API_URL": "http://api.example.com",
        "LLM_WORKER_TOKEN": "secret-token",
        "LLM_WORKER_PROVIDER_CONFIG": "/config.json",
        "LLM_WORKER_CONCURRENCY": "1",
        "LLM_WORKER_POLL_INTERVAL": "0.1",
    }
    mock_getenv.side_effect = env.get
    mock_config = MagicMock()
    mock_config.supported_model_ids = ["model-1"]
    mock_load_config.return_value = mock_config
    mock_worker = MagicMock()
    mock_worker_cls.return_value = mock_worker

    with patch("llm_workers.signal.signal"):
        main()

    mock_load_config.assert_called_once_with("/config.json")
    mock_remote_backend.assert_called_once_with(
        "http://api.example.com", "secret-token", supported_model_ids=["model-1"]
    )
    mock_worker.run.assert_called_once()
