"""Unit tests for llm_workers module."""

from unittest.mock import MagicMock, patch

import pytest
import requests

from llm_workers import (
    LLMWorker,
    LocalLLMCacheWriter,
    LocalQueueBackend,
    RemoteQueueBackend,
    _parse_supported_model_ids,
)


class FakeLLM:
    model_id = "test-model"
    provider_key = "test-provider"
    model_name = "Test Model"

    def call(self, prompts: list[str], temperature: float = 0.0) -> str:
        return "response"


# =============================================================================
# LocalQueueBackend
# =============================================================================


def test_local_queue_backend_claim() -> None:
    store = MagicMock()
    store.claim.return_value = {"request_id": "r1"}
    backend = LocalQueueBackend(store, lease_seconds=30)
    result = backend.claim("worker-1")
    assert result == {"request_id": "r1"}
    store.claim.assert_called_once_with(
        "worker-1", worker_kind="local", lease_seconds=30, supported_model_ids=None
    )


def test_local_queue_backend_heartbeat() -> None:
    store = MagicMock()
    store.heartbeat.return_value = {"request_id": "r1"}
    backend = LocalQueueBackend(store, lease_seconds=30)
    assert backend.heartbeat("r1", "worker-1", "lease-1") is True


def test_local_queue_backend_heartbeat_none() -> None:
    store = MagicMock()
    store.heartbeat.return_value = None
    backend = LocalQueueBackend(store, lease_seconds=30)
    assert backend.heartbeat("r1", "worker-1", "lease-1") is False


def test_local_queue_backend_complete() -> None:
    store = MagicMock()
    store.complete.return_value = True
    backend = LocalQueueBackend(store, lease_seconds=30)
    assert backend.complete("r1", "w1", "l1", "resp", "p", "m", "mid") is True


def test_local_queue_backend_fail() -> None:
    store = MagicMock()
    store.fail.return_value = True
    backend = LocalQueueBackend(store, lease_seconds=30)
    assert backend.fail("r1", "w1", "l1", "error") is True


def test_local_llm_cache_writer_write() -> None:
    cache = MagicMock()
    writer = LocalLLMCacheWriter(cache)
    writer.write(
        {
            "cache_key": "key1",
            "cache_namespace": "ns1",
            "temperature": 0.5,
            "prompt_version": "v1",
        },
        "response",
        "model-1",
    )
    cache.set.assert_called_once()


def test_local_queue_backend_write_cache_no_key() -> None:
    cache = MagicMock()
    writer = LocalLLMCacheWriter(cache)
    writer.write({"temperature": 0.5}, "response", "model-1")
    cache.set.assert_not_called()


# =============================================================================
# RemoteQueueBackend
# =============================================================================


def test_remote_queue_backend_claim() -> None:
    with patch("llm_workers.requests.Session") as mock_session_cls:
        session = MagicMock()
        session.post.return_value.json.return_value = {"task": {"request_id": "r1"}}
        mock_session_cls.return_value = session
        backend = RemoteQueueBackend("http://api", "token")
        result = backend.claim("worker-1")
        assert result == {"request_id": "r1"}


def test_remote_queue_backend_claim_with_models() -> None:
    with patch("llm_workers.requests.Session") as mock_session_cls:
        session = MagicMock()
        session.post.return_value.json.return_value = {"task": None}
        mock_session_cls.return_value = session
        backend = RemoteQueueBackend("http://api", "token", supported_model_ids=["m1"])
        result = backend.claim("worker-1")
        assert result is None
        payload = session.post.call_args.kwargs["json"]
        assert payload["supported_model_ids"] == ["m1"]


def test_remote_queue_backend_heartbeat() -> None:
    with patch("llm_workers.requests.Session") as mock_session_cls:
        session = MagicMock()
        mock_session_cls.return_value = session
        backend = RemoteQueueBackend("http://api", "token")
        assert backend.heartbeat("r1", "w1", "l1") is True


def test_remote_queue_backend_heartbeat_409() -> None:
    with patch("llm_workers.requests.Session") as mock_session_cls:
        session = MagicMock()
        exc = requests.HTTPError("409")
        exc.response = MagicMock()
        exc.response.status_code = 409
        session.post.side_effect = exc
        mock_session_cls.return_value = session
        backend = RemoteQueueBackend("http://api", "token")
        assert backend.heartbeat("r1", "w1", "l1") is False


def test_remote_queue_backend_complete() -> None:
    with patch("llm_workers.requests.Session") as mock_session_cls:
        session = MagicMock()
        mock_session_cls.return_value = session
        backend = RemoteQueueBackend("http://api", "token")
        assert backend.complete("r1", "w1", "l1", "resp", "p", "m", "mid") is True


def test_remote_queue_backend_complete_409() -> None:
    with patch("llm_workers.requests.Session") as mock_session_cls:
        session = MagicMock()
        exc = requests.HTTPError("409")
        exc.response = MagicMock()
        exc.response.status_code = 409
        session.post.side_effect = exc
        mock_session_cls.return_value = session
        backend = RemoteQueueBackend("http://api", "token")
        assert backend.complete("r1", "w1", "l1", "resp", "p", "m", "mid") is False


