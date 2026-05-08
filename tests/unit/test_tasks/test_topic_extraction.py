"""Unit tests for topic_extraction task."""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from lib.tasks.topic_extraction import (
    generate_subtopics_for_topic,
    process_topic_extraction,
)


def test_generate_subtopics_for_topic_empty_sentences() -> None:
    result = generate_subtopics_for_topic("topic", [], [1], MagicMock(), MagicMock())
    assert result == []


def test_generate_subtopics_for_topic_no_topic() -> None:
    result = generate_subtopics_for_topic(
        "no_topic", ["sentence"], [1], MagicMock(), MagicMock()
    )
    assert result == []


def test_generate_subtopics_for_topic_cached() -> None:
    cache = MagicMock()
    cache.find_one.return_value = {"response": "Subtopic A: 1, 2\nSubtopic B: 3"}
    llm = MagicMock()
    result = generate_subtopics_for_topic(
        "MyTopic", ["s1", "s2", "s3"], [10, 11, 12], llm, cache
    )
    assert len(result) == 2
    assert result[0]["name"] == "Subtopic A"
    assert result[0]["sentences"] == [1, 2]
    assert result[0]["parent_topic"] == "MyTopic"
    llm.call.assert_not_called()
    cache.update_one.assert_not_called()


def test_generate_subtopics_for_topic_llm_call() -> None:
    cache = MagicMock()
    cache.find_one.return_value = None
    llm = MagicMock()
    llm.call.return_value = "Subtopic A: 1, 2\nSubtopic B: 3"
    result = generate_subtopics_for_topic(
        "MyTopic", ["s1", "s2", "s3"], [1, 2, 3], llm, cache
    )
    assert len(result) == 2
    llm.call.assert_called_once()
    cache.update_one.assert_called_once()


def test_generate_subtopics_for_topic_parses_numbers() -> None:
    cache = MagicMock()
    cache.find_one.return_value = {"response": "Intro: 15, 20\nConclusion: 25"}
    llm = MagicMock()
    result = generate_subtopics_for_topic(
        "MyTopic", ["s1", "s2", "s3"], [15, 20, 25], llm, cache
    )
    assert result[0]["sentences"] == [15, 20]
    assert result[1]["sentences"] == [25]


def test_process_topic_extraction_no_sentences() -> None:
    with pytest.raises(ValueError, match="Text splitting must be completed first"):
        process_topic_extraction(
            {"submission_id": "sub-1", "results": {}}, MagicMock(), MagicMock()
        )


def test_process_topic_extraction_with_sentences() -> None:
    db = MagicMock()
    db.list_collection_names.return_value = ["llm_cache"]
    db.llm_cache.find_one.return_value = None
    db.llm_cache.update_one.return_value = MagicMock()
    db.submissions.update_one.return_value.modified_count = 1

    llm = MagicMock()
    llm.estimate_tokens.return_value = 10
    llm.context_size = 1000
    llm.call.return_value = "Technology>AI>GPT-4: 0-1\nSport>Football>England: 2-2"

    submission: dict[str, Any] = {
        "submission_id": "sub-1",
        "html_content": "",
        "text_content": "First. Second. Third.",
        "results": {"sentences": ["First.", "Second.", "Third."]},
    }

    with patch(
        "lib.tasks.topic_extraction.generate_subtopics_for_topic", return_value=[]
    ):
        process_topic_extraction(submission, db, llm)

    db.submissions.update_one.assert_called()
    update_call = db.submissions.update_one.call_args.args[1]["$set"]
    assert "results.topics" in update_call
    assert "results.sentences" in update_call


def test_process_topic_extraction_cached_response() -> None:
    db = MagicMock()
    db.list_collection_names.return_value = ["llm_cache"]
    db.llm_cache.find_one.return_value = {"response": "Technology>AI>GPT-4: 0-2"}
    db.submissions.update_one.return_value.modified_count = 1

    llm = MagicMock()
    llm.estimate_tokens.return_value = 10
    llm.context_size = 1000

    submission: dict[str, Any] = {
        "submission_id": "sub-1",
        "html_content": "",
        "text_content": "First. Second. Third.",
        "results": {"sentences": ["First.", "Second.", "Third."]},
    }

    with patch(
        "lib.tasks.topic_extraction.generate_subtopics_for_topic", return_value=[]
    ):
        process_topic_extraction(submission, db, llm)

    llm.call.assert_not_called()
    db.submissions.update_one.assert_called()
