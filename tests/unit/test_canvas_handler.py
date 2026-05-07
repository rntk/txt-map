import logging
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi import BackgroundTasks, HTTPException
from fastapi.testclient import TestClient

from handlers.canvas_handler import (
    CANVAS_SYSTEM_PROMPT,
    ArticlePiece,
    CanvasChatResult,
    CanvasArticlePage,
    CanvasArticleText,
    ChatRequest,
    _build_article_text_with_lines,
    _build_canvas_chunks,
    _cp_offsets_to_js,
    _line_range_to_offsets,
    _merge_chunk_replies,
    _run_canvas_chat,
    _run_canvas_chat_job,
    _run_canvas_chunk_tool_loop,
    post_canvas_chat,
)
from lib.llm.base import LLMMessage, LLMResponse, ToolCall
from lib.storage.canvas_chats import CanvasChatsStorage


class _StubLLM:
    def __init__(self, max_context_tokens: int = 2000) -> None:
        self.max_context_tokens = max_context_tokens

    def estimate_tokens(self, text: str) -> int:
        return len(text) // 4


class _CompleteClient(_StubLLM):
    def __init__(
        self,
        responses: list[LLMResponse],
        max_context_tokens: int = 2000,
    ) -> None:
        super().__init__(max_context_tokens=max_context_tokens)
        self.responses = responses
        self.calls: list[dict[str, Any]] = []

    def complete(self, **kwargs: Any) -> LLMResponse:
        self.calls.append(kwargs)
        return self.responses.pop(0)


class _CanvasStorage:
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []
        self._counters: dict[str, int] = {}

    def add_event(
        self, article_id: str, event_type: str, data: dict[str, Any]
    ) -> dict[str, Any]:
        seq = self._counters.get(article_id, 0) + 1
        self._counters[article_id] = seq
        event: dict[str, Any] = {
            "article_id": article_id,
            "event_type": event_type,
            "data": data,
            "seq": seq,
        }
        self.events.append(event)
        return event

    def delete_event(self, article_id: str, seq: int) -> bool:
        initial_len = len(self.events)
        self.events = [
            ev
            for ev in self.events
            if not (ev.get("article_id") == article_id and ev.get("seq") == seq)
        ]
        return len(self.events) < initial_len


@pytest.fixture
def client():
    with patch.dict(
        "os.environ",
        {
            "MONGODB_URL": "mongodb://localhost:27017",
            "LLAMACPP_URL": "http://localhost:8080",
        },
    ):
        with patch("lifespan.MongoClient"):
            from main import app
            from handlers.canvas_handler import (
                _get_submissions_storage,
            )
            from handlers.dependencies import get_canvas_events_storage

            canvas_storage = _CanvasStorage()
            submissions_storage = MagicMock()

            app.dependency_overrides[get_canvas_events_storage] = lambda: canvas_storage
            app.dependency_overrides[_get_submissions_storage] = lambda: (
                submissions_storage
            )

            with TestClient(app) as test_client:
                yield test_client, canvas_storage, submissions_storage

            app.dependency_overrides.pop(get_canvas_events_storage, None)
            app.dependency_overrides.pop(_get_submissions_storage, None)


def test_build_article_text_splits_results_sentences_into_article_pieces() -> None:
    submission: dict[str, object] = {
        "results": {
            "sentences": [
                "Markets rose: investors cheered results; analysts warned, however, that risks remain.",
                "Shares fell - then recovered? Yes.",
            ]
        }
    }

    article_text = _build_article_text_with_lines(submission)
    piece_texts = [piece.text for piece in article_text.pieces]

    assert article_text.display_text == (
        "Markets rose: investors cheered results; analysts warned, however, "
        "that risks remain.\nShares fell - then recovered? Yes."
    )
    assert piece_texts == [
        "Markets rose:",
        "investors cheered results;",
        "analysts warned,",
        "however,",
        "that risks remain.",
        "Shares fell",
        "- then recovered?",
        "Yes.",
    ]
    assert article_text.numbered_text == "\n".join(
        f"{index}: {piece}" for index, piece in enumerate(piece_texts, start=1)
    )


