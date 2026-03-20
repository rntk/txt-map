"""
Unit tests for the diff handler module.

Tests all functions in handlers/diff_handler.py:
- get_diff (including state machine testing)
- post_diff_calculate
- _ensure_submissions
- _serialize_job
"""
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, UTC, timedelta
import uuid

from fastapi import HTTPException
from pydantic import ValidationError

from handlers.diff_handler import (
    get_diff,
    post_diff_calculate,
    _ensure_submissions,
    _serialize_job,
    DiffCalculateRequest,
)


# =============================================================================
# Fixtures for Diff Handler Tests
# =============================================================================

@pytest.fixture
def mock_semantic_diffs_storage():
    """Create a mock SemanticDiffsStorage instance."""
    storage = MagicMock()
    storage.get_diff_by_pair_key = MagicMock(return_value=None)
    storage.get_latest_job = MagicMock(return_value=None)
    storage.get_active_job = MagicMock(return_value=None)
    storage.create_or_get_active_job = MagicMock()
    storage.set_job_force_recalculate = MagicMock()
    return storage


@pytest.fixture
def sample_submission_a():
    """Create a sample submission document A with ready prerequisites."""
    return {
        "submission_id": "sub-a-001",
        "html_content": "<html><body><p>Submission A content</p></body></html>",
        "text_content": "Submission A content",
        "source_url": "https://example.com/article-a",
        "created_at": datetime.now(UTC) - timedelta(days=1),
        "updated_at": datetime.now(UTC) - timedelta(days=1),
        "tasks": {
            "split_topic_generation": {
                "status": "completed",
                "started_at": datetime.now(UTC) - timedelta(days=1),
                "completed_at": datetime.now(UTC) - timedelta(days=1),
                "error": None
            },
            "subtopics_generation": {
                "status": "completed",
                "started_at": datetime.now(UTC) - timedelta(days=1),
                "completed_at": datetime.now(UTC) - timedelta(days=1),
                "error": None
            },
            "summarization": {
                "status": "completed",
                "started_at": datetime.now(UTC) - timedelta(days=1),
                "completed_at": datetime.now(UTC) - timedelta(days=1),
                "error": None
            },
            "mindmap": {
                "status": "completed",
                "started_at": datetime.now(UTC) - timedelta(days=1),
                "completed_at": datetime.now(UTC) - timedelta(days=1),
                "error": None
            },
            "prefix_tree": {
                "status": "completed",
                "started_at": datetime.now(UTC) - timedelta(days=1),
                "completed_at": datetime.now(UTC) - timedelta(days=1),
                "error": None
            }
        },
        "results": {
            "sentences": ["Sentence one from A.", "Sentence two from A.", "Sentence three from A."],
            "topics": [
                {"name": "Topic A1", "sentences": [1, 2]},
                {"name": "Topic A2", "sentences": [3]}
            ],
            "topic_summaries": {},
            "article_summary": {
                "text": "",
                "bullets": []
            },
            "topic_mindmaps": {},
            "mindmap_results": [],
            "subtopics": [],
            "summary": [],
            "summary_mappings": [],
            "prefix_tree": {}
        }
    }


@pytest.fixture
def sample_submission_b():
    """Create a sample submission document B with ready prerequisites."""
    return {
        "submission_id": "sub-b-002",
        "html_content": "<html><body><p>Submission B content</p></body></html>",
        "text_content": "Submission B content",
        "source_url": "https://example.com/article-b",
        "created_at": datetime.now(UTC) - timedelta(days=1),
        "updated_at": datetime.now(UTC) - timedelta(days=1),
        "tasks": {
            "split_topic_generation": {
                "status": "completed",
                "started_at": datetime.now(UTC) - timedelta(days=1),
                "completed_at": datetime.now(UTC) - timedelta(days=1),
                "error": None
            },
            "subtopics_generation": {
                "status": "completed",
                "started_at": datetime.now(UTC) - timedelta(days=1),
                "completed_at": datetime.now(UTC) - timedelta(days=1),
                "error": None
            },
            "summarization": {
                "status": "completed",
                "started_at": datetime.now(UTC) - timedelta(days=1),
                "completed_at": datetime.now(UTC) - timedelta(days=1),
                "error": None
            },
            "mindmap": {
                "status": "completed",
                "started_at": datetime.now(UTC) - timedelta(days=1),
                "completed_at": datetime.now(UTC) - timedelta(days=1),
                "error": None
            },
            "prefix_tree": {
                "status": "completed",
                "started_at": datetime.now(UTC) - timedelta(days=1),
                "completed_at": datetime.now(UTC) - timedelta(days=1),
                "error": None
            }
        },
        "results": {
            "sentences": ["Sentence one from B.", "Sentence two from B.", "Sentence three from B."],
            "topics": [
                {"name": "Topic B1", "sentences": [1, 2]},
                {"name": "Topic B2", "sentences": [3]}
            ],
            "topic_summaries": {},
            "article_summary": {
                "text": "",
                "bullets": []
            },
            "topic_mindmaps": {},
            "mindmap_results": [],
            "subtopics": [],
            "summary": [],
            "summary_mappings": [],
            "prefix_tree": {}
        }
    }


