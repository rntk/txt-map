"""Unit tests for topic_modeling_generation task."""

from typing import Any
from unittest.mock import MagicMock

from lib.tasks.topic_modeling_generation import process_topic_modeling_generation


def test_process_topic_modeling_generation_few_sentences() -> None:
    db = MagicMock()
    submission: dict[str, Any] = {
        "submission_id": "sub-1",
        "results": {
            "sentences": ["Only one."],
            "topics": [{"name": "A", "sentences": [1]}],
        },
    }
    process_topic_modeling_generation(submission, db, None)
    db.submissions.update_one.assert_called_once()
    assert (
        db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"] == {}
    )


def test_process_topic_modeling_generation_with_sentences() -> None:
    db = MagicMock()
    sentences = [
        "Machine learning is great.",
        "Deep learning improves accuracy.",
        "Neural networks are powerful.",
        "Data science uses statistics.",
        "Python is a programming language.",
    ]
    topics = [
        {"name": "ML", "sentences": [1, 2, 3]},
        {"name": "DS", "sentences": [4, 5]},
    ]
    submission: dict[str, Any] = {
        "submission_id": "sub-2",
        "results": {"sentences": sentences, "topics": topics},
    }
    process_topic_modeling_generation(submission, db, None)
    db.submissions.update_one.assert_called_once()
    payload = db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"]
    assert "latent_topics" in payload
    assert "topic_mapping" in payload
    assert len(payload["latent_topics"]) >= 2
    assert len(payload["topic_mapping"]) == 2


def test_process_topic_modeling_generation_empty_topics() -> None:
    db = MagicMock()
    sentences = [
        "First sentence here.",
        "Second sentence here.",
        "Third sentence here.",
    ]
    submission: dict[str, Any] = {
        "submission_id": "sub-3",
        "results": {"sentences": sentences, "topics": []},
    }
    process_topic_modeling_generation(submission, db, None)
    payload = db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"]
    assert len(payload["topic_mapping"]) == 0


def test_process_topic_modeling_generation_topic_with_no_valid_indices() -> None:
    db = MagicMock()
    sentences = ["Sentence one.", "Sentence two."]
    topics = [{"name": "Bad", "sentences": [99]}]
    submission: dict[str, Any] = {
        "submission_id": "sub-4",
        "results": {"sentences": sentences, "topics": topics},
    }
    process_topic_modeling_generation(submission, db, None)
    payload = db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"]
    mapping = payload["topic_mapping"][0]
    assert mapping["topic_name"] == "Bad"
    assert mapping["latent_topic_ids"] == []
    assert mapping["scores"] == []