def test_build_article_text_splits_fallback_text_on_more_punctuation() -> None:
    submission: dict[str, object] = {
        "text_content": "<p>First clause: second clause; third clause, final clause. Next?</p>"
    }

    article_text = _build_article_text_with_lines(submission)
    piece_texts = [piece.text for piece in article_text.pieces]

    assert article_text.display_text == (
        "First clause: second clause; third clause, final clause. Next?"
    )
    assert piece_texts == [
        "First clause:",
        "second clause;",
        "third clause,",
        "final clause.",
        "Next?",
    ]


def test_line_range_offsets_use_article_piece_boundaries() -> None:
    submission: dict[str, object] = {"results": {"sentences": ["Alpha: beta; gamma."]}}
    article_text = _build_article_text_with_lines(submission)

    assert _line_range_to_offsets(article_text.pieces, 2, 3) == (7, 19)


def test_article_piece_offsets_map_to_readable_display_text() -> None:
    submission: dict[str, object] = {
        "results": {
            "sentences": [
                "Markets rose: investors cheered results; analysts warned.",
                "Shares fell - then recovered?",
            ]
        }
    }

    article_text = _build_article_text_with_lines(submission)

    assert (
        article_text.display_text[
            article_text.pieces[1].start : article_text.pieces[1].end
        ]
        == "investors cheered results;"
    )
    assert (
        article_text.display_text[
            article_text.pieces[4].start : article_text.pieces[4].end
        ]
        == "- then recovered?"
    )
    assert _line_range_to_offsets(article_text.pieces, 2, 3) == (
        article_text.display_text.index("investors"),
        article_text.display_text.index("Shares") - 1,
    )


def test_canvas_prompt_describes_granular_article_pieces() -> None:
    assert "granular pieces" in CANVAS_SYSTEM_PROMPT
    assert "not always complete sentences" in CANVAS_SYSTEM_PROMPT


def _make_pieces(texts: list[str]) -> list[ArticlePiece]:
    pieces: list[ArticlePiece] = []
    offset = 0
    for text in texts:
        pieces.append(ArticlePiece(text=text, start=offset, end=offset + len(text)))
        offset += len(text) + 1
    return pieces


def test_build_canvas_chunks_single_chunk_when_fits_budget() -> None:
    pieces = _make_pieces(["alpha.", "beta.", "gamma."])
    chunks = _build_canvas_chunks(
        pieces=pieces, llm=_StubLLM(max_context_tokens=64000), static_overhead_tokens=0
    )

    assert len(chunks) == 1
    assert chunks[0] == "1: alpha.\n2: beta.\n3: gamma."


def test_build_canvas_chunks_splits_when_budget_is_tight() -> None:
    # Create enough pieces to exceed the minimum 1024-token fallback budget.
    texts = [("word " * 80).strip() + f" #{i}." for i in range(40)]
    pieces = _make_pieces(texts)

    chunks = _build_canvas_chunks(
        pieces=pieces, llm=_StubLLM(max_context_tokens=2000), static_overhead_tokens=0
    )

    assert len(chunks) >= 2
    # Global line numbering stays consistent across chunks.
    joined = "\n".join(chunks)
    for idx in range(1, len(pieces) + 1):
        assert f"{idx}: " in joined
    # First line in the second chunk should not be line 1.
    assert not chunks[1].startswith("1: ")


def test_build_canvas_chunks_empty_pieces_returns_single_empty_chunk() -> None:
    chunks = _build_canvas_chunks(pieces=[], llm=_StubLLM(), static_overhead_tokens=0)
    assert chunks == [""]


def test_merge_chunk_replies_filters_no_info_when_informative_exists() -> None:
    merged = _merge_chunk_replies(
        [
            "No relevant info.",
            "The article says markets rose on strong earnings reports this quarter.",
            "",
        ]
    )
    assert merged == (
        "The article says markets rose on strong earnings reports this quarter."
    )


