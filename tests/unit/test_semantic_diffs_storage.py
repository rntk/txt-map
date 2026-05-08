"""
Unit tests for the SemanticDiffsStorage class.

Tests all methods in lib/storage/semantic_diffs.py:
- __init__
- prepare
- get_diff_by_pair_key
- get_latest_job
- get_active_job
- create_job
- create_or_get_active_job
- upsert_diff
- claim_job
- set_job_force_recalculate
- mark_job_completed
- mark_job_failed

Also tests:
- All indexes specified in the plan
- Job and Diff document structures
- Edge cases: concurrent job claims, race conditions, large payloads
"""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, UTC, timedelta
import uuid

from lib.storage.semantic_diffs import SemanticDiffsStorage
from pymongo.errors import DuplicateKeyError


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_db():
    """Create a mock MongoDB database."""
    db = MagicMock()
    db.semantic_diffs = MagicMock()
    db.semantic_diff_jobs = MagicMock()
    return db


@pytest.fixture
def mock_logger():
    """Create a mock logger."""
    return MagicMock()


@pytest.fixture
def sample_job():
    """Create a sample job document."""
    return {
        "_id": "job-id-001",
        "job_id": str(uuid.uuid4()),
        "pair_key": "sub-a-001::sub-b-002",
        "submission_a_id": "sub-a-001",
        "submission_b_id": "sub-b-002",
        "requested_left_id": "sub-a-001",
        "requested_right_id": "sub-b-002",
        "force_recalculate": False,
        "status": "pending",
        "created_at": datetime.now(UTC),
        "started_at": None,
        "completed_at": None,
        "worker_id": None,
        "error": None,
    }


@pytest.fixture
def sample_diff():
    """Create a sample diff document."""
    return {
        "_id": "diff-id-001",
        "pair_key": "sub-a-001::sub-b-002",
        "submission_a_id": "sub-a-001",
        "submission_b_id": "sub-b-002",
        "algorithm_version": "semantic-v3-topic-aware",
        "computed_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
        "created_at": datetime.now(UTC) - timedelta(days=1),
        "source_fingerprint": {
            "submission_a_updated_at": datetime.now(UTC) - timedelta(days=1),
            "submission_b_updated_at": datetime.now(UTC) - timedelta(days=1),
        },
        "payload": {
            "meta": {"algorithm_version": "semantic-v3-topic-aware"},
            "matches_a_to_b": [],
            "matches_b_to_a": [],
            "nearest_a_to_b": [],
            "nearest_b_to_a": [],
            "unmatched_a": [],
            "unmatched_b": [],
        },
    }


@pytest.fixture
def mock_datetime():
    """Mock datetime with fixed timestamp."""
    fixed_now = datetime(2024, 6, 15, 10, 30, 0, tzinfo=UTC)
    with patch("lib.storage.semantic_diffs.datetime") as mock_dt:
        mock_dt.now.return_value = fixed_now
        mock_dt.UTC = UTC
        yield mock_dt, fixed_now


# =============================================================================
# Test: __init__
# =============================================================================


class TestInit:
    """Tests for SemanticDiffsStorage.__init__."""

    def test_initializes_db_connection(self, mock_db):
        """Initializes _db connection."""
        storage = SemanticDiffsStorage(mock_db)
        assert storage._db is mock_db

    def test_initializes_logger(self, mock_db):
        """Initializes logger with correct name."""
        storage = SemanticDiffsStorage(mock_db)
        assert storage._log is not None
        assert storage._log.name == "semantic_diffs"

    def test_logger_is_properly_configured(self, mock_db):
        """Logger is properly configured."""
        storage = SemanticDiffsStorage(mock_db)
        assert hasattr(storage._log, "warning")
        assert hasattr(storage._log, "info")
        assert hasattr(storage._log, "error")
        assert hasattr(storage._log, "debug")


# =============================================================================
# Test: prepare
# =============================================================================


class TestPrepare:
    """Tests for SemanticDiffsStorage.prepare."""

    def test_creates_unique_index_on_semantic_diffs_pair_key(self, mock_db):
        """Creates unique index on semantic_diffs.pair_key."""
        storage = SemanticDiffsStorage(mock_db)
        storage.prepare()

        mock_db.semantic_diffs.create_index.assert_any_call("pair_key", unique=True)

    def test_creates_compound_index_on_semantic_diff_jobs_pair_key_created_at(
        self, mock_db
    ):
        """Creates compound index on semantic_diff_jobs: (pair_key, created_at)."""
        storage = SemanticDiffsStorage(mock_db)
        storage.prepare()

        mock_db.semantic_diff_jobs.create_index.assert_any_call(
            [("pair_key", 1), ("created_at", -1)]
        )

    def test_creates_partial_unique_index_for_active_jobs(self, mock_db):
        """Creates partial unique index on semantic_diff_jobs for active jobs."""
        storage = SemanticDiffsStorage(mock_db)
        storage.prepare()

        # Find the call with partialFilterExpression
        calls = mock_db.semantic_diff_jobs.create_index.call_args_list
        active_index_call = None
        for call_arg in calls:
            if len(call_arg[0]) > 0 and call_arg[0][0] == [("pair_key", 1)]:
                if len(call_arg[1]) > 0 and "partialFilterExpression" in call_arg[1]:
                    active_index_call = call_arg
                    break

        assert active_index_call is not None
        assert active_index_call[1]["unique"] is True
        assert active_index_call[1]["partialFilterExpression"] == {
            "status": {"$in": ["pending", "processing"]}
        }

    def test_creates_index_on_semantic_diff_jobs_status(self, mock_db):
        """Creates index on semantic_diff_jobs.status."""
        storage = SemanticDiffsStorage(mock_db)
        storage.prepare()

        mock_db.semantic_diff_jobs.create_index.assert_any_call("status")

    def test_creates_compound_index_status_force_recalculate_created_at(self, mock_db):
        """Creates compound index: (status, force_recalculate, created_at)."""
        storage = SemanticDiffsStorage(mock_db)
        storage.prepare()

        mock_db.semantic_diff_jobs.create_index.assert_any_call(
            [("status", 1), ("force_recalculate", -1), ("created_at", 1)]
        )

    def test_handles_index_creation_errors_gracefully(self, mock_db):
        """All index creation errors handled gracefully with warnings."""
        # Arrange: make all create_index calls raise exceptions
        mock_db.semantic_diffs.create_index.side_effect = Exception("Index error 1")
        mock_db.semantic_diff_jobs.create_index.side_effect = Exception("Index error 2")

        storage = SemanticDiffsStorage(mock_db)

        with patch.object(storage._log, "warning") as mock_warning:
            # Act: should not raise
            storage.prepare()

            # Assert: exactly 5 warnings logged (one for each index creation attempt)
            assert mock_warning.call_count == 5
            # Verify warning messages contain expected content
            warning_calls = [str(call) for call in mock_warning.call_args_list]
            assert any("pair_key" in call for call in warning_calls)
            assert any("status" in call for call in warning_calls)

    def test_prepare_creates_all_5_indexes(self, mock_db):
        """prepare creates all 5 required indexes."""
        storage = SemanticDiffsStorage(mock_db)
        storage.prepare()

        # semantic_diffs should have 1 index call
        assert mock_db.semantic_diffs.create_index.call_count >= 1

        # semantic_diff_jobs should have 4 index calls
        assert mock_db.semantic_diff_jobs.create_index.call_count >= 4


