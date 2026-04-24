from handlers.canvas_handler import (
    CANVAS_SYSTEM_PROMPT,
    ArticlePiece,
    _build_article_text_with_lines,
    _build_canvas_chunks,
    _line_range_to_offsets,
    _merge_chunk_replies,
)


class _StubLLM:
    def __init__(self, max_context_tokens: int = 2000) -> None:
        self.max_context_tokens = max_context_tokens

    def estimate_tokens(self, text: str) -> int:
        return len(text) // 4


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
    chunks = _build_canvas_chunks(
        pieces=[], llm=_StubLLM(), static_overhead_tokens=0
    )
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