@pytest.fixture
def sample_submission_not_ready():
    """Create a sample submission with missing prerequisites."""
    return {
        "submission_id": "sub-not-ready-003",
        "html_content": "<html><body><p>Not ready content</p></body></html>",
        "text_content": "Not ready content",
        "source_url": "https://example.com/article-not-ready",
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
        "tasks": {
            "split_topic_generation": {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "error": None
            }
        },
        "results": {
            "sentences": [],
            "topics": [],
            "topic_summaries": {},
            "article_summary": {
                "text": "",
                "bullets": []
            },
            "topic_mindmaps": {},
            "mindmap_results": [],
            "subtopics": [],
            "summary": [],
            "summary_mappings": [],
            "prefix_tree": {}
        }
    }


@pytest.fixture
def sample_diff_doc():
    """Create a sample diff document."""
    return {
        "_id": "diff-id-001",
        "pair_key": "sub-a-001::sub-b-002",
        "submission_a_id": "sub-a-001",
        "submission_b_id": "sub-b-002",
        "algorithm_version": "semantic-v3-topic-aware-charwb-3-6-th0.25-cr0.5-topk-shared",
        "computed_at": datetime.now(UTC) - timedelta(hours=1),
        "updated_at": datetime.now(UTC) - timedelta(hours=1),
        "payload": {
            "meta": {"algorithm_version": "semantic-v3-topic-aware-charwb-3-6-th0.25-cr0.5-topk-shared"},
            "matches_a_to_b": [],
            "matches_b_to_a": [],
            "nearest_a_to_b": [],
            "nearest_b_to_a": [],
            "unmatched_a": [],
            "unmatched_b": []
        }
    }


@pytest.fixture
def sample_job():
    """Create a sample job document."""
    return {
        "_id": "job-id-001",
        "job_id": "job-uuid-001",
        "pair_key": "sub-a-001::sub-b-002",
        "submission_a_id": "sub-a-001",
        "submission_b_id": "sub-b-002",
        "status": "pending",
        "created_at": datetime.now(UTC),
        "started_at": None,
        "completed_at": None,
        "force_recalculate": False,
        "worker_id": None,
        "error": None
    }


@pytest.fixture
def mock_canonical_pair():
    """Mock canonical_pair function."""
    with patch('handlers.diff_handler.canonical_pair') as mock:
        mock.return_value = ("sub-a-001::sub-b-002", "sub-a-001", "sub-b-002")
        yield mock


@pytest.fixture
def mock_check_submission_topic_readiness():
    """Mock check_submission_topic_readiness function."""
    with patch('handlers.diff_handler.check_submission_topic_readiness') as mock:
        mock.return_value = {"ready": True, "missing": [], "unit_count": 3}
        yield mock


@pytest.fixture
def mock_stale_reasons():
    """Mock stale_reasons function."""
    with patch('handlers.diff_handler.stale_reasons') as mock:
        mock.return_value = []
        yield mock


@pytest.fixture
def mock_orient_payload():
    """Mock orient_payload function."""
    with patch('handlers.diff_handler.orient_payload') as mock:
        mock.return_value = {
            "meta": {},
            "matches_left_to_right": [],
            "matches_right_to_left": [],
            "nearest_left_to_right": [],
            "nearest_right_to_left": [],
            "unmatched_left": [],
            "unmatched_right": []
        }
        yield mock


# =============================================================================
# Test: _ensure_submissions
# =============================================================================

