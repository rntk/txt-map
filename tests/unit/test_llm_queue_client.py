from unittest.mock import MagicMock

from lib.llm_queue.client import LLMFuture, LLMRequestError, QueuedLLMClient


def test_queued_llm_client_snapshots_stable_provider_key() -> None:
    store = MagicMock()
    store.submit.return_value = "req-1"
    client = QueuedLLMClient(
        store=store,
        model_id="custom:abc123:llama-3.3",
        max_context_tokens=128000,
        provider_key="custom:abc123",
        provider_name="Remote Llama",
        model_name="llama-3.3",
    )

    future = client.submit("hello", temperature=0.0)

    assert future.request_id == "req-1"
    store.submit.assert_called_once_with(
        prompt="hello",
        temperature=0.0,
        model_id="custom:abc123:llama-3.3",
        requested_provider="custom:abc123",
        requested_model="llama-3.3",
        requested_model_id="custom:abc123:llama-3.3",
        cache_key=None,
        cache_namespace=None,
        prompt_version=None,
    )


def test_llm_future_result_deletes_completed_entry() -> None:
    store = MagicMock()
    store.get_result.return_value = {
        "request_id": "req-1",
        "status": "completed",
        "response": "hello world",
    }

    future = LLMFuture(request_id="req-1", store=store)
    result = future.result()

    assert result == "hello world"
    store.delete_by_id.assert_called_once_with("req-1")


def test_llm_future_result_deletes_failed_entry() -> None:
    store = MagicMock()
    store.get_result.return_value = {
        "request_id": "req-1",
        "status": "failed",
        "error": "timeout",
    }

    future = LLMFuture(request_id="req-1", store=store)

    try:
        future.result()
    except LLMRequestError:
        pass

    store.delete_by_id.assert_called_once_with("req-1")


def test_llm_future_result_cached_does_not_delete() -> None:
    store = MagicMock()

    future = LLMFuture(request_id=None, store=store, cached_response="cached")
    result = future.result()

    assert result == "cached"
    store.delete_by_id.assert_not_called()


def test_llm_future_result_idempotent() -> None:
    store = MagicMock()
    store.get_result.return_value = {
        "request_id": "req-1",
        "status": "completed",
        "response": "hello",
    }

    future = LLMFuture(request_id="req-1", store=store)
    first = future.result()
    second = future.result()

    assert first == "hello"
    assert second == "hello"
    store.delete_by_id.assert_called_once_with("req-1")
