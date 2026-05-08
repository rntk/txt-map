"""Unit tests for llm_queue client and store."""

from unittest.mock import MagicMock, patch

import pytest

from lib.llm_queue.client import LLMFuture, LLMRequestError, QueuedLLMClient
from lib.llm_queue.store import LLMQueueStore


# =============================================================================
# LLMFuture
# =============================================================================


def test_llm_future_done_with_cached_response() -> None:
    future = LLMFuture(request_id="r1", store=None, cached_response="hello")
    assert future.done() is True
    assert future.request_id == "r1"


def test_llm_future_done_with_completed_store() -> None:
    store = MagicMock()
    store.get_result.return_value = {"status": "completed", "response": "done"}
    future = LLMFuture(request_id="r2", store=store)
    assert future.done() is True


def test_llm_future_done_with_failed_store() -> None:
    store = MagicMock()
    store.get_result.return_value = {"status": "failed", "error": "boom"}
    future = LLMFuture(request_id="r3", store=store)
    assert future.done() is True


def test_llm_future_done_with_pending_store() -> None:
    store = MagicMock()
    store.get_result.return_value = {"status": "pending"}
    future = LLMFuture(request_id="r4", store=store)
    assert future.done() is False


def test_llm_future_result_cached() -> None:
    future = LLMFuture(request_id="r1", store=None, cached_response="cached")
    assert future.result() == "cached"


def test_llm_future_result_completed() -> None:
    store = MagicMock()
    store.get_result.return_value = {"status": "completed", "response": "ok"}
    future = LLMFuture(request_id="r1", store=store, poll_interval=0.01)
    assert future.result() == "ok"
    store.delete_by_id.assert_called_once_with("r1")


def test_llm_future_result_failed() -> None:
    store = MagicMock()
    store.get_result.return_value = {"status": "failed", "error": "bad"}
    future = LLMFuture(request_id="r1", store=store, poll_interval=0.01)
    with pytest.raises(LLMRequestError, match="failed: bad"):
        future.result()
    store.delete_by_id.assert_called_once_with("r1")


def test_llm_future_result_disappeared() -> None:
    store = MagicMock()
    store.get_result.return_value = None
    future = LLMFuture(request_id="r1", store=store, poll_interval=0.01)
    with pytest.raises(LLMRequestError, match="disappeared"):
        future.result()


def test_llm_future_result_timeout() -> None:
    store = MagicMock()
    store.get_result.return_value = {"status": "pending"}
    future = LLMFuture(request_id="r1", store=store, poll_interval=0.01)
    with pytest.raises(TimeoutError, match="timed out"):
        future.result(timeout=0.05)


def test_llm_future_gather() -> None:
    f1 = LLMFuture(request_id="a", store=None, cached_response="r1")
    f2 = LLMFuture(request_id="b", store=None, cached_response="r2")
    assert LLMFuture.gather(f1, f2) == ["r1", "r2"]


# =============================================================================
# QueuedLLMClient
# =============================================================================


def test_queued_llm_client_properties() -> None:
    store = MagicMock()
    client = QueuedLLMClient(store=store, model_id="m1", max_context_tokens=4000)
    assert client.model_id == "m1"
    assert client.max_context_tokens == 4000
    assert client.estimate_tokens("abcd") == 1


def test_queued_llm_client_submit_no_cache() -> None:
    store = MagicMock()
    store.submit.return_value = "req-1"
    client = QueuedLLMClient(store=store, model_id="m1", max_context_tokens=4000)
    future = client.submit("prompt", temperature=0.5)
    assert future.request_id == "req-1"
    store.submit.assert_called_once()


def test_queued_llm_client_submit_with_cache_hit() -> None:
    store = MagicMock()
    cache_store = MagicMock()
    cache_entry = MagicMock()
    cache_entry.response = "cached!"
    cache_store.get.return_value = cache_entry

    client = QueuedLLMClient(
        store=store,
        model_id="m1",
        max_context_tokens=4000,
        cache_store=cache_store,
        namespace="ns1",
    )
    future = client.submit("prompt", temperature=0.0)
    assert future.result() == "cached!"
    store.submit.assert_not_called()


