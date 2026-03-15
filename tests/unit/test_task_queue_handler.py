"""
Unit tests for the task queue handler module.

Tests all functions in handlers/task_queue_handler.py:
- list_task_queue
- delete_task_queue_entry
- repeat_task_queue_entry
- add_task_queue_entry

Also tests:
- ALLOWED_TASKS validation
- TASK_PRIORITIES ordering
- AddTaskRequest model validation
"""
import pytest
from unittest.mock import MagicMock, patch, call
from datetime import datetime, UTC
from bson import ObjectId
from fastapi import HTTPException
from pydantic import ValidationError
import uuid

from handlers.task_queue_handler import (
    list_task_queue,
    delete_task_queue_entry,
    repeat_task_queue_entry,
    add_task_queue_entry,
    AddTaskRequest,
    ALLOWED_TASKS,
    TASK_PRIORITIES,
)


# =============================================================================
# Fixtures for Task Queue Handler Tests
# =============================================================================

@pytest.fixture
def sample_task_queue_entry():
    """Create a sample task queue entry document."""
    return {
        "_id": ObjectId(),
        "submission_id": str(uuid.uuid4()),
        "task_type": "split_topic_generation",
        "priority": 1,
        "status": "pending",
        "created_at": datetime.now(UTC),
        "started_at": None,
        "completed_at": None,
        "worker_id": None,
        "retry_count": 0,
        "error": None,
    }


@pytest.fixture
def sample_task_queue_entry_processing():
    """Create a sample task queue entry in processing status."""
    return {
        "_id": ObjectId(),
        "submission_id": str(uuid.uuid4()),
        "task_type": "summarization",
        "priority": 3,
        "status": "processing",
        "created_at": datetime.now(UTC),
        "started_at": datetime.now(UTC),
        "completed_at": None,
        "worker_id": "worker-001",
        "retry_count": 0,
        "error": None,
    }


@pytest.fixture
def sample_task_queue_entry_completed():
    """Create a sample task queue entry in completed status."""
    return {
        "_id": ObjectId(),
        "submission_id": str(uuid.uuid4()),
        "task_type": "mindmap",
        "priority": 3,
        "status": "completed",
        "created_at": datetime.now(UTC),
        "started_at": datetime.now(UTC),
        "completed_at": datetime.now(UTC),
        "worker_id": "worker-002",
        "retry_count": 0,
        "error": None,
    }


@pytest.fixture
def sample_submission():
    """Create a sample submission document."""
    return {
        "submission_id": str(uuid.uuid4()),
        "html_content": "<html><body><p>Sample content</p></body></html>",
        "text_content": "Sample content",
        "source_url": "https://example.com/article",
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
        "tasks": {
            "split_topic_generation": {
                "status": "completed",
                "started_at": datetime.now(UTC),
                "completed_at": datetime.now(UTC),
                "error": None
            },
            "subtopics_generation": {
                "status": "completed",
                "started_at": datetime.now(UTC),
                "completed_at": datetime.now(UTC),
                "error": None
            },
            "summarization": {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "error": None
            },
            "mindmap": {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "error": None
            },
            "prefix_tree": {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "error": None
            }
        },
        "results": {
            "sentences": ["Sentence one.", "Sentence two.", "Sentence three."],
            "topics": [
                {"name": "Topic A", "sentences": [1, 2]},
                {"name": "Topic B", "sentences": [3]}
            ],
            "topic_summaries": {},
            "topic_mindmaps": {},
            "mindmap_results": [],
            "subtopics": [],
            "summary": [],
            "summary_mappings": [],
            "prefix_tree": {}
        }
    }


@pytest.fixture
def mock_cursor():
    """Create a mock MongoDB cursor."""
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.limit.return_value = []
    return cursor


# =============================================================================
# Test: ALLOWED_TASKS and TASK_PRIORITIES Constants
# =============================================================================

class TestConstants:
    """Tests for ALLOWED_TASKS and TASK_PRIORITIES constants."""

    def test_allowed_tasks_contains_all_expected_task_types(self):
        """ALLOWED_TASKS contains all expected task types."""
        expected_tasks = [
            "split_topic_generation",
            "subtopics_generation",
            "summarization",
            "mindmap",
            "prefix_tree"
        ]
        assert set(ALLOWED_TASKS) == set(expected_tasks)

    def test_allowed_tasks_is_list(self):
        """ALLOWED_TASKS is a list."""
        assert isinstance(ALLOWED_TASKS, list)

    def test_task_priorities_has_all_allowed_tasks(self):
        """TASK_PRIORITIES has entries for all ALLOWED_TASKS."""
        for task in ALLOWED_TASKS:
            assert task in TASK_PRIORITIES

    def test_task_priorities_correct_ordering(self):
        """TASK_PRIORITIES has correct ordering (lower number = higher priority)."""
        assert TASK_PRIORITIES["split_topic_generation"] == 1
        assert TASK_PRIORITIES["subtopics_generation"] == 2
        assert TASK_PRIORITIES["summarization"] == 3
        assert TASK_PRIORITIES["mindmap"] == 3
        assert TASK_PRIORITIES["prefix_tree"] == 3

    def test_split_topic_generation_has_highest_priority(self):
        """split_topic_generation has the highest priority (lowest number)."""
        split_priority = TASK_PRIORITIES["split_topic_generation"]
        for task, priority in TASK_PRIORITIES.items():
            if task != "split_topic_generation":
                assert priority >= split_priority

    def test_subtopics_generation_has_second_highest_priority(self):
        """subtopics_generation has the second highest priority."""
        subtopics_priority = TASK_PRIORITIES["subtopics_generation"]
        split_priority = TASK_PRIORITIES["split_topic_generation"]
        assert subtopics_priority > split_priority
        for task, priority in TASK_PRIORITIES.items():
            if task not in ["split_topic_generation", "subtopics_generation"]:
                assert priority >= subtopics_priority


