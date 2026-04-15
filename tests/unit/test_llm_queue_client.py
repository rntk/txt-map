from unittest.mock import MagicMock

from lib.llm_queue.client import QueuedLLMClient


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
