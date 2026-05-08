"""Unit tests for clustering_generation task."""

from typing import Any
from unittest.mock import MagicMock

from lib.tasks.clustering_generation import process_clustering_generation


def test_process_clustering_generation_few_sentences() -> None:
    db = MagicMock()
    submission: dict[str, Any] = {
        "submission_id": "sub-1",
        "results": {
            "sentences": ["Only one."],
            "topics": [{"name": "A", "sentences": [1]}],
        },
    }
    process_clustering_generation(submission, db, None)
    db.submissions.update_one.assert_called_once()
    assert db.submissions.update_one.call_args.args[1]["$set"]["results.clusters"] == []


def test_process_clustering_generation_with_sentences() -> None:
    db = MagicMock()
    sentences = [
        "Machine learning is great.",
        "Deep learning improves accuracy.",
        "Neural networks are powerful.",
        "Data science uses statistics.",
        "Python is a programming language.",
        "Java is also a language.",
        "C++ is fast.",
        "Rust is safe.",
        "Go is concurrent.",
        "Ruby is dynamic.",
        "Perl is old.",
    ]
    topics = [
        {"name": "ML", "sentences": [1, 2, 3]},
        {"name": "PL", "sentences": [5, 6, 7, 8, 9, 10, 11]},
    ]
    submission: dict[str, Any] = {
        "submission_id": "sub-2",
        "results": {"sentences": sentences, "topics": topics},
    }
    process_clustering_generation(submission, db, None)
    db.submissions.update_one.assert_called_once()
    clusters = db.submissions.update_one.call_args.args[1]["$set"]["results.clusters"]
    assert len(clusters) >= 2
    # Check cluster structure
    for c in clusters:
        assert "cluster_id" in c
        assert "keywords" in c
        assert "sentence_indices" in c
        assert "sentence_count" in c
        assert "overlapping_topics" in c


def test_process_clustering_generation_no_topics() -> None:
    db = MagicMock()
    sentences = [
        "First sentence here.",
        "Second sentence here.",
        "Third sentence here.",
        "Fourth sentence here.",
    ]
    submission: dict[str, Any] = {
        "submission_id": "sub-3",
        "results": {"sentences": sentences, "topics": []},
    }
    process_clustering_generation(submission, db, None)
    clusters = db.submissions.update_one.call_args.args[1]["$set"]["results.clusters"]
    assert len(clusters) >= 1
    for c in clusters:
        assert c["overlapping_topics"] == []
