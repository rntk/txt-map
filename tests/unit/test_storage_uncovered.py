"""Unit tests for previously uncovered storage modules."""

from datetime import datetime, UTC
from unittest.mock import MagicMock, patch

import pytest
from bson import ObjectId

from lib.storage.app_settings import AppSettingsStorage
from lib.storage.task_queue import TaskQueueStorage, make_task_document
from lib.storage.tokens import TokenStorage


# =============================================================================
# AppSettingsStorage
# =============================================================================


def test_app_settings_storage_init() -> None:
    db = MagicMock()
    storage = AppSettingsStorage(db)
    assert storage.db is db
    assert storage._collection is db.app_settings


def test_app_settings_storage_prepare_creates_index() -> None:
    db = MagicMock()
    storage = AppSettingsStorage(db)
    storage.prepare()
    db.app_settings.create_index.assert_called_once_with("updated_at")


def test_app_settings_storage_prepare_swallows_exception() -> None:
    db = MagicMock()
    db.app_settings.create_index.side_effect = RuntimeError("index error")
    storage = AppSettingsStorage(db)
    storage.prepare()  # should not raise


def test_app_settings_storage_get_llm_runtime_config() -> None:
    db = MagicMock()
    expected = {"_id": "llm_runtime_config", "provider": "openai", "model": "gpt-4"}
    db.app_settings.find_one.return_value = expected
    storage = AppSettingsStorage(db)
    result = storage.get_llm_runtime_config()
    assert result == expected
    db.app_settings.find_one.assert_called_once_with({"_id": "llm_runtime_config"})


def test_app_settings_storage_get_llm_runtime_config_none() -> None:
    db = MagicMock()
    db.app_settings.find_one.return_value = None
    storage = AppSettingsStorage(db)
    assert storage.get_llm_runtime_config() is None


@patch("lib.storage.app_settings.datetime")
def test_app_settings_storage_set_llm_runtime_config(mock_dt: MagicMock) -> None:
    fixed = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)
    mock_dt.now.return_value = fixed
    db = MagicMock()
    storage = AppSettingsStorage(db)
    result = storage.set_llm_runtime_config("anthropic", "claude-3")
    db.app_settings.update_one.assert_called_once_with(
        {"_id": "llm_runtime_config"},
        {
            "$set": {
                "provider": "anthropic",
                "model": "claude-3",
                "updated_at": fixed,
            }
        },
        upsert=True,
    )
    assert result["provider"] == "anthropic"
    assert result["model"] == "claude-3"
    assert result["updated_at"] == fixed


# =============================================================================
# TaskQueueStorage
# =============================================================================


def test_make_task_document() -> None:
    with patch("lib.storage.task_queue.datetime") as mock_dt:
        fixed = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)
        mock_dt.now.return_value = fixed
        doc = make_task_document("sub-1", "summarize", priority=1)
    assert doc["submission_id"] == "sub-1"
    assert doc["task_type"] == "summarize"
    assert doc["priority"] == 1
    assert doc["status"] == "pending"
    assert doc["created_at"] == fixed
    assert doc["started_at"] is None
    assert doc["completed_at"] is None
    assert doc["worker_id"] is None
    assert doc["retry_count"] == 0
    assert doc["error"] is None


def test_task_queue_storage_list() -> None:
    db = MagicMock()
    storage = TaskQueueStorage(db)
    db.task_queue.find.return_value.sort.return_value.limit.return_value = [
        {"_id": "t1"},
        {"_id": "t2"},
    ]
    result = storage.list()
    assert len(result) == 2
    db.task_queue.find.assert_called_once_with({})


def test_task_queue_storage_list_with_filters() -> None:
    db = MagicMock()
    storage = TaskQueueStorage(db)
    db.task_queue.find.return_value.sort.return_value.limit.return_value = []
    storage.list(filters={"status": "pending"}, limit=10)
    db.task_queue.find.assert_called_once_with({"status": "pending"})


def test_task_queue_storage_get_by_id() -> None:
    db = MagicMock()
    storage = TaskQueueStorage(db)
    obj_id = ObjectId()
    db.task_queue.find_one.return_value = {"_id": obj_id}
    result = storage.get_by_id(str(obj_id))
    assert result == {"_id": obj_id}


def test_task_queue_storage_get_by_id_invalid() -> None:
    db = MagicMock()
    storage = TaskQueueStorage(db)
    with pytest.raises(ValueError, match="Invalid task ID"):
        storage.get_by_id("not-an-objectid")


