"""Unit tests for topic_modeling_generation task."""

from typing import Any
from unittest.mock import MagicMock, patch

import numpy as np
from scipy.sparse import csr_matrix

from lib.tasks.topic_modeling_generation import process_topic_modeling_generation


def test_process_topic_modeling_generation_zero_sentences() -> None:
    db = MagicMock()
    submission: dict[str, Any] = {
        "submission_id": "sub-0",
        "results": {
            "sentences": [],
            "topics": [],
        },
    }
    process_topic_modeling_generation(submission, db, None)
    db.submissions.update_one.assert_called_once_with(
        {"submission_id": "sub-0"},
        {"$set": {"results.topic_model": {}}},
    )


def test_process_topic_modeling_generation_one_sentence() -> None:
    db = MagicMock()
    submission: dict[str, Any] = {
        "submission_id": "sub-1",
        "results": {
            "sentences": ["Only one."],
            "topics": [{"name": "A", "sentences": [1]}],
        },
    }
    process_topic_modeling_generation(submission, db, None)
    db.submissions.update_one.assert_called_once_with(
        {"submission_id": "sub-1"},
        {"$set": {"results.topic_model": {}}},
    )


def test_process_topic_modeling_generation_missing_results_keys() -> None:
    db = MagicMock()
    submission: dict[str, Any] = {
        "submission_id": "sub-missing",
        "results": {},
    }
    process_topic_modeling_generation(submission, db, None)
    db.submissions.update_one.assert_called_once_with(
        {"submission_id": "sub-missing"},
        {"$set": {"results.topic_model": {}}},
    )


def test_process_topic_modeling_generation_missing_topics_with_sentences() -> None:
    db = MagicMock()
    sentences = ["sentence one", "sentence two"]
    submission: dict[str, Any] = {
        "submission_id": "sub-missing-topics",
        "results": {"sentences": sentences},
    }
    process_topic_modeling_generation(submission, db, None)
    db.submissions.update_one.assert_called_once()


def test_process_topic_modeling_generation_two_sentences() -> None:
    db = MagicMock()
    sentences = ["Sentence one.", "Sentence two."]
    topics = [{"name": "A", "sentences": [1, 2]}]
    submission: dict[str, Any] = {
        "submission_id": "sub-2",
        "results": {"sentences": sentences, "topics": topics},
    }
    process_topic_modeling_generation(submission, db, None)
    db.submissions.update_one.assert_called_once()
    payload = db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"]
    assert "latent_topics" in payload
    assert "topic_mapping" in payload
    # n_components = min(max(2, 1), 15) = 2
    assert len(payload["latent_topics"]) == 2
    assert len(payload["topic_mapping"]) == 1
    for lt in payload["latent_topics"]:
        assert isinstance(lt["id"], int)
        assert isinstance(lt["keywords"], list)
        assert isinstance(lt["weight"], float)
    mapping = payload["topic_mapping"][0]
    assert mapping["topic_name"] == "A"


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
        "submission_id": "sub-3",
        "results": {"sentences": sentences, "topics": topics},
    }
    process_topic_modeling_generation(submission, db, None)
    db.submissions.update_one.assert_called_once()
    payload = db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"]
    assert "latent_topics" in payload
    assert "topic_mapping" in payload
    assert len(payload["latent_topics"]) >= 2
    assert len(payload["topic_mapping"]) == 2
    for lt in payload["latent_topics"]:
        assert isinstance(lt["id"], int)
        assert isinstance(lt["keywords"], list)
        assert isinstance(lt["weight"], float)
    for mapping in payload["topic_mapping"]:
        assert isinstance(mapping["topic_name"], str)
        assert isinstance(mapping["latent_topic_ids"], list)
        assert isinstance(mapping["scores"], list)


def test_process_topic_modeling_generation_empty_topics() -> None:
    db = MagicMock()
    sentences = [
        "First sentence here.",
        "Second sentence here.",
        "Third sentence here.",
    ]
    submission: dict[str, Any] = {
        "submission_id": "sub-4",
        "results": {"sentences": sentences, "topics": []},
    }
    process_topic_modeling_generation(submission, db, None)
    payload = db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"]
    assert len(payload["topic_mapping"]) == 0
    # n_components = min(max(2, 0), 15) = 2
    assert len(payload["latent_topics"]) == 2


def test_process_topic_modeling_generation_topic_with_no_valid_indices() -> None:
    db = MagicMock()
    sentences = ["Sentence one.", "Sentence two."]
    topics = [{"name": "Bad", "sentences": [99]}]
    submission: dict[str, Any] = {
        "submission_id": "sub-5",
        "results": {"sentences": sentences, "topics": topics},
    }
    process_topic_modeling_generation(submission, db, None)
    payload = db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"]
    mapping = payload["topic_mapping"][0]
    assert mapping["topic_name"] == "Bad"
    assert mapping["latent_topic_ids"] == []
    assert mapping["scores"] == []