def test_merge_chunk_replies_joins_multiple_informative_replies() -> None:
    merged = _merge_chunk_replies(
        [
            "First substantive reply that clearly adds value to the answer.",
            "Second substantive reply with more detail that also adds value here.",
        ]
    )
    assert "First substantive reply" in merged
    assert "Second substantive reply" in merged
    assert "\n\n" in merged


def test_merge_chunk_replies_falls_back_to_no_info_when_all_chunks_empty() -> None:
    merged = _merge_chunk_replies(["No relevant info.", "Not mentioned."])
    # Returns something rather than empty string so the user still gets an answer.
    assert merged != ""


def test_canvas_chunk_logs_first_llm_call_before_response(caplog) -> None:
    article_text = CanvasArticleText(
        display_text="Alpha.",
        numbered_text="1: Alpha.",
        pieces=[ArticlePiece(text="Alpha.", start=0, end=6)],
        pages=[CanvasArticlePage(page_number=1, start=0, end=6)],
    )
    client = _CompleteClient([LLMResponse(content="Answer without tools.")])

    with caplog.at_level(logging.INFO, logger="canvas_handler"):
        reply = _run_canvas_chunk_tool_loop(
            article_id="article-1",
            article_text=article_text,
            chunk_numbered_text="1: Alpha.",
            chunk_index=0,
            chunk_total=1,
            base_messages=[],
            user_message="What happened?",
            client=client,
            canvas_storage=_CanvasStorage(),
        )

    assert reply == "Answer without tools."
    assert len(client.calls) == 1
    assert "Canvas LLM call start | article=article-1 chunk=1/1 call=1" in caplog.text
    assert (
        "Canvas LLM chunk complete | article=article-1 chunk=1/1 call=1 "
        "reason=no_tool_calls"
    ) in caplog.text


def test_canvas_chunk_stops_after_tool_result_then_no_tool_response() -> None:
    article_text = CanvasArticleText(
        display_text="Alpha. Beta.",
        numbered_text="1: Alpha.\n2: Beta.",
        pieces=[
            ArticlePiece(text="Alpha.", start=0, end=6),
            ArticlePiece(text="Beta.", start=7, end=12),
        ],
        pages=[CanvasArticlePage(page_number=1, start=0, end=12)],
    )
    client = _CompleteClient(
        [
            LLMResponse(
                content=None,
                tool_calls=(
                    ToolCall(
                        name="highlight_span",
                        arguments={"start_line": 1, "end_line": 1},
                        id="call-1",
                    ),
                ),
            ),
            LLMResponse(content="Highlighted the relevant passage."),
        ]
    )
    canvas_storage = _CanvasStorage()

    reply = _run_canvas_chunk_tool_loop(
        article_id="article-1",
        article_text=article_text,
        chunk_numbered_text="1: Alpha.\n2: Beta.",
        chunk_index=0,
        chunk_total=1,
        base_messages=[],
        user_message="Show me Alpha.",
        client=client,
        canvas_storage=canvas_storage,
    )

    assert reply == "Highlighted the relevant passage."
    assert len(client.calls) == 2
    assert len(canvas_storage.events) == 1


def test_canvas_chunk_passes_reasoning_back_with_tool_calls() -> None:
    article_text = CanvasArticleText(
        display_text="Alpha. Beta.",
        numbered_text="1: Alpha.\n2: Beta.",
        pieces=[
            ArticlePiece(text="Alpha.", start=0, end=6),
            ArticlePiece(text="Beta.", start=7, end=12),
        ],
        pages=[CanvasArticlePage(page_number=1, start=0, end=12)],
    )
    client = _CompleteClient(
        [
            LLMResponse(
                content="Let me highlight.",
                reasoning="I should highlight line 1.",
                tool_calls=(
                    ToolCall(
                        name="highlight_span",
                        arguments={"start_line": 1, "end_line": 1},
                        id="call-1",
                    ),
                ),
            ),
            LLMResponse(content="Done highlighting."),
        ]
    )
    canvas_storage = _CanvasStorage()

    reply = _run_canvas_chunk_tool_loop(
        article_id="article-1",
        article_text=article_text,
        chunk_numbered_text="1: Alpha.\n2: Beta.",
        chunk_index=0,
        chunk_total=1,
        base_messages=[],
        user_message="Show me Alpha.",
        client=client,
        canvas_storage=canvas_storage,
    )

    assert reply == "Done highlighting."
    assert len(client.calls) == 2
    # The second call should include the assistant reasoning from the first response.
    second_call_messages = client.calls[1]["messages"]
    assistant_msgs = [m for m in second_call_messages if m.role == "assistant"]
    assert len(assistant_msgs) == 1
    assert assistant_msgs[0].reasoning == "I should highlight line 1."