def test_task_queue_storage_create() -> None:
    db = MagicMock()
    storage = TaskQueueStorage(db)
    inserted = ObjectId()
    db.task_queue.insert_one.return_value.inserted_id = inserted
    result = storage.create({"submission_id": "sub-1"})
    assert result == str(inserted)


def test_task_queue_storage_delete_by_id() -> None:
    db = MagicMock()
    storage = TaskQueueStorage(db)
    obj_id = ObjectId()
    db.task_queue.delete_one.return_value.deleted_count = 1
    assert storage.delete_by_id(str(obj_id)) is True


def test_task_queue_storage_delete_by_id_invalid() -> None:
    db = MagicMock()
    storage = TaskQueueStorage(db)
    with pytest.raises(ValueError, match="Invalid task ID"):
        storage.delete_by_id("bad-id")


def test_task_queue_storage_delete_by_submission() -> None:
    db = MagicMock()
    storage = TaskQueueStorage(db)
    db.task_queue.delete_many.return_value.deleted_count = 3
    result = storage.delete_by_submission("sub-1")
    assert result == 3


def test_task_queue_storage_delete_by_submission_with_filters() -> None:
    db = MagicMock()
    storage = TaskQueueStorage(db)
    db.task_queue.delete_many.return_value.deleted_count = 2
    result = storage.delete_by_submission(
        "sub-1", task_types=["summarize"], statuses=["pending"]
    )
    assert result == 2
    db.task_queue.delete_many.assert_called_once_with(
        {
            "submission_id": "sub-1",
            "task_type": {"$in": ["summarize"]},
            "status": {"$in": ["pending"]},
        }
    )


# =============================================================================
# TokenStorage
# =============================================================================


def test_token_storage_prepare() -> None:
    db = MagicMock()
    storage = TokenStorage(db)
    storage.prepare()
    db.tokens.create_index.assert_any_call("token_hash", unique=True)
    db.tokens.create_index.assert_any_call("created_at")


def test_token_storage_prepare_logs_warning_on_error() -> None:
    db = MagicMock()
    db.tokens.create_index.side_effect = RuntimeError("boom")
    storage = TokenStorage(db)
    storage.prepare()  # should not raise


@patch("lib.storage.tokens.datetime")
def test_token_storage_create_token(mock_dt: MagicMock) -> None:
    fixed = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)
    mock_dt.now.return_value = fixed
    db = MagicMock()
    inserted = ObjectId()
    db.tokens.insert_one.return_value.inserted_id = inserted
    storage = TokenStorage(db)
    result = storage.create_token("hash123", "test-alias", "test-notes", "admin")
    assert result["token_hash"] == "hash123"
    assert result["alias"] == "test-alias"
    assert result["notes"] == "test-notes"
    assert result["created_by"] == "admin"
    assert result["created_at"] == fixed
    assert result["_id"] == inserted


def test_token_storage_delete_token() -> None:
    db = MagicMock()
    db.tokens.delete_one.return_value.deleted_count = 1
    storage = TokenStorage(db)
    obj_id = ObjectId()
    assert storage.delete_token(str(obj_id)) is True


def test_token_storage_delete_token_invalid_id() -> None:
    db = MagicMock()
    storage = TokenStorage(db)
    assert storage.delete_token("not-an-id") is False


def test_token_storage_get_all_tokens() -> None:
    db = MagicMock()
    db.tokens.find.return_value.sort.return_value.limit.return_value = [
        {"_id": ObjectId(), "alias": "t1"},
    ]
    storage = TokenStorage(db)
    result = storage.get_all_tokens()
    assert len(result) == 1
    db.tokens.find.assert_called_once_with({}, {"token_hash": 0})


def test_token_storage_find_by_hash() -> None:
    db = MagicMock()
    db.tokens.find_one.return_value = {"token_hash": "hash123", "alias": "t1"}
    storage = TokenStorage(db)
    result = storage.find_by_hash("hash123")
    assert result == {"token_hash": "hash123", "alias": "t1"}
    db.tokens.find_one.assert_called_once_with({"token_hash": "hash123"})


def test_token_storage_find_by_hash_none() -> None:
    db = MagicMock()
    db.tokens.find_one.return_value = None
    storage = TokenStorage(db)
    assert storage.find_by_hash("missing") is None
