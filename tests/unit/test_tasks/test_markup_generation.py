from lib.tasks.markup_generation import (
    _build_markup_positions,
    _build_markup_classification_prompt,
    _derive_indices_from_data,
    _validate_markup_response,
    _expand_ranges,
    _expand_markup_response,
)


def test_expand_ranges() -> None:
    assert _expand_ranges([1, "3-5", 8]) == [1, 3, 4, 5, 8]
    assert _expand_ranges(["10-12", 15, "15-17"]) == [10, 11, 12, 15, 16, 17]
    assert _expand_ranges("1-3") == [1, 2, 3]
    assert _expand_ranges([1, "invalid", 5]) == [1, 5]
    # wN-prefixed word index strings
    assert _expand_ranges(["w1", "w3-w5", "w8"]) == [1, 3, 4, 5, 8]
    assert _expand_ranges(["w10-w12"]) == [10, 11, 12]
    assert _expand_ranges(["w3-5"]) == [3, 4, 5]


def test_build_markup_classification_prompt_puts_dynamic_content_last() -> None:
    prompt = _build_markup_classification_prompt(
        topic_name="Caching",
        numbered_sentences="{1} Prefix reuse matters.",
        valid_indices="1",
    )

    assert "OUTPUT FORMAT" in prompt
    assert "RULES:" in prompt
    assert "TOPIC: Caching" in prompt
    assert "VALID MARKUP POSITION INDICES: 1" in prompt
    assert "<topic_content>\n{1} Prefix reuse matters.\n</topic_content>" in prompt
    assert prompt.index("OUTPUT FORMAT") < prompt.index("TOPIC: Caching")
    assert prompt.index("RULES:") < prompt.index("TOPIC: Caching")
    assert prompt.index("TOPIC: Caching") < prompt.rindex("<topic_content>")


def test_expand_markup_response_hydrates_keys_and_words() -> None:
    word_map = {1: "Hello", 2: "world", 3: "This", 4: "is", 5: "a", 6: "test"}
    data = {
        "segs": [
            {
                "type": "emphasis",
                "pos_idx": [1, "2-3"],
                "data": {
                    "items": [
                        {
                            "pos_idx": 1,
                            "hlts": [{"wrd_idx": [1, 2], "styl": "bold"}]
                        },
                        {
                            "pos_idx": 2,
                            "hlts": [{"wrd_idx": ["3-6"], "styl": "italic"}]
                        }
                    ]
                }
            },
            {
                "type": "title",
                "pos_idx": [4],
                "data": {"lvl": 2, "tit_idx": 4}
            }
        ]
    }

    expanded = _expand_markup_response(data, word_map)

    assert expanded["segments"][0]["type"] == "emphasis"
    assert expanded["segments"][0]["position_indices"] == [1, 2, 3]
    # Check singular position_index in nested items
    assert expanded["segments"][0]["data"]["items"][0]["position_index"] == 1
    assert expanded["segments"][0]["data"]["items"][0]["highlights"][0]["phrase"] == "Hello world"
    assert expanded["segments"][0]["data"]["items"][0]["highlights"][0]["style"] == "bold"
    assert expanded["segments"][0]["data"]["items"][1]["position_index"] == 2
    assert expanded["segments"][0]["data"]["items"][1]["highlights"][0]["phrase"] == "This is a test"

    assert expanded["segments"][1]["type"] == "title"
    assert expanded["segments"][1]["position_indices"] == [4]
    assert expanded["segments"][1]["data"]["level"] == 2
    assert expanded["segments"][1]["data"]["title_position_index"] == 4