class TestEnsureSubmissions:
    """Tests for the _ensure_submissions helper function."""

    def test_same_ids_raise_http_400(self, mock_submissions_storage):
        """Same submission IDs raise HTTP 400."""
        # Arrange
        submission_id = "sub-001"

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            _ensure_submissions(mock_submissions_storage, submission_id, submission_id)

        assert exc_info.value.status_code == 400
        assert "two different submissions" in str(exc_info.value.detail)

    def test_missing_left_submission_raises_http_404(self, mock_submissions_storage):
        """Missing left submission raises HTTP 404."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [None, {"submission_id": "sub-b-002"}]

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            _ensure_submissions(mock_submissions_storage, "sub-a-001", "sub-b-002")

        assert exc_info.value.status_code == 404
        assert "sub-a-001" in str(exc_info.value.detail)
        assert "not found" in str(exc_info.value.detail)

    def test_missing_right_submission_raises_http_404(self, mock_submissions_storage):
        """Missing right submission raises HTTP 404."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [{"submission_id": "sub-a-001"}, None]

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            _ensure_submissions(mock_submissions_storage, "sub-a-001", "sub-b-002")

        assert exc_info.value.status_code == 404
        assert "sub-b-002" in str(exc_info.value.detail)
        assert "not found" in str(exc_info.value.detail)

    def test_returns_both_submission_documents_when_valid(
        self, mock_submissions_storage, sample_submission_a, sample_submission_b
    ):
        """Returns both submission documents when valid."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]

        # Act
        left, right = _ensure_submissions(
            mock_submissions_storage, "sub-a-001", "sub-b-002"
        )

        # Assert
        assert left["submission_id"] == "sub-a-001"
        assert right["submission_id"] == "sub-b-002"
        mock_submissions_storage.get_by_id.assert_any_call("sub-a-001")
        mock_submissions_storage.get_by_id.assert_any_call("sub-b-002")


# =============================================================================
# Test: _serialize_job
# =============================================================================

class TestSerializeJob:
    """Tests for the _serialize_job helper function."""

    def test_none_input_returns_none(self):
        """None input returns None."""
        # Act
        result = _serialize_job(None)

        # Assert
        assert result is None

    def test_job_document_serialized_with_correct_fields(self, sample_job):
        """Job document serialized with correct fields."""
        # Act
        result = _serialize_job(sample_job)

        # Assert
        assert result is not None
        assert result["job_id"] == "job-uuid-001"
        assert result["status"] == "pending"
        assert result["error"] is None
        assert result["created_at"] is not None
        assert result["started_at"] is None
        assert result["completed_at"] is None
        assert result["force_recalculate"] is False

    def test_job_with_force_recalculate_true(self, sample_job):
        """Job with force_recalculate=True is serialized correctly."""
        # Arrange
        sample_job["force_recalculate"] = True

        # Act
        result = _serialize_job(sample_job)

        # Assert
        assert result["force_recalculate"] is True

    def test_job_with_error_field(self, sample_job):
        """Job with error field is serialized correctly."""
        # Arrange
        sample_job["error"] = "Test error message"
        sample_job["status"] = "failed"

        # Act
        result = _serialize_job(sample_job)

        # Assert
        assert result["error"] == "Test error message"
        assert result["status"] == "failed"

    def test_job_with_all_timestamps(self, sample_job):
        """Job with all timestamps is serialized correctly."""
        # Arrange
        now = datetime.now(UTC)
        sample_job["started_at"] = now - timedelta(minutes=5)
        sample_job["completed_at"] = now
        sample_job["status"] = "completed"

        # Act
        result = _serialize_job(sample_job)

        # Assert
        assert result["started_at"] is not None
        assert result["completed_at"] is not None
        assert result["status"] == "completed"


# =============================================================================
# Test: get_diff - State Machine Testing
# =============================================================================

class TestGetDiffStateMachine:
    """Tests for get_diff endpoint state machine states."""

    def test_state_waiting_prerequisites_when_topics_not_ready(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """State is 'waiting_prerequisites' when topic prerequisites not ready."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {
            "ready": False,
            "missing": ["sentences_missing"],
            "unit_count": 0
        }

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["state"] == "waiting_prerequisites"
        assert result["diff"] is None
        assert result["stale_reasons"] == []

    def test_state_processing_when_active_job_status_is_processing(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons
    ):
        """State is 'processing' when active job status is 'processing'."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        active_job = {
            "_id": "job-001",
            "job_id": "job-uuid-001",
            "status": "processing",
            "created_at": datetime.now(UTC),
            "started_at": datetime.now(UTC),
            "completed_at": None,
            "force_recalculate": False
        }
        mock_semantic_diffs_storage.get_active_job.return_value = active_job

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["state"] == "processing"

    def test_state_queued_when_active_job_exists_but_not_processing(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons
    ):
        """State is 'queued' when active job exists but not processing."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        active_job = {
            "_id": "job-001",
            "job_id": "job-uuid-001",
            "status": "pending",
            "created_at": datetime.now(UTC),
            "started_at": None,
            "completed_at": None,
            "force_recalculate": False
        }
        mock_semantic_diffs_storage.get_active_job.return_value = active_job

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["state"] == "queued"

    def test_state_stale_when_diff_exists_but_is_outdated(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons,
        sample_diff_doc
    ):
        """State is 'stale' when diff exists but is outdated."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = sample_diff_doc
        mock_stale_reasons.return_value = ["algorithm_version_mismatch"]

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["state"] == "stale"
        assert result["stale_reasons"] == ["algorithm_version_mismatch"]

    def test_state_ready_when_diff_exists_and_is_up_to_date(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons,
        sample_diff_doc, mock_orient_payload
    ):
        """State is 'ready' when diff exists and is up-to-date."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = sample_diff_doc
        mock_stale_reasons.return_value = []

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["state"] == "ready"
        assert result["stale_reasons"] == []
        mock_orient_payload.assert_called_once()

    def test_state_failed_when_latest_job_status_is_failed(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons
    ):
        """State is 'failed' when latest job status is 'failed'."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        latest_job = {
            "_id": "job-001",
            "job_id": "job-uuid-001",
            "status": "failed",
            "error": "Computation failed",
            "created_at": datetime.now(UTC) - timedelta(hours=1),
            "started_at": datetime.now(UTC) - timedelta(minutes=59),
            "completed_at": datetime.now(UTC) - timedelta(minutes=58),
            "force_recalculate": False
        }
        mock_semantic_diffs_storage.get_latest_job.return_value = latest_job

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["state"] == "failed"

    def test_state_missing_when_no_diff_or_job_exists(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons
    ):
        """State is 'missing' when no diff or job exists."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = None
        mock_semantic_diffs_storage.get_latest_job.return_value = None
        mock_semantic_diffs_storage.get_active_job.return_value = None

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["state"] == "missing"


