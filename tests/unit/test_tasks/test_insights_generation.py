from unittest.mock import MagicMock, patch

from lib.tasks.insights_generation import (
    _build_compatible_insight_llm,
    _build_compatible_insight_parser,
    _align_source_sentences_to_results_sentences,
    _map_insight_ranges_to_topics_by_overlap,
    _map_insight_source_sentences_to_topics,
    _insight_ranges_to_sentence_indices,
    _map_insight_sentence_indices_to_topics,
    process_insights_generation,
)


class _Range:
    def __init__(self, start: int, end: int) -> None:
        self.start = start
        self.end = end


def test_ranges_convert_to_1_based_sentence_indices():
    ranges = [_Range(0, 1), _Range(1, 2)]

    result = _insight_ranges_to_sentence_indices(ranges)

    assert result == [1, 2, 3]


def test_maps_multiple_topics_in_article_order():
    topics = [
        {"name": "Topic A", "sentences": [1, 2]},
        {"name": "Topic B", "sentences": [5, 6]},
        {"name": "Topic C", "sentences": [3, 4]},
    ]

    result = _map_insight_sentence_indices_to_topics([6, 4, 2], topics)

    assert result == ["Topic A", "Topic C", "Topic B"]


def test_aligns_source_sentences_to_canonical_results_sentences():
    source_sentences = ["Sentence B.", "Sentence D."]
    results_sentences = ["Sentence A.", "Sentence B.", "Sentence C.", "Sentence D."]

    result = _align_source_sentences_to_results_sentences(source_sentences, results_sentences)

    assert result == [2, 4]


def test_maps_topics_from_source_sentences_when_indices_are_unavailable():
    source_sentences = ["Sentence B.", "Sentence D."]
    results_sentences = ["Sentence A.", "Sentence B.", "Sentence C.", "Sentence D."]
    topics = [
        {"name": "Topic A", "sentences": [2]},
        {"name": "Topic B", "sentences": [4]},
    ]

    result = _map_insight_source_sentences_to_topics(source_sentences, results_sentences, topics)

    assert result == ["Topic A", "Topic B"]


def test_maps_topics_from_overlapping_ranges_without_exact_index_match():
    ranges = [{"start": 4, "end": 5}]
    topics = [
        {"name": "Topic A", "ranges": [{"sentence_start": 2, "sentence_end": 4}]},
        {"name": "Topic B", "ranges": [{"sentence_start": 6, "sentence_end": 8}]},
    ]

    result = _map_insight_ranges_to_topics_by_overlap(ranges, topics)

    assert result == ["Topic B"]


def test_build_compatible_insight_llm_binds_legacy_builder_client_and_retry_policy():
    legacy_insight_llm = MagicMock()
    legacy_insight_llm._client = None
    legacy_insight_llm._retry_policy = None
    llm_callable = MagicMock()
    retry_policy = MagicMock()
    chunker = MagicMock()

    def _legacy_build_insight_llm(*, temperature: float = 0.0, chunker: object | None = None) -> MagicMock:
        assert temperature == 0.0
        assert chunker is not None
        return legacy_insight_llm

    with patch("lib.tasks.insights_generation.build_insight_llm", side_effect=_legacy_build_insight_llm):
        result = _build_compatible_insight_llm(
            llm_callable,
            temperature=0.0,
            chunker=chunker,
            retry_policy=retry_policy,
        )

    assert result is legacy_insight_llm
    assert legacy_insight_llm._client is llm_callable
    assert legacy_insight_llm._retry_policy is retry_policy


def test_build_compatible_insight_parser_uses_legacy_zero_arg_constructor():
    legacy_parser = MagicMock()

    class _LegacyInsightParser:
        def __init__(self) -> None:
            pass

    with patch("lib.tasks.insights_generation.InsightParser", _LegacyInsightParser):
        with patch("lib.tasks.insights_generation.inspect.signature", return_value=MagicMock(parameters={})):
            with patch("lib.tasks.insights_generation.InsightParser", return_value=legacy_parser) as mock_parser:
                result = _build_compatible_insight_parser(input_mode="text")

    assert result is legacy_parser
    mock_parser.assert_called_once_with()


def test_process_insights_generation_stores_insights(mock_db):
    submission = {
        "submission_id": "sub-123",
        "html_content": "<p>One. Two.</p>",
        "text_content": "One. Two.",
        "results": {
            "topics": [{"name": "Topic A", "sentences": [1, 2]}],
        },
    }
    mock_llm = MagicMock()
    mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

    with patch("lib.tasks.insights_generation._generate_insights", return_value=[{"name": "Insight A"}]):
        process_insights_generation(submission, mock_db, mock_llm)

    update_call = mock_db.submissions.update_one.call_args
    assert update_call[0][0] == {"submission_id": "sub-123"}
    assert update_call[0][1]["$set"]["results.insights"] == [{"name": "Insight A"}]


def test_process_insights_generation_requires_topics(mock_db):
    submission = {
        "submission_id": "sub-123",
        "html_content": "<p>One. Two.</p>",
        "text_content": "One. Two.",
        "results": {"topics": []},
    }
    mock_llm = MagicMock()

    try:
        process_insights_generation(submission, mock_db, mock_llm)
    except ValueError as exc:
        assert str(exc) == "Topic extraction must be completed first"
    else:
        raise AssertionError("Expected ValueError")
