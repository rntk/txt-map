"""Unit tests for previously uncovered handler modules."""

from datetime import datetime, UTC
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from handlers.llm_providers_handler import (
    CreateProviderRequest,
    create_provider,
    delete_provider,
    list_providers,
)
from handlers.llm_queue_handler import delete_llm_queue_entry, list_llm_queue
from handlers.task_queue_handler import (
    AddTaskRequest,
    add_task_queue_entry,
    delete_task_queue_entry,
    list_task_queue,
    repeat_task_queue_entry,
)
from handlers.tokens_handler import (
    CreateTokenRequest,
    create_token,
    delete_token,
    list_tokens,
    _generate_token,
)


# =============================================================================
# Tokens Handler
# =============================================================================


def test_generate_token() -> None:
    token = _generate_token()
    assert isinstance(token, str)
    assert len(token) > 20


def test_list_tokens() -> None:
    storage = MagicMock()
    storage.get_all_tokens.return_value = [
        {
            "_id": "id1",
            "alias": "test",
            "notes": "notes",
            "created_at": datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC),
            "created_by": "admin",
        }
    ]
    result = list_tokens(session={}, storage=storage)
    assert len(result.tokens) == 1
    assert result.tokens[0].alias == "test"


def test_create_token() -> None:
    storage = MagicMock()
    storage.create_token.return_value = {
        "alias": "mytoken",
        "notes": "",
        "created_at": datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC),
    }
    result = create_token(
        CreateTokenRequest(alias="mytoken", notes=""),
        session={"alias": "admin"},
        storage=storage,
    )
    assert result.alias == "mytoken"
    assert len(result.token) > 20


def test_delete_token() -> None:
    storage = MagicMock()
    storage.delete_token.return_value = True
    result = delete_token("id1", session={}, storage=storage)
    assert result.success is True


# =============================================================================
# Task Queue Handler
# =============================================================================


def test_list_task_queue() -> None:
    storage = MagicMock()
    storage.list.return_value = [
        {"_id": "oid1", "submission_id": "sub-1", "status": "pending"}
    ]
    result = list_task_queue(task_queue_storage=storage)
    assert len(result["tasks"]) == 1
    assert result["tasks"][0]["id"] == "oid1"


def test_list_task_queue_with_filters() -> None:
    storage = MagicMock()
    storage.list.return_value = []
    result = list_task_queue(
        submission_id="sub-1", status="pending", limit=10, task_queue_storage=storage
    )
    assert result == {"tasks": []}
    storage.list.assert_called_once_with(
        {"submission_id": "sub-1", "status": "pending"}, 10
    )


def test_list_task_queue_invalid_limit() -> None:
    storage = MagicMock()
    with pytest.raises(HTTPException, match="Limit must be positive"):
        list_task_queue(limit=0, task_queue_storage=storage)


def test_delete_task_queue_entry() -> None:
    storage = MagicMock()
    storage.delete_by_id.return_value = True
    result = delete_task_queue_entry("task-id", task_queue_storage=storage)
    assert result["deleted"] is True


def test_delete_task_queue_entry_not_found() -> None:
    storage = MagicMock()
    storage.delete_by_id.return_value = False
    with pytest.raises(HTTPException, match="Task not found"):
        delete_task_queue_entry("task-id", task_queue_storage=storage)


def test_delete_task_queue_entry_invalid_id() -> None:
    storage = MagicMock()
    storage.delete_by_id.side_effect = ValueError("Invalid")
    with pytest.raises(HTTPException, match="Invalid task ID"):
        delete_task_queue_entry("bad-id", task_queue_storage=storage)


def test_repeat_task_queue_entry() -> None:
    task_storage = MagicMock()
    task_storage.get_by_id.return_value = {
        "_id": "t1",
        "task_type": "split_topic_generation",
        "submission_id": "sub-1",
    }
    sub_storage = MagicMock()
    sub_storage.get_by_id.return_value = {"_id": "sub-1"}
    sub_storage.expand_recalculation_tasks.return_value = ["split_topic_generation"]
    task_storage.create.return_value = "new-id"

    result = repeat_task_queue_entry(
        "t1", task_queue_storage=task_storage, submissions_storage=sub_storage
    )
    assert result["requeued"] is True
    assert "split_topic_generation" in result["tasks"]


def test_repeat_task_queue_entry_not_found() -> None:
    task_storage = MagicMock()
    task_storage.get_by_id.return_value = None
    with pytest.raises(HTTPException, match="Task not found"):
        repeat_task_queue_entry(
            "t1", task_queue_storage=task_storage, submissions_storage=MagicMock()
        )


def test_repeat_task_queue_entry_invalid_id() -> None:
    task_storage = MagicMock()
    task_storage.get_by_id.side_effect = ValueError("Invalid")
    with pytest.raises(HTTPException, match="Invalid task ID"):
        repeat_task_queue_entry(
            "bad", task_queue_storage=task_storage, submissions_storage=MagicMock()
        )


