"""Unit tests for topic_extraction helper functions."""

from lib.tasks.topic_extraction import (
    build_tagged_text,
    normalize_topic,
    normalize_topic_ranges,
    parse_llm_ranges,
    parse_range_string,
)


def test_normalize_topic() -> None:
    assert normalize_topic("Hello World") == "hello_world"
    assert normalize_topic("AI/ML-Tools") == "ai_ml_tools"
    assert normalize_topic("  Spaces  ") == "spaces"


def test_build_tagged_text() -> None:
    sentences = ["First sentence.", "Second sentence."]
    result = build_tagged_text(sentences, start_index=5)
    assert result == "{5} First sentence.\n{6} Second sentence."


def test_build_tagged_text_default_start() -> None:
    sentences = ["Hello."]
    result = build_tagged_text(sentences)
    assert result == "{0} Hello."


def test_parse_range_string() -> None:
    assert parse_range_string("0-5, 10-15, 20") == [
        (0, 5),
        (10, 15),
        (20, 20),
    ]


def test_parse_range_string_single() -> None:
    assert parse_range_string("5") == [(5, 5)]


def test_parse_range_string_empty() -> None:
    assert parse_range_string("") == []


def test_parse_range_string_negative_ignored() -> None:
    assert parse_range_string("-5") == []


def test_parse_llm_ranges() -> None:
    response = "Technology>AI>GPT-4: 0-5\nSport>Football>England: 2, 4, 6-9"
    result = parse_llm_ranges(response)
    assert len(result) == 4
    assert result[0] == ("Technology>AI>GPT-4", 0, 5)
    assert result[1] == ("Sport>Football>England", 2, 2)
    assert result[2] == ("Sport>Football>England", 4, 4)
    assert result[3] == ("Sport>Football>England", 6, 9)


def test_parse_llm_ranges_skips_invalid_lines() -> None:
    response = "No colon here\nTopic: 1-3"
    result = parse_llm_ranges(response)
    assert len(result) == 1
    assert result[0] == ("Topic", 1, 3)


def test_normalize_topic_ranges() -> None:
    ranges = [("A", 5, 0), ("B", 10, 15)]
    result = normalize_topic_ranges(ranges, max_index=20)
    # Swapped start/end for A, filled gaps
    assert result[0] == ("A", 0, 5)
    # Gap 6-9 filled with no_topic
    assert result[1] == ("no_topic", 6, 9)
    assert result[2] == ("B", 10, 15)
    # Gap 16-20 filled with no_topic
    assert result[3] == ("no_topic", 16, 20)


def test_normalize_topic_ranges_empty() -> None:
    assert normalize_topic_ranges([], 10) == []


def test_normalize_topic_ranges_overlap() -> None:
    ranges = [("A", 0, 5), ("B", 3, 8)]
    result = normalize_topic_ranges(ranges, max_index=10)
    assert result[0] == ("A", 0, 5)
    # B starts at 3 which is < current=6, so adjusted to max(start, current)=6
    assert result[1] == ("B", 6, 8)
    assert result[2] == ("no_topic", 9, 10)
