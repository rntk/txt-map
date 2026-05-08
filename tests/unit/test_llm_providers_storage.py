"""Unit tests for LlmProvidersStorage."""

from datetime import datetime, UTC
from unittest.mock import MagicMock, patch

import pytest
from bson import ObjectId

from lib.storage.llm_providers import LlmProvidersStorage


@pytest.fixture
def mock_db():
    db = MagicMock()
    db.llm_providers = MagicMock()
    return db


def test_storage_init(mock_db: MagicMock) -> None:
    storage = LlmProvidersStorage(mock_db)
    assert storage.db is mock_db


def test_storage_prepare(mock_db: MagicMock) -> None:
    storage = LlmProvidersStorage(mock_db)
    storage.prepare()
    mock_db.llm_providers.create_index.assert_called_once_with("created_at")


def test_storage_prepare_swallows_exception(mock_db: MagicMock) -> None:
    mock_db.llm_providers.create_index.side_effect = RuntimeError("boom")
    storage = LlmProvidersStorage(mock_db)
    storage.prepare()


def test_list_providers(mock_db: MagicMock) -> None:
    storage = LlmProvidersStorage(mock_db)
    oid = ObjectId()
    mock_db.llm_providers.find.return_value.sort.return_value = [
        {"_id": oid, "name": "p1"},
    ]
    result = storage.list_providers()
    assert len(result) == 1
    assert result[0]["_id"] == str(oid)
    mock_db.llm_providers.find.assert_called_once_with({}, {"token_encrypted": 0})


def test_get_provider(mock_db: MagicMock) -> None:
    storage = LlmProvidersStorage(mock_db)
    oid = ObjectId()
    mock_db.llm_providers.find_one.return_value = {"_id": oid, "name": "p1"}
    result = storage.get_provider(str(oid))
    assert result is not None
    assert result["_id"] == str(oid)


def test_get_provider_invalid_id(mock_db: MagicMock) -> None:
    storage = LlmProvidersStorage(mock_db)
    assert storage.get_provider("bad-id") is None
    mock_db.llm_providers.find_one.assert_not_called()


def test_get_provider_not_found(mock_db: MagicMock) -> None:
    storage = LlmProvidersStorage(mock_db)
    mock_db.llm_providers.find_one.return_value = None
    assert storage.get_provider(str(ObjectId())) is None


@patch("lib.storage.llm_providers.datetime")
def test_create_provider(mock_dt: MagicMock, mock_db: MagicMock) -> None:
    fixed = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)
    mock_dt.now.return_value = fixed
    storage = LlmProvidersStorage(mock_db)
    oid = ObjectId()
    mock_db.llm_providers.insert_one.return_value.inserted_id = oid
    result = storage.create_provider("name", "openai", "gpt-4", "http://url", "token")
    assert result["name"] == "name"
    assert result["type"] == "openai"
    assert result["model"] == "gpt-4"
    assert result["url"] == "http://url"
    assert result["token_encrypted"] == "token"
    assert result["created_at"] == fixed
    assert result["_id"] == str(oid)


def test_delete_provider(mock_db: MagicMock) -> None:
    storage = LlmProvidersStorage(mock_db)
    mock_db.llm_providers.delete_one.return_value.deleted_count = 1
    assert storage.delete_provider(str(ObjectId())) is True


def test_delete_provider_invalid_id(mock_db: MagicMock) -> None:
    storage = LlmProvidersStorage(mock_db)
    assert storage.delete_provider("bad-id") is False
    mock_db.llm_providers.delete_one.assert_not_called()