def test_add_task_queue_entry() -> None:
    task_storage = MagicMock()
    sub_storage = MagicMock()
    sub_storage.get_by_id.return_value = {"_id": "sub-1"}
    sub_storage.expand_recalculation_tasks.return_value = ["split_topic_generation"]
    task_storage.create.return_value = "tid"

    result = add_task_queue_entry(
        AddTaskRequest(submission_id="sub-1", task_type="split_topic_generation"),
        task_queue_storage=task_storage,
        submissions_storage=sub_storage,
    )
    assert result["queued"] is True


def test_add_task_queue_entry_invalid_type() -> None:
    with pytest.raises(HTTPException, match="Unsupported task type"):
        add_task_queue_entry(
            AddTaskRequest(submission_id="sub-1", task_type="invalid_task"),
            task_queue_storage=MagicMock(),
            submissions_storage=MagicMock(),
        )


# =============================================================================
# LLM Queue Handler
# =============================================================================


def test_list_llm_queue() -> None:
    store = MagicMock()
    store.list.return_value = [
        {"request_id": "r1", "status": "pending", "response": "big text"}
    ]
    result = list_llm_queue(llm_queue_store=store)
    assert len(result["tasks"]) == 1
    assert "response" not in result["tasks"][0]


def test_list_llm_queue_invalid_limit() -> None:
    store = MagicMock()
    with pytest.raises(HTTPException, match="Limit must be positive"):
        list_llm_queue(limit=0, llm_queue_store=store)


def test_delete_llm_queue_entry() -> None:
    store = MagicMock()
    store.delete_by_id.return_value = True
    result = delete_llm_queue_entry("r1", llm_queue_store=store)
    assert result["deleted"] is True


def test_delete_llm_queue_entry_not_found() -> None:
    store = MagicMock()
    store.delete_by_id.return_value = False
    with pytest.raises(HTTPException, match="LLM Task not found"):
        delete_llm_queue_entry("r1", llm_queue_store=store)


# =============================================================================
# LLM Providers Handler
# =============================================================================


def test_list_providers() -> None:
    storage = MagicMock()
    storage.list_providers.return_value = [{"_id": "p1", "name": "Test"}]
    with patch(
        "handlers.llm_providers_handler.is_encryption_available", return_value=True
    ):
        result = list_providers(session={}, storage=storage)
    assert result["providers"] == [{"_id": "p1", "name": "Test"}]
    assert result["encryption_available"] is True


def test_list_providers_no_encryption() -> None:
    storage = MagicMock()
    with patch(
        "handlers.llm_providers_handler.is_encryption_available", return_value=False
    ):
        result = list_providers(session={}, storage=storage)
    assert result["providers"] == []
    assert result["encryption_available"] is False


def test_create_provider_no_encryption() -> None:
    storage = MagicMock()
    with patch(
        "handlers.llm_providers_handler.is_encryption_available", return_value=False
    ):
        with pytest.raises(HTTPException, match="environment variable is not set"):
            create_provider(
                CreateProviderRequest(name="test", type="openai", model="gpt-4"),
                session={},
                storage=storage,
            )


def test_create_provider_empty_name() -> None:
    storage = MagicMock()
    with patch(
        "handlers.llm_providers_handler.is_encryption_available", return_value=True
    ):
        with pytest.raises(HTTPException, match="Provider name is required"):
            create_provider(
                CreateProviderRequest(name="  ", type="openai", model="gpt-4"),
                session={},
                storage=storage,
            )


def test_create_provider_invalid_type() -> None:
    storage = MagicMock()
    with patch(
        "handlers.llm_providers_handler.is_encryption_available", return_value=True
    ):
        with pytest.raises(HTTPException, match="Invalid type"):
            create_provider(
                CreateProviderRequest(name="test", type="invalid", model="gpt-4"),
                session={},
                storage=storage,
            )


def test_create_provider_empty_model() -> None:
    storage = MagicMock()
    with patch(
        "handlers.llm_providers_handler.is_encryption_available", return_value=True
    ):
        with pytest.raises(HTTPException, match="Model name is required"):
            create_provider(
                CreateProviderRequest(name="test", type="openai", model="  "),
                session={},
                storage=storage,
            )


def test_create_provider_success() -> None:
    storage = MagicMock()
    storage.create_provider.return_value = {
        "_id": "p1",
        "name": "Test",
        "type": "openai",
        "model": "gpt-4",
        "url": None,
        "token_encrypted": "enc",
    }
    with (
        patch(
            "handlers.llm_providers_handler.is_encryption_available", return_value=True
        ),
        patch("handlers.llm_providers_handler.encrypt_token", return_value="encrypted"),
    ):
        result = create_provider(
            CreateProviderRequest(
                name="Test", type="openai", model="gpt-4", token="secret"
            ),
            session={},
            storage=storage,
        )
    assert result["name"] == "Test"
    assert "token_encrypted" not in result


def test_delete_provider() -> None:
    storage = MagicMock()
    storage.delete_provider.return_value = True
    result = delete_provider("p1", session={}, storage=storage)
    assert result["status"] == "deleted"


def test_delete_provider_not_found() -> None:
    storage = MagicMock()
    storage.delete_provider.return_value = False
    with pytest.raises(HTTPException, match="Provider not found"):
        delete_provider("p1", session={}, storage=storage)
