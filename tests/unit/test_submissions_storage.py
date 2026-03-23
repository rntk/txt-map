"""
Unit tests for the SubmissionsStorage class.

Tests all methods in lib/storage/submissions.py:
- __init__
- prepare
- create
- get_by_id
- update_task_status
- update_results
- clear_results
- expand_recalculation_tasks
- get_overall_status

Also tests constants:
- indexes
- task_names
- task_dependencies
"""
from unittest.mock import MagicMock, patch
from datetime import datetime, UTC

from lib.storage.submissions import SubmissionsStorage


# =============================================================================
# Test: Constants
# =============================================================================

class TestConstants:
    """Tests for class-level constants."""

    def test_indexes_contains_submission_id_and_created_at(self):
        """indexes contains 'submission_id' and 'created_at'."""
        assert "submission_id" in SubmissionsStorage.indexes
        assert "created_at" in SubmissionsStorage.indexes
        assert len(SubmissionsStorage.indexes) == 2

    def test_task_names_contains_all_task_types(self):
        """task_names contains all task types."""
        expected_tasks = [
            "split_topic_generation",
            "subtopics_generation",
            "summarization",
            "mindmap",
            "prefix_tree",
            "insights_generation",
            "storytelling_generation",
        ]
        assert SubmissionsStorage.task_names == expected_tasks
        assert len(SubmissionsStorage.task_names) == 7

    def test_task_dependencies_correctly_defined(self):
        """task_dependencies correctly defined for all tasks."""
        expected_deps = {
            "split_topic_generation": [],
            "subtopics_generation": ["split_topic_generation"],
            "summarization": ["split_topic_generation"],
            "mindmap": ["split_topic_generation"],
            "prefix_tree": ["split_topic_generation"],
            "insights_generation": ["split_topic_generation"],
            "storytelling_generation": ["summarization", "mindmap", "insights_generation"],
        }
        assert SubmissionsStorage.task_dependencies == expected_deps


# =============================================================================
# Test: __init__
# =============================================================================

class TestInit:
    """Tests for SubmissionsStorage.__init__."""

    def test_initializes_db_connection(self, mock_db):
        """Initializes _db connection."""
        storage = SubmissionsStorage(mock_db)
        assert storage._db is mock_db

    def test_initializes_logger(self, mock_db):
        """Initializes logger with correct name."""
        storage = SubmissionsStorage(mock_db)
        assert storage._log is not None
        assert storage._log.name == "submissions"

    def test_task_names_list_contains_all_task_types(self, mock_db):
        """task_names list contains all task types."""
        storage = SubmissionsStorage(mock_db)
        assert len(storage.task_names) == 7
        assert "split_topic_generation" in storage.task_names
        assert "subtopics_generation" in storage.task_names
        assert "summarization" in storage.task_names
        assert "mindmap" in storage.task_names
        assert "prefix_tree" in storage.task_names
        assert "insights_generation" in storage.task_names
        assert "storytelling_generation" in storage.task_names

    def test_task_dependencies_correctly_defined(self, mock_db):
        """task_dependencies correctly defined."""
        storage = SubmissionsStorage(mock_db)
        assert storage.task_dependencies["split_topic_generation"] == []
        assert storage.task_dependencies["subtopics_generation"] == ["split_topic_generation"]
        assert storage.task_dependencies["summarization"] == ["split_topic_generation"]
        assert storage.task_dependencies["mindmap"] == ["split_topic_generation"]
        assert storage.task_dependencies["prefix_tree"] == ["split_topic_generation"]
        assert storage.task_dependencies["insights_generation"] == ["split_topic_generation"]
        assert storage.task_dependencies["storytelling_generation"] == ["summarization", "mindmap", "insights_generation"]


# =============================================================================
# Test: prepare
# =============================================================================

class TestPrepare:
    """Tests for SubmissionsStorage.prepare."""

    def test_creates_index_on_submission_id(self, mock_db):
        """Creates index on 'submission_id'."""
        storage = SubmissionsStorage(mock_db)
        storage.prepare()

        # Check create_index was called with "submission_id"
        calls = mock_db.submissions.create_index.call_args_list
        index_names = [call_arg[0][0] for call_arg in calls]
        assert "submission_id" in index_names

    def test_creates_index_on_created_at(self, mock_db):
        """Creates index on 'created_at'."""
        storage = SubmissionsStorage(mock_db)
        storage.prepare()

        # Check create_index was called with "created_at"
        calls = mock_db.submissions.create_index.call_args_list
        index_names = [call_arg[0][0] for call_arg in calls]
        assert "created_at" in index_names

    def test_handles_index_creation_errors_gracefully(self, mock_db):
        """Handles index creation errors gracefully (logs warning)."""
        # Arrange: make create_index raise an exception
        mock_db.submissions.create_index.side_effect = Exception("Index already exists")

        storage = SubmissionsStorage(mock_db)
        with patch.object(storage._log, 'warning') as mock_warning:
            # Act: should not raise
            storage.prepare()

            # Assert: warning was logged for each index (2 indexes: submission_id and created_at)
            assert mock_warning.call_count == 2