def test_canvas_chat_stops_after_all_chunks_return_without_tool_calls(caplog) -> None:
    submission: dict[str, object] = {
        "results": {
            "sentences": [("word " * 80).strip() + f" #{i}." for i in range(40)]
        }
    }
    client = _CompleteClient(
        [
            LLMResponse(content="First chunk answer with useful detail."),
            LLMResponse(content="Second chunk answer with useful detail."),
            LLMResponse(content="Third chunk answer with useful detail."),
            LLMResponse(content="Fourth chunk answer with useful detail."),
            LLMResponse(content="Fifth chunk answer with useful detail."),
        ],
        max_context_tokens=2000,
    )

    with (
        patch("handlers.canvas_handler.create_llm_client", return_value=client),
        caplog.at_level(logging.INFO, logger="canvas_handler"),
    ):
        reply = _run_canvas_chat(
            article_id="article-1",
            submission=submission,
            user_message="Summarize.",
            history=[],
            canvas_storage=_CanvasStorage(),
            db=None,
        )

    assert len(client.calls) == 5
    assert not client.responses
    assert "First chunk answer" in reply
    assert "Canvas chat complete | article=article-1 chunks_processed=" in caplog.text


def test_delete_canvas_event_success(client):
    test_client, canvas_storage, submissions_storage = client
    submissions_storage.get_by_id.return_value = {"submission_id": "article-1"}
    canvas_storage.add_event("article-1", "highlight_span", {"start": 0, "end": 5})
    canvas_storage.add_event("article-1", "highlight_span", {"start": 6, "end": 10})

    response = test_client.delete("/api/canvas/article-1/events/1")

    assert response.status_code == 200
    assert response.json()["deleted"] is True
    assert len(canvas_storage.events) == 1
    # seq is immutable: surviving event keeps the seq it was assigned at insert.
    assert canvas_storage.events[0]["seq"] == 2
    assert canvas_storage.events[0]["data"]["start"] == 6


def test_delete_canvas_event_not_found(client):
    test_client, canvas_storage, submissions_storage = client
    submissions_storage.get_by_id.return_value = {"submission_id": "article-1"}

    response = test_client.delete("/api/canvas/article-1/events/5")

    assert response.status_code == 404
    assert response.json()["detail"] == "Event not found"


def test_delete_canvas_event_article_not_found(client):
    test_client, _canvas_storage, submissions_storage = client
    submissions_storage.get_by_id.return_value = None

    response = test_client.delete("/api/canvas/article-1/events/1")

    assert response.status_code == 404
    assert response.json()["detail"] == "Article not found"


def test_canvas_events_storage_delete_event_deletes_one() -> None:
    from lib.storage.canvas_events import CanvasEventsStorage

    mock_db = MagicMock()
    storage = CanvasEventsStorage(mock_db)
    mock_db.canvas_events.delete_one.return_value = MagicMock(deleted_count=1)

    result = storage.delete_event("article-1", 3)

    assert result is True
    mock_db.canvas_events.delete_one.assert_called_once_with(
        {"article_id": "article-1", "seq": 3}
    )


