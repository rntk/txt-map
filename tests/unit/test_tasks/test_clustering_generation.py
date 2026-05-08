"""Unit tests for clustering_generation task."""

from typing import Any
from unittest.mock import MagicMock, patch

import numpy as np
from scipy.sparse import csr_matrix

from lib.tasks.clustering_generation import process_clustering_generation


def test_process_clustering_generation_zero_sentences() -> None:
    db = MagicMock()
    submission: dict[str, Any] = {
        "submission_id": "sub-0",
        "results": {
            "sentences": [],
            "topics": [],
        },
    }
    process_clustering_generation(submission, db, None)
    db.submissions.update_one.assert_called_once_with(
        {"submission_id": "sub-0"},
        {"$set": {"results.clusters": []}},
    )


def test_process_clustering_generation_one_sentence() -> None:
    db = MagicMock()
    submission: dict[str, Any] = {
        "submission_id": "sub-1",
        "results": {
            "sentences": ["Only one."],
            "topics": [{"name": "A", "sentences": [1]}],
        },
    }
    process_clustering_generation(submission, db, None)
    db.submissions.update_one.assert_called_once_with(
        {"submission_id": "sub-1"},
        {"$set": {"results.clusters": []}},
    )


def test_process_clustering_generation_missing_results_keys() -> None:
    db = MagicMock()
    submission: dict[str, Any] = {
        "submission_id": "sub-missing",
        "results": {},
    }
    process_clustering_generation(submission, db, None)
    db.submissions.update_one.assert_called_once_with(
        {"submission_id": "sub-missing"},
        {"$set": {"results.clusters": []}},
    )


def test_process_clustering_generation_missing_topics_with_sentences() -> None:
    db = MagicMock()
    sentences = ["sentence one", "sentence two"]
    submission: dict[str, Any] = {
        "submission_id": "sub-missing-topics",
        "results": {"sentences": sentences},
    }
    process_clustering_generation(submission, db, None)
    db.submissions.update_one.assert_called_once()


def test_process_clustering_generation_two_sentences() -> None:
    db = MagicMock()
    sentences = [
        "Machine learning is great.",
        "Deep learning improves accuracy.",
    ]
    submission: dict[str, Any] = {
        "submission_id": "sub-2",
        "results": {"sentences": sentences, "topics": []},
    }
    process_clustering_generation(submission, db, None)
    db.submissions.update_one.assert_called_once()
    clusters = db.submissions.update_one.call_args.args[1]["$set"]["results.clusters"]
    # k = min(max(2, 2//10), 20) = 2, so 2 clusters
    assert len(clusters) == 2
    total_sentences = sum(c["sentence_count"] for c in clusters)
    assert total_sentences == 2
    for c in clusters:
        assert c["overlapping_topics"] == []


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
        "submission_id": "sub-3",
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
    # Verify descending sort by sentence_count
    counts = [c["sentence_count"] for c in clusters]
    assert counts == sorted(counts, reverse=True)


def test_process_clustering_generation_no_topics() -> None:
    db = MagicMock()
    sentences = [
        "First sentence here.",
        "Second sentence here.",
        "Third sentence here.",
        "Fourth sentence here.",
    ]
    submission: dict[str, Any] = {
        "submission_id": "sub-4",
        "results": {"sentences": sentences, "topics": []},
    }
    process_clustering_generation(submission, db, None)
    clusters = db.submissions.update_one.call_args.args[1]["$set"]["results.clusters"]
    assert len(clusters) >= 1
    for c in clusters:
        assert c["overlapping_topics"] == []