def test_expand_markup_response_preserves_plural_for_quote_and_paragraph() -> None:
    word_map = {1: "Quote", 2: "text", 3: "Para", 4: "text"}
    data = {
        "segs": [
            {
                "type": "quote",
                "pos_idx": [1, 2],
                "data": {
                    "attr": "Author",
                    "pos_idx": [1, 2]
                }
            },
            {
                "type": "paragraph",
                "pos_idx": [3, 4],
                "data": {
                    "paras": [
                        {"pos_idx": [3, 4]}
                    ]
                }
            }
        ]
    }

    expanded = _expand_markup_response(data, word_map)

    assert expanded["segments"][0]["type"] == "quote"
    assert expanded["segments"][0]["data"]["position_indices"] == [1, 2]
    assert "position_index" not in expanded["segments"][0]["data"]

    assert expanded["segments"][1]["type"] == "paragraph"
    assert expanded["segments"][1]["data"]["paragraphs"][0]["position_indices"] == [3, 4]
    assert "position_index" not in expanded["segments"][1]["data"]["paragraphs"][0]


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


def test_validate_markup_response_accepts_empty_paragraph_groups_via_hydration() -> None:
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

    assert _validate_markup_response(response, [1, 2]) is True


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
    positions, word_map = _build_markup_positions(
        [1],
        ["What does computation mean? — How in-model execution differs from tool use."],
    )

    assert [position["text"] for position in positions] == [
        "What does computation mean?",
        "How in-model execution differs from tool use.",
    ]
    assert [position["source_sentence_index"] for position in positions] == [1, 1]
    assert positions[0]["marked_text"] == "What[w1] does[w2] computation[w3] mean?[w4]"
    assert word_map[1] == "What"
    assert word_map[2] == "does"
    assert word_map[3] == "computation"
    assert word_map[4] == "mean?"


def test_expand_markup_response_auto_generates_list_items() -> None:
    data = {
        "segs": [
            {
                "type": "list",
                "pos_idx": ["3-5"],
                "data": {"ord": True},
            }
        ]
    }
    expanded = _expand_markup_response(data, {})
    items = expanded["segments"][0]["data"]["items"]
    assert items == [
        {"position_index": 3},
        {"position_index": 4},
        {"position_index": 5},
    ]
    assert expanded["segments"][0]["data"]["ordered"] is True


def test_expand_markup_response_auto_generates_code_items() -> None:
    data = {
        "segs": [
            {
                "type": "code",
                "pos_idx": [7, 8],
                "data": {"lang": "python"},
            }
        ]
    }
    expanded = _expand_markup_response(data, {})
    items = expanded["segments"][0]["data"]["items"]
    assert items == [{"position_index": 7}, {"position_index": 8}]
    assert expanded["segments"][0]["data"]["language"] == "python"


def test_expand_markup_response_auto_generates_steps_items() -> None:
    data = {
        "segs": [
            {
                "type": "steps",
                "pos_idx": ["2-4"],
                "data": {},
            }
        ]
    }
    expanded = _expand_markup_response(data, {})
    items = expanded["segments"][0]["data"]["items"]
    assert items == [
        {"position_index": 2, "step_number": 1},
        {"position_index": 3, "step_number": 2},
        {"position_index": 4, "step_number": 3},
    ]


def test_expand_markup_response_does_not_overwrite_existing_list_items() -> None:
    """LLM-provided items (backward compat) should not be replaced."""
    data = {
        "segs": [
            {
                "type": "list",
                "pos_idx": [1, 2],
                "data": {
                    "ord": False,
                    "items": [{"pos_idx": 1}, {"pos_idx": 2}],
                },
            }
        ]
    }
    expanded = _expand_markup_response(data, {})
    # items came from LLM — should have been converted to position_index via _walk
    assert len(expanded["segments"][0]["data"]["items"]) == 2


def test_expand_markup_response_hydrates_w_prefixed_word_indices() -> None:
    word_map = {3: "Feb", 4: "8,", 5: "2026"}
    data = {
        "segs": [
            {
                "type": "timeline",
                "pos_idx": [1],
                "data": {
                    "evts": [{"pos_idx": 1, "wrd_idx": ["w3", "w4-w5"]}],
                },
            }
        ]
    }
    expanded = _expand_markup_response(data, word_map)
    event = expanded["segments"][0]["data"]["events"][0]
    assert event["date"] == "Feb 8, 2026"
