"""Additional unit tests for llm_workers module."""

import time
from unittest.mock import MagicMock

from llm_workers import HeartbeatLoop, LocalLLMCacheWriter


def test_heartbeat_loop_lost_lease() -> None:
    backend = MagicMock()
    backend.heartbeat.return_value = False
    loop = HeartbeatLoop(backend, "req-1", "worker-1", "lease-1", interval_seconds=0.01)
    loop.start()
    time.sleep(0.05)
    loop.stop()
    assert loop.lost_lease is True


def test_heartbeat_loop_exception() -> None:
    backend = MagicMock()
    backend.heartbeat.side_effect = RuntimeError("network error")
    loop = HeartbeatLoop(backend, "req-1", "worker-1", "lease-1", interval_seconds=0.01)
    loop.start()
    time.sleep(0.05)
    loop.stop()
    assert loop.lost_lease is False


def test_local_llm_cache_writer_skips_when_no_key() -> None:
    cache = MagicMock()
    writer = LocalLLMCacheWriter(cache)
    writer.write({"temperature": 0.5}, "response", "model")
    cache.set.assert_not_called()


def test_local_llm_cache_writer_with_namespace() -> None:
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
