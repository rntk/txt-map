from lib.tasks.markup_generation import (
    _build_markup_positions,
    _derive_indices_from_data,
    _validate_markup_response,
)


def test_derive_indices_from_paragraph_data() -> None:
    data = {
        "paragraphs": [
            {"position_indices": [4, 5]},
            {"position_indices": [6, 7]},
        ]
    }

    result = _derive_indices_from_data("paragraph", data)

    assert result == [4, 5, 6, 7]


def test_validate_markup_response_accepts_valid_paragraph_segment() -> None:
    response = {
        "segments": [
            {
                "type": "paragraph",
                "position_indices": [1, 2, 3, 4],
                "data": {
                    "paragraphs": [
                        {"position_indices": [1, 2]},
                        {"position_indices": [3, 4]},
                    ]
                },
            }
        ]
    }

    assert _validate_markup_response(response, [1, 2, 3, 4]) is True


def test_validate_markup_response_derives_top_level_indices_for_paragraph_segment() -> None:
    response = {
        "segments": [
            {
                "type": "paragraph",
                "data": {
                    "paragraphs": [
                        {"position_indices": [2, 3]},
                        {"position_indices": [4]},
                    ]
                },
            }
        ]
    }

    assert _validate_markup_response(response, [2, 3, 4]) is True
    assert response["segments"][0]["position_indices"] == [2, 3, 4]


def test_validate_markup_response_rejects_duplicate_nested_paragraph_indices() -> None:
    response = {
        "segments": [
            {
                "type": "paragraph",
                "position_indices": [1, 2, 3],
                "data": {
                    "paragraphs": [
                        {"position_indices": [1, 2]},
                        {"position_indices": [2, 3]},
                    ]
                },
            }
        ]
    }

    assert _validate_markup_response(response, [1, 2, 3]) is False


def test_validate_markup_response_rejects_mismatched_paragraph_coverage() -> None:
    response = {
        "segments": [
            {
                "type": "paragraph",
                "position_indices": [1, 2, 3],
                "data": {
                    "paragraphs": [
                        {"position_indices": [1, 2]},
                    ]
                },
            }
        ]
    }

    assert _validate_markup_response(response, [1, 2, 3]) is False


def test_validate_markup_response_rejects_empty_paragraph_groups() -> None:
    response = {
        "segments": [
            {
                "type": "paragraph",
                "position_indices": [1, 2],
                "data": {
                    "paragraphs": [],
                },
            }
        ]
    }

    assert _validate_markup_response(response, [1, 2]) is False


def test_derive_indices_from_legacy_sentence_fields() -> None:
    data = {
        "pairs": [
            {
                "question_sentence_index": 3,
                "answer_sentence_indices": [4, 5],
            }
        ]
    }

    result = _derive_indices_from_data("question_answer", data)

    assert result == [3, 4, 5]


def test_validate_markup_response_accepts_legacy_sentence_indices() -> None:
    response = {
        "segments": [
            {
                "type": "plain",
                "sentence_indices": [1, 2],
                "data": {},
            }
        ]
    }

    assert _validate_markup_response(response, [1, 2]) is True


def test_validate_markup_response_accepts_partial_coverage() -> None:
    response = {
        "segments": [
            {
                "type": "quote",
                "position_indices": [2],
                "data": {
                    "attribution": "Ada",
                    "position_indices": [2],
                },
            }
        ]
    }

    assert _validate_markup_response(response, [1, 2, 3]) is True


def test_validate_markup_response_accepts_empty_segments() -> None:
    response = {
        "segments": []
    }

    assert _validate_markup_response(response, [1, 2, 3]) is True


def test_build_markup_positions_splits_heading_like_content() -> None:
    positions = _build_markup_positions(
        [1],
        ["What does computation mean? — How in-model execution differs from tool use."],
    )

    assert [position["text"] for position in positions] == [
        "What does computation mean?",
        "How in-model execution differs from tool use.",
    ]
    assert [position["source_sentence_index"] for position in positions] == [1, 1]