def test_process_clustering_generation_topic_defaults() -> None:
    db = MagicMock()
    sentences = [
        "First sentence here.",
        "Second sentence here.",
        "Third sentence here.",
        "Fourth sentence here.",
    ]
    topics = [
        {"sentences": [1, 2]},  # missing "name"
        {"name": "OnlyName"},  # missing "sentences"
    ]
    submission: dict[str, Any] = {
        "submission_id": "sub-5",
        "results": {"sentences": sentences, "topics": topics},
    }
    process_clustering_generation(submission, db, None)
    clusters = db.submissions.update_one.call_args.args[1]["$set"]["results.clusters"]
    assert len(clusters) >= 1


def test_process_clustering_generation_overlapping_topics() -> None:
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
    # Overlapping topics: sentence 1 belongs to both ML and AI
    topics = [
        {"name": "ML", "sentences": [1, 2, 3]},
        {"name": "AI", "sentences": [1, 4]},
        {"name": "PL", "sentences": [5, 6, 7, 8, 9, 10, 11]},
    ]
    submission: dict[str, Any] = {
        "submission_id": "sub-6",
        "results": {"sentences": sentences, "topics": topics},
    }
    process_clustering_generation(submission, db, None)
    clusters = db.submissions.update_one.call_args.args[1]["$set"]["results.clusters"]
    assert len(clusters) >= 2
    # Find the cluster containing sentence 1 and verify overlapping_topics order/dedup
    cluster_with_s1 = None
    for c in clusters:
        if 1 in c["sentence_indices"]:
            cluster_with_s1 = c
            break
    assert cluster_with_s1 is not None
    # overlapping_topics should have ML first (first seen), then AI, in order, no duplicates
    assert "ML" in cluster_with_s1["overlapping_topics"]
    assert "AI" in cluster_with_s1["overlapping_topics"]


def test_process_clustering_generation_thirty_sentences() -> None:
    db = MagicMock()
    sentences = [f"Sentence number {i} about machine learning and data." for i in range(30)]
    submission: dict[str, Any] = {
        "submission_id": "sub-7",
        "results": {"sentences": sentences, "topics": []},
    }
    process_clustering_generation(submission, db, None)
    clusters = db.submissions.update_one.call_args.args[1]["$set"]["results.clusters"]
    # 30 sentences // 10 = 3, so k should be 3
    assert len(clusters) == 3


