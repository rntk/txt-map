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


def test_process_topic_extraction_creates_cache_collection() -> None:
    db = MagicMock()
    db.list_collection_names.return_value = []
    llm = MagicMock(spec=["estimate_tokens", "call", "max_context_tokens"])
    llm.estimate_tokens.return_value = 10
    llm.max_context_tokens = 64000
    llm.call.return_value = "Topic A: 0-2"
    submission = {
        "submission_id": "sub-1",
        "text_content": "Sentence one. Sentence two. Sentence three.",
        "results": {"sentences": ["Sentence one.", "Sentence two.", "Sentence three."]},
    }

    with patch("lib.tasks.topic_extraction.SubmissionsStorage") as mock_storage:
        mock_instance = MagicMock()
        mock_storage.return_value = mock_instance
        process_topic_extraction(submission, db, llm)

    db.create_collection.assert_called_once_with("llm_cache")
    db.llm_cache.create_index.assert_called_once_with("prompt_hash", unique=True)


def test_process_topic_extraction_uses_fallback_context_size() -> None:
    db = MagicMock()
    db.list_collection_names.return_value = ["llm_cache"]
    llm = MagicMock(spec=["estimate_tokens", "call"])
    llm.estimate_tokens.return_value = 10
    llm.call.return_value = "Topic A: 0-2"
    submission = {
        "submission_id": "sub-1",
        "text_content": "Sentence one. Sentence two. Sentence three.",
        "results": {"sentences": ["Sentence one.", "Sentence two.", "Sentence three."]},
    }

    with patch("lib.tasks.topic_extraction.SubmissionsStorage") as mock_storage:
        mock_instance = MagicMock()
        mock_storage.return_value = mock_instance
        # The function should still work with fallback context_size=64000
        process_topic_extraction(submission, db, llm)

    # Verify it completed without error
    assert True


def test_process_topic_extraction_handles_llm_error_per_chunk(capsys) -> None:
    db = MagicMock()
    db.list_collection_names.return_value = ["llm_cache"]
    db.llm_cache.find_one.return_value = None  # No cache hit
    llm = MagicMock(spec=["estimate_tokens", "call", "max_context_tokens"])
    llm.estimate_tokens.return_value = 10
    llm.max_context_tokens = 64000
    llm.call.side_effect = Exception("LLM failure")
    submission = {
        "submission_id": "sub-1",
        "text_content": "Sentence one. Sentence two. Sentence three.",
        "results": {"sentences": ["Sentence one.", "Sentence two.", "Sentence three."]},
    }

    with patch("lib.tasks.topic_extraction.SubmissionsStorage") as mock_storage:
        mock_instance = MagicMock()
        mock_storage.return_value = mock_instance
        process_topic_extraction(submission, db, llm)

    captured = capsys.readouterr()
    assert "Error calling LLM for chunk" in captured.out


def test_process_topic_extraction_no_topics_found(capsys) -> None:
    db = MagicMock()
    db.list_collection_names.return_value = ["llm_cache"]
    llm = MagicMock(spec=["estimate_tokens", "call", "max_context_tokens"])
    llm.estimate_tokens.return_value = 10
    llm.max_context_tokens = 64000
    llm.call.return_value = ""  # Empty response -> no topics
    submission = {
        "submission_id": "sub-1",
        "text_content": "Sentence one. Sentence two. Sentence three.",
        "results": {"sentences": ["Sentence one.", "Sentence two.", "Sentence three."]},
    }

    with patch("lib.tasks.topic_extraction.SubmissionsStorage") as mock_storage:
        mock_instance = MagicMock()
        mock_storage.return_value = mock_instance
        process_topic_extraction(submission, db, llm)

    captured = capsys.readouterr()
    assert "No topics found for submission sub-1" in captured.out


def test_process_topic_extraction_create_index_exception() -> None:
    db = MagicMock()
    db.list_collection_names.return_value = []
    db.llm_cache.create_index.side_effect = Exception("index already exists")
    llm = MagicMock(spec=["estimate_tokens", "call", "max_context_tokens"])
    llm.estimate_tokens.return_value = 10
    llm.max_context_tokens = 64000
    llm.call.return_value = "Topic A: 0-2"
    submission = {
        "submission_id": "sub-1",
        "text_content": "Sentence one. Sentence two. Sentence three.",
        "results": {"sentences": ["Sentence one.", "Sentence two.", "Sentence three."]},
    }

    with patch("lib.tasks.topic_extraction.SubmissionsStorage") as mock_storage:
        mock_instance = MagicMock()
        mock_storage.return_value = mock_instance
        process_topic_extraction(submission, db, llm)

    db.create_collection.assert_called_once_with("llm_cache")
    db.llm_cache.create_index.assert_called_once_with("prompt_hash", unique=True)


class _BadContextSize:
    """Mock LLM where accessing context_size raises."""

    def __init__(self) -> None:
        self.estimate_tokens = MagicMock(return_value=10)
        self.call = MagicMock(return_value="Topic A: 0-2")

    @property
    def context_size(self) -> int:
        raise RuntimeError("bad context_size")

    @property
    def max_context_tokens(self) -> int:
        raise RuntimeError("bad max_context_tokens")


def test_process_topic_extraction_context_size_exception() -> None:
    db = MagicMock()
    db.list_collection_names.return_value = ["llm_cache"]
    llm = _BadContextSize()
    submission = {
        "submission_id": "sub-1",
        "text_content": "Sentence one. Sentence two. Sentence three.",
        "results": {"sentences": ["Sentence one.", "Sentence two.", "Sentence three."]},
    }

    with patch("lib.tasks.topic_extraction.SubmissionsStorage") as mock_storage:
        mock_instance = MagicMock()
        mock_storage.return_value = mock_instance
        process_topic_extraction(submission, db, llm)

    # Should complete without error using fallback context_size=64000
    assert True