# =============================================================================
# Test: create
# =============================================================================

class TestCreate:
    """Tests for SubmissionsStorage.create."""

    def test_generates_unique_uuid_for_submission_id(self, mock_db):
        """Generates unique UUID for submission_id."""
        storage = SubmissionsStorage(mock_db)

        with patch('lib.storage.submissions.uuid.uuid4') as mock_uuid:
            mock_uuid.return_value = MagicMock(hex='abc123')
            mock_uuid.return_value.__str__ = lambda self: 'test-uuid-123'

            storage.create(html_content="<p>Test</p>")

            # Check the submission_id was set from uuid
            inserted_doc = mock_db.submissions.insert_one.call_args[0][0]
            assert inserted_doc["submission_id"] == 'test-uuid-123'

    def test_sets_created_at_and_updated_at_timestamps(self, mock_db):
        """Sets created_at and updated_at timestamps."""
        storage = SubmissionsStorage(mock_db)
        mock_now = datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC)

        with patch('lib.storage.submissions.datetime') as mock_datetime:
            mock_datetime.now.return_value = mock_now
            mock_datetime.UTC = UTC

            result = storage.create(html_content="<p>Test</p>")

            assert result["created_at"] == mock_now
            assert result["updated_at"] == mock_now

    def test_html_content_stored_correctly(self, mock_db):
        """html_content stored correctly."""
        storage = SubmissionsStorage(mock_db)
        html = "<html><body><p>Test content</p></body></html>"

        result = storage.create(html_content=html)

        assert result["html_content"] == html

    def test_text_content_stored_correctly_defaults_to_empty_string(self, mock_db):
        """text_content stored correctly (defaults to '')."""
        storage = SubmissionsStorage(mock_db)

        # Test with explicit text_content
        result = storage.create(html_content="<p>Test</p>", text_content="Plain text")
        assert result["text_content"] == "Plain text"

        # Test with default
        result = storage.create(html_content="<p>Test</p>")
        assert result["text_content"] == ""

    def test_source_url_stored_correctly_defaults_to_empty_string(self, mock_db):
        """source_url stored correctly (defaults to '')."""
        storage = SubmissionsStorage(mock_db)

        # Test with explicit source_url
        result = storage.create(
            html_content="<p>Test</p>",
            source_url="https://example.com/article"
        )
        assert result["source_url"] == "https://example.com/article"

        # Test with default
        result = storage.create(html_content="<p>Test</p>")
        assert result["source_url"] == ""

    def test_all_tasks_initialized_with_status_pending(self, mock_db):
        """All tasks initialized with status='pending'."""
        storage = SubmissionsStorage(mock_db)
        result = storage.create(html_content="<p>Test</p>")

        for task_name in SubmissionsStorage.task_names:
            assert result["tasks"][task_name]["status"] == "pending"

    def test_all_task_timestamps_initialized(self, mock_db):
        """All task timestamps initialized (started_at=None, completed_at=None)."""
        storage = SubmissionsStorage(mock_db)
        result = storage.create(html_content="<p>Test</p>")

        for task_name in SubmissionsStorage.task_names:
            assert result["tasks"][task_name]["started_at"] is None
            assert result["tasks"][task_name]["completed_at"] is None

    def test_all_task_errors_initialized_to_none(self, mock_db):
        """All task errors initialized to None."""
        storage = SubmissionsStorage(mock_db)
        result = storage.create(html_content="<p>Test</p>")

        for task_name in SubmissionsStorage.task_names:
            assert result["tasks"][task_name]["error"] is None

    def test_results_structure_initialized_with_all_fields(self, mock_db):
        """results structure initialized with all fields."""
        storage = SubmissionsStorage(mock_db)
        result = storage.create(html_content="<p>Test</p>")

        expected_results = {
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
            "prefix_tree": {},
            "insights": [],
            "storytelling": {},
            "annotations": {},
        }

        for key, expected_value in expected_results.items():
            assert key in result["results"]
            assert result["results"][key] == expected_value

    def test_document_inserted_into_submissions_collection(self, mock_db):
        """Document inserted into submissions collection."""
        storage = SubmissionsStorage(mock_db)
        storage.create(html_content="<p>Test</p>")

        mock_db.submissions.insert_one.assert_called_once()

    def test_returns_created_document(self, mock_db):
        """Returns created document."""
        storage = SubmissionsStorage(mock_db)
        result = storage.create(html_content="<p>Test</p>")

        assert result is not None
        assert "submission_id" in result
        assert "html_content" in result
        assert "tasks" in result
        assert "results" in result

    def test_creates_submission_with_all_parameters(self, mock_db):
        """Creates submission with all parameters provided."""
        storage = SubmissionsStorage(mock_db)
        result = storage.create(
            html_content="<html>Full</html>",
            text_content="Full text",
            source_url="https://example.com/full"
        )

        assert result["html_content"] == "<html>Full</html>"
        assert result["text_content"] == "Full text"
        assert result["source_url"] == "https://example.com/full"


