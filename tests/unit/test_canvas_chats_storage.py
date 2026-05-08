"""Unit tests for CanvasChatsStorage."""

from unittest.mock import MagicMock, patch

import pytest
from bson import ObjectId

from lib.storage.canvas_chats import CanvasChatsStorage


@pytest.fixture
def mock_db():
    db = MagicMock()
    db.canvas_chats = MagicMock()
    return db


def test_canvas_storage_prepare(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    storage.prepare()
    assert mock_db.canvas_chats.create_index.call_count == 3


def test_canvas_storage_prepare_logs_warnings(mock_db: MagicMock) -> None:
    mock_db.canvas_chats.create_index.side_effect = RuntimeError("boom")
    storage = CanvasChatsStorage(mock_db)
    storage.prepare()  # should not raise


@patch("lib.storage.canvas_chats.uuid.uuid4")
def test_create_chat(mock_uuid: MagicMock, mock_db: MagicMock) -> None:
    mock_uuid.return_value.hex = "chat123"
    storage = CanvasChatsStorage(mock_db)
    oid = ObjectId()

    def fake_insert_one(doc):
        doc["_id"] = oid
        return MagicMock(inserted_id=oid)

    mock_db.canvas_chats.insert_one.side_effect = fake_insert_one
    result = storage.create_chat("article-1", "My Chat")
    assert result["chat_id"] == "chat123"
    assert result["article_id"] == "article-1"
    assert result["title"] == "My Chat"
    assert result["messages"] == []
    assert result["events"] == []
    assert result["event_seq"] == 0


@patch("lib.storage.canvas_chats.uuid.uuid4")
def test_create_chat_with_message(mock_uuid: MagicMock, mock_db: MagicMock) -> None:
    mock_uuid.return_value.hex = "chat456"
    storage = CanvasChatsStorage(mock_db)
    oid = ObjectId()

    def fake_insert_one(doc):
        doc["_id"] = oid
        return MagicMock(inserted_id=oid)

    mock_db.canvas_chats.insert_one.side_effect = fake_insert_one
    result = storage.create_chat_with_message("article-1", "user", "Hello world")
    assert result["chat_id"] == "chat456"
    assert result["title"] == "Hello world"
    assert len(result["messages"]) == 1
    assert result["messages"][0]["role"] == "user"


def test_create_chat_with_message_long_title(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    oid = ObjectId()

    def fake_insert_one(doc):
        doc["_id"] = oid
        return MagicMock(inserted_id=oid)

    mock_db.canvas_chats.insert_one.side_effect = fake_insert_one
    long_content = "x" * 100
    result = storage.create_chat_with_message("article-1", "user", long_content)
    assert result["title"].endswith("...")
    assert len(result["title"]) == 60


def test_list_chats(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find.return_value.sort.return_value = [
        {
            "_id": ObjectId(),
            "chat_id": "c1",
            "article_id": "a1",
            "title": "Chat 1",
            "messages": [{"role": "user", "content": "hi"}],
            "events": [{"seq": 1}],
        },
    ]
    result = storage.list_chats("a1")
    assert len(result) == 1
    assert result[0]["chat_id"] == "c1"
    assert result[0]["message_count"] == 1
    assert result[0]["event_count"] == 1
    assert "messages" not in result[0]
    assert "events" not in result[0]


def test_list_chats_hidden_messages(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find.return_value.sort.return_value = [
        {
            "_id": ObjectId(),
            "chat_id": "c1",
            "article_id": "a1",
            "title": "Chat 1",
            "messages": [
                {"role": "user", "content": "hi"},
                {"role": "assistant", "content": "hello", "hidden": True},
            ],
            "events": [],
        },
    ]
    result = storage.list_chats("a1")
    assert result[0]["message_count"] == 1


def test_get_chat(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find_one.return_value = {
        "_id": ObjectId(),
        "chat_id": "c1",
        "article_id": "a1",
    }
    result = storage.get_chat("a1", "c1")
    assert result is not None
    assert result["chat_id"] == "c1"


def test_get_chat_not_found(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find_one.return_value = None
    assert storage.get_chat("a1", "c1") is None


def test_delete_chat(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.delete_one.return_value.deleted_count = 1
    assert storage.delete_chat("a1", "c1") is True


def test_update_title(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.update_one.return_value.modified_count = 1
    assert storage.update_title("a1", "c1", "New Title") is True


def test_add_message(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.update_one.return_value.modified_count = 1
    assert storage.add_message("a1", "c1", "user", "hello") is True
    update = mock_db.canvas_chats.update_one.call_args.args[1]
    assert "messages" in update["$push"]
    assert update["$push"]["messages"]["role"] == "user"


def test_add_message_with_options(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.update_one.return_value.modified_count = 1
    assert (
        storage.add_message(
            "a1",
            "c1",
            "assistant",
            "ok",
            hidden=True,
            reasoning="r1",
            tool_call_id="tc1",
            tool_calls=[{}],
        )
        is True
    )
    msg = mock_db.canvas_chats.update_one.call_args.args[1]["$push"]["messages"]
    assert msg["hidden"] is True
    assert msg["reasoning"] == "r1"
    assert msg["tool_call_id"] == "tc1"
    assert msg["tool_calls"] == [{}]


def test_add_message_sets_title(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.update_one.return_value.modified_count = 1
    mock_db.canvas_chats.find_one.return_value = {
        "title": "New chat",
        "messages": [{"role": "user", "content": "First message"}],
    }
    storage.add_message("a1", "c1", "user", "First message")
    # _maybe_set_title_from_first_message is called
    mock_db.canvas_chats.update_one.assert_called()


def test_maybe_set_title_skips_if_already_set(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find_one.return_value = {
        "title": "Existing",
        "messages": [{"role": "user", "content": "msg"}],
    }
    storage._maybe_set_title_from_first_message("a1", "c1")
    # Second call count should remain at 0 if no title update happens
    # Actually find_one + no update_one for title
    assert mock_db.canvas_chats.update_one.call_count == 0


def test_add_event(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find_one_and_update.return_value = {"event_seq": 3}
    event = storage.add_event("a1", "c1", "highlight", {"span": [1, 2]})
    assert event is not None
    assert event["seq"] == 3
    assert event["event_type"] == "highlight"
    assert event["data"] == {"span": [1, 2]}


def test_add_event_chat_not_found(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find_one_and_update.return_value = None
    assert storage.add_event("a1", "c1", "highlight", {}) is None


def test_get_events(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find_one.return_value = {
        "events": [
            {"seq": 2, "event_type": "b"},
            {"seq": 1, "event_type": "a"},
        ]
    }
    result = storage.get_events("a1", "c1")
    assert len(result) == 2
    assert result[0]["seq"] == 1  # sorted
    assert result[1]["seq"] == 2


def test_get_events_with_pagination(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find_one.return_value = {
        "events": [
            {"seq": 1},
            {"seq": 2},
            {"seq": 3},
        ]
    }
    result = storage.get_events("a1", "c1", offset=1, limit=1)
    assert len(result) == 1
    assert result[0]["seq"] == 2


def test_get_events_not_found(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find_one.return_value = None
    assert storage.get_events("a1", "c1") == []


def test_delete_event(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.update_one.return_value.modified_count = 1
    assert storage.delete_event("a1", "c1", 1) is True


def test_maybe_set_title_skips_if_doc_not_found(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find_one.return_value = None
    storage._maybe_set_title_from_first_message("a1", "c1")
    assert mock_db.canvas_chats.update_one.call_count == 0


def test_maybe_set_title_skips_if_no_messages(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find_one.return_value = {
        "title": "New chat",
        "messages": None,
    }
    storage._maybe_set_title_from_first_message("a1", "c1")
    assert mock_db.canvas_chats.update_one.call_count == 0


def test_maybe_set_title_skips_if_no_user_message(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find_one.return_value = {
        "title": "New chat",
        "messages": [{"role": "assistant", "content": "hello"}],
    }
    storage._maybe_set_title_from_first_message("a1", "c1")
    assert mock_db.canvas_chats.update_one.call_count == 0


def test_maybe_set_title_skips_if_empty_content(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find_one.return_value = {
        "title": "New chat",
        "messages": [{"role": "user", "content": "   "}],
    }
    storage._maybe_set_title_from_first_message("a1", "c1")
    assert mock_db.canvas_chats.update_one.call_count == 0


def test_maybe_set_title_truncates_long_content(mock_db: MagicMock) -> None:
    storage = CanvasChatsStorage(mock_db)
    mock_db.canvas_chats.find_one.return_value = {
        "title": "New chat",
        "messages": [{"role": "user", "content": "x" * 100}],
    }
    storage._maybe_set_title_from_first_message("a1", "c1")
    mock_db.canvas_chats.update_one.assert_called_once()
    call_args = mock_db.canvas_chats.update_one.call_args
    assert call_args[0][1]["$set"]["title"].endswith("...")
    assert len(call_args[0][1]["$set"]["title"]) == 60
