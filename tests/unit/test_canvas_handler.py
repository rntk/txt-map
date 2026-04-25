import logging
from typing import Any
from unittest.mock import patch

from handlers.canvas_handler import (
    CANVAS_SYSTEM_PROMPT,
    ArticlePiece,
    CanvasArticlePage,
    CanvasArticleText,
    _build_article_text_with_lines,
    _build_canvas_chunks,
    _line_range_to_offsets,
    _merge_chunk_replies,
    _run_canvas_chat,
    _run_canvas_chunk_tool_loop,
)
from lib.llm.base import LLMResponse, ToolCall


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

    def add_event(
        self, article_id: str, event_type: str, data: dict[str, Any]
    ) -> dict[str, Any]:
        event: dict[str, Any] = {
            "article_id": article_id,
            "event_type": event_type,
            "data": data,
        }
        self.events.append(event)
        return event


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