# =============================================================================
# Test: AddTaskRequest Model
# =============================================================================

class TestAddTaskRequest:
    """Tests for the AddTaskRequest Pydantic model."""

    def test_valid_request_with_all_fields(self):
        """Valid request with all fields passes validation."""
        request = AddTaskRequest(
            submission_id=str(uuid.uuid4()),
            task_type="split_topic_generation",
            priority=5
        )
        assert request.submission_id is not None
        assert request.task_type == "split_topic_generation"
        assert request.priority == 5

    def test_valid_request_without_priority(self):
        """Valid request without priority uses default None."""
        request = AddTaskRequest(
            submission_id=str(uuid.uuid4()),
            task_type="summarization"
        )
        assert request.submission_id is not None
        assert request.task_type == "summarization"
        assert request.priority is None

    def test_priority_minimum_boundary_value_1(self):
        """Priority minimum boundary value (1) is valid."""
        request = AddTaskRequest(
            submission_id=str(uuid.uuid4()),
            task_type="mindmap",
            priority=1
        )
        assert request.priority == 1

    def test_priority_maximum_boundary_value_10(self):
        """Priority maximum boundary value (10) is valid."""
        request = AddTaskRequest(
            submission_id=str(uuid.uuid4()),
            task_type="prefix_tree",
            priority=10
        )
        assert request.priority == 10

    def test_priority_below_minimum_raises_validation_error(self):
        """Priority below minimum (0) raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            AddTaskRequest(
                submission_id=str(uuid.uuid4()),
                task_type="summarization",
                priority=0
            )
        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert errors[0]["loc"] == ("priority",)
        assert errors[0]["type"] == "greater_than_equal"

    def test_priority_above_maximum_raises_validation_error(self):
        """Priority above maximum (11) raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            AddTaskRequest(
                submission_id=str(uuid.uuid4()),
                task_type="summarization",
                priority=11
            )
        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert errors[0]["loc"] == ("priority",)
        assert errors[0]["type"] == "less_than_equal"

    def test_missing_submission_id_raises_validation_error(self):
        """Missing submission_id raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            AddTaskRequest(task_type="summarization")
        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert errors[0]["loc"] == ("submission_id",)
        assert errors[0]["type"] == "missing"

    def test_missing_task_type_raises_validation_error(self):
        """Missing task_type raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            AddTaskRequest(submission_id=str(uuid.uuid4()))
        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert errors[0]["loc"] == ("task_type",)
        assert errors[0]["type"] == "missing"


# =============================================================================
# Test: list_task_queue
# =============================================================================

