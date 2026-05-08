"""Unit tests for insights_generation helper functions."""

from unittest.mock import MagicMock

from lib.tasks.insights_generation import (
    _align_source_sentences_to_results_sentences,
    _cache_namespace,
    _coerce_sentence_text,
    _find_matching_result_sentence_indices,
    _insight_ranges_to_sentence_indices,
    _map_insight_ranges_to_topics_by_overlap,
    _map_insight_sentence_indices_to_topics,
    _map_insight_source_sentences_to_topics,
    _normalize_sentence_text,
    _resolve_insight_source_sentences,
)


class FakeSentence:
    def __init__(self, text: str) -> None:
        self.text = text


def test_coerce_sentence_text_string() -> None:
    assert _coerce_sentence_text("hello") == "hello"


def test_coerce_sentence_text_with_text_attr() -> None:
    assert _coerce_sentence_text(FakeSentence("world")) == "world"


def test_coerce_sentence_text_none() -> None:
    assert _coerce_sentence_text(None) == ""


def test_cache_namespace() -> None:
    llm = MagicMock()
    llm.model_id = "provider:model"
    assert _cache_namespace(llm) == "content_annotation:provider:model"


def test_cache_namespace_unknown() -> None:
    assert _cache_namespace(object()) == "content_annotation:unknown"


def test_insight_ranges_to_sentence_indices() -> None:
    class FakeRange:
        def __init__(self, start: int, end: int) -> None:
            self.start = start
            self.end = end

    ranges = [FakeRange(0, 1), FakeRange(3, 3)]
    result = _insight_ranges_to_sentence_indices(ranges)
    # 0-based [0,1] -> 1-based [1,2], [3,3] -> [4]
    assert result == [1, 2, 4]


def test_normalize_sentence_text() -> None:
    assert _normalize_sentence_text("  hello   world  ") == "hello world"


def test_resolve_insight_source_sentences() -> None:
    sentences = ["First.", "Second.", FakeSentence("Third.")]
    result = _resolve_insight_source_sentences([1, 2, 3], sentences)
    assert result == ["First.", "Second.", "Third."]


def test_resolve_insight_source_sentences_out_of_range() -> None:
    sentences = ["First."]
    result = _resolve_insight_source_sentences([1, 99], sentences)
    assert result == ["First."]


def test_align_source_sentences_to_results_sentences() -> None:
    source = ["Hello world.", "Foo bar."]
    results = ["Hello world.", "Foo bar.", "Baz qux."]
    result = _align_source_sentences_to_results_sentences(source, results)
    assert result == [1, 2]


def test_align_source_sentences_empty() -> None:
    assert _align_source_sentences_to_results_sentences([], ["a"]) == []
    assert _align_source_sentences_to_results_sentences(["a"], []) == []


def test_find_matching_result_sentence_indices_exact() -> None:
    results = ["Hello world.", "Foo bar."]
    result = _find_matching_result_sentence_indices("Hello world.", results)
    assert result == [1]


def test_find_matching_result_sentence_indices_substring() -> None:
    results = ["This is a very long sentence about Python."]
    result = _find_matching_result_sentence_indices(
        "This is a very long sentence", results
    )
    assert result == [1]


def test_find_matching_result_sentence_indices_empty() -> None:
    assert _find_matching_result_sentence_indices("", ["a"]) == []


def test_map_insight_sentence_indices_to_topics() -> None:
    topics = [
        {"name": "A", "sentences": [1, 2]},
        {"name": "B", "sentences": [3, 4]},
    ]
    result = _map_insight_sentence_indices_to_topics([1, 3, 4], topics)
    assert result == ["A", "B"]


def test_map_insight_sentence_indices_to_topics_empty() -> None:
    assert _map_insight_sentence_indices_to_topics([], [{"name": "A"}]) == []
    assert _map_insight_sentence_indices_to_topics([1], []) == []


def test_map_insight_ranges_to_topics_by_overlap() -> None:
    ranges = [{"start": 0, "end": 2}]
    topics = [
        {
            "name": "A",
            "ranges": [{"sentence_start": 1, "sentence_end": 3}],
        },
        {"name": "B", "ranges": [{"sentence_start": 10, "sentence_end": 12}]},
    ]
    result = _map_insight_ranges_to_topics_by_overlap(ranges, topics)
    assert result == ["A"]


def test_map_insight_ranges_to_topics_by_overlap_with_sentences() -> None:
    ranges = [{"start": 0, "end": 2}]
    topics = [
        {"name": "A", "sentences": [1, 2, 3]},
        {"name": "B", "sentences": [10, 11]},
    ]
    result = _map_insight_ranges_to_topics_by_overlap(ranges, topics)
    assert result == ["A"]


def test_map_insight_ranges_to_topics_by_overlap_empty() -> None:
    assert _map_insight_ranges_to_topics_by_overlap([], [{"name": "A"}]) == []
    assert _map_insight_ranges_to_topics_by_overlap([{"start": 0, "end": 1}], []) == []


def test_map_insight_source_sentences_to_topics() -> None:
    source = ["Hello world."]
    results = ["Hello world.", "Foo bar."]
    topics = [{"name": "Greeting", "sentences": [1]}]
    result = _map_insight_source_sentences_to_topics(source, results, topics)
    assert result == ["Greeting"]


def test_map_insight_source_sentences_to_topics_empty() -> None:
    assert _map_insight_source_sentences_to_topics([], ["a"], [{"name": "A"}]) == []