def test_canvas_events_storage_delete_event_not_found() -> None:
    from lib.storage.canvas_events import CanvasEventsStorage

    mock_db = MagicMock()
    storage = CanvasEventsStorage(mock_db)
    mock_db.canvas_events.delete_one.return_value = MagicMock(deleted_count=0)

    result = storage.delete_event("article-1", 1)

    assert result is False


def test_canvas_chats_storage_create_chat_with_message_persists_first_message() -> None:
    mock_db = MagicMock()
    storage = CanvasChatsStorage(mock_db)

    def _insert_one(doc: dict[str, Any]) -> MagicMock:
        doc["_id"] = "generated-id"
        return MagicMock(inserted_id="generated-id")

    mock_db.canvas_chats.insert_one.side_effect = _insert_one

    chat = storage.create_chat_with_message(
        article_id="article-1",
        role="user",
        content="Explain the article",
    )

    inserted = mock_db.canvas_chats.insert_one.call_args.args[0]
    assert chat["chat_id"] == inserted["chat_id"]
    assert inserted["article_id"] == "article-1"
    assert inserted["title"] == "Explain the article"
    assert inserted["messages"][0]["role"] == "user"
    assert inserted["messages"][0]["content"] == "Explain the article"


def test_canvas_chats_storage_list_chats_filters_empty_sessions() -> None:
    mock_db = MagicMock()
    storage = CanvasChatsStorage(mock_db)

    storage.list_chats("article-1")

    mock_db.canvas_chats.find.assert_called_once()
    assert mock_db.canvas_chats.find.call_args.args[0] == {
        "article_id": "article-1",
        "messages.0": {"$exists": True},
    }


def test_post_canvas_chat_creates_new_chat_with_first_message() -> None:
    background_tasks = BackgroundTasks()
    chats_storage = MagicMock()
    chats_storage.create_chat_with_message.return_value = {"chat_id": "chat-1"}
    submissions_storage = MagicMock()
    submissions_storage.get_by_id.return_value = {"submission_id": "article-1"}

    response = post_canvas_chat(
        article_id="article-1",
        body=ChatRequest(message=" Explain this "),
        background_tasks=background_tasks,
        canvas_storage=MagicMock(),
        chats_storage=chats_storage,
        submissions_storage=submissions_storage,
        db=None,
    )

    chats_storage.create_chat.assert_not_called()
    chats_storage.create_chat_with_message.assert_called_once_with(
        article_id="article-1",
        role="user",
        content="Explain this",
    )
    chats_storage.add_message.assert_not_called()
    assert response["chat_id"] == "chat-1"


def test_post_canvas_chat_uses_server_history_not_client_reasoning() -> None:
    background_tasks = MagicMock()
    chats_storage = MagicMock()
    stored_messages: list[dict[str, Any]] = [
        {"role": "user", "content": "Previous question"},
        {
            "role": "assistant",
            "content": "Calling tool",
            "hidden": True,
            "reasoning": "server reasoning",
            "tool_calls": [
                {
                    "id": "call-1",
                    "name": "highlight_span",
                    "arguments": {"start_line": 1, "end_line": 1},
                }
            ],
        },
    ]
    chats_storage.get_chat.return_value = {
        "chat_id": "chat-1",
        "messages": stored_messages,
    }
    submissions_storage = MagicMock()
    submissions_storage.get_by_id.return_value = {"submission_id": "article-1"}

    response = post_canvas_chat(
        article_id="article-1",
        body=ChatRequest(
            message="Follow up",
            chat_id="chat-1",
            history=[
                {
                    "role": "assistant",
                    "content": "client supplied",
                    "reasoning": "untrusted",
                }
            ],
        ),
        background_tasks=background_tasks,
        canvas_storage=MagicMock(),
        chats_storage=chats_storage,
        submissions_storage=submissions_storage,
        db=None,
    )

    assert response["chat_id"] == "chat-1"
    background_tasks.add_task.assert_called_once()
    assert background_tasks.add_task.call_args.kwargs["history"] == stored_messages


