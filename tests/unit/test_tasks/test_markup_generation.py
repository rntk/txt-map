from lib.tasks.markup_generation import _derive_indices_from_data, _validate_markup_response


def test_derive_indices_from_paragraph_data() -> None:
    data = {
        "paragraphs": [
            {"sentence_indices": [4, 5]},
            {"sentence_indices": [6, 7]},
        ]
    }

    result = _derive_indices_from_data("paragraph", data)

    assert result == [4, 5, 6, 7]


def test_validate_markup_response_accepts_valid_paragraph_segment() -> None:
    response = {
        "segments": [
            {
                "type": "paragraph",
                "sentence_indices": [1, 2, 3, 4],
                "data": {
                    "paragraphs": [
                        {"sentence_indices": [1, 2]},
                        {"sentence_indices": [3, 4]},
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
                        {"sentence_indices": [2, 3]},
                        {"sentence_indices": [4]},
                    ]
                },
            }
        ]
    }

    assert _validate_markup_response(response, [2, 3, 4]) is True
    assert response["segments"][0]["sentence_indices"] == [2, 3, 4]


def test_validate_markup_response_rejects_duplicate_nested_paragraph_indices() -> None:
    response = {
        "segments": [
            {
                "type": "paragraph",
                "sentence_indices": [1, 2, 3],
                "data": {
                    "paragraphs": [
                        {"sentence_indices": [1, 2]},
                        {"sentence_indices": [2, 3]},
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
                "sentence_indices": [1, 2, 3],
                "data": {
                    "paragraphs": [
                        {"sentence_indices": [1, 2]},
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
                "sentence_indices": [1, 2],
                "data": {
                    "paragraphs": [],
                },
            }
        ]
    }

    assert _validate_markup_response(response, [1, 2]) is False