# =============================================================================
# Test: get_diff - Prerequisite Checks
# =============================================================================

class TestGetDiffPrerequisites:
    """Tests for get_diff prerequisite checks."""

    def test_left_prereq_correctly_populated(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """Left prerequisite is correctly populated."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {
            "ready": True,
            "missing": [],
            "unit_count": 3
        }

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert "prereq" in result
        assert "left" in result["prereq"]
        assert result["prereq"]["left"]["ready"] is True
        assert result["prereq"]["left"]["unit_count"] == 3

    def test_right_prereq_correctly_populated(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """Right prerequisite is correctly populated."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {
            "ready": True,
            "missing": [],
            "unit_count": 5
        }

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert "prereq" in result
        assert "right" in result["prereq"]
        assert result["prereq"]["right"]["ready"] is True
        assert result["prereq"]["right"]["unit_count"] == 5

    def test_readiness_based_on_topic_data_availability(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_not_ready, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """Readiness is based on topic data availability."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_not_ready, sample_submission_b]
        mock_check_submission_topic_readiness.side_effect = [
            {"ready": False, "missing": ["sentences_missing", "topics_missing"], "unit_count": 0},
            {"ready": True, "missing": [], "unit_count": 3}
        ]

        # Act
        result = get_diff(
            left_submission_id="sub-not-ready-003",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["state"] == "waiting_prerequisites"
        assert result["prereq"]["left"]["ready"] is False
        assert "sentences_missing" in result["prereq"]["left"]["missing"]


# =============================================================================
# Test: get_diff - Stale Detection
# =============================================================================

class TestGetDiffStaleDetection:
    """Tests for get_diff stale detection."""

    def test_algorithm_version_mismatch_detected(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons,
        sample_diff_doc
    ):
        """Algorithm version mismatch is detected."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = sample_diff_doc
        mock_stale_reasons.return_value = ["algorithm_version_mismatch"]

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert "algorithm_version_mismatch" in result["stale_reasons"]
        assert result["state"] == "stale"

    def test_left_submission_update_after_diff_computed(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons,
        sample_diff_doc
    ):
        """Left submission update after diff computed is detected."""
        # Arrange
        # Make submission_a updated after diff was computed
        sample_submission_a["updated_at"] = datetime.now(UTC)
        sample_diff_doc["computed_at"] = datetime.now(UTC) - timedelta(hours=1)

        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = sample_diff_doc
        mock_stale_reasons.return_value = ["left_submission_updated"]

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert "left_submission_updated" in result["stale_reasons"]
        assert result["state"] == "stale"

    def test_right_submission_update_after_diff_computed(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons,
        sample_diff_doc
    ):
        """Right submission update after diff computed is detected."""
        # Arrange
        # Make submission_b updated after diff was computed
        sample_submission_b["updated_at"] = datetime.now(UTC)
        sample_diff_doc["computed_at"] = datetime.now(UTC) - timedelta(hours=1)

        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = sample_diff_doc
        mock_stale_reasons.return_value = ["right_submission_updated"]

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert "right_submission_updated" in result["stale_reasons"]
        assert result["state"] == "stale"


# =============================================================================
# Test: get_diff - Payload Orientation
# =============================================================================

class TestGetDiffPayloadOrientation:
    """Tests for get_diff payload orientation."""

    def test_correctly_oriented_when_left_is_submission_a(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons,
        sample_diff_doc, mock_orient_payload
    ):
        """Payload is correctly oriented when left=submission_a."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = sample_diff_doc
        mock_stale_reasons.return_value = []

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        mock_orient_payload.assert_called_once()
        call_args = mock_orient_payload.call_args
        assert call_args[0][3] == "sub-a-001"  # left_submission_id
        assert call_args[0][4] == "sub-b-002"  # right_submission_id
        assert result["diff"] is not None

    def test_correctly_oriented_when_left_is_submission_b(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons,
        sample_diff_doc, mock_orient_payload
    ):
        """Payload is correctly oriented when left=submission_b."""
        # Arrange
        # Swap the canonical pair mock for this test
        mock_canonical_pair.return_value = ("sub-a-001::sub-b-002", "sub-b-002", "sub-a-001")

        mock_submissions_storage.get_by_id.side_effect = [sample_submission_b, sample_submission_a]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = sample_diff_doc
        mock_stale_reasons.return_value = []

        # Act
        result = get_diff(
            left_submission_id="sub-b-002",
            right_submission_id="sub-a-001",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        mock_orient_payload.assert_called_once()
        call_args = mock_orient_payload.call_args
        assert call_args[0][3] == "sub-b-002"  # left_submission_id
        assert call_args[0][4] == "sub-a-001"  # right_submission_id
        assert result["diff"] is not None


# =============================================================================
# Test: get_diff - Submission Validation
# =============================================================================

class TestGetDiffSubmissionValidation:
    """Tests for get_diff submission validation."""

    def test_valid_submissions_return_diff_state_information(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons
    ):
        """Valid submissions return diff state information."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert "pair" in result
        assert "state" in result
        assert "prereq" in result
        assert "stale_reasons" in result
        assert "latest_job" in result
        assert "diff" in result

    def test_same_submission_ids_raise_http_400_before_canonical_pair(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """Same submission IDs raise HTTP 400 (checked before canonical_pair)."""
        # Arrange
        # Note: _ensure_submissions checks for same IDs before canonical_pair is called
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_a]

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            get_diff(
                left_submission_id="sub-a-001",
                right_submission_id="sub-a-001",
                submissions_storage=mock_submissions_storage,
                semantic_diffs_storage=mock_semantic_diffs_storage
            )

        # Assert that canonical_pair was never called (short-circuit on same IDs)
        mock_canonical_pair.assert_not_called()
        assert exc_info.value.status_code == 400
        assert "two different submissions" in str(exc_info.value.detail)

    def test_non_existent_left_submission_raises_http_404(
        self, mock_submissions_storage, mock_semantic_diffs_storage
    ):
        """Non-existent left submission raises HTTP 404."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = None

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            get_diff(
                left_submission_id="non-existent-left",
                right_submission_id="sub-b-002",
                submissions_storage=mock_submissions_storage,
                semantic_diffs_storage=mock_semantic_diffs_storage
            )

        assert exc_info.value.status_code == 404

    def test_non_existent_right_submission_raises_http_404(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a
    ):
        """Non-existent right submission raises HTTP 404."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, None]

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            get_diff(
                left_submission_id="sub-a-001",
                right_submission_id="non-existent-right",
                submissions_storage=mock_submissions_storage,
                semantic_diffs_storage=mock_semantic_diffs_storage
            )

        assert exc_info.value.status_code == 404


# =============================================================================
# Test: post_diff_calculate
# =============================================================================

class TestPostDiffCalculate:
    """Tests for the post_diff_calculate endpoint."""

    def test_valid_request_creates_job_successfully(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """Valid request creates job successfully."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_active_job.return_value = None
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = None
        new_job = {
            "_id": "job-001",
            "job_id": "new-job-uuid",
            "status": "pending",
            "force_recalculate": False
        }
        mock_semantic_diffs_storage.create_or_get_active_job.return_value = (new_job, True)

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=False
        )

        # Act
        result = post_diff_calculate(
            payload=request,
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["job_id"] == "new-job-uuid"
        assert result["status"] == "pending"
        mock_semantic_diffs_storage.create_or_get_active_job.assert_called_once()

    def test_same_submission_ids_raise_http_400(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a
    ):
        """Same submission IDs raise HTTP 400."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_a]

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-a-001",
            force=False
        )

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            post_diff_calculate(
                payload=request,
                submissions_storage=mock_submissions_storage,
                semantic_diffs_storage=mock_semantic_diffs_storage
            )

        assert exc_info.value.status_code == 400

    def test_non_existent_submissions_raise_http_404(
        self, mock_submissions_storage, mock_semantic_diffs_storage
    ):
        """Non-existent submissions raise HTTP 404."""
        # Arrange
        # Use different IDs to avoid the same-ID check (which would raise 400)
        mock_submissions_storage.get_by_id.return_value = None

        request = DiffCalculateRequest(
            left_submission_id="non-existent-left",
            right_submission_id="non-existent-right",
            force=False
        )

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            post_diff_calculate(
                payload=request,
                submissions_storage=mock_submissions_storage,
                semantic_diffs_storage=mock_semantic_diffs_storage
            )

        assert exc_info.value.status_code == 404
        assert "not found" in str(exc_info.value.detail)

    def test_prerequisites_not_ready_raises_http_409_with_details(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_check_submission_topic_readiness
    ):
        """Prerequisites not ready raises HTTP 409 with details."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.side_effect = [
            {"ready": False, "missing": ["sentences_missing"], "unit_count": 0},
            {"ready": True, "missing": [], "unit_count": 3}
        ]

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=False
        )

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            post_diff_calculate(
                payload=request,
                submissions_storage=mock_submissions_storage,
                semantic_diffs_storage=mock_semantic_diffs_storage
            )

        assert exc_info.value.status_code == 409
        assert "Topic prerequisites are not ready" in str(exc_info.value.detail)

    def test_returns_existing_active_job_if_one_exists(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """Returns existing active job if one exists."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        existing_job = {
            "_id": "job-001",
            "job_id": "existing-job-uuid",
            "status": "pending",
            "force_recalculate": False
        }
        mock_semantic_diffs_storage.get_active_job.return_value = existing_job

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=False
        )

        # Act
        result = post_diff_calculate(
            payload=request,
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["job_id"] == "existing-job-uuid"
        mock_semantic_diffs_storage.create_or_get_active_job.assert_not_called()

    def test_force_flag_sets_force_recalculate_on_existing_job(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """Force flag sets force_recalculate on existing job."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        existing_job = {
            "_id": "job-001",
            "job_id": "existing-job-uuid",
            "status": "pending",
            "force_recalculate": False
        }
        mock_semantic_diffs_storage.get_active_job.return_value = existing_job

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=True
        )

        # Act
        result = post_diff_calculate(
            payload=request,
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        mock_semantic_diffs_storage.set_job_force_recalculate.assert_called_once_with("job-001", True)
        assert result["force_recalculate"] is True

    def test_no_new_job_created_when_active_job_exists(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """No new job created when active job exists."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        existing_job = {
            "_id": "job-001",
            "job_id": "existing-job-uuid",
            "status": "pending",
            "force_recalculate": False
        }
        mock_semantic_diffs_storage.get_active_job.return_value = existing_job

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=False
        )

        # Act
        post_diff_calculate(
            payload=request,
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        mock_semantic_diffs_storage.create_or_get_active_job.assert_not_called()

    def test_returns_status_up_to_date_when_diff_exists_and_is_current(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons,
        sample_diff_doc
    ):
        """Returns status='up_to_date' when diff exists and is current."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_active_job.return_value = None
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = sample_diff_doc
        mock_stale_reasons.return_value = []

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=False
        )

        # Act
        result = post_diff_calculate(
            payload=request,
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["status"] == "up_to_date"
        assert result["job_id"] is None
        mock_semantic_diffs_storage.create_or_get_active_job.assert_not_called()

    def test_no_job_created_for_up_to_date_diffs_unless_force_true(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons,
        sample_diff_doc
    ):
        """No job created for up-to-date diffs (unless force=true)."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_active_job.return_value = None
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = sample_diff_doc
        mock_stale_reasons.return_value = []

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=False
        )

        # Act
        post_diff_calculate(
            payload=request,
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        mock_semantic_diffs_storage.create_or_get_active_job.assert_not_called()

    def test_force_true_creates_new_job_even_when_diff_exists(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons,
        sample_diff_doc
    ):
        """Force=true creates new job even when diff exists."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_active_job.return_value = None
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = sample_diff_doc
        mock_stale_reasons.return_value = []
        new_job = {
            "_id": "job-002",
            "job_id": "forced-job-uuid",
            "status": "pending",
            "force_recalculate": True
        }
        mock_semantic_diffs_storage.create_or_get_active_job.return_value = (new_job, True)

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=True
        )

        # Act
        result = post_diff_calculate(
            payload=request,
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["job_id"] == "forced-job-uuid"
        assert result["force_recalculate"] is True
        mock_semantic_diffs_storage.create_or_get_active_job.assert_called_once()

    def test_force_true_on_existing_job_updates_force_recalculate_flag(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """Force=true on existing job updates force_recalculate flag."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        existing_job = {
            "_id": "job-001",
            "job_id": "existing-job-uuid",
            "status": "pending",
            "force_recalculate": False
        }
        mock_semantic_diffs_storage.get_active_job.return_value = existing_job

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=True
        )

        # Act
        post_diff_calculate(
            payload=request,
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        mock_semantic_diffs_storage.set_job_force_recalculate.assert_called_once_with("job-001", True)

    def test_new_job_created_with_status_pending(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """New job created with status='pending'."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_active_job.return_value = None
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = None
        new_job = {
            "_id": "job-001",
            "job_id": "new-job-uuid",
            "status": "pending",
            "force_recalculate": False
        }
        mock_semantic_diffs_storage.create_or_get_active_job.return_value = (new_job, True)

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=False
        )

        # Act
        result = post_diff_calculate(
            payload=request,
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["status"] == "pending"

    def test_job_id_is_uuid(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """Job_id is UUID."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_active_job.return_value = None
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = None

        def mock_create(**kwargs):
            job = {
                "_id": "job-001",
                "job_id": kwargs["job_id"],
                "status": "pending",
                "force_recalculate": kwargs.get("force_recalculate", False)
            }
            return (job, True)

        mock_semantic_diffs_storage.create_or_get_active_job.side_effect = mock_create

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=False
        )

        # Act
        result = post_diff_calculate(
            payload=request,
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        # Validate UUID format
        try:
            uuid.UUID(result["job_id"])
        except ValueError:
            pytest.fail("job_id is not a valid UUID")

    def test_pair_key_submission_a_id_submission_b_id_correctly_set(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """Pair_key, submission_a_id, submission_b_id correctly set."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_active_job.return_value = None
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = None
        new_job = {
            "_id": "job-001",
            "job_id": "new-job-uuid",
            "status": "pending",
            "force_recalculate": False
        }
        mock_semantic_diffs_storage.create_or_get_active_job.return_value = (new_job, True)

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=False
        )

        # Act
        result = post_diff_calculate(
            payload=request,
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["pair_key"] == "sub-a-001::sub-b-002"
        assert result["submission_a_id"] == "sub-a-001"
        assert result["submission_b_id"] == "sub-b-002"

    def test_force_recalculate_flag_persisted(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """Force_recalculate flag persisted."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_active_job.return_value = None
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = None
        new_job = {
            "_id": "job-001",
            "job_id": "new-job-uuid",
            "status": "pending",
            "force_recalculate": True
        }
        mock_semantic_diffs_storage.create_or_get_active_job.return_value = (new_job, True)

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=True
        )

        # Act
        result = post_diff_calculate(
            payload=request,
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert result["force_recalculate"] is True


# =============================================================================
# Test: DiffCalculateRequest Model
# =============================================================================

class TestDiffCalculateRequestModel:
    """Tests for the DiffCalculateRequest data model."""

    def test_left_submission_id_required(self):
        """Left submission_id is required."""
        # Act & Assert
        with pytest.raises(ValidationError) as exc_info:
            DiffCalculateRequest(
                right_submission_id="sub-b-002",
                force=False
            )

        # Assert specific error for missing left_submission_id
        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert errors[0]["loc"] == ("left_submission_id",)
        assert errors[0]["type"] == "missing"

    def test_right_submission_id_required(self):
        """Right submission_id is required."""
        # Act & Assert
        with pytest.raises(ValidationError) as exc_info:
            DiffCalculateRequest(
                left_submission_id="sub-a-001",
                force=False
            )

        # Assert specific error for missing right_submission_id
        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert errors[0]["loc"] == ("right_submission_id",)
        assert errors[0]["type"] == "missing"

    def test_force_defaults_to_false(self):
        """Force defaults to False."""
        # Act
        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002"
        )

        # Assert
        assert request.force is False

    def test_force_can_be_set_to_true(self):
        """Force can be set to True."""
        # Act
        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=True
        )

        # Assert
        assert request.force is True


# =============================================================================
# Test: Response Structures
# =============================================================================

class TestResponseStructures:
    """Tests for response structure verification."""

    def test_get_diff_response_has_all_required_fields(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness, mock_stale_reasons
    ):
        """GET /diff response has all required fields."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}

        # Act
        result = get_diff(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert - pair object
        assert "pair" in result
        assert "left_submission_id" in result["pair"]
        assert "right_submission_id" in result["pair"]
        assert "pair_key" in result["pair"]
        assert "submission_a_id" in result["pair"]
        assert "submission_b_id" in result["pair"]

        # Assert - other fields
        assert "state" in result
        assert "prereq" in result
        assert "stale_reasons" in result
        assert "latest_job" in result
        assert "diff" in result

    def test_post_diff_calculate_response_has_all_required_fields(
        self, mock_submissions_storage, mock_semantic_diffs_storage,
        sample_submission_a, sample_submission_b, mock_canonical_pair,
        mock_check_submission_topic_readiness
    ):
        """POST /diff/calculate response has all required fields."""
        # Arrange
        mock_submissions_storage.get_by_id.side_effect = [sample_submission_a, sample_submission_b]
        mock_check_submission_topic_readiness.return_value = {"ready": True, "missing": [], "unit_count": 3}
        mock_semantic_diffs_storage.get_active_job.return_value = None
        mock_semantic_diffs_storage.get_diff_by_pair_key.return_value = None
        new_job = {
            "_id": "job-001",
            "job_id": "new-job-uuid",
            "status": "pending",
            "force_recalculate": False
        }
        mock_semantic_diffs_storage.create_or_get_active_job.return_value = (new_job, True)

        request = DiffCalculateRequest(
            left_submission_id="sub-a-001",
            right_submission_id="sub-b-002",
            force=False
        )

        # Act
        result = post_diff_calculate(
            payload=request,
            submissions_storage=mock_submissions_storage,
            semantic_diffs_storage=mock_semantic_diffs_storage
        )

        # Assert
        assert "job_id" in result
        assert "status" in result
        assert "pair_key" in result
        assert "submission_a_id" in result
        assert "submission_b_id" in result
        assert "force_recalculate" in result