@patch("lib.tasks.clustering_generation.AgglomerativeClustering")
@patch("lib.tasks.clustering_generation.cosine_distances")
@patch("lib.tasks.clustering_generation.TfidfVectorizer")
def test_process_clustering_generation_mocked_sklearn(
    mock_vectorizer_cls: MagicMock,
    mock_cosine: MagicMock,
    mock_clustering_cls: MagicMock,
) -> None:
    """Comprehensive mocked test to kill sklearn parameter and data-processing mutants."""
    db = MagicMock()
    sentences = ["sentence one", "sentence two", "sentence three"]
    topics = [
        {"name": "TopicA", "sentences": [1, 2]},
        {"sentences": [3]},  # missing name
    ]
    submission: dict[str, Any] = {
        "submission_id": "sub-mock",
        "results": {"sentences": sentences, "topics": topics},
    }

    mock_vec = MagicMock()
    # 7 features so [:5] vs [:6] produces different keywords
    dense = np.array([
        [2.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0],
        [1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0],
        [0.0, 2.0, 0.0, 0.0, 0.0, 0.0, 1.0],
    ])
    mock_vec.fit_transform.return_value = csr_matrix(dense)
    mock_vec.get_feature_names_out.return_value = np.array(
        ["f1", "f2", "f3", "f4", "f5", "f6", "f7"]
    )
    mock_vectorizer_cls.return_value = mock_vec

    # Include negative values to kill np.clip mutants
    raw_dist = np.array([
        [0.0, -0.1, 1.0],
        [-0.1, 0.0, 0.5],
        [1.0, 0.5, 0.0],
    ])
    mock_cosine.return_value = raw_dist

    mock_model = MagicMock()
    mock_model.fit_predict.return_value = np.array([0, 0, 1])
    mock_clustering_cls.return_value = mock_model

    process_clustering_generation(submission, db, None)

    mock_vectorizer_cls.assert_called_once_with(
        max_features=5000,
        stop_words="english",
        ngram_range=(1, 2),
    )
    mock_cosine.assert_called_once()
    np.testing.assert_array_equal(
        mock_cosine.call_args.args[0],
        dense,
    )
    mock_clustering_cls.assert_called_once_with(
        n_clusters=2,
        metric="precomputed",
        linkage="average",
    )
    # Assert exact clipped distance matrix passed to fit_predict
    expected_clipped = np.array([
        [0.0, 0.0, 1.0],
        [0.0, 0.0, 0.5],
        [1.0, 0.5, 0.0],
    ])
    np.testing.assert_array_equal(
        mock_clustering_cls.return_value.fit_predict.call_args.args[0],
        expected_clipped,
    )

    db.submissions.update_one.assert_called_once()
    args = db.submissions.update_one.call_args
    assert args.args[0] == {"submission_id": "sub-mock"}
    clusters = args.args[1]["$set"]["results.clusters"]
    assert len(clusters) == 2

    # Cluster 0: sentences 1 and 2 (indices 0, 1)
    c0 = [c for c in clusters if c["cluster_id"] == 0][0]
    assert c0["sentence_indices"] == [1, 2]
    assert c0["sentence_count"] == 2
    # avg_vec = [1.5, 1.0, 1.0, 1.0, 0.5, 0.5, 0.0]
    # argsort reversed (stable) = [0, 3, 2, 1, 5, 4, 6][:5] = [0, 3, 2, 1, 5]
    # > 0 filter removes index 6
    assert c0["keywords"] == ["f1", "f4", "f3", "f2", "f6"]
    assert c0["overlapping_topics"] == ["TopicA"]

    # Cluster 1: sentence 3 (index 2)
    c1 = [c for c in clusters if c["cluster_id"] == 1][0]
    assert c1["sentence_indices"] == [3]
    assert c1["sentence_count"] == 1
    # avg_vec = [0.0, 2.0, 0.0, 0.0, 0.0, 0.0, 1.0]
    # argsort reversed (stable) = [1, 6, 5, 4, 3, 2, 0][:5] = [1, 6, 5, 4, 3]
    # > 0 filter removes indices 5,4,3
    assert c1["keywords"] == ["f2", "f7"]
    assert c1["overlapping_topics"] == [""]

    # Verify descending sort by sentence_count
    assert clusters[0]["sentence_count"] >= clusters[1]["sentence_count"]


@patch("lib.tasks.clustering_generation.AgglomerativeClustering")
@patch("lib.tasks.clustering_generation.cosine_distances")
@patch("lib.tasks.clustering_generation.TfidfVectorizer")
def test_process_clustering_generation_mocked_sklearn_many_sentences(
    mock_vectorizer_cls: MagicMock,
    mock_cosine: MagicMock,
    mock_clustering_cls: MagicMock,
) -> None:
    """Test the k=20 cap with 210 sentences."""
    db = MagicMock()
    sentences = [f"sentence {i}" for i in range(210)]
    submission: dict[str, Any] = {
        "submission_id": "sub-many",
        "results": {"sentences": sentences, "topics": []},
    }

    mock_vec = MagicMock()
    mock_vec.fit_transform.return_value = csr_matrix(np.eye(210, 2))
    mock_vec.get_feature_names_out.return_value = np.array(["w1", "w2"])
    mock_vectorizer_cls.return_value = mock_vec

    mock_cosine.return_value = np.eye(210)

    mock_model = MagicMock()
    mock_model.fit_predict.return_value = np.zeros(210, dtype=int)
    mock_clustering_cls.return_value = mock_model

    process_clustering_generation(submission, db, None)

    mock_clustering_cls.assert_called_once_with(
        n_clusters=20,
        metric="precomputed",
        linkage="average",
    )
