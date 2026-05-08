"""Unit tests for CanvasEventsStorage."""

from datetime import datetime, UTC
from unittest.mock import MagicMock, patch

import pytest
from bson import ObjectId

from lib.storage.canvas_events import CanvasEventsStorage


@pytest.fixture
def mock_db():
    db = MagicMock()
    db.canvas_events = MagicMock()
    db.canvas_events_counters = MagicMock()
    return db


def test_canvas_events_init(mock_db: MagicMock) -> None:
    storage = CanvasEventsStorage(mock_db)
    assert storage._db is mock_db
    assert storage._log.name == "canvas_events"


def test_canvas_events_prepare(mock_db: MagicMock) -> None:
    mock_db.canvas_events.index_information.return_value = {}
    storage = CanvasEventsStorage(mock_db)
    storage.prepare()
    assert mock_db.canvas_events.create_index.call_count >= 2


def test_canvas_events_prepare_handles_existing_non_unique_index(
    mock_db: MagicMock,
) -> None:
    mock_db.canvas_events.index_information.return_value = {
        "article_id_1_seq_1": {"key": [("article_id", 1), ("seq", 1)], "unique": False}
    }
    storage = CanvasEventsStorage(mock_db)
    storage.prepare()
    mock_db.canvas_events.drop_index.assert_called_once_with("article_id_1_seq_1")


def test_canvas_events_prepare_logs_warning_on_index_error(
    mock_db: MagicMock,
) -> None:
    mock_db.canvas_events.index_information.return_value = {}
    mock_db.canvas_events.create_index.side_effect = RuntimeError("boom")
    storage = CanvasEventsStorage(mock_db)
    storage.prepare()  # should not raise


def test_canvas_events_prepare_backfill_counters(mock_db: MagicMock) -> None:
    mock_db.canvas_events.index_information.return_value = {}
    mock_db.canvas_events.aggregate.return_value = [
        {"_id": "article-1", "max_seq": 5},
        {"_id": "article-2", "max_seq": 10},
    ]
    storage = CanvasEventsStorage(mock_db)
    storage.prepare()
    assert mock_db.canvas_events_counters.update_one.call_count == 2


def test_canvas_events_prepare_backfill_skips_if_max_seq_none(
    mock_db: MagicMock,
) -> None:
    mock_db.canvas_events.index_information.return_value = {}
    mock_db.canvas_events.aggregate.return_value = [
        {"_id": "article-1", "max_seq": None},
    ]
    storage = CanvasEventsStorage(mock_db)
    storage.prepare()
    mock_db.canvas_events_counters.update_one.assert_not_called()


def test_canvas_events_prepare_backfill_handles_error(mock_db: MagicMock) -> None:
    mock_db.canvas_events.index_information.return_value = {}
    mock_db.canvas_events.aggregate.side_effect = RuntimeError("aggregate error")
    storage = CanvasEventsStorage(mock_db)
    storage.prepare()  # should not raise


def test_canvas_events_next_seq(mock_db: MagicMock) -> None:
    mock_db.canvas_events_counters.find_one_and_update.return_value = {"seq": 1}
    storage = CanvasEventsStorage(mock_db)
    result = storage._next_seq("article-1")
    assert result == 1
    mock_db.canvas_events_counters.find_one_and_update.assert_called_once_with(
        {"_id": "article-1"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=pytest.importorskip("pymongo").ReturnDocument.AFTER,
    )


@patch("lib.storage.canvas_events.datetime")
def test_canvas_events_add_event(mock_dt: MagicMock, mock_db: MagicMock) -> None:
    fixed = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)
    mock_dt.now.return_value = fixed
    mock_db.canvas_events_counters.find_one_and_update.return_value = {"seq": 3}
    oid = ObjectId()

    def fake_insert_one(doc):
        doc["_id"] = oid
        return MagicMock(inserted_id=oid)

    mock_db.canvas_events.insert_one.side_effect = fake_insert_one
    storage = CanvasEventsStorage(mock_db)
    result = storage.add_event("article-1", "highlight", {"span": [1, 2]})
    assert result["seq"] == 3
    assert result["event_type"] == "highlight"
    assert result["data"] == {"span": [1, 2]}
    assert result["article_id"] == "article-1"
    assert result["_id"] == str(oid)


def test_canvas_events_get_events(mock_db: MagicMock) -> None:
    mock_db.canvas_events.find.return_value.sort.return_value.skip.return_value.limit.return_value = [
        {"_id": ObjectId(), "seq": 1, "event_type": "a"},
        {"_id": ObjectId(), "seq": 2, "event_type": "b"},
    ]
    storage = CanvasEventsStorage(mock_db)
    result = storage.get_events("article-1", offset=0, limit=50)
    assert len(result) == 2
    assert result[0]["_id"] is not None


def test_canvas_events_get_events_empty(mock_db: MagicMock) -> None:
    mock_db.canvas_events.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
    storage = CanvasEventsStorage(mock_db)
    result = storage.get_events("article-1")
    assert result == []


def test_canvas_events_delete_event(mock_db: MagicMock) -> None:
    mock_db.canvas_events.delete_one.return_value.deleted_count = 1
    storage = CanvasEventsStorage(mock_db)
    assert storage.delete_event("article-1", 3) is True


def test_canvas_events_delete_event_not_found(mock_db: MagicMock) -> None:
    mock_db.canvas_events.delete_one.return_value.deleted_count = 0
    storage = CanvasEventsStorage(mock_db)
    assert storage.delete_event("article-1", 999) is False
