"""Unit tests for llm_workers main() and related functions."""

from unittest.mock import MagicMock, patch

import pytest

from llm_workers import _parse_supported_model_ids, main


def test_parse_supported_model_ids_empty() -> None:
    assert _parse_supported_model_ids("") is None
    assert _parse_supported_model_ids("   ") is None


def test_parse_supported_model_ids_values() -> None:
    assert _parse_supported_model_ids("m1,m2") == ["m1", "m2"]


@patch("llm_workers.os.getenv")
@patch("llm_workers.MongoClient")
@patch("llm_workers.create_llm_client")
@patch("llm_workers.LLMQueueStore")
@patch("llm_workers.MongoLLMCacheStore")
@patch("llm_workers.AppSettingsStorage")
@patch("llm_workers.LLMWorker")
def test_main_local_backend(
    mock_worker_cls: MagicMock,
    mock_app_settings: MagicMock,
    mock_cache: MagicMock,
    mock_queue: MagicMock,
    mock_create_llm: MagicMock,
    mock_mongo: MagicMock,
    mock_getenv: MagicMock,
) -> None:
    env = {
        "LLM_WORKER_BACKEND": "local",
        "MONGODB_URL": "mongodb://localhost:8765/",
        "LLM_WORKER_LEASE_SECONDS": "30",
        "LLM_WORKER_CONCURRENCY": "1",
        "LLM_WORKER_POLL_INTERVAL": "0.1",
    }
    mock_getenv.side_effect = env.get
    mock_worker = MagicMock()
    mock_worker_cls.return_value = mock_worker
    mock_queue_instance = MagicMock()
    mock_queue.return_value = mock_queue_instance
    mock_queue_instance.reclaim_stale_processing.return_value = 0

    mock_worker.run = MagicMock()
    with patch("llm_workers.signal.signal"):
        main()

    mock_mongo.assert_called_once_with("mongodb://localhost:8765/")
    mock_worker_cls.assert_called_once()
    mock_worker.run.assert_called_once()


@patch("llm_workers.threading.Thread")
@patch("llm_workers.os.getenv")
@patch("llm_workers.MongoClient")
@patch("llm_workers.create_llm_client")
@patch("llm_workers.LLMQueueStore")
@patch("llm_workers.MongoLLMCacheStore")
@patch("llm_workers.AppSettingsStorage")
@patch("llm_workers.LLMWorker")
def test_main_local_backend_starts_multiple_worker_threads(
    mock_worker_cls: MagicMock,
    mock_app_settings: MagicMock,
    mock_cache: MagicMock,
    mock_queue: MagicMock,
    mock_create_llm: MagicMock,
    mock_mongo: MagicMock,
    mock_getenv: MagicMock,
    mock_thread_cls: MagicMock,
) -> None:
    env = {
        "LLM_WORKER_BACKEND": "local",
        "MONGODB_URL": "mongodb://localhost:8765/",
        "LLM_WORKER_LEASE_SECONDS": "30",
        "LLM_WORKER_CONCURRENCY": "3",
        "LLM_WORKER_POLL_INTERVAL": "0.1",
        "LLM_WORKER_ID": "worker-prefix",
    }
    mock_getenv.side_effect = env.get
    mock_queue_instance = MagicMock()
    mock_queue_instance.reclaim_stale_processing.return_value = 2
    mock_queue.return_value = mock_queue_instance
    thread_instances = [MagicMock() for _ in range(4)]
    mock_thread_cls.side_effect = thread_instances

    with patch("llm_workers.signal.signal"):
        main()

    mock_queue_instance.reclaim_stale_processing.assert_called_once_with(
        lease_seconds=30
    )
    assert mock_worker_cls.call_count == 3
    worker_ids = [call.kwargs["worker_id"] for call in mock_worker_cls.call_args_list]
    assert worker_ids == ["worker-prefix-1", "worker-prefix-2", "worker-prefix-3"]
    assert all(
        call.kwargs["register_signal_handlers"] is False
        for call in mock_worker_cls.call_args_list
    )
    assert mock_thread_cls.call_count == 4
    assert mock_thread_cls.call_args_list[0].kwargs["name"] == "llm-maintenance"
    assert mock_thread_cls.call_args_list[0].kwargs["daemon"] is True
    for thread in thread_instances:
        thread.start.assert_called_once_with()
    for thread in thread_instances:
        thread.join.assert_called_once_with()


@patch("llm_workers.threading.Thread")
@patch("llm_workers.os.getenv")
@patch("llm_workers.load_remote_provider_config")
@patch("llm_workers.RemoteQueueBackend")
@patch("llm_workers.LLMWorker")
def test_main_remote_backend_creates_backend_per_worker(
    mock_worker_cls: MagicMock,
    mock_remote_backend_cls: MagicMock,
    mock_load_config: MagicMock,
    mock_getenv: MagicMock,
    mock_thread_cls: MagicMock,
) -> None:
    env = {
        "LLM_WORKER_BACKEND": "remote",
        "LLM_WORKER_API_URL": "http://api",
        "LLM_WORKER_TOKEN": "token",
        "LLM_WORKER_PROVIDER_CONFIG": "/tmp/providers.json",
        "LLM_WORKER_CONCURRENCY": "2",
        "LLM_WORKER_ID": "remote-worker",
    }
    mock_getenv.side_effect = env.get
    config = MagicMock()
    config.supported_model_ids = ["custom:p:gpt"]
    mock_load_config.return_value = config
    backend_instances = [MagicMock(), MagicMock()]
    mock_remote_backend_cls.side_effect = backend_instances
    worker_instances = [MagicMock(), MagicMock()]
    mock_worker_cls.side_effect = worker_instances
    thread_instances = [MagicMock(), MagicMock()]
    mock_thread_cls.side_effect = thread_instances

    with patch("llm_workers.signal.signal"):
        main()

    mock_load_config.assert_called_once_with("/tmp/providers.json")
    assert mock_remote_backend_cls.call_count == 2
    worker_backends = [
        call.kwargs["backend"] for call in mock_worker_cls.call_args_list
    ]
    assert worker_backends == backend_instances
    worker_ids = [call.kwargs["worker_id"] for call in mock_worker_cls.call_args_list]
    assert worker_ids == ["remote-worker-1", "remote-worker-2"]


@patch("llm_workers.os.getenv")
def test_main_remote_backend_missing_url(mock_getenv: MagicMock) -> None:
    env = {"LLM_WORKER_BACKEND": "remote"}
    mock_getenv.side_effect = env.get
    with pytest.raises(RuntimeError, match="LLM_WORKER_API_URL"):
        main()


@patch("llm_workers.os.getenv")
def test_main_remote_backend_missing_token(mock_getenv: MagicMock) -> None:
    env = {"LLM_WORKER_BACKEND": "remote", "LLM_WORKER_API_URL": "http://api"}
    mock_getenv.side_effect = env.get
    with pytest.raises(RuntimeError, match="LLM_WORKER_TOKEN"):
        main()


@patch("llm_workers.os.getenv")
def test_main_unsupported_backend(mock_getenv: MagicMock) -> None:
    env = {"LLM_WORKER_BACKEND": "unknown"}
    mock_getenv.side_effect = env.get
    with pytest.raises(RuntimeError, match="Unsupported LLM worker backend"):
        main()