# =============================================================================
# Test: get_diff_by_pair_key
# =============================================================================


class TestGetDiffByPairKey:
    """Tests for SemanticDiffsStorage.get_diff_by_pair_key."""

    def test_returns_diff_document_when_found(self, mock_db, sample_diff):
        """Returns diff document when found."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diffs.find_one.return_value = sample_diff

        result = storage.get_diff_by_pair_key("sub-a-001::sub-b-002")

        assert result == sample_diff

    def test_returns_none_when_not_found(self, mock_db):
        """Returns None when not found."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diffs.find_one.return_value = None

        result = storage.get_diff_by_pair_key("non-existent-key")

        assert result is None

    def test_queries_by_pair_key_field(self, mock_db):
        """Queries by 'pair_key' field."""
        storage = SemanticDiffsStorage(mock_db)
        storage.get_diff_by_pair_key("test-pair-key")

        mock_db.semantic_diffs.find_one.assert_called_once_with(
            {"pair_key": "test-pair-key"}
        )


# =============================================================================
# Test: get_latest_job
# =============================================================================


class TestGetLatestJob:
    """Tests for SemanticDiffsStorage.get_latest_job."""

    def test_returns_latest_job_sorted_by_created_at_descending(
        self, mock_db, sample_job
    ):
        """Returns latest job sorted by created_at descending."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.find_one.return_value = sample_job

        result = storage.get_latest_job("sub-a-001::sub-b-002")

        assert result == sample_job
        mock_db.semantic_diff_jobs.find_one.assert_called_once_with(
            {"pair_key": "sub-a-001::sub-b-002"}, sort=[("created_at", -1)]
        )

    def test_returns_none_when_no_jobs_exist(self, mock_db):
        """Returns None when no jobs exist."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.find_one.return_value = None

        result = storage.get_latest_job("non-existent-key")

        assert result is None

    def test_includes_all_job_statuses(self, mock_db):
        """Includes all job statuses (pending, processing, completed, failed)."""
        storage = SemanticDiffsStorage(mock_db)

        for status in ["pending", "processing", "completed", "failed"]:
            job = {"_id": f"job-{status}", "status": status}
            mock_db.semantic_diff_jobs.find_one.return_value = job

            result = storage.get_latest_job("test-key")
            assert result["status"] == status


# =============================================================================
# Test: get_active_job
# =============================================================================


