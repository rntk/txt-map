from handlers.canvas_handler import (
    CANVAS_SYSTEM_PROMPT,
    _build_article_text_with_lines,
    _line_range_to_offsets,
)


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