def test_canvas_chat_job_persists_hidden_tool_transcript() -> None:
    chats_storage = MagicMock()
    transcript = (
        LLMMessage(
            role="assistant",
            content="Let me highlight.",
            reasoning="server reasoning",
            tool_calls=(
                ToolCall(
                    name="highlight_span",
                    arguments={"start_line": 1, "end_line": 1},
                    id="call-1",
                ),
            ),
        ),
        LLMMessage(
            role="tool", content="Highlighted lines 1-1.", tool_call_id="call-1"
        ),
    )

    with patch(
        "handlers.canvas_handler._run_canvas_chat",
        return_value=CanvasChatResult(reply="Done.", transcript=transcript),
    ):
        _run_canvas_chat_job(
            request_id="request-1",
            article_id="article-1",
            submission={"submission_id": "article-1"},
            user_message="Show me Alpha.",
            history=[],
            canvas_storage=MagicMock(),
            db=None,
            chats_storage=chats_storage,
            chat_id="chat-1",
        )

    assert chats_storage.add_message.call_count == 3
    first_call = chats_storage.add_message.call_args_list[0].kwargs
    second_call = chats_storage.add_message.call_args_list[1].kwargs
    third_call = chats_storage.add_message.call_args_list[2].kwargs
    assert first_call["hidden"] is True
    assert first_call["reasoning"] == "server reasoning"
    assert first_call["tool_calls"][0]["name"] == "highlight_span"
    assert second_call["hidden"] is True
    assert second_call["role"] == "tool"
    assert second_call["tool_call_id"] == "call-1"
    assert third_call["role"] == "assistant"
    assert third_call["content"] == "Done."


def test_post_canvas_chat_rejects_blank_message_without_creating_chat() -> None:
    chats_storage = MagicMock()
    submissions_storage = MagicMock()
    submissions_storage.get_by_id.return_value = {"submission_id": "article-1"}

    with pytest.raises(HTTPException) as exc_info:
        post_canvas_chat(
            article_id="article-1",
            body=ChatRequest(message="   "),
            background_tasks=BackgroundTasks(),
            canvas_storage=MagicMock(),
            chats_storage=chats_storage,
            submissions_storage=submissions_storage,
            db=None,
        )

    assert exc_info.value.status_code == 400
    chats_storage.create_chat.assert_not_called()
    chats_storage.create_chat_with_message.assert_not_called()
    chats_storage.add_message.assert_not_called()


def test_canvas_events_storage_add_event_uses_atomic_counter() -> None:
    from lib.storage.canvas_events import CanvasEventsStorage

    mock_db = MagicMock()
    storage = CanvasEventsStorage(mock_db)
    mock_db.canvas_events_counters.find_one_and_update.return_value = {
        "_id": "article-1",
        "seq": 7,
    }

    def _insert_one(doc):
        doc["_id"] = "generated-id"
        return MagicMock(inserted_id="generated-id")

    mock_db.canvas_events.insert_one.side_effect = _insert_one

    event = storage.add_event("article-1", "highlight_span", {"start": 0})

    assert event["seq"] == 7
    call = mock_db.canvas_events_counters.find_one_and_update.call_args
    assert call.args[0] == {"_id": "article-1"}
    assert call.args[1] == {"$inc": {"seq": 1}}
    assert call.kwargs.get("upsert") is True
    mock_db.canvas_events.count_documents.assert_not_called()


def test_canvas_events_storage_prepare_drops_old_non_unique_index() -> None:
    from lib.storage.canvas_events import CanvasEventsStorage

    mock_db = MagicMock()
    storage = CanvasEventsStorage(mock_db)
    mock_db.canvas_events.index_information.return_value = {
        "article_id_1_seq_1": {"key": [("article_id", 1), ("seq", 1)]},
    }
    mock_db.canvas_events.aggregate.return_value = []

    storage.prepare()

    mock_db.canvas_events.drop_index.assert_called_once_with("article_id_1_seq_1")
    mock_db.canvas_events.create_index.assert_any_call(
        [("article_id", 1), ("seq", 1)], unique=True
    )


