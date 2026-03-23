from unittest.mock import MagicMock, patch

from lib.tasks.insights_generation import (
    _align_source_sentences_to_results_sentences,
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