def test_queued_llm_client_submit_with_cache_miss() -> None:
    store = MagicMock()
    store.submit.return_value = "req-2"
    cache_store = MagicMock()
    cache_store.get.return_value = None

    client = QueuedLLMClient(
        store=store,
        model_id="m1",
        max_context_tokens=4000,
        cache_store=cache_store,
        namespace="ns1",
    )
    future = client.submit("prompt", temperature=0.0)
    assert future.request_id == "req-2"
    store.submit.assert_called_once()


def test_queued_llm_client_call_with_string() -> None:
    store = MagicMock()
    store.submit.return_value = "req-3"
    client = QueuedLLMClient(store=store, model_id="m1", max_context_tokens=4000)
    with patch.object(
        client,
        "submit",
        return_value=LLMFuture(request_id=None, store=None, cached_response="direct"),
    ):
        result = client.call("prompt text", temperature=0.7)
    assert result == "direct"


def test_queued_llm_client_call_with_list() -> None:
    store = MagicMock()
    client = QueuedLLMClient(store=store, model_id="m1", max_context_tokens=4000)
    with patch.object(
        client,
        "submit",
        return_value=LLMFuture(
            request_id=None, store=None, cached_response="list-direct"
        ),
    ) as mock_submit:
        result = client.call(["prompt text"], temperature=0.7)
    assert result == "list-direct"
    mock_submit.assert_called_once_with("prompt text", 0.7)


def test_queued_llm_client_with_namespace() -> None:
    store = MagicMock()
    client = QueuedLLMClient(
        store=store,
        model_id="m1",
        max_context_tokens=4000,
        namespace="old",
    )
    new_client = client.with_namespace("new", prompt_version="v2")
    assert new_client._namespace == "new"
    assert new_client._prompt_version == "v2"
    assert new_client._model_id == "m1"


# =============================================================================
# LLMQueueStore
# =============================================================================


@pytest.fixture
def mock_db() -> object:
    col = MagicMock()

    class FakeDB:
        llm_queue = col

        def __getitem__(self, key):
            return col if key == "llm_queue" else MagicMock()

    return FakeDB()