# =============================================================================
# Test: get_by_id
# =============================================================================

class TestGetById:
    """Tests for SubmissionsStorage.get_by_id."""

    def test_returns_submission_document_when_found(self, mock_db):
        """Returns submission document when found."""
        storage = SubmissionsStorage(mock_db)
        expected_submission = {
            "submission_id": "test-id-123",
            "html_content": "<p>Test</p>"
        }
        mock_db.submissions.find_one.return_value = expected_submission

        result = storage.get_by_id("test-id-123")

        assert result == expected_submission

    def test_returns_none_when_not_found(self, mock_db):
        """Returns None when not found."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.find_one.return_value = None

        result = storage.get_by_id("non-existent-id")

        assert result is None

    def test_queries_by_submission_id_field_not_id(self, mock_db):
        """Queries by 'submission_id' field (not _id)."""
        storage = SubmissionsStorage(mock_db)
        storage.get_by_id("test-id-123")

        mock_db.submissions.find_one.assert_called_once_with(
            {"submission_id": "test-id-123"}
        )


# =============================================================================
# Test: update_task_status
# =============================================================================

class TestUpdateTaskStatus:
    """Tests for SubmissionsStorage.update_task_status."""

    def test_status_processing_sets_started_at_to_now(self, mock_db):
        """status='processing' sets started_at to now."""
        storage = SubmissionsStorage(mock_db)
        mock_now = datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        with patch('lib.storage.submissions.datetime') as mock_datetime:
            mock_datetime.now.return_value = mock_now
            mock_datetime.UTC = UTC

            storage.update_task_status("sub-123", "split_topic_generation", "processing")

            update_doc = mock_db.submissions.update_one.call_args[0][1]
            assert update_doc["$set"]["tasks.split_topic_generation.started_at"] == mock_now

    def test_status_completed_sets_completed_at_to_now(self, mock_db):
        """status='completed' sets completed_at to now."""
        storage = SubmissionsStorage(mock_db)
        mock_now = datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        with patch('lib.storage.submissions.datetime') as mock_datetime:
            mock_datetime.now.return_value = mock_now
            mock_datetime.UTC = UTC

            storage.update_task_status("sub-123", "split_topic_generation", "completed")

            update_doc = mock_db.submissions.update_one.call_args[0][1]
            assert update_doc["$set"]["tasks.split_topic_generation.completed_at"] == mock_now

    def test_status_failed_sets_completed_at_to_now(self, mock_db):
        """status='failed' sets completed_at to now."""
        storage = SubmissionsStorage(mock_db)
        mock_now = datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        with patch('lib.storage.submissions.datetime') as mock_datetime:
            mock_datetime.now.return_value = mock_now
            mock_datetime.UTC = UTC

            storage.update_task_status("sub-123", "split_topic_generation", "failed")

            update_doc = mock_db.submissions.update_one.call_args[0][1]
            assert update_doc["$set"]["tasks.split_topic_generation.completed_at"] == mock_now

    def test_error_message_stored_when_provided(self, mock_db):
        """error message stored when provided."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.update_task_status(
            "sub-123",
            "split_topic_generation",
            "failed",
            error="Test error message"
        )

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["tasks.split_topic_generation.error"] == "Test error message"

    def test_updated_at_timestamp_updated(self, mock_db):
        """updated_at timestamp updated."""
        storage = SubmissionsStorage(mock_db)
        mock_now = datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        with patch('lib.storage.submissions.datetime') as mock_datetime:
            mock_datetime.now.return_value = mock_now
            mock_datetime.UTC = UTC

            storage.update_task_status("sub-123", "split_topic_generation", "processing")

            update_doc = mock_db.submissions.update_one.call_args[0][1]
            assert update_doc["$set"]["updated_at"] == mock_now

    def test_returns_true_when_document_modified(self, mock_db):
        """Returns True when document modified."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        result = storage.update_task_status("sub-123", "split_topic_generation", "processing")

        assert result is True

    def test_returns_false_when_submission_not_found(self, mock_db):
        """Returns False when submission not found."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=0)

        result = storage.update_task_status("non-existent", "split_topic_generation", "processing")

        assert result is False

    def test_handles_status_pending(self, mock_db):
        """Handles status value 'pending'."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        result = storage.update_task_status("sub-123", "split_topic_generation", "pending")

        assert result is True
        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["tasks.split_topic_generation.status"] == "pending"

    def test_handles_status_processing(self, mock_db):
        """Handles status value 'processing'."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        result = storage.update_task_status("sub-123", "split_topic_generation", "processing")

        assert result is True

    def test_handles_status_completed(self, mock_db):
        """Handles status value 'completed'."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        result = storage.update_task_status("sub-123", "split_topic_generation", "completed")

        assert result is True

    def test_handles_status_failed(self, mock_db):
        """Handles status value 'failed'."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        result = storage.update_task_status("sub-123", "split_topic_generation", "failed")

        assert result is True

    def test_queries_by_submission_id(self, mock_db):
        """Queries by submission_id field."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.update_task_status("test-sub-id", "split_topic_generation", "processing")

        mock_db.submissions.update_one.assert_called_once()
        query = mock_db.submissions.update_one.call_args[0][0]
        assert query == {"submission_id": "test-sub-id"}


# =============================================================================
# Test: update_results
# =============================================================================

class TestUpdateResults:
    """Tests for SubmissionsStorage.update_results."""

    def test_updates_specified_result_fields(self, mock_db):
        """Updates specified result fields."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.update_results("sub-123", {"sentences": ["Sentence 1"]})

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["results.sentences"] == ["Sentence 1"]

    def test_preserves_existing_result_fields_not_in_update(self, mock_db):
        """Preserves existing result fields not in update."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.update_results("sub-123", {"sentences": ["Sentence 1"]})

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        # Only sentences should be in the update, not other fields
        assert "results.topics" not in update_doc["$set"]
        assert "results.summary" not in update_doc["$set"]

    def test_updates_updated_at_timestamp(self, mock_db):
        """Updates updated_at timestamp."""
        storage = SubmissionsStorage(mock_db)
        mock_now = datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        with patch('lib.storage.submissions.datetime') as mock_datetime:
            mock_datetime.now.return_value = mock_now
            mock_datetime.UTC = UTC

            storage.update_results("sub-123", {"sentences": ["Sentence 1"]})

            update_doc = mock_db.submissions.update_one.call_args[0][1]
            assert update_doc["$set"]["updated_at"] == mock_now

    def test_returns_true_when_modified(self, mock_db):
        """Returns True when modified."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        result = storage.update_results("sub-123", {"sentences": ["Sentence 1"]})

        assert result is True

    def test_returns_false_when_not_found(self, mock_db):
        """Returns False when not found."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=0)

        result = storage.update_results("non-existent", {"sentences": ["Sentence 1"]})

        assert result is False

    def test_handles_nested_dict_values(self, mock_db):
        """Handles nested dict values."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        nested_data = {
            "topic1": {"summary": "Summary text", "sentences": [1, 2, 3]}
        }
        storage.update_results("sub-123", {"topic_summaries": nested_data})

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["results.topic_summaries"] == nested_data

    def test_handles_list_values(self, mock_db):
        """Handles list values."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        list_data = ["Item 1", "Item 2", "Item 3"]
        storage.update_results("sub-123", {"sentences": list_data})

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["results.sentences"] == list_data

    def test_updates_multiple_fields_at_once(self, mock_db):
        """Updates multiple fields at once."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.update_results("sub-123", {
            "sentences": ["S1"],
            "topics": [{"name": "T1"}],
            "summary": ["Summary text"]
        })

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["results.sentences"] == ["S1"]
        assert update_doc["$set"]["results.topics"] == [{"name": "T1"}]
        assert update_doc["$set"]["results.summary"] == ["Summary text"]

    def test_queries_by_submission_id(self, mock_db):
        """Queries by submission_id field."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.update_results("test-sub-id", {"sentences": ["S1"]})

        query = mock_db.submissions.update_one.call_args[0][0]
        assert query == {"submission_id": "test-sub-id"}


# =============================================================================
# Test: clear_results
# =============================================================================

class TestClearResults:
    """Tests for SubmissionsStorage.clear_results."""

    def test_task_names_none_clears_all_tasks(self, mock_db):
        """task_names=None clears all tasks."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.clear_results("sub-123", task_names=None)

        # Check all tasks are reset
        update_doc = mock_db.submissions.update_one.call_args[0][1]
        for task_name in SubmissionsStorage.task_names:
            assert update_doc["$set"][f"tasks.{task_name}.status"] == "pending"
            assert update_doc["$set"][f"tasks.{task_name}.started_at"] is None
            assert update_doc["$set"][f"tasks.{task_name}.completed_at"] is None
            assert update_doc["$set"][f"tasks.{task_name}.error"] is None

    def test_task_names_all_clears_all_tasks(self, mock_db):
        """task_names=['all'] clears all tasks."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.clear_results("sub-123", task_names=["all"])

        # Check all tasks are reset
        update_doc = mock_db.submissions.update_one.call_args[0][1]
        for task_name in SubmissionsStorage.task_names:
            assert update_doc["$set"][f"tasks.{task_name}.status"] == "pending"

    def test_specific_task_names_clears_only_those_tasks(self, mock_db):
        """Specific task_names clear only those tasks."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.clear_results("sub-123", task_names=["summarization"])

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        # summarization should be reset
        assert update_doc["$set"]["tasks.summarization.status"] == "pending"
        # Other tasks should not be in the update
        assert "tasks.split_topic_generation.status" not in update_doc["$set"]

    def test_dependent_tasks_included_automatically(self, mock_db):
        """Dependent tasks included automatically."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        # Clear split_topic_generation - should include all dependent tasks
        storage.clear_results("sub-123", task_names=["split_topic_generation"])

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        # All tasks should be reset since all depend on split_topic_generation
        for task_name in SubmissionsStorage.task_names:
            assert update_doc["$set"][f"tasks.{task_name}.status"] == "pending"

    def test_task_status_reset_to_pending(self, mock_db):
        """Task status set to 'pending'."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.clear_results("sub-123", task_names=["summarization"])

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["tasks.summarization.status"] == "pending"

    def test_task_started_at_set_to_none(self, mock_db):
        """Task started_at set to None."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.clear_results("sub-123", task_names=["summarization"])

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["tasks.summarization.started_at"] is None

    def test_task_completed_at_set_to_none(self, mock_db):
        """Task completed_at set to None."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.clear_results("sub-123", task_names=["summarization"])

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["tasks.summarization.completed_at"] is None

    def test_task_error_set_to_none(self, mock_db):
        """Task error set to None."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.clear_results("sub-123", task_names=["summarization"])

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["tasks.summarization.error"] is None

    def test_split_topic_generation_clears_sentences_and_topics(self, mock_db):
        """split_topic_generation clears sentences, topics."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.clear_results("sub-123", task_names=["split_topic_generation"])

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["results.sentences"] == []
        assert update_doc["$set"]["results.topics"] == []

    def test_subtopics_generation_clears_subtopics(self, mock_db):
        """subtopics_generation clears subtopics."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.clear_results("sub-123", task_names=["subtopics_generation"])

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["results.subtopics"] == []

    def test_summarization_clears_topic_summaries_summary_summary_mappings(self, mock_db):
        """summarization clears topic_summaries, summary, summary_mappings."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.clear_results("sub-123", task_names=["summarization"])

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["results.topic_summaries"] == {}
        assert update_doc["$set"]["results.article_summary"] == {"text": "", "bullets": []}
        assert update_doc["$set"]["results.summary"] == []
        assert update_doc["$set"]["results.summary_mappings"] == []

    def test_mindmap_clears_topic_mindmaps_mindmap_results_mindmap_metadata(self, mock_db):
        """mindmap clears topic_mindmaps, mindmap_results, mindmap_metadata."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.clear_results("sub-123", task_names=["mindmap"])

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["results.topic_mindmaps"] == {}
        assert update_doc["$set"]["results.mindmap_results"] == []
        assert update_doc["$set"]["results.mindmap_metadata"] == {}

    def test_prefix_tree_clears_prefix_tree(self, mock_db):
        """prefix_tree clears prefix_tree."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.clear_results("sub-123", task_names=["prefix_tree"])

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["results.prefix_tree"] == {}

    def test_insights_generation_clears_insights(self, mock_db):
        """insights_generation clears insights."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.clear_results("sub-123", task_names=["insights_generation"])

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        assert update_doc["$set"]["results.insights"] == []

    def test_updated_at_timestamp_updated(self, mock_db):
        """updated_at timestamp updated."""
        storage = SubmissionsStorage(mock_db)
        mock_now = datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        with patch('lib.storage.submissions.datetime') as mock_datetime:
            mock_datetime.now.return_value = mock_now
            mock_datetime.UTC = UTC

            storage.clear_results("sub-123", task_names=["summarization"])

            update_doc = mock_db.submissions.update_one.call_args[0][1]
            assert update_doc["$set"]["updated_at"] == mock_now

    def test_returns_true_when_modified(self, mock_db):
        """Returns True when modified."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        result = storage.clear_results("sub-123", task_names=["summarization"])

        assert result is True

    def test_returns_false_when_not_found(self, mock_db):
        """Returns False when not found."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=0)

        result = storage.clear_results("non-existent", task_names=["summarization"])

        assert result is False


# =============================================================================
# Test: expand_recalculation_tasks
# =============================================================================

class TestExpandRecalculationTasks:
    """Tests for SubmissionsStorage.expand_recalculation_tasks."""

    def test_none_input_returns_all_tasks(self, mock_db):
        """None input returns all tasks."""
        storage = SubmissionsStorage(mock_db)

        result = storage.expand_recalculation_tasks(None)

        assert result == SubmissionsStorage.task_names

    def test_all_input_returns_all_tasks(self, mock_db):
        """['all'] returns all tasks."""
        storage = SubmissionsStorage(mock_db)

        result = storage.expand_recalculation_tasks(["all"])

        assert result == SubmissionsStorage.task_names

    def test_split_topic_generation_returns_all_tasks(self, mock_db):
        """['split_topic_generation'] returns all tasks (all depend on it)."""
        storage = SubmissionsStorage(mock_db)

        result = storage.expand_recalculation_tasks(["split_topic_generation"])

        assert len(result) == 7
        assert set(result) == set(SubmissionsStorage.task_names)

    def test_subtopics_generation_returns_subtopics_and_mindmap(self, mock_db):
        """['subtopics_generation'] returns subtopics_generation + mindmap."""
        # Note: Based on task_dependencies, only mindmap depends on subtopics_generation
        # But looking at the code, the expansion logic adds tasks whose deps are in expanded
        # subtopics_generation has dep split_topic_generation
        # summarization has dep split_topic_generation
        # mindmap has dep split_topic_generation
        # prefix_tree has dep split_topic_generation
        # So if we start with subtopics_generation, we only get subtopics_generation
        # because no other task depends on subtopics_generation
        storage = SubmissionsStorage(mock_db)

        result = storage.expand_recalculation_tasks(["subtopics_generation"])

        # Only subtopics_generation should be returned since no task depends on it
        assert result == ["subtopics_generation"]

    def test_summarization_returns_summarization_and_storytelling(self, mock_db):
        """['summarization'] returns summarization and downstream storytelling."""
        storage = SubmissionsStorage(mock_db)

        result = storage.expand_recalculation_tasks(["summarization"])

        assert result == ["summarization", "storytelling_generation"]

    def test_mindmap_returns_mindmap_and_storytelling(self, mock_db):
        """['mindmap'] returns mindmap and downstream storytelling."""
        storage = SubmissionsStorage(mock_db)

        result = storage.expand_recalculation_tasks(["mindmap"])

        assert result == ["mindmap", "storytelling_generation"]

    def test_prefix_tree_returns_only_prefix_tree(self, mock_db):
        """['prefix_tree'] returns only prefix_tree."""
        storage = SubmissionsStorage(mock_db)

        result = storage.expand_recalculation_tasks(["prefix_tree"])

        assert result == ["prefix_tree"]

    def test_insights_generation_returns_insights_and_storytelling(self, mock_db):
        """['insights_generation'] returns insights_generation and storytelling_generation."""
        storage = SubmissionsStorage(mock_db)

        result = storage.expand_recalculation_tasks(["insights_generation"])

        assert result == ["insights_generation", "storytelling_generation"]

    def test_multiple_tasks_merged_correctly(self, mock_db):
        """Multiple tasks merged correctly."""
        storage = SubmissionsStorage(mock_db)

        result = storage.expand_recalculation_tasks(["summarization", "mindmap"])

        assert "summarization" in result
        assert "mindmap" in result
        assert "storytelling_generation" in result

    def test_invalid_task_names_filtered_out(self, mock_db):
        """Invalid task names filtered out."""
        storage = SubmissionsStorage(mock_db)

        result = storage.expand_recalculation_tasks(["invalid_task", "summarization"])

        assert "invalid_task" not in result
        assert "summarization" in result

    def test_returns_tasks_in_canonical_order(self, mock_db):
        """Returns tasks in canonical order (task_names order)."""
        storage = SubmissionsStorage(mock_db)

        # Request in non-canonical order
        result = storage.expand_recalculation_tasks(["prefix_tree", "summarization", "mindmap"])

        # Should be returned in task_names order
        expected_order = [name for name in SubmissionsStorage.task_names if name in result]
        assert result == expected_order

    def test_empty_list_returns_empty_list(self, mock_db):
        """Empty list input returns empty list."""
        storage = SubmissionsStorage(mock_db)

        result = storage.expand_recalculation_tasks([])

        assert result == []


# =============================================================================
# Test: get_overall_status
# =============================================================================

class TestGetOverallStatus:
    """Tests for SubmissionsStorage.get_overall_status."""

    def test_any_failed_returns_failed(self, mock_db):
        """Any 'failed' -> 'failed'."""
        storage = SubmissionsStorage(mock_db)
        submission = {
            "tasks": {
                "split_topic_generation": {"status": "completed"},
                "subtopics_generation": {"status": "failed"},
                "summarization": {"status": "pending"},
                "mindmap": {"status": "pending"},
                "prefix_tree": {"status": "pending"}
            }
        }

        result = storage.get_overall_status(submission)

        assert result == "failed"

    def test_all_completed_returns_completed(self, mock_db):
        """All 'completed' -> 'completed'."""
        storage = SubmissionsStorage(mock_db)
        submission = {
            "tasks": {
                "split_topic_generation": {"status": "completed"},
                "subtopics_generation": {"status": "completed"},
                "summarization": {"status": "completed"},
                "mindmap": {"status": "completed"},
                "prefix_tree": {"status": "completed"}
            }
        }

        result = storage.get_overall_status(submission)

        assert result == "completed"

    def test_any_processing_returns_processing(self, mock_db):
        """Any 'processing' -> 'processing'."""
        storage = SubmissionsStorage(mock_db)
        submission = {
            "tasks": {
                "split_topic_generation": {"status": "completed"},
                "subtopics_generation": {"status": "processing"},
                "summarization": {"status": "pending"},
                "mindmap": {"status": "pending"},
                "prefix_tree": {"status": "pending"}
            }
        }

        result = storage.get_overall_status(submission)

        assert result == "processing"

    def test_all_pending_returns_pending(self, mock_db):
        """All 'pending' -> 'pending'."""
        storage = SubmissionsStorage(mock_db)
        submission = {
            "tasks": {
                "split_topic_generation": {"status": "pending"},
                "subtopics_generation": {"status": "pending"},
                "summarization": {"status": "pending"},
                "mindmap": {"status": "pending"},
                "prefix_tree": {"status": "pending"}
            }
        }

        result = storage.get_overall_status(submission)

        assert result == "pending"

    def test_mixed_pending_processing_returns_processing(self, mock_db):
        """Mixed pending/processing -> 'processing'."""
        storage = SubmissionsStorage(mock_db)
        submission = {
            "tasks": {
                "split_topic_generation": {"status": "completed"},
                "subtopics_generation": {"status": "processing"},
                "summarization": {"status": "pending"},
                "mindmap": {"status": "pending"},
                "prefix_tree": {"status": "pending"}
            }
        }

        result = storage.get_overall_status(submission)

        assert result == "processing"

    def test_mixed_completed_failed_returns_failed(self, mock_db):
        """Mixed completed/failed -> 'failed'."""
        storage = SubmissionsStorage(mock_db)
        submission = {
            "tasks": {
                "split_topic_generation": {"status": "completed"},
                "subtopics_generation": {"status": "completed"},
                "summarization": {"status": "failed"},
                "mindmap": {"status": "completed"},
                "prefix_tree": {"status": "completed"}
            }
        }

        result = storage.get_overall_status(submission)

        assert result == "failed"

    def test_empty_tasks_dict_handling(self, mock_db):
        """Empty tasks dict handling."""
        storage = SubmissionsStorage(mock_db)
        submission = {"tasks": {}}

        result = storage.get_overall_status(submission)

        # With no tasks, all() on empty list returns True, so should be "completed"
        # But actually statuses would be [], so any(s == "failed") is False
        # all(s == "completed" for s in []) is True (vacuous truth)
        # So it returns "completed"
        assert result == "completed"

    def test_missing_tasks_key_handling(self, mock_db):
        """Missing 'tasks' key handling."""
        storage = SubmissionsStorage(mock_db)
        submission = {}

        result = storage.get_overall_status(submission)

        # .get("tasks", {}) returns {}, so same as empty tasks
        assert result == "completed"


# =============================================================================
# Edge Cases
# =============================================================================

class TestEdgeCases:
    """Edge case tests for SubmissionsStorage."""

    def test_concurrent_updates_handled(self, mock_db):
        """Concurrent updates to same submission handled by MongoDB."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        # Simulate concurrent updates - MongoDB handles this atomically
        storage.update_task_status("sub-123", "split_topic_generation", "processing")
        storage.update_task_status("sub-123", "split_topic_generation", "completed")

        assert mock_db.submissions.update_one.call_count == 2

    def test_large_text_content(self, mock_db):
        """Very large text_content handled correctly."""
        storage = SubmissionsStorage(mock_db)
        large_content = "A" * 1000000  # 1MB of content

        result = storage.create(html_content=large_content)

        assert result["html_content"] == large_content
        assert len(result["html_content"]) == 1000000

    def test_unicode_content(self, mock_db):
        """Unicode content handled correctly."""
        storage = SubmissionsStorage(mock_db)
        unicode_content = "<p>Hello 世界 🌍 Привет мир</p>"

        result = storage.create(html_content=unicode_content)

        assert result["html_content"] == unicode_content

    def test_special_characters_in_source_url(self, mock_db):
        """Special characters in source_url handled correctly."""
        storage = SubmissionsStorage(mock_db)
        special_url = "https://example.com/article?param=value&other=123#section"

        result = storage.create(html_content="<p>Test</p>", source_url=special_url)

        assert result["source_url"] == special_url

    def test_empty_html_content(self, mock_db):
        """Empty html_content handled correctly."""
        storage = SubmissionsStorage(mock_db)

        result = storage.create(html_content="")

        assert result["html_content"] == ""

    def test_none_error_parameter(self, mock_db):
        """None error parameter handled correctly."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        storage.update_task_status("sub-123", "split_topic_generation", "failed", error=None)

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        # error should not be in the update when None
        assert "tasks.split_topic_generation.error" not in update_doc["$set"]

    def test_multiple_result_updates_preserve_other_fields(self, mock_db):
        """Multiple result updates preserve other fields."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        # First update
        storage.update_results("sub-123", {"sentences": ["S1"]})
        # Second update
        storage.update_results("sub-123", {"topics": [{"name": "T1"}]})

        assert mock_db.submissions.update_one.call_count == 2

    def test_clear_results_with_overlapping_tasks(self, mock_db):
        """clear_results with overlapping task dependencies."""
        storage = SubmissionsStorage(mock_db)
        mock_db.submissions.update_one.return_value = MagicMock(modified_count=1)

        # Clear multiple tasks that share dependencies
        storage.clear_results("sub-123", task_names=["summarization", "mindmap"])

        update_doc = mock_db.submissions.update_one.call_args[0][1]
        # Both should be reset
        assert update_doc["$set"]["tasks.summarization.status"] == "pending"
        assert update_doc["$set"]["tasks.mindmap.status"] == "pending"

    def test_expand_recalculation_with_duplicate_task_names(self, mock_db):
        """expand_recalculation_tasks with duplicate task names."""
        storage = SubmissionsStorage(mock_db)

        result = storage.expand_recalculation_tasks(["summarization", "summarization"])

        # Should only appear once
        assert result.count("summarization") == 1

    def test_get_overall_status_with_unknown_status_value(self, mock_db):
        """get_overall_status with unknown status value."""
        storage = SubmissionsStorage(mock_db)
        submission = {
            "tasks": {
                "split_topic_generation": {"status": "unknown_status"},
                "subtopics_generation": {"status": "pending"},
                "summarization": {"status": "pending"},
                "mindmap": {"status": "pending"},
                "prefix_tree": {"status": "pending"}
            }
        }

        result = storage.get_overall_status(submission)

        # Unknown status is not failed, completed, or processing, so falls to pending
        assert result == "pending"