def test_canvas_events_storage_prepare_keeps_existing_unique_index() -> None:
    from lib.storage.canvas_events import CanvasEventsStorage

    mock_db = MagicMock()
    storage = CanvasEventsStorage(mock_db)
    mock_db.canvas_events.index_information.return_value = {
        "article_id_1_seq_1": {
            "key": [("article_id", 1), ("seq", 1)],
            "unique": True,
        },
    }
    mock_db.canvas_events.aggregate.return_value = []

    storage.prepare()

    mock_db.canvas_events.drop_index.assert_not_called()


def test_canvas_events_storage_prepare_backfills_counters() -> None:
    from lib.storage.canvas_events import CanvasEventsStorage

    mock_db = MagicMock()
    storage = CanvasEventsStorage(mock_db)
    mock_db.canvas_events.index_information.return_value = {}
    mock_db.canvas_events.aggregate.return_value = [
        {"_id": "article-1", "max_seq": 4},
        {"_id": "article-2", "max_seq": 0},
    ]

    storage.prepare()

    calls = mock_db.canvas_events_counters.update_one.call_args_list
    assert len(calls) == 2
    assert calls[0].args == (
        {"_id": "article-1"},
        {"$max": {"seq": 4}},
    )
    assert calls[0].kwargs.get("upsert") is True
    assert calls[1].args == (
        {"_id": "article-2"},
        {"$max": {"seq": 0}},
    )


# ---------------------------------------------------------------------------
# _cp_offsets_to_js — Python code-point → JavaScript UTF-16 offset conversion
# ---------------------------------------------------------------------------


def test_cp_offsets_to_js_empty_offsets_returns_empty() -> None:
    assert _cp_offsets_to_js("hello", []) == []


def test_cp_offsets_to_js_bmp_only_returns_unchanged() -> None:
    # All characters ≤ U+FFFF: code-point and UTF-16 offsets are identical.
    text = "hello world"
    offsets = [0, 5, 11]
    assert _cp_offsets_to_js(text, offsets) == offsets


def test_cp_offsets_to_js_supplementary_char_at_start() -> None:
    # U+1F600 (😀) is a supplementary character: 1 code point but 2 UTF-16 units.
    text = "\U0001f600abc"  # cp offsets: 0=😀, 1=a, 2=b, 3=c, 4=end
    # JS UTF-16 offsets:            0=😀(2 units), 2=a, 3=b, 4=c, 5=end
    assert _cp_offsets_to_js(text, [0]) == [0]
    assert _cp_offsets_to_js(text, [1]) == [2]
    assert _cp_offsets_to_js(text, [2]) == [3]
    assert _cp_offsets_to_js(text, [4]) == [5]  # end-of-string


def test_cp_offsets_to_js_multiple_supplementary_chars() -> None:
    # Two supplementary chars followed by BMP text.
    emoji = "\U0001f600\U0001f4a1"  # 2 code points, 4 UTF-16 units
    text = emoji + "AB"  # cp len=4, js len=6
    assert _cp_offsets_to_js(text, [0, 1, 2, 3, 4]) == [0, 2, 4, 5, 6]


def test_cp_offsets_to_js_end_of_string_offset() -> None:
    # The last page's 'end' is exactly len(text) in code points.
    text = "A\U0001f600B"  # cp len=3, js len=4
    cp_len = len(text)  # 3
    assert _cp_offsets_to_js(text, [cp_len]) == [4]


def test_cp_offsets_to_js_matches_javascript_surrogate_pair_behaviour() -> None:
    # Simulate the real bug: Python offset is 5 (after 4 BMP chars + 1 supp char),
    # JavaScript UTF-16 index for the same position must be 6.
    text = "abcd\U0001d400xy"  # 𝐀 is U+1D400 (math bold capital A)
    # cp offsets: 0=a 1=b 2=c 3=d 4=𝐀 5=x 6=y 7=end
    # js offsets: 0=a 1=b 2=c 3=d 4=𝐀hi 6=x 7=y 8=end
    assert _cp_offsets_to_js(text, [5, 7]) == [6, 8]