def test_queue_store_prepare(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    store.prepare()
    assert mock_db.llm_queue.create_index.call_count == 4


def test_queue_store_prepare_swallows_exceptions(mock_db: MagicMock) -> None:
    mock_db.llm_queue.create_index.side_effect = RuntimeError("boom")
    store = LLMQueueStore(mock_db)
    store.prepare()  # should not raise


def test_queue_store_submit(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.insert_one.return_value.inserted_id = "oid"
    req_id = store.submit("prompt", 0.5, model_id="m1")
    assert isinstance(req_id, str)
    mock_db.llm_queue.insert_one.assert_called_once()
    doc = mock_db.llm_queue.insert_one.call_args.args[0]
    assert doc["prompt"] == "prompt"
    assert doc["temperature"] == 0.5
    assert doc["status"] == "pending"


def test_queue_store_claim(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.find_one_and_update.return_value = {"request_id": "r1"}
    result = store.claim("worker-1", lease_seconds=30)
    assert result == {"request_id": "r1"}
    query = mock_db.llm_queue.find_one_and_update.call_args.args[0]
    update = mock_db.llm_queue.find_one_and_update.call_args.args[1]
    assert query == {"status": "pending"}
    assert update["$set"]["status"] == "processing"
    assert update["$set"]["worker_id"] == "worker-1"
    assert update["$set"]["worker_kind"] == "local"
    assert update["$set"]["lease_id"]
    assert update["$set"]["error"] is None


def test_queue_store_claim_with_model_filter(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    store.claim("worker-1", supported_model_ids=["m1"], include_legacy_model_ids=False)
    query = mock_db.llm_queue.find_one_and_update.call_args.args[0]
    assert query["requested_model_id"]["$in"] == ["m1"]


def test_queue_store_claim_with_legacy_model_filter(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    store.claim("worker-1", supported_model_ids=["m1"])
    query = mock_db.llm_queue.find_one_and_update.call_args.args[0]
    assert query["$or"] == [
        {"requested_model_id": {"$in": ["m1"]}},
        {"requested_model_id": {"$exists": False}, "model_id": {"$in": ["m1"]}},
    ]


def test_queue_store_heartbeat(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.find_one_and_update.return_value = {"request_id": "r1"}
    result = store.heartbeat("r1", "worker-1", "lease-1")
    assert result == {"request_id": "r1"}
    query = mock_db.llm_queue.find_one_and_update.call_args.args[0]
    update = mock_db.llm_queue.find_one_and_update.call_args.args[1]
    assert query == {
        "request_id": "r1",
        "status": "processing",
        "worker_id": "worker-1",
        "lease_id": "lease-1",
    }
    assert "lease_expires_at" in update["$set"]
    assert "last_heartbeat_at" in update["$set"]


def test_queue_store_complete(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.update_one.return_value.modified_count = 1
    assert store.complete("r1", "response") is True


def test_queue_store_complete_with_lease(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.update_one.return_value.modified_count = 1
    assert (
        store.complete(
            "r1",
            "response",
            worker_id="w1",
            lease_id="l1",
            executed_provider="openai",
            executed_model="GPT",
            executed_model_id="openai:gpt",
        )
        is True
    )
    query = mock_db.llm_queue.update_one.call_args.args[0]
    update = mock_db.llm_queue.update_one.call_args.args[1]
    assert query["worker_id"] == "w1"
    assert query["lease_id"] == "l1"
    assert query["status"] == "processing"
    assert update["$set"]["status"] == "completed"
    assert update["$set"]["response"] == "response"
    assert update["$set"]["executed_provider"] == "openai"
    assert update["$set"]["executed_model"] == "GPT"
    assert update["$set"]["executed_model_id"] == "openai:gpt"


def test_queue_store_fail(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.update_one.return_value.modified_count = 1
    assert store.fail("r1", "error") is True


def test_queue_store_get_result(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.find_one.return_value = {"request_id": "r1"}
    assert store.get_result("r1") == {"request_id": "r1"}


def test_queue_store_get_results(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.find.return_value = [
        {"request_id": "r1"},
        {"request_id": "r2"},
    ]
    results = store.get_results(["r1", "r2", "r3"])
    assert results[0] == {"request_id": "r1"}
    assert results[1] == {"request_id": "r2"}
    assert results[2] is None


def test_queue_store_list(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.find.return_value.sort.return_value.limit.return_value = [
        {"request_id": "r1"}
    ]
    assert store.list() == [{"request_id": "r1"}]


def test_queue_store_delete_by_id(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.delete_one.return_value.deleted_count = 1
    assert store.delete_by_id("r1") is True


def test_queue_store_delete_by_ids(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.delete_many.return_value.deleted_count = 2
    assert store.delete_by_ids(["r1", "r2"]) == 2


def test_queue_store_delete_by_ids_empty(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    assert store.delete_by_ids([]) == 0
    mock_db.llm_queue.delete_many.assert_not_called()


def test_queue_store_reclaim_stale(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.update_many.return_value.modified_count = 5
    assert store.reclaim_stale_processing(10) == 5


def test_queue_store_reclaim_stale_with_lease_seconds(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.update_many.return_value.modified_count = 3
    assert store.reclaim_stale_processing(10, lease_seconds=30) == 3


def test_queue_store_cleanup_old(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.delete_many.return_value.deleted_count = 4
    assert store.cleanup_old(24) == 4


def test_queue_store_cleanup_old_with_statuses(mock_db: MagicMock) -> None:
    store = LLMQueueStore(mock_db)
    mock_db.llm_queue.delete_many.return_value.deleted_count = 2
    assert store.cleanup_old(12, statuses=["completed"]) == 2