def test_process_topic_modeling_generation_boundary_indices() -> None:
    db = MagicMock()
    sentences = ["Sentence one.", "Sentence two.", "Sentence three."]
    # idx=1 (first) and idx=3 (last) are boundary values
    topics = [{"name": "Boundary", "sentences": [1, 3]}]
    submission: dict[str, Any] = {
        "submission_id": "sub-6",
        "results": {"sentences": sentences, "topics": topics},
    }
    process_topic_modeling_generation(submission, db, None)
    payload = db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"]
    mapping = payload["topic_mapping"][0]
    assert mapping["topic_name"] == "Boundary"
    # Should have matched latent topics since indices are valid
    assert isinstance(mapping["latent_topic_ids"], list)
    assert isinstance(mapping["scores"], list)


def test_process_topic_modeling_generation_missing_keys() -> None:
    db = MagicMock()
    sentences = ["Sentence one.", "Sentence two."]
    # Topic missing "name" and "sentences"
    topics = [{}]
    submission: dict[str, Any] = {
        "submission_id": "sub-7",
        "results": {"sentences": sentences, "topics": topics},
    }
    process_topic_modeling_generation(submission, db, None)
    payload = db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"]
    mapping = payload["topic_mapping"][0]
    assert mapping["topic_name"] == ""
    assert mapping["latent_topic_ids"] == []
    assert mapping["scores"] == []


def test_process_topic_modeling_generation_many_topics() -> None:
    db = MagicMock()
    sentences = [f"Sentence number {i} about various topics." for i in range(20)]
    # 16 topics to test min(max(2, 16), 15) = 15 cap
    topics = [{"name": f"Topic {i}", "sentences": [i + 1]} for i in range(16)]
    submission: dict[str, Any] = {
        "submission_id": "sub-8",
        "results": {"sentences": sentences, "topics": topics},
    }
    process_topic_modeling_generation(submission, db, None)
    payload = db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"]
    # n_components should be capped at 15
    assert len(payload["latent_topics"]) == 15
    assert len(payload["topic_mapping"]) == 16