class TestListTaskQueue:
    """Tests for the list_task_queue endpoint."""

    def _setup_mock_cursor(self, mock_db, tasks):
        """Helper to set up a mock cursor that supports method chaining."""
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = mock_cursor
        mock_cursor.limit.return_value = tasks
        mock_db.task_queue.find.return_value = mock_cursor
        return mock_cursor

    def test_returns_all_tasks_when_no_filters_provided(
        self, mock_db, sample_task_queue_entry
    ):
        """Returns all tasks when no filters provided."""
        # Arrange
        self._setup_mock_cursor(mock_db, [sample_task_queue_entry])
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act
        result = list_task_queue(
            submission_id=None,
            status=None,
            limit=100,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert "tasks" in result
        assert len(result["tasks"]) == 1
        mock_db.task_queue.find.assert_called_once_with({})

    def test_submission_id_filter_returns_tasks_for_specific_submission(
        self, mock_db, sample_task_queue_entry
    ):
        """submission_id filter returns tasks for specific submission."""
        # Arrange
        self._setup_mock_cursor(mock_db, [sample_task_queue_entry])
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db
        test_submission_id = "test-submission-123"

        # Act
        result = list_task_queue(
            submission_id=test_submission_id,
            status=None,
            limit=100,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        mock_db.task_queue.find.assert_called_once_with(
            {"submission_id": test_submission_id}
        )

    def test_status_filter_returns_tasks_with_matching_status(
        self, mock_db, sample_task_queue_entry
    ):
        """status filter returns tasks with matching status."""
        # Arrange
        self._setup_mock_cursor(mock_db, [sample_task_queue_entry])
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db
        test_status = "pending"

        # Act
        result = list_task_queue(
            submission_id=None,
            status=test_status,
            limit=100,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        mock_db.task_queue.find.assert_called_once_with(
            {"status": test_status}
        )

    def test_combined_filters_work_correctly(
        self, mock_db, sample_task_queue_entry
    ):
        """Combined filters work correctly."""
        # Arrange
        self._setup_mock_cursor(mock_db, [sample_task_queue_entry])
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db
        test_submission_id = "test-submission-123"
        test_status = "processing"

        # Act
        result = list_task_queue(
            submission_id=test_submission_id,
            status=test_status,
            limit=100,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        mock_db.task_queue.find.assert_called_once_with({
            "submission_id": test_submission_id,
            "status": test_status
        })

    def test_limit_parameter_restricts_results_count(
        self, mock_db, sample_task_queue_entry
    ):
        """limit parameter restricts results count."""
        # Arrange
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = mock_cursor
        mock_cursor.limit.return_value = [sample_task_queue_entry]
        mock_db.task_queue.find.return_value = mock_cursor
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db
        test_limit = 5

        # Act
        result = list_task_queue(
            submission_id=None,
            status=None,
            limit=test_limit,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        mock_cursor.limit.assert_called_once_with(test_limit)

    def test_non_positive_limit_raises_http_400(self, mock_db):
        """Non-positive limit raises HTTP 400."""
        # Arrange
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            list_task_queue(
                submission_id=None,
                status=None,
                limit=0,
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 400
        assert "positive" in exc_info.value.detail.lower()

        # Test negative limit
        with pytest.raises(HTTPException) as exc_info:
            list_task_queue(
                submission_id=None,
                status=None,
                limit=-5,
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 400

    def test_task_id_is_serialized_to_string_id_field(
        self, mock_db, sample_task_queue_entry
    ):
        """Task _id is serialized to string 'id' field."""
        # Arrange
        self._setup_mock_cursor(mock_db, [sample_task_queue_entry])
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act
        result = list_task_queue(
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert len(result["tasks"]) == 1
        task = result["tasks"][0]
        assert "id" in task
        assert "_id" not in task
        assert isinstance(task["id"], str)
        assert task["id"] == str(sample_task_queue_entry["_id"])

    def test_results_sorted_by_created_at_descending(
        self, mock_db, sample_task_queue_entry
    ):
        """Results sorted by created_at descending."""
        # Arrange
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = mock_cursor
        mock_cursor.limit.return_value = [sample_task_queue_entry]
        mock_db.task_queue.find.return_value = mock_cursor
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act
        result = list_task_queue(submissions_storage=mock_submissions_storage)

        # Assert
        mock_cursor.sort.assert_called_once_with("created_at", -1)

    def test_returns_empty_list_when_no_tasks_found(self, mock_db):
        """Returns empty list when no tasks found."""
        # Arrange
        self._setup_mock_cursor(mock_db, [])
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act
        result = list_task_queue(submissions_storage=mock_submissions_storage)

        # Assert
        assert result["tasks"] == []

    def test_multiple_tasks_returned_in_correct_order(
        self, mock_db, sample_task_queue_entry, sample_task_queue_entry_processing
    ):
        """Multiple tasks returned in correct order."""
        # Arrange
        tasks = [sample_task_queue_entry, sample_task_queue_entry_processing]
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = mock_cursor
        mock_cursor.limit.return_value = tasks
        mock_db.task_queue.find.return_value = mock_cursor
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act
        result = list_task_queue(submissions_storage=mock_submissions_storage)

        # Assert
        assert len(result["tasks"]) == 2
        for task in result["tasks"]:
            assert "id" in task
            assert "_id" not in task

    def test_status_filter_pending(self, mock_db, sample_task_queue_entry):
        """Status filter for 'pending' status."""
        # Arrange
        self._setup_mock_cursor(mock_db, [sample_task_queue_entry])
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act
        list_task_queue(status="pending", submissions_storage=mock_submissions_storage)

        # Assert
        mock_db.task_queue.find.assert_called_once_with({"status": "pending"})

    def test_status_filter_completed(self, mock_db, sample_task_queue_entry_completed):
        """Status filter for 'completed' status."""
        # Arrange
        self._setup_mock_cursor(mock_db, [sample_task_queue_entry_completed])
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act
        list_task_queue(status="completed", submissions_storage=mock_submissions_storage)

        # Assert
        mock_db.task_queue.find.assert_called_once_with({"status": "completed"})

    def test_status_filter_failed(self, mock_db, sample_task_queue_entry):
        """Status filter for 'failed' status."""
        # Arrange
        sample_task_queue_entry["status"] = "failed"
        self._setup_mock_cursor(mock_db, [sample_task_queue_entry])
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act
        list_task_queue(status="failed", submissions_storage=mock_submissions_storage)

        # Assert
        mock_db.task_queue.find.assert_called_once_with({"status": "failed"})


# =============================================================================
# Test: delete_task_queue_entry
# =============================================================================

class TestDeleteTaskQueueEntry:
    """Tests for the delete_task_queue_entry endpoint."""

    def test_valid_object_id_deletes_task_successfully(
        self, mock_db, sample_task_queue_entry
    ):
        """Valid ObjectId deletes task successfully."""
        # Arrange
        task_id = str(sample_task_queue_entry["_id"])
        mock_db.task_queue.delete_one.return_value = MagicMock(deleted_count=1)
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act
        result = delete_task_queue_entry(
            task_id=task_id,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert result["deleted"] is True
        assert result["task_id"] == task_id
        mock_db.task_queue.delete_one.assert_called_once_with(
            {"_id": ObjectId(task_id)}
        )

    def test_invalid_object_id_format_raises_http_400(self, mock_db):
        """Invalid ObjectId format raises HTTP 400."""
        # Arrange
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db
        invalid_task_id = "not-a-valid-object-id"

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            delete_task_queue_entry(
                task_id=invalid_task_id,
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 400
        assert "invalid" in exc_info.value.detail.lower()

    def test_non_existent_task_id_raises_http_404(self, mock_db):
        """Non-existent task ID raises HTTP 404."""
        # Arrange
        task_id = str(ObjectId())
        mock_db.task_queue.delete_one.return_value = MagicMock(deleted_count=0)
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            delete_task_queue_entry(
                task_id=task_id,
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 404
        assert "not found" in exc_info.value.detail.lower()

    def test_response_includes_deleted_true_and_task_id(
        self, mock_db, sample_task_queue_entry
    ):
        """Response includes deleted=true and task_id."""
        # Arrange
        task_id = str(sample_task_queue_entry["_id"])
        mock_db.task_queue.delete_one.return_value = MagicMock(deleted_count=1)
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act
        result = delete_task_queue_entry(
            task_id=task_id,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert "deleted" in result
        assert "task_id" in result
        assert result["deleted"] is True
        assert result["task_id"] == task_id

    def test_object_id_validation_with_empty_string(self, mock_db):
        """ObjectId validation with empty string."""
        # Arrange
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            delete_task_queue_entry(
                task_id="",
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 400

    def test_object_id_validation_with_none(self, mock_db):
        """ObjectId validation with None-like string."""
        # Arrange
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            delete_task_queue_entry(
                task_id="None",
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 400

    def test_object_id_validation_with_special_characters(self, mock_db):
        """ObjectId validation with special characters."""
        # Arrange
        mock_submissions_storage = MagicMock()
        mock_submissions_storage._db = mock_db

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            delete_task_queue_entry(
                task_id="<script>alert('xss')</script>",
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 400


# =============================================================================
# Test: repeat_task_queue_entry
# =============================================================================

class TestRepeatTaskQueueEntry:
    """Tests for the repeat_task_queue_entry endpoint."""

    def test_valid_task_id_requeues_the_task(
        self, mock_db, mock_submissions_storage, sample_task_queue_entry,
        sample_submission
    ):
        """Valid task ID re-queues the task."""
        # Arrange
        task_id = str(sample_task_queue_entry["_id"])
        sample_task_queue_entry["submission_id"] = sample_submission["submission_id"]
        mock_db.task_queue.find_one.return_value = sample_task_queue_entry
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage.expand_recalculation_tasks.return_value = [
            "split_topic_generation"
        ]
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        # Act
        result = repeat_task_queue_entry(
            task_id=task_id,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert result["requeued"] is True
        assert "tasks" in result
        assert "task_ids" in result
        assert len(result["task_ids"]) == 1

    def test_invalid_object_id_format_raises_http_400(
        self, mock_db, mock_submissions_storage
    ):
        """Invalid ObjectId format raises HTTP 400."""
        # Arrange
        mock_submissions_storage._db = mock_db
        invalid_task_id = "invalid-object-id"

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            repeat_task_queue_entry(
                task_id=invalid_task_id,
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 400
        assert "invalid" in exc_info.value.detail.lower()

    def test_non_existent_task_id_raises_http_404(
        self, mock_db, mock_submissions_storage
    ):
        """Non-existent task ID raises HTTP 404."""
        # Arrange
        task_id = str(ObjectId())
        mock_db.task_queue.find_one.return_value = None
        mock_submissions_storage._db = mock_db

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            repeat_task_queue_entry(
                task_id=task_id,
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 404
        assert "not found" in exc_info.value.detail.lower()

    def test_unsupported_task_type_raises_http_400(
        self, mock_db, mock_submissions_storage, sample_task_queue_entry,
        sample_submission
    ):
        """Unsupported task type raises HTTP 400."""
        # Arrange
        task_id = str(sample_task_queue_entry["_id"])
        sample_task_queue_entry["task_type"] = "unsupported_task"
        sample_task_queue_entry["submission_id"] = sample_submission["submission_id"]
        mock_db.task_queue.find_one.return_value = sample_task_queue_entry
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage._db = mock_db

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            repeat_task_queue_entry(
                task_id=task_id,
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 400
        assert "unsupported" in exc_info.value.detail.lower()

    def test_non_existent_submission_raises_http_404(
        self, mock_db, mock_submissions_storage, sample_task_queue_entry
    ):
        """Non-existent submission raises HTTP 404."""
        # Arrange
        task_id = str(sample_task_queue_entry["_id"])
        mock_db.task_queue.find_one.return_value = sample_task_queue_entry
        mock_submissions_storage.get_by_id.return_value = None
        mock_submissions_storage._db = mock_db

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            repeat_task_queue_entry(
                task_id=task_id,
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 404
        assert "not found" in exc_info.value.detail.lower()

    def test_dependent_tasks_are_expanded_and_queued(
        self, mock_db, mock_submissions_storage, sample_task_queue_entry,
        sample_submission
    ):
        """Dependent tasks are expanded and queued."""
        # Arrange
        task_id = str(sample_task_queue_entry["_id"])
        sample_task_queue_entry["submission_id"] = sample_submission["submission_id"]
        sample_task_queue_entry["task_type"] = "split_topic_generation"
        mock_db.task_queue.find_one.return_value = sample_task_queue_entry
        mock_submissions_storage.get_by_id.return_value = sample_submission
        expanded_tasks = [
            "split_topic_generation",
            "subtopics_generation",
            "summarization"
        ]
        mock_submissions_storage.expand_recalculation_tasks.return_value = expanded_tasks
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        # Act
        result = repeat_task_queue_entry(
            task_id=task_id,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert result["tasks"] == expanded_tasks
        assert len(result["task_ids"]) == len(expanded_tasks)
        mock_submissions_storage.expand_recalculation_tasks.assert_called_once_with(
            ["split_topic_generation"]
        )

    def test_existing_pending_processing_tasks_are_deleted_first(
        self, mock_db, mock_submissions_storage, sample_task_queue_entry,
        sample_submission
    ):
        """Existing pending/processing tasks are deleted first."""
        # Arrange
        task_id = str(sample_task_queue_entry["_id"])
        sample_task_queue_entry["submission_id"] = sample_submission["submission_id"]
        sample_task_queue_entry["task_type"] = "split_topic_generation"
        mock_db.task_queue.find_one.return_value = sample_task_queue_entry
        mock_submissions_storage.get_by_id.return_value = sample_submission
        expanded_tasks = ["split_topic_generation", "subtopics_generation"]
        mock_submissions_storage.expand_recalculation_tasks.return_value = expanded_tasks
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        # Act
        repeat_task_queue_entry(
            task_id=task_id,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        mock_db.task_queue.delete_many.assert_called_once_with({
            "submission_id": sample_submission["submission_id"],
            "task_type": {"$in": expanded_tasks},
            "status": {"$in": ["pending", "processing"]}
        })

    def test_results_are_cleared_for_expanded_tasks(
        self, mock_db, mock_submissions_storage, sample_task_queue_entry,
        sample_submission
    ):
        """Results are cleared for expanded tasks."""
        # Arrange
        task_id = str(sample_task_queue_entry["_id"])
        sample_task_queue_entry["submission_id"] = sample_submission["submission_id"]
        sample_task_queue_entry["task_type"] = "summarization"
        mock_db.task_queue.find_one.return_value = sample_task_queue_entry
        mock_submissions_storage.get_by_id.return_value = sample_submission
        expanded_tasks = ["summarization"]
        mock_submissions_storage.expand_recalculation_tasks.return_value = expanded_tasks
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        # Act
        repeat_task_queue_entry(
            task_id=task_id,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        mock_submissions_storage.clear_results.assert_called_once_with(
            sample_submission["submission_id"],
            expanded_tasks
        )

    def test_response_includes_requeued_true_tasks_and_task_ids(
        self, mock_db, mock_submissions_storage, sample_task_queue_entry,
        sample_submission
    ):
        """Response includes requeued=true, tasks list, and new task_ids."""
        # Arrange
        task_id = str(sample_task_queue_entry["_id"])
        sample_task_queue_entry["submission_id"] = sample_submission["submission_id"]
        mock_db.task_queue.find_one.return_value = sample_task_queue_entry
        mock_submissions_storage.get_by_id.return_value = sample_submission
        expanded_tasks = ["split_topic_generation"]
        mock_submissions_storage.expand_recalculation_tasks.return_value = expanded_tasks
        mock_submissions_storage._db = mock_db
        new_task_id = ObjectId()
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=new_task_id
        )

        # Act
        result = repeat_task_queue_entry(
            task_id=task_id,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert result["requeued"] is True
        assert result["tasks"] == expanded_tasks
        assert result["task_ids"] == [str(new_task_id)]

    def test_new_task_entries_have_correct_structure(
        self, mock_db, mock_submissions_storage, sample_task_queue_entry,
        sample_submission
    ):
        """New task entries have correct structure."""
        # Arrange
        task_id = str(sample_task_queue_entry["_id"])
        sample_task_queue_entry["submission_id"] = sample_submission["submission_id"]
        sample_task_queue_entry["task_type"] = "split_topic_generation"
        mock_db.task_queue.find_one.return_value = sample_task_queue_entry
        mock_submissions_storage.get_by_id.return_value = sample_submission
        expanded_tasks = ["split_topic_generation"]
        mock_submissions_storage.expand_recalculation_tasks.return_value = expanded_tasks
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        # Act
        repeat_task_queue_entry(
            task_id=task_id,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        call_args = mock_db.task_queue.insert_one.call_args[0][0]
        assert call_args["submission_id"] == sample_submission["submission_id"]
        assert call_args["task_type"] in expanded_tasks
        assert call_args["status"] == "pending"
        assert call_args["priority"] == TASK_PRIORITIES["split_topic_generation"]
        assert call_args["retry_count"] == 0
        assert call_args["error"] is None
        assert call_args["worker_id"] is None
        assert call_args["started_at"] is None
        assert call_args["completed_at"] is None
        assert "created_at" in call_args

    def test_repeat_with_subtopics_generation_task(
        self, mock_db, mock_submissions_storage, sample_task_queue_entry,
        sample_submission
    ):
        """Repeat with subtopics_generation task type."""
        # Arrange
        task_id = str(sample_task_queue_entry["_id"])
        sample_task_queue_entry["submission_id"] = sample_submission["submission_id"]
        sample_task_queue_entry["task_type"] = "subtopics_generation"
        mock_db.task_queue.find_one.return_value = sample_task_queue_entry
        mock_submissions_storage.get_by_id.return_value = sample_submission
        expanded_tasks = ["subtopics_generation"]
        mock_submissions_storage.expand_recalculation_tasks.return_value = expanded_tasks
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        # Act
        result = repeat_task_queue_entry(
            task_id=task_id,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert result["requeued"] is True
        assert "subtopics_generation" in result["tasks"]


# =============================================================================
# Test: add_task_queue_entry
# =============================================================================

class TestAddTaskQueueEntry:
    """Tests for the add_task_queue_entry endpoint."""

    def test_valid_task_type_queues_task_successfully(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """Valid task_type queues task successfully."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage.expand_recalculation_tasks.return_value = [
            "split_topic_generation"
        ]
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        payload = AddTaskRequest(
            submission_id=sample_submission["submission_id"],
            task_type="split_topic_generation"
        )

        # Act
        result = add_task_queue_entry(
            payload=payload,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert result["queued"] is True
        assert "tasks" in result
        assert "task_ids" in result
        assert len(result["task_ids"]) == 1

    def test_invalid_task_type_raises_http_400(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """Invalid task_type raises HTTP 400."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage._db = mock_db

        payload = AddTaskRequest(
            submission_id=sample_submission["submission_id"],
            task_type="invalid_task_type"
        )

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            add_task_queue_entry(
                payload=payload,
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 400
        assert "unsupported" in exc_info.value.detail.lower()

    def test_non_existent_submission_raises_http_404(
        self, mock_db, mock_submissions_storage
    ):
        """Non-existent submission raises HTTP 404."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = None
        mock_submissions_storage._db = mock_db

        payload = AddTaskRequest(
            submission_id=str(uuid.uuid4()),
            task_type="split_topic_generation"
        )

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            add_task_queue_entry(
                payload=payload,
                submissions_storage=mock_submissions_storage
            )
        assert exc_info.value.status_code == 404
        assert "not found" in exc_info.value.detail.lower()

    def test_custom_priority_1_to_10_is_respected(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """Custom priority (1-10) is respected."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage.expand_recalculation_tasks.return_value = [
            "summarization"
        ]
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        payload = AddTaskRequest(
            submission_id=sample_submission["submission_id"],
            task_type="summarization",
            priority=7
        )

        # Act
        add_task_queue_entry(
            payload=payload,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        call_args = mock_db.task_queue.insert_one.call_args[0][0]
        assert call_args["priority"] == 7

    def test_default_priority_used_when_not_specified(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """Default priority used when not specified."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage.expand_recalculation_tasks.return_value = [
            "mindmap"
        ]
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        payload = AddTaskRequest(
            submission_id=sample_submission["submission_id"],
            task_type="mindmap",
            priority=None
        )

        # Act
        add_task_queue_entry(
            payload=payload,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        call_args = mock_db.task_queue.insert_one.call_args[0][0]
        assert call_args["priority"] == TASK_PRIORITIES["mindmap"]

    def test_dependent_tasks_are_expanded_automatically(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """Dependent tasks are expanded automatically."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        expanded_tasks = [
            "split_topic_generation",
            "subtopics_generation",
            "summarization"
        ]
        mock_submissions_storage.expand_recalculation_tasks.return_value = expanded_tasks
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        payload = AddTaskRequest(
            submission_id=sample_submission["submission_id"],
            task_type="split_topic_generation"
        )

        # Act
        result = add_task_queue_entry(
            payload=payload,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert result["tasks"] == expanded_tasks
        mock_submissions_storage.expand_recalculation_tasks.assert_called_once_with(
            ["split_topic_generation"]
        )

    def test_results_cleared_for_expanded_tasks(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """Results cleared for expanded tasks."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        expanded_tasks = ["summarization"]
        mock_submissions_storage.expand_recalculation_tasks.return_value = expanded_tasks
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        payload = AddTaskRequest(
            submission_id=sample_submission["submission_id"],
            task_type="summarization"
        )

        # Act
        add_task_queue_entry(
            payload=payload,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        mock_submissions_storage.clear_results.assert_called_once_with(
            sample_submission["submission_id"],
            expanded_tasks
        )

    def test_response_includes_queued_true_tasks_and_task_ids(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """Response includes queued=true, tasks list, and task_ids."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        expanded_tasks = ["split_topic_generation"]
        mock_submissions_storage.expand_recalculation_tasks.return_value = expanded_tasks
        mock_submissions_storage._db = mock_db
        new_task_id = ObjectId()
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=new_task_id
        )

        payload = AddTaskRequest(
            submission_id=sample_submission["submission_id"],
            task_type="split_topic_generation"
        )

        # Act
        result = add_task_queue_entry(
            payload=payload,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert result["queued"] is True
        assert result["tasks"] == expanded_tasks
        assert result["task_ids"] == [str(new_task_id)]

    def test_multiple_expanded_tasks_create_multiple_queue_entries(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """Multiple expanded tasks create multiple queue entries."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        expanded_tasks = [
            "split_topic_generation",
            "subtopics_generation",
            "summarization",
            "mindmap",
            "prefix_tree"
        ]
        mock_submissions_storage.expand_recalculation_tasks.return_value = expanded_tasks
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        payload = AddTaskRequest(
            submission_id=sample_submission["submission_id"],
            task_type="split_topic_generation"
        )

        # Act
        result = add_task_queue_entry(
            payload=payload,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        assert mock_db.task_queue.insert_one.call_count == len(expanded_tasks)
        assert len(result["task_ids"]) == len(expanded_tasks)

    def test_new_task_entries_have_correct_structure_for_add(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """New task entries have correct structure for add operation."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        expanded_tasks = ["prefix_tree"]
        mock_submissions_storage.expand_recalculation_tasks.return_value = expanded_tasks
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        payload = AddTaskRequest(
            submission_id=sample_submission["submission_id"],
            task_type="prefix_tree",
            priority=5
        )

        # Act
        add_task_queue_entry(
            payload=payload,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        call_args = mock_db.task_queue.insert_one.call_args[0][0]
        assert call_args["submission_id"] == sample_submission["submission_id"]
        assert call_args["task_type"] == "prefix_tree"
        assert call_args["priority"] == 5
        assert call_args["status"] == "pending"
        assert call_args["retry_count"] == 0
        assert call_args["error"] is None
        assert call_args["worker_id"] is None
        assert call_args["started_at"] is None
        assert call_args["completed_at"] is None
        assert "created_at" in call_args

    def test_add_with_all_allowed_task_types(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """Add works with all ALLOWED_TASKS types."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage.expand_recalculation_tasks.return_value = ["test_task"]
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        # Act & Assert for each allowed task type
        for task_type in ALLOWED_TASKS:
            mock_submissions_storage.expand_recalculation_tasks.return_value = [task_type]
            payload = AddTaskRequest(
                submission_id=sample_submission["submission_id"],
                task_type=task_type
            )

            result = add_task_queue_entry(
                payload=payload,
                submissions_storage=mock_submissions_storage
            )

            assert result["queued"] is True
            assert task_type in result["tasks"]

    def test_priority_boundary_value_1(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """Priority boundary value 1 works correctly."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage.expand_recalculation_tasks.return_value = ["mindmap"]
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        payload = AddTaskRequest(
            submission_id=sample_submission["submission_id"],
            task_type="mindmap",
            priority=1
        )

        # Act
        add_task_queue_entry(
            payload=payload,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        call_args = mock_db.task_queue.insert_one.call_args[0][0]
        assert call_args["priority"] == 1

    def test_priority_boundary_value_10(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """Priority boundary value 10 works correctly."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage.expand_recalculation_tasks.return_value = ["mindmap"]
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        payload = AddTaskRequest(
            submission_id=sample_submission["submission_id"],
            task_type="mindmap",
            priority=10
        )

        # Act
        add_task_queue_entry(
            payload=payload,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        call_args = mock_db.task_queue.insert_one.call_args[0][0]
        assert call_args["priority"] == 10


# =============================================================================
# Integration Tests
# =============================================================================

class TestTaskQueueHandlerIntegration:
    """Integration tests for task queue handler."""

    def test_full_workflow_add_list_delete(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """Full workflow: add task, list tasks, delete task."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        expanded_tasks = ["split_topic_generation"]
        mock_submissions_storage.expand_recalculation_tasks.return_value = expanded_tasks
        mock_submissions_storage._db = mock_db
        new_task_id = ObjectId()
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=new_task_id
        )

        # Step 1: Add task
        payload = AddTaskRequest(
            submission_id=sample_submission["submission_id"],
            task_type="split_topic_generation"
        )
        add_result = add_task_queue_entry(
            payload=payload,
            submissions_storage=mock_submissions_storage
        )
        assert add_result["queued"] is True

        # Step 2: List tasks - setup mock cursor
        mock_task_entry = {
            "_id": new_task_id,
            "submission_id": sample_submission["submission_id"],
            "task_type": "split_topic_generation",
            "priority": 1,
            "status": "pending",
            "created_at": datetime.now(UTC),
            "started_at": None,
            "completed_at": None,
            "worker_id": None,
            "retry_count": 0,
            "error": None,
        }
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = mock_cursor
        mock_cursor.limit.return_value = [mock_task_entry]
        mock_db.task_queue.find.return_value = mock_cursor
        
        list_result = list_task_queue(
            submission_id=sample_submission["submission_id"],
            submissions_storage=mock_submissions_storage
        )
        assert len(list_result["tasks"]) == 1

        # Step 3: Delete task
        mock_db.task_queue.delete_one.return_value = MagicMock(deleted_count=1)
        delete_result = delete_task_queue_entry(
            task_id=str(new_task_id),
            submissions_storage=mock_submissions_storage
        )
        assert delete_result["deleted"] is True

    def test_repeat_after_add_creates_new_entries(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """Repeat after add creates new entries."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage._db = mock_db

        # Step 1: Add initial task
        expanded_tasks = ["split_topic_generation", "subtopics_generation"]
        mock_submissions_storage.expand_recalculation_tasks.return_value = expanded_tasks
        initial_task_id = ObjectId()
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=initial_task_id
        )

        payload = AddTaskRequest(
            submission_id=sample_submission["submission_id"],
            task_type="split_topic_generation"
        )
        add_result = add_task_queue_entry(
            payload=payload,
            submissions_storage=mock_submissions_storage
        )
        assert add_result["queued"] is True

        # Step 2: Repeat the task
        task_entry = {
            "_id": initial_task_id,
            "submission_id": sample_submission["submission_id"],
            "task_type": "split_topic_generation",
            "priority": 1,
            "status": "pending",
            "created_at": datetime.now(UTC),
            "started_at": None,
            "completed_at": None,
            "worker_id": None,
            "retry_count": 0,
            "error": None,
        }
        mock_db.task_queue.find_one.return_value = task_entry
        new_task_id = ObjectId()
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=new_task_id
        )

        repeat_result = repeat_task_queue_entry(
            task_id=str(initial_task_id),
            submissions_storage=mock_submissions_storage
        )
        assert repeat_result["requeued"] is True

    def test_list_with_multiple_filters_combined(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """List with multiple filters combined."""
        # Arrange
        task_entry = {
            "_id": ObjectId(),
            "submission_id": sample_submission["submission_id"],
            "task_type": "summarization",
            "priority": 3,
            "status": "completed",
            "created_at": datetime.now(UTC),
            "started_at": datetime.now(UTC),
            "completed_at": datetime.now(UTC),
            "worker_id": "worker-001",
            "retry_count": 0,
            "error": None,
        }
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = mock_cursor
        mock_cursor.limit.return_value = [task_entry]
        mock_db.task_queue.find.return_value = mock_cursor
        mock_submissions_storage._db = mock_db

        # Act
        result = list_task_queue(
            submission_id=sample_submission["submission_id"],
            status="completed",
            limit=10,
            submissions_storage=mock_submissions_storage
        )

        # Assert
        mock_db.task_queue.find.assert_called_once_with({
            "submission_id": sample_submission["submission_id"],
            "status": "completed"
        })

    def test_task_priority_ordering_preserved_in_queue(
        self, mock_db, mock_submissions_storage, sample_submission
    ):
        """Task priority ordering is preserved in queue entries."""
        # Arrange
        mock_submissions_storage.get_by_id.return_value = sample_submission
        mock_submissions_storage._db = mock_db
        mock_db.task_queue.insert_one.return_value = MagicMock(
            inserted_id=ObjectId()
        )

        # Add tasks with different priorities
        for task_type in ALLOWED_TASKS:
            mock_submissions_storage.expand_recalculation_tasks.return_value = [task_type]
            payload = AddTaskRequest(
                submission_id=sample_submission["submission_id"],
                task_type=task_type,
                priority=None  # Use default priority
            )
            add_task_queue_entry(
                payload=payload,
                submissions_storage=mock_submissions_storage
            )

        # Assert priorities are correct
        calls = mock_db.task_queue.insert_one.call_args_list
        priorities = {}
        for call_arg in calls:
            task = call_arg[0][0]
            priorities[task["task_type"]] = task["priority"]

        for task_type, expected_priority in TASK_PRIORITIES.items():
            if task_type in priorities:
                assert priorities[task_type] == expected_priority