class TestGetActiveJob:
    """Tests for SemanticDiffsStorage.get_active_job."""

    def test_returns_job_with_status_pending(self, mock_db, sample_job):
        """Returns job with status 'pending'."""
        storage = SemanticDiffsStorage(mock_db)
        sample_job["status"] = "pending"
        mock_db.semantic_diff_jobs.find_one.return_value = sample_job

        result = storage.get_active_job("sub-a-001::sub-b-002")

        assert result["status"] == "pending"

    def test_returns_job_with_status_processing(self, mock_db, sample_job):
        """Returns job with status 'processing'."""
        storage = SemanticDiffsStorage(mock_db)
        sample_job["status"] = "processing"
        mock_db.semantic_diff_jobs.find_one.return_value = sample_job

        result = storage.get_active_job("sub-a-001::sub-b-002")

        assert result["status"] == "processing"

    def test_returns_none_when_no_active_jobs(self, mock_db):
        """Returns None when no active jobs."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.find_one.return_value = None

        result = storage.get_active_job("test-key")

        assert result is None

    def test_does_not_return_completed_jobs(self, mock_db):
        """Does not return completed jobs."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.find_one.return_value = None

        result = storage.get_active_job("test-key")

        assert result is None
        # Verify query filters for pending/processing only
        call_args = mock_db.semantic_diff_jobs.find_one.call_args
        query = call_args[0][0]
        assert query["status"] == {"$in": ["pending", "processing"]}

    def test_does_not_return_failed_jobs(self, mock_db):
        """Does not return failed jobs."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.find_one.return_value = None

        result = storage.get_active_job("test-key")

        assert result is None

    def test_sorted_by_created_at_descending(self, mock_db):
        """Sorted by created_at descending."""
        storage = SemanticDiffsStorage(mock_db)
        storage.get_active_job("test-key")

        call_args = mock_db.semantic_diff_jobs.find_one.call_args
        assert call_args[1]["sort"] == [("created_at", -1)]


# =============================================================================
# Test: create_job
# =============================================================================


class TestCreateJob:
    """Tests for SemanticDiffsStorage.create_job."""

    def test_creates_job_with_all_required_fields(self, mock_db, mock_datetime):
        """Creates job with all required fields."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime

        result = storage.create_job(
            job_id="job-uuid-001",
            pair_key="sub-a-001::sub-b-002",
            submission_a_id="sub-a-001",
            submission_b_id="sub-b-002",
            requested_left_id="sub-a-001",
            requested_right_id="sub-b-002",
        )

        assert result["job_id"] == "job-uuid-001"
        assert result["pair_key"] == "sub-a-001::sub-b-002"
        assert result["submission_a_id"] == "sub-a-001"
        assert result["submission_b_id"] == "sub-b-002"
        assert result["requested_left_id"] == "sub-a-001"
        assert result["requested_right_id"] == "sub-b-002"
        assert result["force_recalculate"] is False
        assert result["status"] == "pending"
        assert result["created_at"] == fixed_now
        assert result["started_at"] is None
        assert result["completed_at"] is None
        assert result["worker_id"] is None
        assert result["error"] is None

    def test_force_recalculate_defaults_to_false(self, mock_db):
        """force_recalculate defaults to False."""
        storage = SemanticDiffsStorage(mock_db)
        result = storage.create_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )

        assert result["force_recalculate"] is False

    def test_force_recalculate_can_be_set_to_true(self, mock_db, mock_datetime):
        """force_recalculate can be set to True."""
        storage = SemanticDiffsStorage(mock_db)

        result = storage.create_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
            force_recalculate=True,
        )

        assert result["force_recalculate"] is True

    def test_inserts_into_semantic_diff_jobs_collection(self, mock_db):
        """Inserts into semantic_diff_jobs collection."""
        storage = SemanticDiffsStorage(mock_db)
        storage.create_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )

        mock_db.semantic_diff_jobs.insert_one.assert_called_once()

    def test_returns_created_job_document(self, mock_db):
        """Returns created job document."""
        storage = SemanticDiffsStorage(mock_db)
        result = storage.create_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )

        assert result is not None
        assert "job_id" in result
        assert "pair_key" in result
        assert "status" in result


# =============================================================================
# Test: create_or_get_active_job
# =============================================================================