def test_remote_queue_backend_fail() -> None:
    with patch("llm_workers.requests.Session") as mock_session_cls:
        session = MagicMock()
        mock_session_cls.return_value = session
        backend = RemoteQueueBackend("http://api", "token")
        assert backend.fail("r1", "w1", "l1", "error") is True


def test_remote_queue_backend_fail_409() -> None:
    with patch("llm_workers.requests.Session") as mock_session_cls:
        session = MagicMock()
        exc = requests.HTTPError("409")
        exc.response = MagicMock()
        exc.response.status_code = 409
        session.post.side_effect = exc
        mock_session_cls.return_value = session
        backend = RemoteQueueBackend("http://api", "token")
        assert backend.fail("r1", "w1", "l1", "error") is False


# =============================================================================
# LLMWorker
# =============================================================================


def test_llm_worker_init() -> None:
    backend = MagicMock()
    worker = LLMWorker(backend=backend, register_signal_handlers=False)
    assert worker.worker_id.startswith("llm-worker-")


def test_llm_worker_stop() -> None:
    backend = MagicMock()
    worker = LLMWorker(backend=backend, register_signal_handlers=False)
    worker.stop()
    assert worker._running is False


def test_llm_worker_handle_stop() -> None:
    backend = MagicMock()
    worker = LLMWorker(backend=backend, register_signal_handlers=False)
    worker._handle_stop(15, None)
    assert worker._running is False


def test_llm_worker_record_heartbeat() -> None:
    with patch("llm_workers.Path.touch") as mock_touch:
        backend = MagicMock()
        worker = LLMWorker(
            backend=backend, heartbeat_file="/tmp/hb", register_signal_handlers=False
        )
        worker._record_heartbeat()
        mock_touch.assert_called_once()


def test_llm_worker_get_llm_client_with_request_provider() -> None:
    backend = MagicMock()
    worker = LLMWorker(backend=backend, db=MagicMock(), register_signal_handlers=False)
    with patch("llm_workers.create_llm_client_from_config", return_value=FakeLLM()):
        llm = worker._get_llm_client(
            {"requested_provider": "openai", "requested_model": "gpt-4"}
        )
    assert llm.model_id == "test-model"


def test_llm_worker_get_llm_client_fallback() -> None:
    backend = MagicMock()
    worker = LLMWorker(backend=backend, db=MagicMock(), register_signal_handlers=False)
    with patch("llm_workers.create_llm_client", return_value=FakeLLM()):
        llm = worker._get_llm_client({})
    assert llm.model_id == "test-model"


def test_llm_worker_get_llm_client_no_db() -> None:
    backend = MagicMock()
    worker = LLMWorker(backend=backend, db=None, register_signal_handlers=False)
    with pytest.raises(RuntimeError, match="Remote worker cannot resolve"):
        worker._get_llm_client({})


def test_llm_worker_process_success() -> None:
    backend = MagicMock()
    backend.complete.return_value = True
    worker = LLMWorker(backend=backend, db=MagicMock(), register_signal_handlers=False)
    with patch.object(worker, "_get_llm_client", return_value=FakeLLM()):
        worker._process(
            {
                "request_id": "r1",
                "lease_id": "l1",
                "prompt": "hello",
                "temperature": 0.0,
            }
        )
    backend.complete.assert_called_once()


def test_llm_worker_process_fail() -> None:
    backend = MagicMock()
    backend.fail.return_value = True
    worker = LLMWorker(backend=backend, db=MagicMock(), register_signal_handlers=False)

    class BadLLM:
        def call(self, prompts: list[str], temperature: float = 0.0) -> str:
            raise RuntimeError("llm error")

    with patch.object(worker, "_get_llm_client", return_value=BadLLM()):
        worker._process(
            {
                "request_id": "r1",
                "lease_id": "l1",
                "prompt": "hello",
                "temperature": 0.0,
            }
        )
    backend.fail.assert_called_once()


def test_llm_worker_process_complete_lost_lease() -> None:
    backend = MagicMock()
    backend.complete.return_value = False
    worker = LLMWorker(backend=backend, db=MagicMock(), register_signal_handlers=False)
    with patch.object(worker, "_get_llm_client", return_value=FakeLLM()):
        worker._process(
            {
                "request_id": "r1",
                "lease_id": "l1",
                "prompt": "hello",
                "temperature": 0.0,
            }
        )
    backend.complete.assert_called_once()
    backend.fail.assert_not_called()


def test_llm_worker_process_writes_cache() -> None:
    backend = MagicMock()
    backend.complete.return_value = True
    cache_writer = MagicMock()
    worker = LLMWorker(
        backend=backend,
        db=MagicMock(),
        cache_writer=cache_writer,
        register_signal_handlers=False,
    )
    with patch.object(worker, "_get_llm_client", return_value=FakeLLM()):
        worker._process(
            {
                "request_id": "r1",
                "lease_id": "l1",
                "prompt": "hello",
                "temperature": 0.0,
                "cache_namespace": "ns1",
            }
        )
    backend.complete.assert_called_once()
    cache_writer.write.assert_called_once()


# =============================================================================
# Misc
# =============================================================================


def test_parse_supported_model_ids() -> None:
    assert _parse_supported_model_ids("m1,m2") == ["m1", "m2"]
    assert _parse_supported_model_ids("") is None
