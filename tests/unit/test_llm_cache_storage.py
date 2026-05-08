"""Unit tests for MongoLLMCacheStore."""

from unittest.mock import MagicMock

import pytest
from bson import ObjectId

from lib.storage.llm_cache import MongoLLMCacheStore


@pytest.fixture
def mock_db():
    db = MagicMock()
    db.llm_cache = MagicMock()
    return db


def test_cache_store_prepare(mock_db: MagicMock) -> None:
    store = MongoLLMCacheStore(mock_db)
    store.prepare()
    assert mock_db.llm_cache.drop_index.call_count == 1
    assert mock_db.llm_cache.create_index.call_count == 3


def test_cache_store_prepare_swallows_exceptions(mock_db: MagicMock) -> None:
    mock_db.llm_cache.drop_index.side_effect = RuntimeError("boom")
    mock_db.llm_cache.create_index.side_effect = RuntimeError("boom")
    store = MongoLLMCacheStore(mock_db)
    store.prepare()  # should not raise


def test_cache_store_get_found(mock_db: MagicMock) -> None:
    store = MongoLLMCacheStore(mock_db)
    mock_db.llm_cache.find_one.return_value = {
        "key": "k1",
        "response": "r1",
        "created_at": 123.0,
        "namespace": "ns",
        "model_id": "m1",
        "prompt_version": "v1",
        "temperature": 0.5,
    }
    entry = store.get("k1")
    assert entry is not None
    assert entry.key == "k1"
    assert entry.response == "r1"
    assert entry.namespace == "ns"


def test_cache_store_get_not_found(mock_db: MagicMock) -> None:
    store = MongoLLMCacheStore(mock_db)
    mock_db.llm_cache.find_one.return_value = None
    assert store.get("missing") is None


def test_cache_store_set(mock_db: MagicMock) -> None:
    store = MongoLLMCacheStore(mock_db)
    entry = MagicMock()
    entry.key = "k1"
    entry.response = "r1"
    entry.created_at = 123.0
    entry.namespace = "ns"
    entry.model_id = "m1"
    entry.prompt_version = "v1"
    entry.temperature = 0.5
    store.set(entry)
    mock_db.llm_cache.update_one.assert_called_once()
    assert mock_db.llm_cache.update_one.call_args.args[1]["$set"]["key"] == "k1"


def test_cache_store_list_entries(mock_db: MagicMock) -> None:
    store = MongoLLMCacheStore(mock_db)
    oid = ObjectId()
    mock_db.llm_cache.find.return_value.sort.return_value.skip.return_value.limit.return_value = [
        {"_id": oid, "key": "k1", "namespace": "ns"},
    ]
    result = store.list_entries(namespace="ns", limit=10, skip=0)
    assert len(result) == 1
    assert result[0]["id"] == str(oid)
    assert "_id" not in result[0]


def test_cache_store_list_entries_no_namespace(mock_db: MagicMock) -> None:
    store = MongoLLMCacheStore(mock_db)
    mock_db.llm_cache.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
    store.list_entries()
    mock_db.llm_cache.find.assert_called_once_with({})


def test_cache_store_count_entries(mock_db: MagicMock) -> None:
    store = MongoLLMCacheStore(mock_db)
    mock_db.llm_cache.count_documents.return_value = 42
    assert store.count_entries("ns") == 42
    mock_db.llm_cache.count_documents.assert_called_once_with({"namespace": "ns"})


def test_cache_store_delete_entry_by_id(mock_db: MagicMock) -> None:
    store = MongoLLMCacheStore(mock_db)
    mock_db.llm_cache.delete_one.return_value.deleted_count = 1
    assert store.delete_entry_by_id(str(ObjectId())) is True


def test_cache_store_delete_entry_by_id_invalid(mock_db: MagicMock) -> None:
    store = MongoLLMCacheStore(mock_db)
    assert store.delete_entry_by_id("bad-id") is False


def test_cache_store_delete_by_namespace(mock_db: MagicMock) -> None:
    store = MongoLLMCacheStore(mock_db)
    mock_db.llm_cache.delete_many.return_value.deleted_count = 5
    assert store.delete_by_namespace("ns") == 5


def test_cache_store_delete_all(mock_db: MagicMock) -> None:
    store = MongoLLMCacheStore(mock_db)
    mock_db.llm_cache.delete_many.return_value.deleted_count = 10
    assert store.delete_all() == 10


def test_cache_store_get_namespaces(mock_db: MagicMock) -> None:
    store = MongoLLMCacheStore(mock_db)
    mock_db.llm_cache.distinct.return_value = ["ns1", "ns2"]
    assert store.get_namespaces() == ["ns1", "ns2"]


def test_cache_store_get_stats(mock_db: MagicMock) -> None:
    store = MongoLLMCacheStore(mock_db)
    mock_db.llm_cache.aggregate.return_value = [
        {"_id": "ns1", "count": 10},
        {"_id": "ns2", "count": 5},
    ]
    result = store.get_stats()
    assert result == [
        {"namespace": "ns1", "count": 10},
        {"namespace": "ns2", "count": 5},
    ]