class TestCreateOrGetActiveJob:
    """Tests for SemanticDiffsStorage.create_or_get_active_job."""

    def test_creates_new_job_when_no_active_job_exists(self, mock_db, mock_datetime):
        """Creates new job when no active job exists."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime

        result_job, created = storage.create_or_get_active_job(
            job_id="job-uuid-001",
            pair_key="sub-a-001::sub-b-002",
            submission_a_id="sub-a-001",
            submission_b_id="sub-b-002",
            requested_left_id="sub-a-001",
            requested_right_id="sub-b-002",
        )

        assert created is True
        assert result_job["job_id"] == "job-uuid-001"
        assert result_job["status"] == "pending"
        mock_db.semantic_diff_jobs.insert_one.assert_called_once()

    def test_returns_existing_active_job_when_one_exists(self, mock_db, sample_job):
        """Returns existing active job when one exists."""
        storage = SemanticDiffsStorage(mock_db)
        sample_job["status"] = "pending"

        # Simulate DuplicateKeyError on insert
        mock_db.semantic_diff_jobs.insert_one.side_effect = DuplicateKeyError(
            "Duplicate key"
        )
        mock_db.semantic_diff_jobs.find_one.return_value = sample_job

        result_job, created = storage.create_or_get_active_job(
            job_id="job-uuid-001",
            pair_key="sub-a-001::sub-b-002",
            submission_a_id="sub-a-001",
            submission_b_id="sub-b-002",
            requested_left_id="sub-a-001",
            requested_right_id="sub-b-002",
        )

        assert created is False
        assert result_job == sample_job

    def test_returns_tuple_with_created_true_when_inserted(self, mock_db):
        """Returns (job, True) when created."""
        storage = SemanticDiffsStorage(mock_db)

        result_job, created = storage.create_or_get_active_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )

        assert created is True

    def test_returns_tuple_with_created_false_when_retrieved_existing(
        self, mock_db, sample_job
    ):
        """Returns (job, False) when retrieved existing."""
        storage = SemanticDiffsStorage(mock_db)
        sample_job["status"] = "processing"

        mock_db.semantic_diff_jobs.insert_one.side_effect = DuplicateKeyError(
            "Duplicate"
        )
        mock_db.semantic_diff_jobs.find_one.return_value = sample_job

        result_job, created = storage.create_or_get_active_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )

        assert created is False

    def test_handles_duplicate_key_error_by_fetching_active_job(
        self, mock_db, sample_job
    ):
        """Handles DuplicateKeyError by fetching active job."""
        storage = SemanticDiffsStorage(mock_db)

        mock_db.semantic_diff_jobs.insert_one.side_effect = DuplicateKeyError(
            "Duplicate key"
        )
        mock_db.semantic_diff_jobs.find_one.return_value = sample_job

        storage.create_or_get_active_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )

        # Verify get_active_job was called after DuplicateKeyError
        mock_db.semantic_diff_jobs.find_one.assert_called()

    def test_raises_if_duplicate_key_error_but_no_active_job_found(self, mock_db):
        """Raises if DuplicateKeyError but no active job found."""
        storage = SemanticDiffsStorage(mock_db)

        mock_db.semantic_diff_jobs.insert_one.side_effect = DuplicateKeyError(
            "Duplicate key"
        )
        mock_db.semantic_diff_jobs.find_one.return_value = None

        with pytest.raises(DuplicateKeyError):
            storage.create_or_get_active_job(
                job_id="job-001",
                pair_key="key-001",
                submission_a_id="sub-a",
                submission_b_id="sub-b",
                requested_left_id="sub-a",
                requested_right_id="sub-b",
            )


# =============================================================================
# Test: upsert_diff
# =============================================================================


class TestUpsertDiff:
    """Tests for SemanticDiffsStorage.upsert_diff."""

    def test_inserts_new_diff_when_pair_key_doesnt_exist(self, mock_db, mock_datetime):
        """Inserts new diff when pair_key doesn't exist."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime
        mock_db.semantic_diffs.update_one.return_value = MagicMock(
            matched_count=0, modified_count=0, upserted_id="new-id"
        )

        storage.upsert_diff(
            pair_key="sub-a-001::sub-b-002",
            submission_a_id="sub-a-001",
            submission_b_id="sub-b-002",
            algorithm_version="semantic-v3",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload={"matches": []},
        )

        mock_db.semantic_diffs.update_one.assert_called_once()
        call_args = mock_db.semantic_diffs.update_one.call_args
        assert call_args[0][0] == {"pair_key": "sub-a-001::sub-b-002"}
        assert call_args[0][1]["$setOnInsert"]["created_at"] == fixed_now

    def test_updates_existing_diff_when_pair_key_exists(self, mock_db, mock_datetime):
        """Updates existing diff when pair_key exists."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime
        mock_db.semantic_diffs.update_one.return_value = MagicMock(
            matched_count=1, modified_count=1
        )

        storage.upsert_diff(
            pair_key="sub-a-001::sub-b-002",
            submission_a_id="sub-a-001",
            submission_b_id="sub-b-002",
            algorithm_version="semantic-v3",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload={"matches": []},
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        update_doc = call_args[0][1]

        assert "created_at" not in update_doc.get("$set", {})

    def test_sets_computed_at_and_updated_at_timestamps(self, mock_db, mock_datetime):
        """Sets computed_at and updated_at timestamps."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime

        storage.upsert_diff(
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="v1",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload={},
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["computed_at"] == fixed_now
        assert update_doc["$set"]["updated_at"] == fixed_now

    def test_stores_algorithm_version(self, mock_db):
        """Stores algorithm_version."""
        storage = SemanticDiffsStorage(mock_db)

        storage.upsert_diff(
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="semantic-v3-topic-aware",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload={},
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["algorithm_version"] == "semantic-v3-topic-aware"

    def test_stores_submission_timestamps_in_source_fingerprint(self, mock_db):
        """Stores submission_a_updated_at and submission_b_updated_at in source_fingerprint."""
        storage = SemanticDiffsStorage(mock_db)
        sub_a_updated = datetime(2024, 1, 1, tzinfo=UTC)
        sub_b_updated = datetime(2024, 1, 2, tzinfo=UTC)

        storage.upsert_diff(
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="v1",
            submission_a_updated_at=sub_a_updated,
            submission_b_updated_at=sub_b_updated,
            payload={},
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        update_doc = call_args[0][1]

        assert (
            update_doc["$set"]["source_fingerprint"]["submission_a_updated_at"]
            == sub_a_updated
        )
        assert (
            update_doc["$set"]["source_fingerprint"]["submission_b_updated_at"]
            == sub_b_updated
        )

    def test_stores_payload(self, mock_db):
        """Stores payload."""
        storage = SemanticDiffsStorage(mock_db)
        test_payload = {
            "meta": {"version": "v1"},
            "matches_a_to_b": [{"left": 1, "right": 2}],
            "matches_b_to_a": [],
            "unmatched_a": [3],
            "unmatched_b": [4],
        }

        storage.upsert_diff(
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="v1",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload=test_payload,
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["payload"] == test_payload

    def test_set_on_insert_ensures_created_at_only_set_on_insert(self, mock_db):
        """setOnInsert ensures created_at only set on insert."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diffs.update_one.return_value = MagicMock(
            matched_count=1, modified_count=1
        )

        storage.upsert_diff(
            pair_key="existing-key",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="v1",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload={},
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        update_doc = call_args[0][1]

        # created_at should only be in $setOnInsert, not in $set
        assert "created_at" not in update_doc.get("$set", {})
        assert "created_at" in update_doc.get("$setOnInsert", {})

    def test_uses_upsert_true(self, mock_db):
        """Uses upsert=True."""
        storage = SemanticDiffsStorage(mock_db)

        storage.upsert_diff(
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="v1",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload={},
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        assert call_args[1]["upsert"] is True

    def test_handles_large_payloads(self, mock_db):
        """Handles large payloads."""
        storage = SemanticDiffsStorage(mock_db)

        # Create a large payload with many matches
        large_payload = {
            "meta": {"version": "v1"},
            "matches_a_to_b": [{"left": i, "right": i + 1} for i in range(10000)],
            "matches_b_to_a": [{"left": i, "right": i + 1} for i in range(10000)],
            "nearest_a_to_b": [
                {"left": i, "right": i + 1, "score": 0.95} for i in range(10000)
            ],
            "nearest_b_to_a": [
                {"left": i, "right": i + 1, "score": 0.95} for i in range(10000)
            ],
            "unmatched_a": list(range(5000)),
            "unmatched_b": list(range(5000)),
        }

        storage.upsert_diff(
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="v1",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload=large_payload,
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        assert call_args[0][1]["$set"]["payload"] == large_payload


# =============================================================================
# Test: claim_job
# =============================================================================


class TestClaimJob:
    """Tests for SemanticDiffsStorage.claim_job."""

    def test_finds_job_with_status_pending(self, mock_db, sample_job):
        """Finds job with status='pending'."""
        storage = SemanticDiffsStorage(mock_db)
        sample_job["status"] = "pending"
        mock_db.semantic_diff_jobs.find_one_and_update.return_value = sample_job

        result = storage.claim_job("worker-001")

        assert result is not None
        call_args = mock_db.semantic_diff_jobs.find_one_and_update.call_args
        query = call_args[0][0]
        assert query["status"] == "pending"

    def test_updates_status_to_processing(self, mock_db, sample_job):
        """Updates status to 'processing'."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.find_one_and_update.return_value = sample_job

        storage.claim_job("worker-001")

        call_args = mock_db.semantic_diff_jobs.find_one_and_update.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["status"] == "processing"

    def test_sets_started_at_timestamp(self, mock_db, mock_datetime, sample_job):
        """Sets started_at timestamp."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime
        mock_db.semantic_diff_jobs.find_one_and_update.return_value = sample_job

        with patch("lib.storage.semantic_diffs.datetime") as mock_dt_patch:
            mock_dt_patch.now.return_value = fixed_now
            mock_dt_patch.UTC = UTC

            storage.claim_job("worker-001")

        call_args = mock_db.semantic_diff_jobs.find_one_and_update.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["started_at"] == fixed_now

    def test_sets_worker_id(self, mock_db, sample_job):
        """Sets worker_id."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.find_one_and_update.return_value = sample_job

        storage.claim_job("worker-001")

        call_args = mock_db.semantic_diff_jobs.find_one_and_update.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["worker_id"] == "worker-001"

    def test_clears_error_field(self, mock_db, sample_job):
        """Clears error field."""
        storage = SemanticDiffsStorage(mock_db)
        sample_job["error"] = "Previous error"
        mock_db.semantic_diff_jobs.find_one_and_update.return_value = sample_job

        storage.claim_job("worker-001")

        call_args = mock_db.semantic_diff_jobs.find_one_and_update.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["error"] is None

    def test_sorted_by_force_recalculate_descending_then_created_at_ascending(
        self, mock_db
    ):
        """Sorted by force_recalculate descending, then created_at ascending."""
        storage = SemanticDiffsStorage(mock_db)
        storage.claim_job("worker-001")

        call_args = mock_db.semantic_diff_jobs.find_one_and_update.call_args
        assert call_args[1]["sort"] == [("force_recalculate", -1), ("created_at", 1)]

    def test_returns_claimed_job(self, mock_db, sample_job):
        """Returns claimed job."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.find_one_and_update.return_value = sample_job

        result = storage.claim_job("worker-001")

        assert result == sample_job

    def test_returns_none_when_no_pending_jobs(self, mock_db):
        """Returns None when no pending jobs."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.find_one_and_update.return_value = None

        result = storage.claim_job("worker-001")

        assert result is None

    def test_force_recalculate_jobs_processed_first(self, mock_db):
        """force_recalculate jobs processed first (verified by sort order)."""
        storage = SemanticDiffsStorage(mock_db)
        storage.claim_job("worker-001")

        call_args = mock_db.semantic_diff_jobs.find_one_and_update.call_args
        sort_order = call_args[1]["sort"]

        # force_recalculate should be sorted descending (-1), meaning True comes first
        assert sort_order[0] == ("force_recalculate", -1)


# =============================================================================
# Test: set_job_force_recalculate
# =============================================================================


class TestSetJobForceRecalculate:
    """Tests for SemanticDiffsStorage.set_job_force_recalculate."""

    def test_updates_force_recalculate_to_true(self, mock_db):
        """Updates force_recalculate to True."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)

        storage.set_job_force_recalculate("job-id-001", True)

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["force_recalculate"] is True

    def test_updates_force_recalculate_to_false(self, mock_db):
        """Updates force_recalculate to False."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)

        storage.set_job_force_recalculate("job-id-001", False)

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["force_recalculate"] is False

    def test_queries_by_job_id(self, mock_db):
        """Queries by _id field."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)

        storage.set_job_force_recalculate("job-id-001", True)

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        query = call_args[0][0]

        assert query == {"_id": "job-id-001"}

    def test_no_error_if_job_does_not_exist(self, mock_db):
        """No error if job doesn't exist (update may not modify)."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(
            matched_count=0, modified_count=0
        )

        # Should not raise
        result = storage.set_job_force_recalculate("non-existent-job", True)

        assert result is None


# =============================================================================
# Test: mark_job_completed
# =============================================================================


class TestMarkJobCompleted:
    """Tests for SemanticDiffsStorage.mark_job_completed."""

    def test_sets_status_to_completed(self, mock_db):
        """Sets status='completed'."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)

        storage.mark_job_completed("job-id-001")

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["status"] == "completed"

    def test_sets_completed_at_timestamp(self, mock_db, mock_datetime):
        """Sets completed_at timestamp."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)

        with patch("lib.storage.semantic_diffs.datetime") as mock_dt_patch:
            mock_dt_patch.now.return_value = fixed_now
            mock_dt_patch.UTC = UTC

            storage.mark_job_completed("job-id-001")

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["completed_at"] == fixed_now

    def test_queries_by_job_id(self, mock_db):
        """Queries by _id field."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)

        storage.mark_job_completed("job-id-001")

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        query = call_args[0][0]

        assert query == {"_id": "job-id-001"}


# =============================================================================
# Test: mark_job_failed
# =============================================================================


class TestMarkJobFailed:
    """Tests for SemanticDiffsStorage.mark_job_failed."""

    def test_sets_status_to_failed(self, mock_db):
        """Sets status='failed'."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)

        storage.mark_job_failed("job-id-001", "Test error message")

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["status"] == "failed"

    def test_sets_completed_at_timestamp(self, mock_db, mock_datetime):
        """Sets completed_at timestamp."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)

        with patch("lib.storage.semantic_diffs.datetime") as mock_dt_patch:
            mock_dt_patch.now.return_value = fixed_now
            mock_dt_patch.UTC = UTC

            storage.mark_job_failed("job-id-001", "Error message")

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["completed_at"] == fixed_now

    def test_sets_error_message(self, mock_db):
        """Sets error message."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)
        error_msg = "Database connection failed"

        storage.mark_job_failed("job-id-001", error_msg)

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["error"] == error_msg

    def test_queries_by_job_id(self, mock_db):
        """Queries by _id field."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)

        storage.mark_job_failed("job-id-001", "Error")

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        query = call_args[0][0]

        assert query == {"_id": "job-id-001"}

    def test_handles_long_error_messages(self, mock_db):
        """Handles long error messages."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)
        long_error = "Error: " + "x" * 10000

        storage.mark_job_failed("job-id-001", long_error)

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["error"] == long_error


# =============================================================================
# Test: Job Document Structure
# =============================================================================


class TestJobDocumentStructure:
    """Tests for Job document structure."""

    def test_job_has_job_id_field(self, mock_db):
        """Job has job_id field (string/UUID)."""
        storage = SemanticDiffsStorage(mock_db)
        job = storage.create_job(
            job_id="test-uuid-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )

        assert isinstance(job["job_id"], str)
        assert job["job_id"] == "test-uuid-001"

    def test_job_has_pair_key_field(self, mock_db):
        """Job has pair_key field."""
        storage = SemanticDiffsStorage(mock_db)
        job = storage.create_job(
            job_id="job-001",
            pair_key="sub-a::sub-b",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )

        assert job["pair_key"] == "sub-a::sub-b"

    def test_job_has_submission_ids(self, mock_db):
        """Job has submission_a_id and submission_b_id fields."""
        storage = SemanticDiffsStorage(mock_db)
        job = storage.create_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a-001",
            submission_b_id="sub-b-002",
            requested_left_id="sub-a-001",
            requested_right_id="sub-b-002",
        )

        assert job["submission_a_id"] == "sub-a-001"
        assert job["submission_b_id"] == "sub-b-002"

    def test_job_has_requested_ids(self, mock_db):
        """Job has requested_left_id and requested_right_id fields."""
        storage = SemanticDiffsStorage(mock_db)
        job = storage.create_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a-req",
            requested_right_id="sub-b-req",
        )

        assert job["requested_left_id"] == "sub-a-req"
        assert job["requested_right_id"] == "sub-b-req"

    def test_job_has_force_recalculate_boolean(self, mock_db):
        """Job has force_recalculate boolean field."""
        storage = SemanticDiffsStorage(mock_db)

        job_false = storage.create_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
            force_recalculate=False,
        )
        assert job_false["force_recalculate"] is False

        job_true = storage.create_job(
            job_id="job-002",
            pair_key="key-002",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
            force_recalculate=True,
        )
        assert job_true["force_recalculate"] is True

    def test_job_has_status_field(self, mock_db):
        """Job has status field (pending | processing | completed | failed)."""
        storage = SemanticDiffsStorage(mock_db)
        job = storage.create_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )

        assert job["status"] == "pending"
        assert job["status"] in ["pending", "processing", "completed", "failed"]

    def test_job_has_created_at_timestamp(self, mock_db, mock_datetime):
        """Job has created_at datetime timestamp."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime

        job = storage.create_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )

        assert job["created_at"] == fixed_now
        assert isinstance(job["created_at"], datetime)

    def test_job_has_nullable_timestamps(self, mock_db):
        """Job has nullable timestamps (started_at, completed_at)."""
        storage = SemanticDiffsStorage(mock_db)
        job = storage.create_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )

        assert job["started_at"] is None
        assert job["completed_at"] is None

    def test_job_has_nullable_worker_id(self, mock_db):
        """Job has nullable worker_id field."""
        storage = SemanticDiffsStorage(mock_db)
        job = storage.create_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )

        assert job["worker_id"] is None

    def test_job_has_nullable_error_field(self, mock_db):
        """Job has nullable error field."""
        storage = SemanticDiffsStorage(mock_db)
        job = storage.create_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )

        assert job["error"] is None


# =============================================================================
# Test: Diff Document Structure
# =============================================================================


class TestDiffDocumentStructure:
    """Tests for Diff document structure."""

    def test_diff_has_pair_key_field(self, mock_db, mock_datetime):
        """Diff has pair_key field."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime
        mock_db.semantic_diffs.update_one.return_value = MagicMock()

        storage.upsert_diff(
            pair_key="sub-a::sub-b",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="v1",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload={},
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        assert call_args[0][1]["$set"]["pair_key"] == "sub-a::sub-b"

    def test_diff_has_submission_ids(self, mock_db):
        """Diff has submission_a_id and submission_b_id fields."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diffs.update_one.return_value = MagicMock()

        storage.upsert_diff(
            pair_key="key-001",
            submission_a_id="sub-a-001",
            submission_b_id="sub-b-002",
            algorithm_version="v1",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload={},
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        assert call_args[0][1]["$set"]["submission_a_id"] == "sub-a-001"
        assert call_args[0][1]["$set"]["submission_b_id"] == "sub-b-002"

    def test_diff_has_algorithm_version(self, mock_db):
        """Diff has algorithm_version field."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diffs.update_one.return_value = MagicMock()

        storage.upsert_diff(
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="semantic-v3-topic-aware-charwb",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload={},
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        assert (
            call_args[0][1]["$set"]["algorithm_version"]
            == "semantic-v3-topic-aware-charwb"
        )

    def test_diff_has_computed_at_timestamp(self, mock_db, mock_datetime):
        """Diff has computed_at timestamp."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime
        mock_db.semantic_diffs.update_one.return_value = MagicMock()

        storage.upsert_diff(
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="v1",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload={},
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        assert call_args[0][1]["$set"]["computed_at"] == fixed_now

    def test_diff_has_updated_at_timestamp(self, mock_db, mock_datetime):
        """Diff has updated_at timestamp."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime
        mock_db.semantic_diffs.update_one.return_value = MagicMock()

        storage.upsert_diff(
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="v1",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload={},
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        assert call_args[0][1]["$set"]["updated_at"] == fixed_now

    def test_diff_has_source_fingerprint(self, mock_db):
        """Diff has source_fingerprint with submission timestamps."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diffs.update_one.return_value = MagicMock()
        sub_a_ts = datetime(2024, 1, 1, tzinfo=UTC)
        sub_b_ts = datetime(2024, 1, 2, tzinfo=UTC)

        storage.upsert_diff(
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="v1",
            submission_a_updated_at=sub_a_ts,
            submission_b_updated_at=sub_b_ts,
            payload={},
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        fingerprint = call_args[0][1]["$set"]["source_fingerprint"]

        assert fingerprint["submission_a_updated_at"] == sub_a_ts
        assert fingerprint["submission_b_updated_at"] == sub_b_ts

    def test_diff_has_payload_dict(self, mock_db):
        """Diff has payload dict field."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diffs.update_one.return_value = MagicMock()
        test_payload = {"matches": [], "unmatched": []}

        storage.upsert_diff(
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="v1",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload=test_payload,
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        assert call_args[0][1]["$set"]["payload"] == test_payload

    def test_diff_has_created_at_set_on_insert(self, mock_db, mock_datetime):
        """Diff has created_at set only on insert via $setOnInsert."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime
        mock_db.semantic_diffs.update_one.return_value = MagicMock()

        storage.upsert_diff(
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="v1",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload={},
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        assert call_args[0][1]["$setOnInsert"]["created_at"] == fixed_now


# =============================================================================
# Test: Edge Cases
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and race conditions."""

    def test_concurrent_job_claims_atomic_operation(self, mock_db, sample_job):
        """Concurrent job claims use atomic find_one_and_update."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.find_one_and_update.return_value = sample_job

        # Multiple workers trying to claim jobs
        storage.claim_job("worker-001")
        storage.claim_job("worker-002")

        # Each claim is atomic via find_one_and_update
        assert mock_db.semantic_diff_jobs.find_one_and_update.call_count == 2

    def test_race_condition_create_or_get_active_job(self, mock_db, sample_job):
        """Race condition in create_or_get_active_job handled via DuplicateKeyError."""
        storage = SemanticDiffsStorage(mock_db)

        # Simulate race condition: insert fails with DuplicateKeyError
        mock_db.semantic_diff_jobs.insert_one.side_effect = DuplicateKeyError(
            "Duplicate"
        )
        mock_db.semantic_diff_jobs.find_one.return_value = sample_job

        # Should gracefully handle and return existing job
        job, created = storage.create_or_get_active_job(
            job_id="job-001",
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )

        assert created is False
        assert job == sample_job

    def test_large_payload_handling(self, mock_db):
        """Large diff payloads are stored correctly."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diffs.update_one.return_value = MagicMock()

        # Create a moderately large payload to test without CI instability
        large_payload = {
            "meta": {"version": "v1", "config": {"param": "value" * 100}},
            "matches_a_to_b": [
                {"left": i, "right": j, "score": 0.95}
                for i in range(500)
                for j in range(2)
            ],
            "unmatched_a": list(range(1000)),
        }

        storage.upsert_diff(
            pair_key="key-001",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="v1",
            submission_a_updated_at=datetime.now(UTC),
            submission_b_updated_at=datetime.now(UTC),
            payload=large_payload,
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        stored_payload = call_args[0][1]["$set"]["payload"]
        assert stored_payload == large_payload

    def test_empty_pair_key_query(self, mock_db):
        """Empty pair_key handled correctly."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diffs.find_one.return_value = None

        result = storage.get_diff_by_pair_key("")

        assert result is None
        mock_db.semantic_diffs.find_one.assert_called_once_with({"pair_key": ""})

    def test_special_characters_in_pair_key(self, mock_db):
        """Special characters in pair_key handled correctly."""
        storage = SemanticDiffsStorage(mock_db)
        special_key = "sub-a::special::chars::sub-b"
        mock_db.semantic_diffs.find_one.return_value = None

        storage.get_diff_by_pair_key(special_key)

        mock_db.semantic_diffs.find_one.assert_called_once_with(
            {"pair_key": special_key}
        )

    def test_job_status_transitions(self, mock_db, sample_job):
        """Job status transitions: pending -> processing -> completed/failed."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)

        # Start with pending job
        sample_job["status"] = "pending"
        mock_db.semantic_diff_jobs.find_one_and_update.return_value = sample_job

        # Claim job (pending -> processing)
        claimed_job = storage.claim_job("worker-001")
        assert claimed_job is not None

        # Mark as completed
        storage.mark_job_completed("job-id-001")
        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        assert call_args[0][1]["$set"]["status"] == "completed"

        # Or mark as failed
        mock_db.semantic_diff_jobs.update_one.reset_mock()
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)
        storage.mark_job_failed("job-id-001", "Test error")
        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        assert call_args[0][1]["$set"]["status"] == "failed"

    def test_force_recalculate_flag_update_during_processing(self, mock_db):
        """Force recalculate flag can be updated during processing."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)

        # Set force_recalculate to True during processing
        storage.set_job_force_recalculate("job-001", True)

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        assert call_args[0][1]["$set"]["force_recalculate"] is True

        # Can be set back to False
        mock_db.semantic_diff_jobs.update_one.reset_mock()
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)
        storage.set_job_force_recalculate("job-001", False)

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        assert call_args[0][1]["$set"]["force_recalculate"] is False

    def test_multiple_index_creation_errors_handled(self, mock_db):
        """Multiple index creation errors are all handled gracefully."""
        storage = SemanticDiffsStorage(mock_db)

        # Make all index creations fail
        mock_db.semantic_diffs.create_index.side_effect = Exception("Index error")
        mock_db.semantic_diff_jobs.create_index.side_effect = Exception("Index error")

        with patch.object(storage._log, "warning") as mock_warning:
            # Should not raise
            storage.prepare()

            # Multiple warnings should be logged
            assert mock_warning.call_count >= 5  # 5 indexes

    def test_datetime_utc_timezone_used(self, mock_db):
        """datetime.now(UTC) is used for all timestamps."""
        storage = SemanticDiffsStorage(mock_db)

        with patch("lib.storage.semantic_diffs.datetime") as mock_dt:
            fixed_now = datetime(2024, 6, 15, 10, 30, 0, tzinfo=UTC)
            mock_dt.now.return_value = fixed_now
            mock_dt.UTC = UTC

            # Test create_job
            storage.create_job(
                job_id="job-001",
                pair_key="key-001",
                submission_a_id="sub-a",
                submission_b_id="sub-b",
                requested_left_id="sub-a",
                requested_right_id="sub-b",
            )

            # Verify datetime.now was called with UTC timezone
            mock_dt.now.assert_called_with(UTC)


# =============================================================================
# Test: Integration Scenarios
# =============================================================================


class TestIntegrationScenarios:
    """Integration scenario tests."""

    def test_full_job_lifecycle(self, mock_db, mock_datetime):
        """Test full job lifecycle: create -> claim -> complete."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime

        # Create job
        job = storage.create_job(
            job_id="job-001",
            pair_key="sub-a::sub-b",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            requested_left_id="sub-a",
            requested_right_id="sub-b",
        )
        assert job["status"] == "pending"

        # Setup mock for claim
        job["status"] = "processing"
        mock_db.semantic_diff_jobs.find_one_and_update.return_value = job

        # Claim job
        with patch("lib.storage.semantic_diffs.datetime") as mock_dt_patch:
            mock_dt_patch.now.return_value = fixed_now
            mock_dt_patch.UTC = UTC
            claimed = storage.claim_job("worker-001")

        assert claimed is not None

        # Complete job
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)
        storage.mark_job_completed("job-001")

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        assert call_args[0][1]["$set"]["status"] == "completed"

    def test_diff_computation_and_storage(self, mock_db, mock_datetime):
        """Test diff computation result storage."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime
        mock_db.semantic_diffs.update_one.return_value = MagicMock()

        diff_payload = {
            "meta": {"algorithm_version": "v1"},
            "matches_a_to_b": [{"left": 1, "right": 2}],
            "matches_b_to_a": [{"left": 2, "right": 1}],
            "unmatched_a": [3],
            "unmatched_b": [4],
        }

        storage.upsert_diff(
            pair_key="sub-a::sub-b",
            submission_a_id="sub-a",
            submission_b_id="sub-b",
            algorithm_version="v1",
            submission_a_updated_at=fixed_now,
            submission_b_updated_at=fixed_now,
            payload=diff_payload,
        )

        call_args = mock_db.semantic_diffs.update_one.call_args
        assert call_args[0][1]["$set"]["payload"] == diff_payload
        assert call_args[1]["upsert"] is True

    def test_failed_job_with_error_message(self, mock_db, mock_datetime):
        """Test failed job with error message storage."""
        storage = SemanticDiffsStorage(mock_db)
        mock_dt, fixed_now = mock_datetime
        mock_db.semantic_diff_jobs.update_one.return_value = MagicMock(modified_count=1)

        error_msg = "Submission not found: sub-a-001"
        storage.mark_job_failed("job-001", error_msg)

        call_args = mock_db.semantic_diff_jobs.update_one.call_args
        update_doc = call_args[0][1]

        assert update_doc["$set"]["status"] == "failed"
        assert update_doc["$set"]["error"] == error_msg
        assert update_doc["$set"]["completed_at"] == fixed_now


# =============================================================================
# Test: delete_by_pair_key
# =============================================================================


class TestDeleteByPairKey:
    """Tests for SemanticDiffsStorage.delete_by_pair_key."""

    def test_deletes_diffs_and_jobs(self, mock_db):
        """Deletes both diffs and jobs for a pair key."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diffs.delete_many.return_value.deleted_count = 5
        mock_db.semantic_diff_jobs.delete_many.return_value.deleted_count = 3

        diff_count, job_count = storage.delete_by_pair_key("sub-a::sub-b")

        assert diff_count == 5
        assert job_count == 3
        mock_db.semantic_diffs.delete_many.assert_called_once_with(
            {"pair_key": "sub-a::sub-b"}
        )
        mock_db.semantic_diff_jobs.delete_many.assert_called_once_with(
            {"pair_key": "sub-a::sub-b"}
        )

    def test_returns_zero_counts_when_nothing_deleted(self, mock_db):
        """Returns zero counts when nothing deleted."""
        storage = SemanticDiffsStorage(mock_db)
        mock_db.semantic_diffs.delete_many.return_value.deleted_count = 0
        mock_db.semantic_diff_jobs.delete_many.return_value.deleted_count = 0

        diff_count, job_count = storage.delete_by_pair_key("non-existent")

        assert diff_count == 0
        assert job_count == 0