@patch("lib.tasks.topic_modeling_generation.NMF")
@patch("lib.tasks.topic_modeling_generation.TfidfVectorizer")
def test_process_topic_modeling_generation_mocked_sklearn(
    mock_vectorizer_cls: MagicMock,
    mock_nmf_cls: MagicMock,
) -> None:
    """Comprehensive mocked test to kill sklearn parameter and data-processing mutants."""
    db = MagicMock()
    sentences = ["s1", "s2"]
    topics = [
        {"name": "TopicA", "sentences": [1, 2]},
        {"name": "TopicB", "sentences": [99]},  # no valid indices -> continue
        {"name": "TopicC", "sentences": [1]},   # tests idx - 1 boundary
    ]
    submission: dict[str, Any] = {
        "submission_id": "sub-mock",
        "results": {"sentences": sentences, "topics": topics},
    }

    mock_vec = MagicMock()
    # 9 features to kill [:8] vs [:9]
    mock_vec.fit_transform.return_value = csr_matrix(np.eye(2, 9))
    mock_vec.get_feature_names_out.return_value = np.array([f"f{i}" for i in range(1, 10)])
    mock_vectorizer_cls.return_value = mock_vec

    mock_nmf = MagicMock()
    # W shape (2, 3)
    # Component 0 sums to 1.0, component 1 sums to 2.0, component 2 sums to 0.0
    # weights = [1/3, 2/3, 0.0] -> kills round(..., 4) vs round(..., 5)
    mock_nmf.fit_transform.return_value = np.array([
        [1.0, 0.0, 0.0],
        [0.0, 2.0, 0.0],
    ])
    # H shape (3, 9)
    # H[0] has zeros to kill >= 0 vs > 0
    # H[1] has non-zero values
    # H[2] all zeros (weight 0.0)
    mock_nmf.components_ = np.array([
        [1.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
        [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    ])
    mock_nmf_cls.return_value = mock_nmf

    process_topic_modeling_generation(submission, db, None)

    mock_vectorizer_cls.assert_called_once_with(
        max_features=5000,
        stop_words="english",
    )
    mock_nmf_cls.assert_called_once_with(
        n_components=3,
        random_state=42,
        max_iter=500,
    )

    db.submissions.update_one.assert_called_once()
    args = db.submissions.update_one.call_args
    assert args.args[0] == {"submission_id": "sub-mock"}
    payload = args.args[1]["$set"]["results.topic_model"]

    # latent_topics
    assert len(payload["latent_topics"]) == 3
    lt0 = payload["latent_topics"][0]
    assert lt0["id"] == 0
    # H[0] = [1.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    # argsort reversed stable = [0, 2, 1, 3, 4, 5, 6, 7, 8][:8]
    # > 0 filter keeps only indices 0 and 2
    assert lt0["keywords"] == ["f1", "f3"]
    # weight = 1/3
    assert lt0["weight"] == 0.3333

    lt1 = payload["latent_topics"][1]
    assert lt1["id"] == 1
    # H[1] = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]
    # argsort reversed stable = [0, 1, 2, 3, 4, 5, 6, 7, 8][:8]
    # > 0 filter keeps all 9, but [:8] limits to 8
    assert lt1["keywords"] == ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"]
    assert lt1["weight"] == 0.6667

    lt2 = payload["latent_topics"][2]
    assert lt2["id"] == 2
    # H[2] all zeros
    assert lt2["keywords"] == []
    assert lt2["weight"] == 0.0

    # topic_mapping
    assert len(payload["topic_mapping"]) == 3

    mapping0 = payload["topic_mapping"][0]
    assert mapping0["topic_name"] == "TopicA"
    # indices_0based = [0, 1]
    # avg_scores = [0.5, 1.0, 0.0]
    # total_s = 1.5, normalized = [1/3, 2/3, 0.0]
    # argsort reversed = [1, 0, 2]
    # >= 0.1: 0 and 1 pass, 2 fails
    assert mapping0["latent_topic_ids"] == [1, 0]
    assert mapping0["scores"] == [0.6667, 0.3333]

    mapping1 = payload["topic_mapping"][1]
    assert mapping1["topic_name"] == "TopicB"
    assert mapping1["latent_topic_ids"] == []
    assert mapping1["scores"] == []

    mapping2 = payload["topic_mapping"][2]
    assert mapping2["topic_name"] == "TopicC"
    # indices_0based = [0]
    # avg_scores = [1.0, 0.0, 0.0]
    # total_s = 1.0, normalized = [1.0, 0.0, 0.0]
    # argsort reversed = [0, 1, 2]
    # >= 0.1: only 0 passes
    assert mapping2["latent_topic_ids"] == [0]
    assert mapping2["scores"] == [1.0]


@patch("lib.tasks.topic_modeling_generation.NMF")
@patch("lib.tasks.topic_modeling_generation.TfidfVectorizer")
def test_process_topic_modeling_generation_mocked_sklearn_zero_total(
    mock_vectorizer_cls: MagicMock,
    mock_nmf_cls: MagicMock,
) -> None:
    """Test behavior when W sum is zero to kill total branch mutants."""
    db = MagicMock()
    sentences = ["s1", "s2"]
    topics = [{"name": "TopicA", "sentences": [1, 2]}]
    submission: dict[str, Any] = {
        "submission_id": "sub-zero",
        "results": {"sentences": sentences, "topics": topics},
    }

    mock_vec = MagicMock()
    mock_vec.fit_transform.return_value = csr_matrix(np.eye(2, 2))
    mock_vec.get_feature_names_out.return_value = np.array(["w1", "w2"])
    mock_vectorizer_cls.return_value = mock_vec

    mock_nmf = MagicMock()
    mock_nmf.fit_transform.return_value = np.zeros((2, 2))
    mock_nmf.components_ = np.eye(2, 2)
    mock_nmf_cls.return_value = mock_nmf

    process_topic_modeling_generation(submission, db, None)

    payload = db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"]
    # total = 0, original returns [0.0, 0.0]
    assert payload["latent_topics"][0]["weight"] == 0.0
    assert payload["latent_topics"][1]["weight"] == 0.0


@patch("lib.tasks.topic_modeling_generation.NMF")
@patch("lib.tasks.topic_modeling_generation.TfidfVectorizer")
def test_process_topic_modeling_generation_mocked_sklearn_small_total(
    mock_vectorizer_cls: MagicMock,
    mock_nmf_cls: MagicMock,
) -> None:
    """Test behavior when total_s is 0.25 to kill total_s > 1 and / vs * mutants."""
    db = MagicMock()
    sentences = ["s1", "s2"]
    topics = [{"name": "TopicA", "sentences": [1, 2]}]
    submission: dict[str, Any] = {
        "submission_id": "sub-small",
        "results": {"sentences": sentences, "topics": topics},
    }

    mock_vec = MagicMock()
    mock_vec.fit_transform.return_value = csr_matrix(np.eye(2, 2))
    mock_vec.get_feature_names_out.return_value = np.array(["w1", "w2"])
    mock_vectorizer_cls.return_value = mock_vec

    mock_nmf = MagicMock()
    # W shape (2, 2), sentences=2, n_components=2
    # TopicA uses sentences [1,2] -> indices [0,1]
    # avg_scores = mean of W[0] and W[1] = [0.25, 0.0]
    # total_s = 0.25
    # Original normalizes: [1.0, 0.0]
    # Mutant total_s > 1: skips normalization -> [0.25, 0.0]
    # Mutant * total_s: multiplies -> [0.0625, 0.0]
    mock_nmf.fit_transform.return_value = np.array([
        [0.2, 0.1],
        [0.1, 0.1],
    ])
    mock_nmf.components_ = np.eye(2, 2)
    mock_nmf_cls.return_value = mock_nmf

    process_topic_modeling_generation(submission, db, None)

    payload = db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"]
    # topic_weights_raw = [0.3, 0.2], total = 0.5, normalized = [0.6, 0.4]
    assert payload["latent_topics"][0]["weight"] == 0.6
    assert payload["latent_topics"][1]["weight"] == 0.4

    mapping = payload["topic_mapping"][0]
    assert mapping["topic_name"] == "TopicA"
    # avg_scores = [0.15, 0.1], total_s = 0.25
    # Original normalizes to [0.6, 0.4]
    # Mutant total_s > 1 skips normalization -> [0.15, 0.1]
    assert mapping["latent_topic_ids"] == [0, 1]
    assert mapping["scores"] == [0.6, 0.4]


@patch("lib.tasks.topic_modeling_generation.NMF")
@patch("lib.tasks.topic_modeling_generation.TfidfVectorizer")
def test_process_topic_modeling_generation_mocked_sklearn_threshold(
    mock_vectorizer_cls: MagicMock,
    mock_nmf_cls: MagicMock,
) -> None:
    """Test behavior with avg_scores exactly at threshold to kill >= vs > mutant."""
    db = MagicMock()
    sentences = ["s1", "s2"]
    topics = [{"name": "TopicA", "sentences": [1]}]
    submission: dict[str, Any] = {
        "submission_id": "sub-thresh",
        "results": {"sentences": sentences, "topics": topics},
    }

    mock_vec = MagicMock()
    mock_vec.fit_transform.return_value = csr_matrix(np.eye(2, 2))
    mock_vec.get_feature_names_out.return_value = np.array(["w1", "w2"])
    mock_vectorizer_cls.return_value = mock_vec

    mock_nmf = MagicMock()
    # W shape (2, 2)
    # TopicA uses sentence 1 -> W[0] = [0.1, 0.9]
    mock_nmf.fit_transform.return_value = np.array([
        [0.1, 0.9],
        [0.0, 0.0],
    ])
    mock_nmf.components_ = np.eye(2, 2)
    mock_nmf_cls.return_value = mock_nmf

    process_topic_modeling_generation(submission, db, None)

    payload = db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"]
    mapping = payload["topic_mapping"][0]
    # avg_scores = [0.1, 0.9]
    # original >= 0.1 includes both -> latent_topic_ids = [1, 0]
    # mutant > 0.1 excludes 0.1 -> latent_topic_ids = [1]
    assert mapping["latent_topic_ids"] == [1, 0]
    assert mapping["scores"] == [0.9, 0.1]


@patch("lib.tasks.topic_modeling_generation.NMF")
@patch("lib.tasks.topic_modeling_generation.TfidfVectorizer")
def test_process_topic_modeling_generation_mocked_sklearn_many_topics(
    mock_vectorizer_cls: MagicMock,
    mock_nmf_cls: MagicMock,
) -> None:
    """Test the 15-component cap with mocked sklearn."""
    db = MagicMock()
    sentences = [f"sentence {i}" for i in range(20)]
    topics = [{"name": f"T{i}", "sentences": [i + 1]} for i in range(16)]
    submission: dict[str, Any] = {
        "submission_id": "sub-cap",
        "results": {"sentences": sentences, "topics": topics},
    }

    mock_vec = MagicMock()
    mock_vec.fit_transform.return_value = csr_matrix(np.eye(20, 2))
    mock_vec.get_feature_names_out.return_value = np.array(["w1", "w2"])
    mock_vectorizer_cls.return_value = mock_vec

    mock_nmf = MagicMock()
    mock_nmf.fit_transform.return_value = np.eye(20, 15)
    mock_nmf.components_ = np.eye(15, 2)
    mock_nmf_cls.return_value = mock_nmf

    process_topic_modeling_generation(submission, db, None)

    mock_nmf_cls.assert_called_once_with(
        n_components=15,
        random_state=42,
        max_iter=500,
    )
    payload = db.submissions.update_one.call_args.args[1]["$set"]["results.topic_model"]
    assert len(payload["latent_topics"]) == 15
    assert len(payload["topic_mapping"]) == 16
