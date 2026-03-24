"""
Unit tests for the workers module.

Tests Worker class, main function, and constants.
"""
import pytest
import signal
from datetime import datetime, UTC
from unittest.mock import MagicMock, patch


# Import module under test
from workers import (
    Worker,
    TASK_DEPENDENCIES,
    TASK_PRIORITIES,
    TASK_HANDLERS,
)


class TestTaskDependencies:
    """Test TASK_DEPENDENCIES constant."""

    def test_split_topic_generation_has_no_dependencies(self):
        """split_topic_generation has no dependencies."""
        assert TASK_DEPENDENCIES["split_topic_generation"] == []

    def test_subtopics_generation_depends_on_split_topic_generation(self):
        """subtopics_generation depends on split_topic_generation."""
        assert TASK_DEPENDENCIES["subtopics_generation"] == ["split_topic_generation"]

    def test_summarization_depends_on_split_topic_generation(self):
        """summarization depends on split_topic_generation."""
        assert TASK_DEPENDENCIES["summarization"] == ["split_topic_generation"]

    def test_mindmap_depends_on_subtopics_generation(self):
        """mindmap depends on subtopics_generation."""
        assert TASK_DEPENDENCIES["mindmap"] == ["subtopics_generation"]

    def test_prefix_tree_depends_on_split_topic_generation(self):
        """prefix_tree depends on split_topic_generation."""
        assert TASK_DEPENDENCIES["prefix_tree"] == ["split_topic_generation"]

    def test_all_task_types_are_defined(self):
        """All task types from TASK_HANDLERS have dependencies defined."""
        for task_type in TASK_HANDLERS.keys():
            assert task_type in TASK_DEPENDENCIES


class TestTaskPriorities:
    """Test TASK_PRIORITIES constant."""

    def test_split_topic_generation_has_highest_priority(self):
        """split_topic_generation has priority 1 (highest)."""
        assert TASK_PRIORITIES["split_topic_generation"] == 1

    def test_subtopics_generation_has_priority_2(self):
        """subtopics_generation has priority 2."""
        assert TASK_PRIORITIES["subtopics_generation"] == 2

    def test_summarization_has_priority_3(self):
        """summarization has priority 3."""
        assert TASK_PRIORITIES["summarization"] == 3

    def test_mindmap_has_priority_3(self):
        """mindmap has priority 3."""
        assert TASK_PRIORITIES["mindmap"] == 3

    def test_prefix_tree_has_priority_3(self):
        """prefix_tree has priority 3."""
        assert TASK_PRIORITIES["prefix_tree"] == 3

    def test_insights_generation_has_priority_4(self):
        """insights_generation has priority 4."""
        assert TASK_PRIORITIES["insights_generation"] == 4

    def test_all_task_types_have_priorities(self):
        """All task types from TASK_HANDLERS have priorities defined."""
        for task_type in TASK_HANDLERS.keys():
            assert task_type in TASK_PRIORITIES


class TestTaskHandlers:
    """Test TASK_HANDLERS constant."""

    def test_split_topic_generation_handler_exists(self):
        """Handler for split_topic_generation exists."""
        assert "split_topic_generation" in TASK_HANDLERS
        assert callable(TASK_HANDLERS["split_topic_generation"])

    def test_subtopics_generation_handler_exists(self):
        """Handler for subtopics_generation exists."""
        assert "subtopics_generation" in TASK_HANDLERS
        assert callable(TASK_HANDLERS["subtopics_generation"])

    def test_summarization_handler_exists(self):
        """Handler for summarization exists."""
        assert "summarization" in TASK_HANDLERS
        assert callable(TASK_HANDLERS["summarization"])

    def test_mindmap_handler_exists(self):
        """Handler for mindmap exists."""
        assert "mindmap" in TASK_HANDLERS
        assert callable(TASK_HANDLERS["mindmap"])

    def test_prefix_tree_handler_exists(self):
        """Handler for prefix_tree exists."""
        assert "prefix_tree" in TASK_HANDLERS
        assert callable(TASK_HANDLERS["prefix_tree"])

    def test_insights_generation_handler_exists(self):
        """Handler for insights_generation exists."""
        assert "insights_generation" in TASK_HANDLERS
        assert callable(TASK_HANDLERS["insights_generation"])


class TestWorkerInit:
    """Test Worker.__init__ method."""

    @patch('workers.signal.signal')
    @patch('workers.SubmissionsStorage')
    @patch('workers.SemanticDiffsStorage')
    def test_stores_db_and_llm_references(self, mock_semantic_storage, mock_submissions_storage, mock_signal):
        """Worker stores db and llm references."""
        mock_db = MagicMock()
        mock_llm = MagicMock()

        worker = Worker(mock_db, mock_llm)

        assert worker.db is mock_db
        assert worker.llm is mock_llm

    @patch('workers.signal.signal')
    @patch('workers.SubmissionsStorage')
    @patch('workers.SemanticDiffsStorage')
    def test_sets_running_true_initially(self, mock_semantic_storage, mock_submissions_storage, mock_signal):
        """Worker sets running=True initially."""
        mock_db = MagicMock()
        mock_llm = MagicMock()

        worker = Worker(mock_db, mock_llm)

        assert worker.running is True

    @patch('workers.signal.signal')
    @patch('workers.SubmissionsStorage')
    @patch('workers.SemanticDiffsStorage')
    @patch('workers.os.getpid')
    def test_generates_worker_id_from_process_id(self, mock_getpid, mock_semantic_storage, mock_submissions_storage, mock_signal):
        """Worker generates worker_id from process ID."""
        mock_getpid.return_value = 12345
        mock_db = MagicMock()
        mock_llm = MagicMock()

        worker = Worker(mock_db, mock_llm)

        assert worker.worker_id == "worker-12345"

    @patch('workers.signal.signal')
    @patch('workers.SemanticDiffsStorage')
    @patch('workers.SubmissionsStorage')
    def test_creates_submissions_storage_instance(self, mock_submissions_storage, mock_semantic_storage, mock_signal):
        """Worker creates SubmissionsStorage instance."""
        mock_db = MagicMock()
        mock_llm = MagicMock()

        worker = Worker(mock_db, mock_llm)

        mock_submissions_storage.assert_called_once_with(mock_db)
        assert worker.submissions_storage is mock_submissions_storage.return_value

    @patch('workers.signal.signal')
    @patch('workers.SubmissionsStorage')
    @patch('workers.SemanticDiffsStorage')
    def test_creates_semantic_diffs_storage_instance(self, mock_semantic_storage, mock_submissions_storage, mock_signal):
        """Worker creates SemanticDiffsStorage instance."""
        mock_db = MagicMock()
        mock_llm = MagicMock()

        worker = Worker(mock_db, mock_llm)

        mock_semantic_storage.assert_called_once_with(mock_db)
        assert worker.semantic_diffs_storage is mock_semantic_storage.return_value

    @patch('workers.signal.signal')
    @patch('workers.SubmissionsStorage')
    @patch('workers.SemanticDiffsStorage')
    def test_registers_sigint_handler(self, mock_semantic_storage, mock_submissions_storage, mock_signal):
        """Worker registers signal handler for SIGINT."""
        mock_db = MagicMock()
        mock_llm = MagicMock()

        worker = Worker(mock_db, mock_llm)

        mock_signal.assert_any_call(signal.SIGINT, worker._signal_handler)

    @patch('workers.signal.signal')
    @patch('workers.SubmissionsStorage')
    @patch('workers.SemanticDiffsStorage')
    def test_registers_sigterm_handler(self, mock_semantic_storage, mock_submissions_storage, mock_signal):
        """Worker registers signal handler for SIGTERM."""
        mock_db = MagicMock()
        mock_llm = MagicMock()

        worker = Worker(mock_db, mock_llm)

        mock_signal.assert_any_call(signal.SIGTERM, worker._signal_handler)


class TestWorkerSignalHandler:
    """Test Worker._signal_handler method."""

    @patch('workers.signal.signal')
    @patch('workers.SubmissionsStorage')
    @patch('workers.SemanticDiffsStorage')
    def test_sets_running_false_on_signal(self, mock_semantic_storage, mock_submissions_storage, mock_signal):
        """Signal handler sets running=False."""
        mock_db = MagicMock()
        mock_llm = MagicMock()

        worker = Worker(mock_db, mock_llm)
        worker.running = True

        worker._signal_handler(signal.SIGINT, None)

        assert worker.running is False

    @patch('workers.signal.signal')
    @patch('workers.SubmissionsStorage')
    @patch('workers.SemanticDiffsStorage')
    def test_logs_shutdown_message(self, mock_semantic_storage, mock_submissions_storage, mock_signal, caplog):
        """Signal handler logs shutdown message."""
        mock_db = MagicMock()
        mock_llm = MagicMock()

        worker = Worker(mock_db, mock_llm)

        with caplog.at_level("INFO"):
            worker._signal_handler(signal.SIGTERM, None)

        assert "Received signal" in caplog.text
        assert "shutting down" in caplog.text

    @patch('workers.signal.signal')
    @patch('workers.SubmissionsStorage')
    @patch('workers.SemanticDiffsStorage')
    def test_handles_sigint(self, mock_semantic_storage, mock_submissions_storage, mock_signal):
        """Signal handler handles SIGINT (Ctrl+C)."""
        mock_db = MagicMock()
        mock_llm = MagicMock()

        worker = Worker(mock_db, mock_llm)
        worker.running = True

        worker._signal_handler(signal.SIGINT, None)

        assert worker.running is False

    @patch('workers.signal.signal')
    @patch('workers.SubmissionsStorage')
    @patch('workers.SemanticDiffsStorage')
    def test_handles_sigterm(self, mock_semantic_storage, mock_submissions_storage, mock_signal):
        """Signal handler handles SIGTERM."""
        mock_db = MagicMock()
        mock_llm = MagicMock()

        worker = Worker(mock_db, mock_llm)
        worker.running = True

        worker._signal_handler(signal.SIGTERM, None)

        assert worker.running is False


class TestWorkerDependenciesMet:
    """Test Worker._dependencies_met method."""

    @pytest.fixture
    def worker(self):
        """Create a worker instance with mocked dependencies."""
        with patch('workers.signal.signal'), \
             patch('workers.SubmissionsStorage'), \
             patch('workers.SemanticDiffsStorage'):
            mock_db = MagicMock()
            mock_llm = MagicMock()
            yield Worker(mock_db, mock_llm)

    def test_returns_true_for_task_with_no_dependencies(self, worker):
        """Returns True for tasks with no dependencies (split_topic_generation)."""
        task = {
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        result = worker._dependencies_met(task)

        assert result is True

    def test_returns_true_when_all_dependencies_completed(self, worker):
        """Returns True when all dependencies have status='completed'."""
        task = {
            "task_type": "subtopics_generation",
            "submission_id": "sub-123"
        }

        submission = {
            "_id": "sub-123",
            "tasks": {
                "split_topic_generation": {"status": "completed"}
            }
        }
        worker.submissions_storage.get_by_id.return_value = submission

        result = worker._dependencies_met(task)

        assert result is True
        worker.submissions_storage.get_by_id.assert_called_once_with("sub-123")

    def test_returns_false_when_dependency_pending(self, worker):
        """Returns False when any dependency is 'pending'."""
        task = {
            "task_type": "subtopics_generation",
            "submission_id": "sub-123"
        }

        submission = {
            "_id": "sub-123",
            "tasks": {
                "split_topic_generation": {"status": "pending"}
            }
        }
        worker.submissions_storage.get_by_id.return_value = submission

        result = worker._dependencies_met(task)

        assert result is False

    def test_returns_false_when_dependency_processing(self, worker):
        """Returns False when any dependency is 'processing'."""
        task = {
            "task_type": "subtopics_generation",
            "submission_id": "sub-123"
        }

        submission = {
            "_id": "sub-123",
            "tasks": {
                "split_topic_generation": {"status": "processing"}
            }
        }
        worker.submissions_storage.get_by_id.return_value = submission

        result = worker._dependencies_met(task)

        assert result is False

    def test_returns_false_when_dependency_failed(self, worker):
        """Returns False when any dependency is 'failed'."""
        task = {
            "task_type": "subtopics_generation",
            "submission_id": "sub-123"
        }

        submission = {
            "_id": "sub-123",
            "tasks": {
                "split_topic_generation": {"status": "failed"}
            }
        }
        worker.submissions_storage.get_by_id.return_value = submission

        result = worker._dependencies_met(task)

        assert result is False

    def test_returns_false_when_submission_not_found(self, worker, caplog):
        """Returns False when submission not found (logs warning)."""
        task = {
            "task_type": "subtopics_generation",
            "submission_id": "sub-123"
        }

        worker.submissions_storage.get_by_id.return_value = None

        with caplog.at_level("WARNING"):
            result = worker._dependencies_met(task)

        assert result is False
        assert "not found" in caplog.text
        assert "sub-123" in caplog.text

    def test_handles_missing_task_data_in_submission(self, worker):
        """Handles missing task data in submission."""
        task = {
            "task_type": "subtopics_generation",
            "submission_id": "sub-123"
        }

        submission = {
            "_id": "sub-123",
            "tasks": {}
        }
        worker.submissions_storage.get_by_id.return_value = submission

        result = worker._dependencies_met(task)

        assert result is False

    def test_mindmap_requires_subtopics_generation_completed(self, worker):
        """mindmap requires subtopics_generation to be completed."""
        task = {
            "task_type": "mindmap",
            "submission_id": "sub-123"
        }

        submission = {
            "_id": "sub-123",
            "tasks": {
                "split_topic_generation": {"status": "completed"},
                "subtopics_generation": {"status": "completed"}
            }
        }
        worker.submissions_storage.get_by_id.return_value = submission

        result = worker._dependencies_met(task)

        assert result is True

    def test_mindmap_blocked_if_subtopics_not_completed(self, worker):
        """mindmap blocked if subtopics_generation not completed."""
        task = {
            "task_type": "mindmap",
            "submission_id": "sub-123"
        }

        submission = {
            "_id": "sub-123",
            "tasks": {
                "split_topic_generation": {"status": "completed"},
                "subtopics_generation": {"status": "pending"}
            }
        }
        worker.submissions_storage.get_by_id.return_value = submission

        result = worker._dependencies_met(task)

        assert result is False


class TestWorkerClaimTask:
    """Test Worker.claim_task method."""

    @pytest.fixture
    def worker(self):
        """Create a worker instance with mocked dependencies."""
        with patch('workers.signal.signal'), \
             patch('workers.SubmissionsStorage'), \
             patch('workers.SemanticDiffsStorage'):
            mock_db = MagicMock()
            mock_llm = MagicMock()
            worker = Worker(mock_db, mock_llm)
            # Mock _dependencies_met to return True by default
            worker._dependencies_met = MagicMock(return_value=True)
            yield worker

    def test_claims_tasks_in_priority_order(self, worker):
        """Claims tasks in priority order (1, 2, 3)."""
        mock_task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }
        # Only return task for split_topic_generation, None for others
        worker.db.task_queue.find_one_and_update.side_effect = [mock_task, None, None, None, None, None, None]

        result = worker.claim_task()

        # Should have tried split_topic_generation first (priority 1)
        call_args = worker.db.task_queue.find_one_and_update.call_args_list[0]
        assert call_args[0][0]["task_type"] == "split_topic_generation"
        assert result == mock_task

    def test_claims_oldest_task_first_within_same_priority(self, worker):
        """Claims oldest task first within same priority (created_at sort)."""
        mock_task = {
            "_id": "task-1",
            "task_type": "summarization",
            "submission_id": "sub-123"
        }
        # Return None for priority 1 and 2 tasks, then return the summarization task
        worker.db.task_queue.find_one_and_update.side_effect = [None, None, mock_task, None, None]

        worker.claim_task()

        # Check sort parameter includes created_at for the call that returned the task
        call_args = worker.db.task_queue.find_one_and_update.call_args_list[2]
        sort_param = call_args[1]["sort"]
        assert ("priority", 1) in sort_param
        assert ("created_at", 1) in sort_param

    def test_updates_status_to_processing(self, worker):
        """Updates status to 'processing'."""
        mock_task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }
        worker.db.task_queue.find_one_and_update.side_effect = [mock_task, None, None, None, None, None, None]

        worker.claim_task()

        call_args = worker.db.task_queue.find_one_and_update.call_args_list[0]
        update_doc = call_args[0][1]
        assert update_doc["$set"]["status"] == "processing"

    def test_sets_started_at_timestamp(self, worker):
        """Sets started_at timestamp."""
        mock_task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }
        worker.db.task_queue.find_one_and_update.side_effect = [mock_task, None, None, None, None, None, None]

        worker.claim_task()

        call_args = worker.db.task_queue.find_one_and_update.call_args_list[0]
        update_doc = call_args[0][1]
        assert "$set" in update_doc
        assert "started_at" in update_doc["$set"]

    def test_sets_worker_id(self, worker):
        """Sets worker_id on claimed task."""
        mock_task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }
        worker.db.task_queue.find_one_and_update.side_effect = [mock_task, None, None, None, None, None, None]

        worker.claim_task()

        call_args = worker.db.task_queue.find_one_and_update.call_args_list[0]
        update_doc = call_args[0][1]
        assert update_doc["$set"]["worker_id"] == worker.worker_id

    def test_checks_dependencies_after_claim(self, worker):
        """Checks dependencies after claim."""
        mock_task = {
            "_id": "task-1",
            "task_type": "subtopics_generation",
            "submission_id": "sub-123"
        }
        worker.db.task_queue.find_one_and_update.side_effect = [None, mock_task, None, None, None, None, None]

        worker.claim_task()

        worker._dependencies_met.assert_called_once_with(mock_task)

    def test_returns_task_to_pending_if_dependencies_not_met(self, worker):
        """Returns task to 'pending' if dependencies not met."""
        mock_task = {
            "_id": "task-1",
            "task_type": "subtopics_generation",
            "submission_id": "sub-123"
        }
        worker.db.task_queue.find_one_and_update.side_effect = [None, mock_task, None, None, None, None, None]
        worker._dependencies_met.return_value = False

        result = worker.claim_task()

        # Should have called update_one to reset task
        worker.db.task_queue.update_one.assert_called_once()
        update_call = worker.db.task_queue.update_one.call_args
        assert update_call[0][1]["$set"]["status"] == "pending"
        assert result is None

    def test_returns_none_when_no_tasks_available(self, worker):
        """Returns None when no tasks available."""
        worker.db.task_queue.find_one_and_update.return_value = None

        result = worker.claim_task()

        assert result is None

    def test_handles_empty_task_queue(self, worker):
        """Handles empty task queue."""
        worker.db.task_queue.find_one_and_update.return_value = None

        result = worker.claim_task()

        assert result is None

    def test_claims_subtopics_generation_after_split_topic(self, worker):
        """Claims subtopics_generation (priority 2) after checking split_topic_generation."""
        # No split_topic_generation tasks
        worker.db.task_queue.find_one_and_update.return_value = None

        result = worker.claim_task()

        assert result is None
        # Should have tried all task types
        assert worker.db.task_queue.find_one_and_update.call_count == len(TASK_HANDLERS)


class TestWorkerClaimDiffJob:
    """Test Worker.claim_diff_job method."""

    @pytest.fixture
    def worker(self):
        """Create a worker instance with mocked dependencies."""
        with patch('workers.signal.signal'), \
             patch('workers.SubmissionsStorage'), \
             patch('workers.SemanticDiffsStorage') as mock_semantic_storage:
            mock_db = MagicMock()
            mock_llm = MagicMock()
            worker = Worker(mock_db, mock_llm)
            worker.semantic_diffs_storage = mock_semantic_storage.return_value
            yield worker

    def test_delegates_to_semantic_diffs_storage_claim_job(self, worker):
        """Delegates to semantic_diffs_storage.claim_job."""
        mock_job = {"_id": "job-1", "pair_key": "pair-1"}
        worker.semantic_diffs_storage.claim_job.return_value = mock_job

        result = worker.claim_diff_job()

        worker.semantic_diffs_storage.claim_job.assert_called_once_with(worker.worker_id)
        assert result == mock_job

    def test_returns_claimed_job(self, worker):
        """Returns claimed job."""
        mock_job = {"_id": "job-1", "pair_key": "pair-1"}
        worker.semantic_diffs_storage.claim_job.return_value = mock_job

        result = worker.claim_diff_job()

        assert result == mock_job

    def test_returns_none_when_no_jobs_available(self, worker):
        """Returns None when no jobs available."""
        worker.semantic_diffs_storage.claim_job.return_value = None

        result = worker.claim_diff_job()

        assert result is None


class TestWorkerProcessTask:
    """Test Worker.process_task method."""

    @pytest.fixture
    def worker(self):
        """Create a worker instance with mocked dependencies."""
        with patch('workers.signal.signal'), \
             patch('workers.SubmissionsStorage'), \
             patch('workers.SemanticDiffsStorage'):
            mock_db = MagicMock()
            mock_llm = MagicMock()
            worker = Worker(mock_db, mock_llm)
            yield worker

    @patch('workers.TASK_HANDLERS')
    @patch('workers.create_llm_client')
    def test_finds_handler_from_task_handlers_mapping(self, mock_create_llm, mock_handlers, worker, caplog):
        """Finds handler from TASK_HANDLERS mapping."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }
        
        mock_handler = MagicMock()
        mock_handlers.__getitem__.return_value = mock_handler
        mock_handlers.get.return_value = mock_handler

        submission = {"_id": "sub-123"}
        worker.submissions_storage.get_by_id.return_value = submission
        mock_create_llm.return_value = MagicMock(provider_name="OpenAI", model_name="gpt-4o")

        with patch.object(worker, '_mark_task_completed'):
            worker.process_task(task)
            mock_handler.assert_called_once()

    @patch('workers.TASK_HANDLERS')
    @patch('workers.create_llm_client')
    def test_updates_submission_task_status_to_processing(self, mock_create_llm, mock_handlers, worker):
        """Updates submission task status to 'processing'."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        mock_handler = MagicMock()
        mock_handlers.__getitem__.return_value = mock_handler
        mock_handlers.get.return_value = mock_handler

        submission = {"_id": "sub-123"}
        worker.submissions_storage.get_by_id.return_value = submission
        mock_create_llm.return_value = MagicMock(provider_name="OpenAI", model_name="gpt-4o")

        with patch.object(worker, '_mark_task_completed'):
            worker.process_task(task)

        worker.submissions_storage.update_task_status.assert_called_with(
            "sub-123", "split_topic_generation", "processing"
        )

    @patch('workers.TASK_HANDLERS')
    @patch('workers.create_llm_client')
    def test_fetches_submission_document(self, mock_create_llm, mock_handlers, worker):
        """Fetches submission document."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        mock_handler = MagicMock()
        mock_handlers.__getitem__.return_value = mock_handler
        mock_handlers.get.return_value = mock_handler

        submission = {"_id": "sub-123"}
        worker.submissions_storage.get_by_id.return_value = submission
        mock_create_llm.return_value = MagicMock(provider_name="OpenAI", model_name="gpt-4o")

        with patch.object(worker, '_mark_task_completed'):
            worker.process_task(task)

        worker.submissions_storage.get_by_id.assert_called_once_with("sub-123")

    @patch('workers.TASK_HANDLERS')
    @patch('workers.create_llm_client')
    def test_calls_handler_with_submission_db_llm(self, mock_create_llm, mock_handlers, worker):
        """Non-cache tasks (e.g. mindmap) called with (submission, db, llm) only."""
        task = {
            "_id": "task-1",
            "task_type": "mindmap",
            "submission_id": "sub-123"
        }

        mock_handler = MagicMock()
        mock_handlers.__getitem__.return_value = mock_handler
        mock_handlers.get.return_value = mock_handler

        submission = {"_id": "sub-123"}
        worker.submissions_storage.get_by_id.return_value = submission
        active_llm = MagicMock(provider_name="OpenAI", model_name="gpt-4o")
        mock_create_llm.return_value = active_llm

        with patch.object(worker, '_mark_task_completed'):
            worker.process_task(task)

            mock_handler.assert_called_once_with(submission, worker.db, active_llm)

    @patch('workers.TASK_HANDLERS')
    @patch('workers.create_llm_client')
    def test_calls_cache_task_handler_with_runtime_llm(self, mock_create_llm, mock_handlers, worker):
        """Cache tasks receive the per-task LLM client and cache store."""
        task = {
            "_id": "task-1",
            "task_type": "summarization",
            "submission_id": "sub-123"
        }

        mock_handler = MagicMock()
        mock_handlers.get.return_value = mock_handler
        submission = {"_id": "sub-123"}
        worker.submissions_storage.get_by_id.return_value = submission
        active_llm = MagicMock(provider_name="OpenAI", model_name="gpt-4o")
        mock_create_llm.return_value = active_llm

        with patch.object(worker, '_mark_task_completed'):
            worker.process_task(task)

        mock_handler.assert_called_once_with(submission, worker.db, active_llm, cache_store=worker.cache_store)

    @patch('workers.TASK_HANDLERS')
    @patch('workers.create_llm_client')
    def test_marks_task_completed_on_success(self, mock_create_llm, mock_handlers, worker):
        """Marks task completed on success."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        mock_handler = MagicMock()
        mock_handlers.__getitem__.return_value = mock_handler
        mock_handlers.get.return_value = mock_handler

        submission = {"_id": "sub-123"}
        worker.submissions_storage.get_by_id.return_value = submission
        mock_create_llm.return_value = MagicMock(provider_name="OpenAI", model_name="gpt-4o")

        with patch.object(worker, '_mark_task_completed') as mock_mark_completed:
            worker.process_task(task)

            mock_mark_completed.assert_called_once_with(task)

    @patch('workers.create_llm_client')
    def test_marks_task_failed_on_exception(self, mock_create_llm, worker):
        """Marks task failed on exception."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        submission = {"_id": "sub-123"}
        worker.submissions_storage.get_by_id.return_value = submission
        mock_create_llm.return_value = MagicMock(provider_name="OpenAI", model_name="gpt-4o")

        with patch.object(worker, '_mark_task_failed') as mock_mark_failed:
            with patch.object(worker, '_mark_task_completed'):
                with patch('workers.TASK_HANDLERS') as mock_handlers:
                    mock_handler = MagicMock(side_effect=Exception("Test error"))
                    mock_handlers.__getitem__.return_value = mock_handler
                    mock_handlers.get.return_value = mock_handler
                    worker.process_task(task)

                    mock_mark_failed.assert_called_once()

    def test_no_handler_found_marks_failed(self, worker, caplog):
        """No handler found -> mark failed with error message."""
        task = {
            "_id": "task-1",
            "task_type": "unknown_task_type",
            "submission_id": "sub-123"
        }

        with patch.object(worker, '_mark_task_failed') as mock_mark_failed:
            worker.process_task(task)

            mock_mark_failed.assert_called_once()
            call_args = mock_mark_failed.call_args
            assert "No handler for task type" in call_args[0][1]

    @patch('workers.create_llm_client')
    def test_submission_not_found_marks_failed(self, mock_create_llm, worker):
        """Submission not found -> mark failed."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        worker.submissions_storage.get_by_id.return_value = None
        mock_create_llm.return_value = MagicMock(provider_name="OpenAI", model_name="gpt-4o")

        with patch.object(worker, '_mark_task_failed') as mock_mark_failed:
            worker.process_task(task)

            mock_mark_failed.assert_called_once()

    @patch('workers.TASK_HANDLERS')
    @patch('workers.create_llm_client')
    def test_logs_errors_with_exc_info(self, mock_create_llm, mock_handlers, worker, caplog):
        """Logs errors with exc_info."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        mock_handler = MagicMock(side_effect=Exception("Test error"))
        mock_handlers.__getitem__.return_value = mock_handler
        mock_handlers.get.return_value = mock_handler

        submission = {"_id": "sub-123"}
        worker.submissions_storage.get_by_id.return_value = submission
        mock_create_llm.return_value = MagicMock(provider_name="OpenAI", model_name="gpt-4o")

        with patch.object(worker, '_mark_task_failed'):
            with patch.object(worker, '_mark_task_completed'):
                with caplog.at_level("ERROR"):
                    worker.process_task(task)

                assert "Error processing" in caplog.text
                assert "Test error" in caplog.text


class TestWorkerMarkTaskCompleted:
    """Test Worker._mark_task_completed method."""

    @pytest.fixture
    def worker(self):
        """Create a worker instance with mocked dependencies."""
        with patch('workers.signal.signal'), \
             patch('workers.SubmissionsStorage'), \
             patch('workers.SemanticDiffsStorage'):
            mock_db = MagicMock()
            mock_llm = MagicMock()
            yield Worker(mock_db, mock_llm)

    def test_updates_task_queue_status_completed(self, worker):
        """Updates task_queue: status='completed'."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        worker._mark_task_completed(task)

        worker.db.task_queue.update_one.assert_called_once()
        call_args = worker.db.task_queue.update_one.call_args
        assert call_args[0][1]["$set"]["status"] == "completed"

    def test_updates_task_queue_completed_at(self, worker):
        """Updates task_queue: completed_at=now."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        worker._mark_task_completed(task)

        call_args = worker.db.task_queue.update_one.call_args
        assert "completed_at" in call_args[0][1]["$set"]

    def test_updates_submission_task_status_completed(self, worker):
        """Updates submission: task status='completed'."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        worker._mark_task_completed(task)

        worker.submissions_storage.update_task_status.assert_called_once_with(
            "sub-123", "split_topic_generation", "completed"
        )

    def test_deletes_completed_task_from_database(self, worker):
        """Deletes completed task from task_queue database."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        worker._mark_task_completed(task)

        worker.db.task_queue.delete_one.assert_called_once_with({"_id": "task-1"})


class TestWorkerMarkTaskFailed:
    """Test Worker._mark_task_failed method."""

    @pytest.fixture
    def worker(self):
        """Create a worker instance with mocked dependencies."""
        with patch('workers.signal.signal'), \
             patch('workers.SubmissionsStorage'), \
             patch('workers.SemanticDiffsStorage'):
            mock_db = MagicMock()
            mock_llm = MagicMock()
            yield Worker(mock_db, mock_llm)

    def test_updates_task_queue_status_failed(self, worker):
        """Updates task_queue: status='failed'."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        worker._mark_task_failed(task, "Test error message")

        call_args = worker.db.task_queue.update_one.call_args
        assert call_args[0][1]["$set"]["status"] == "failed"

    def test_updates_task_queue_completed_at(self, worker):
        """Updates task_queue: completed_at=now."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        worker._mark_task_failed(task, "Test error message")

        call_args = worker.db.task_queue.update_one.call_args
        assert "completed_at" in call_args[0][1]["$set"]

    def test_updates_task_queue_error_message(self, worker):
        """Updates task_queue: error=error_msg."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        worker._mark_task_failed(task, "Test error message")

        call_args = worker.db.task_queue.update_one.call_args
        assert call_args[0][1]["$set"]["error"] == "Test error message"

    def test_increments_retry_count(self, worker):
        """Increments retry_count."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        worker._mark_task_failed(task, "Test error message")

        call_args = worker.db.task_queue.update_one.call_args
        assert call_args[0][1]["$inc"]["retry_count"] == 1

    def test_updates_submission_task_status_failed(self, worker):
        """Updates submission: task status='failed', error=error_msg."""
        task = {
            "_id": "task-1",
            "task_type": "split_topic_generation",
            "submission_id": "sub-123"
        }

        worker._mark_task_failed(task, "Test error message")

        worker.submissions_storage.update_task_status.assert_called_once_with(
            "sub-123", "split_topic_generation", "failed", error="Test error message"
        )


class TestWorkerProcessDiffJob:
    """Test Worker.process_diff_job method."""

    @pytest.fixture
    def worker(self):
        """Create a worker instance with mocked dependencies."""
        with patch('workers.signal.signal'), \
             patch('workers.SubmissionsStorage'), \
             patch('workers.SemanticDiffsStorage'):
            mock_db = MagicMock()
            mock_llm = MagicMock()
            worker = Worker(mock_db, mock_llm)
            yield worker

    def test_validates_job_payload_pair_key(self, worker):
        """Validates job payload (pair_key required)."""
        job = {
            "_id": "job-1",
            "pair_key": None,
            "submission_a_id": "sub-a",
            "submission_b_id": "sub-b"
        }

        with patch.object(worker, '_mark_diff_job_failed') as mock_mark_failed:
            worker.process_diff_job(job)
            mock_mark_failed.assert_called_once()

    def test_validates_job_payload_submission_a_id(self, worker):
        """Validates job payload (submission_a_id required)."""
        job = {
            "_id": "job-1",
            "pair_key": "pair-1",
            "submission_a_id": None,
            "submission_b_id": "sub-b"
        }

        with patch.object(worker, '_mark_diff_job_failed') as mock_mark_failed:
            worker.process_diff_job(job)
            mock_mark_failed.assert_called_once()

    def test_validates_job_payload_submission_b_id(self, worker):
        """Validates job payload (submission_b_id required)."""
        job = {
            "_id": "job-1",
            "pair_key": "pair-1",
            "submission_a_id": "sub-a",
            "submission_b_id": None
        }

        with patch.object(worker, '_mark_diff_job_failed') as mock_mark_failed:
            worker.process_diff_job(job)
            mock_mark_failed.assert_called_once()

    def test_invalid_payload_marks_failed(self, worker):
        """Invalid payload -> mark failed."""
        job = {
            "_id": "job-1",
            "pair_key": None,
            "submission_a_id": "sub-a",
            "submission_b_id": "sub-b"
        }

        with patch.object(worker, '_mark_diff_job_failed') as mock_mark_failed:
            worker.process_diff_job(job)
            mock_mark_failed.assert_called_once_with(job, "Invalid job payload")

    def test_fetches_both_submissions(self, worker):
        """Fetches both submissions."""
        job = {
            "_id": "job-1",
            "pair_key": "pair-1",
            "submission_a_id": "sub-a",
            "submission_b_id": "sub-b"
        }

        submission_a = {"_id": "sub-a", "results": {}}
        submission_b = {"_id": "sub-b", "results": {}}
        worker.submissions_storage.get_by_id.side_effect = [submission_a, submission_b]

        with patch('workers.check_submission_topic_readiness') as mock_readiness:
            mock_readiness.side_effect = [
                {"ready": True, "missing": []},
                {"ready": True, "missing": []}
            ]
            with patch.object(worker, '_mark_diff_job_completed'):
                with patch('workers.compute_topic_aware_semantic_diff'):
                    with patch.object(worker.semantic_diffs_storage, 'upsert_diff'):
                        worker.process_diff_job(job)

        assert worker.submissions_storage.get_by_id.call_count == 2

    def test_submissions_not_found_marks_failed(self, worker):
        """Submissions not found -> mark failed."""
        job = {
            "_id": "job-1",
            "pair_key": "pair-1",
            "submission_a_id": "sub-a",
            "submission_b_id": "sub-b"
        }

        worker.submissions_storage.get_by_id.return_value = None

        with patch.object(worker, '_mark_diff_job_failed') as mock_mark_failed:
            worker.process_diff_job(job)
            mock_mark_failed.assert_called_once()

    def test_checks_topic_readiness(self, worker):
        """Checks topic readiness."""
        job = {
            "_id": "job-1",
            "pair_key": "pair-1",
            "submission_a_id": "sub-a",
            "submission_b_id": "sub-b"
        }

        submission_a = {"_id": "sub-a", "results": {}}
        submission_b = {"_id": "sub-b", "results": {}}
        worker.submissions_storage.get_by_id.side_effect = [submission_a, submission_b]

        with patch('workers.check_submission_topic_readiness') as mock_readiness:
            mock_readiness.side_effect = [
                {"ready": True, "missing": []},
                {"ready": True, "missing": []}
            ]
            with patch.object(worker, '_mark_diff_job_completed'):
                with patch('workers.compute_topic_aware_semantic_diff'):
                    with patch.object(worker.semantic_diffs_storage, 'upsert_diff'):
                        worker.process_diff_job(job)

            assert mock_readiness.call_count == 2

    def test_prerequisites_not_ready_marks_failed(self, worker):
        """Prerequisites not ready -> mark failed with details."""
        job = {
            "_id": "job-1",
            "pair_key": "pair-1",
            "submission_a_id": "sub-a",
            "submission_b_id": "sub-b"
        }

        submission_a = {"_id": "sub-a", "results": {}}
        submission_b = {"_id": "sub-b", "results": {}}
        worker.submissions_storage.get_by_id.side_effect = [submission_a, submission_b]

        with patch('workers.check_submission_topic_readiness') as mock_readiness:
            mock_readiness.side_effect = [
                {"ready": False, "missing": ["topics"]},
                {"ready": True, "missing": []}
            ]
            with patch.object(worker, '_mark_diff_job_failed') as mock_mark_failed:
                worker.process_diff_job(job)
                mock_mark_failed.assert_called_once()
                assert "Topic prerequisites" in mock_mark_failed.call_args[0][1]

    def test_skips_when_diff_up_to_date(self, worker):
        """Skips when existing diff is up-to-date."""
        job = {
            "_id": "job-1",
            "pair_key": "pair-1",
            "submission_a_id": "sub-a",
            "submission_b_id": "sub-b",
            "force_recalculate": False
        }

        submission_a = {"_id": "sub-a", "results": {}}
        submission_b = {"_id": "sub-b", "results": {}}
        worker.submissions_storage.get_by_id.side_effect = [submission_a, submission_b]

        existing_diff = {"_id": "diff-1"}
        worker.semantic_diffs_storage.get_diff_by_pair_key.return_value = existing_diff

        with patch('workers.check_submission_topic_readiness') as mock_readiness:
            mock_readiness.side_effect = [
                {"ready": True, "missing": []},
                {"ready": True, "missing": []}
            ]
            with patch('workers.stale_reasons') as mock_stale:
                mock_stale.return_value = []  # No stale reasons = up to date
                with patch.object(worker, '_mark_diff_job_completed') as mock_mark_completed:
                    worker.process_diff_job(job)

                    mock_mark_completed.assert_called_once()

    def test_skips_logs_message(self, worker, caplog):
        """Skips logs message."""
        job = {
            "_id": "job-1",
            "pair_key": "pair-1",
            "submission_a_id": "sub-a",
            "submission_b_id": "sub-b",
            "force_recalculate": False
        }

        submission_a = {"_id": "sub-a", "results": {}}
        submission_b = {"_id": "sub-b", "results": {}}
        worker.submissions_storage.get_by_id.side_effect = [submission_a, submission_b]

        existing_diff = {"_id": "diff-1"}
        worker.semantic_diffs_storage.get_diff_by_pair_key.return_value = existing_diff

        with patch('workers.check_submission_topic_readiness') as mock_readiness:
            mock_readiness.side_effect = [
                {"ready": True, "missing": []},
                {"ready": True, "missing": []}
            ]
            with patch('workers.stale_reasons') as mock_stale:
                mock_stale.return_value = []
                with patch.object(worker, '_mark_diff_job_completed'):
                    with caplog.at_level("INFO"):
                        worker.process_diff_job(job)

                    assert "Skipped" in caplog.text

    def test_computes_diff_when_needed(self, worker):
        """Computes diff when needed."""
        job = {
            "_id": "job-1",
            "pair_key": "pair-1",
            "submission_a_id": "sub-a",
            "submission_b_id": "sub-b",
            "force_recalculate": True
        }

        submission_a = {"_id": "sub-a", "results": {}}
        submission_b = {"_id": "sub-b", "results": {}}
        worker.submissions_storage.get_by_id.side_effect = [submission_a, submission_b]

        with patch('workers.check_submission_topic_readiness') as mock_readiness:
            mock_readiness.side_effect = [
                {"ready": True, "missing": []},
                {"ready": True, "missing": []}
            ]
            with patch('workers.compute_topic_aware_semantic_diff') as mock_compute:
                mock_compute.return_value = {"diff": "result"}
                with patch.object(worker.semantic_diffs_storage, 'upsert_diff'):
                    with patch.object(worker, '_mark_diff_job_completed'):
                        worker.process_diff_job(job)

                        mock_compute.assert_called_once_with(submission_a, submission_b)

    def test_upserts_diff_with_payload(self, worker):
        """Upserts diff with payload."""
        job = {
            "_id": "job-1",
            "pair_key": "pair-1",
            "submission_a_id": "sub-a",
            "submission_b_id": "sub-b",
            "force_recalculate": True
        }

        submission_a = {"_id": "sub-a", "results": {}, "updated_at": datetime.now(UTC)}
        submission_b = {"_id": "sub-b", "results": {}, "updated_at": datetime.now(UTC)}
        worker.submissions_storage.get_by_id.side_effect = [submission_a, submission_b]

        diff_payload = {"diff": "result"}

        with patch('workers.check_submission_topic_readiness') as mock_readiness:
            mock_readiness.side_effect = [
                {"ready": True, "missing": []},
                {"ready": True, "missing": []}
            ]
            with patch('workers.compute_topic_aware_semantic_diff') as mock_compute:
                mock_compute.return_value = diff_payload
                with patch.object(worker.semantic_diffs_storage, 'upsert_diff') as mock_upsert:
                    with patch.object(worker, '_mark_diff_job_completed'):
                        worker.process_diff_job(job)

                        mock_upsert.assert_called_once()
                        call_kwargs = mock_upsert.call_args[1]
                        assert call_kwargs["pair_key"] == "pair-1"
                        assert call_kwargs["payload"] == diff_payload

    def test_marks_job_completed_on_success(self, worker):
        """Marks job completed on success."""
        job = {
            "_id": "job-1",
            "pair_key": "pair-1",
            "submission_a_id": "sub-a",
            "submission_b_id": "sub-b",
            "force_recalculate": True
        }

        submission_a = {"_id": "sub-a", "results": {}}
        submission_b = {"_id": "sub-b", "results": {}}
        worker.submissions_storage.get_by_id.side_effect = [submission_a, submission_b]

        with patch('workers.check_submission_topic_readiness') as mock_readiness:
            mock_readiness.side_effect = [
                {"ready": True, "missing": []},
                {"ready": True, "missing": []}
            ]
            with patch('workers.compute_topic_aware_semantic_diff'):
                with patch.object(worker.semantic_diffs_storage, 'upsert_diff'):
                    with patch.object(worker, '_mark_diff_job_completed') as mock_mark_completed:
                        worker.process_diff_job(job)

                        mock_mark_completed.assert_called_once()

    def test_marks_job_failed_on_exception(self, worker):
        """Any exception -> mark failed with error message."""
        job = {
            "_id": "job-1",
            "pair_key": "pair-1",
            "submission_a_id": "sub-a",
            "submission_b_id": "sub-b"
        }

        submission_a = {"_id": "sub-a", "results": {}}
        submission_b = {"_id": "sub-b", "results": {}}
        worker.submissions_storage.get_by_id.side_effect = [submission_a, submission_b]

        with patch('workers.check_submission_topic_readiness') as mock_readiness:
            mock_readiness.side_effect = [
                {"ready": True, "missing": []},
                {"ready": True, "missing": []}
            ]
            with patch('workers.compute_topic_aware_semantic_diff') as mock_compute:
                mock_compute.side_effect = Exception("Computation error")
                with patch.object(worker, '_mark_diff_job_failed') as mock_mark_failed:
                    worker.process_diff_job(job)

                    mock_mark_failed.assert_called_once()
                    assert "Computation error" in mock_mark_failed.call_args[0][1]

    def test_logs_errors_with_exc_info(self, worker, caplog):
        """Logs errors with exc_info."""
        job = {
            "_id": "job-1",
            "pair_key": "pair-1",
            "submission_a_id": "sub-a",
            "submission_b_id": "sub-b"
        }

        submission_a = {"_id": "sub-a", "results": {}}
        submission_b = {"_id": "sub-b", "results": {}}
        worker.submissions_storage.get_by_id.side_effect = [submission_a, submission_b]

        with patch('workers.check_submission_topic_readiness') as mock_readiness:
            mock_readiness.side_effect = [
                {"ready": True, "missing": []},
                {"ready": True, "missing": []}
            ]
            with patch('workers.compute_topic_aware_semantic_diff') as mock_compute:
                mock_compute.side_effect = Exception("Computation error")
                with patch.object(worker, '_mark_diff_job_failed'):
                    with caplog.at_level("ERROR"):
                        worker.process_diff_job(job)

                    assert "Error processing semantic diff job" in caplog.text


class TestWorkerMarkDiffJobCompleted:
    """Test Worker._mark_diff_job_completed method."""

    @pytest.fixture
    def worker(self):
        """Create a worker instance with mocked dependencies."""
        with patch('workers.signal.signal'), \
             patch('workers.SubmissionsStorage'), \
             patch('workers.SemanticDiffsStorage'):
            mock_db = MagicMock()
            mock_llm = MagicMock()
            yield Worker(mock_db, mock_llm)

    def test_delegates_to_semantic_diffs_storage_mark_job_completed(self, worker):
        """Delegates to semantic_diffs_storage.mark_job_completed."""
        job = {"_id": "job-1"}

        worker._mark_diff_job_completed(job)

        worker.semantic_diffs_storage.mark_job_completed.assert_called_once_with("job-1")


class TestWorkerMarkDiffJobFailed:
    """Test Worker._mark_diff_job_failed method."""

    @pytest.fixture
    def worker(self):
        """Create a worker instance with mocked dependencies."""
        with patch('workers.signal.signal'), \
             patch('workers.SubmissionsStorage'), \
             patch('workers.SemanticDiffsStorage'):
            mock_db = MagicMock()
            mock_llm = MagicMock()
            yield Worker(mock_db, mock_llm)

    def test_delegates_to_semantic_diffs_storage_mark_job_failed(self, worker):
        """Delegates to semantic_diffs_storage.mark_job_failed."""
        job = {"_id": "job-1"}

        worker._mark_diff_job_failed(job, "Error message")

        worker.semantic_diffs_storage.mark_job_failed.assert_called_once_with("job-1", "Error message")


class TestWorkerRun:
    """Test Worker.run method."""

    @pytest.fixture
    def worker(self):
        """Create a worker instance with mocked dependencies."""
        with patch('workers.signal.signal'), \
             patch('workers.SubmissionsStorage'), \
             patch('workers.SemanticDiffsStorage'):
            mock_db = MagicMock()
            mock_llm = MagicMock()
            yield Worker(mock_db, mock_llm)

    def test_logs_worker_start_message(self, worker, caplog):
        """Logs worker start message."""
        worker.running = False  # Stop immediately

        with caplog.at_level("INFO"):
            worker.run()

        assert "started" in caplog.text
        assert worker.worker_id in caplog.text

    def test_loops_while_running_true(self, worker):
        """Loops while running=True."""
        call_count = [0]

        def mock_claim_task():
            call_count[0] += 1
            if call_count[0] >= 3:
                worker.running = False
            return None

        worker.claim_task = mock_claim_task
        worker.claim_diff_job = MagicMock(return_value=None)

        with patch('workers.time.sleep'):
            worker.run()

        # Should have looped at least 3 times
        assert call_count[0] >= 3

    def test_attempts_to_claim_task_first(self, worker):
        """Attempts to claim task first."""
        mock_task = {"_id": "task-1", "task_type": "split_topic_generation", "submission_id": "sub-1"}
        mock_claim_task = MagicMock(return_value=mock_task)
        mock_claim_diff_job = MagicMock(return_value=None)
        
        def claim_task_side_effect():
            worker.running = False
            return mock_task
        
        mock_claim_task.side_effect = claim_task_side_effect
        worker.claim_task = mock_claim_task
        worker.claim_diff_job = mock_claim_diff_job

        with patch.object(worker, 'process_task'):
            with patch('workers.time.sleep'):
                worker.run()

        mock_claim_task.assert_called_once()
        mock_claim_diff_job.assert_not_called()

    def test_attempts_to_claim_diff_job_if_no_task(self, worker):
        """If no task, attempts to claim diff job."""
        mock_diff_job = {"_id": "job-1", "pair_key": "pair-1"}
        call_count = [0]
        
        mock_claim_task = MagicMock(return_value=None)
        mock_claim_diff_job = MagicMock(return_value=mock_diff_job)
        
        def claim_diff_job_side_effect():
            call_count[0] += 1
            if call_count[0] > 1:
                worker.running = False
            return mock_diff_job
        
        mock_claim_diff_job.side_effect = claim_diff_job_side_effect
        worker.claim_task = mock_claim_task
        worker.claim_diff_job = mock_claim_diff_job

        with patch.object(worker, 'process_diff_job'):
            with patch('workers.time.sleep'):
                worker.run()

        assert mock_claim_task.call_count >= 1
        assert mock_claim_diff_job.call_count >= 1

    def test_sleeps_if_no_jobs_available(self, worker):
        """If no jobs, sleeps for poll_interval."""
        call_count = [0]
        
        def mock_claim_task():
            call_count[0] += 1
            if call_count[0] > 1:
                worker.running = False
            return None
            
        def mock_claim_diff_job():
            return None
        
        worker.claim_task = mock_claim_task
        worker.claim_diff_job = mock_claim_diff_job

        with patch('workers.time.sleep') as mock_sleep:
            worker.run(poll_interval=5)

            mock_sleep.assert_called_with(5)

    def test_processes_claimed_task(self, worker):
        """Processes claimed task."""
        mock_task = {"_id": "task-1", "task_type": "split_topic_generation", "submission_id": "sub-1"}
        
        def mock_claim_task():
            worker.running = False
            return mock_task
        
        worker.claim_task = mock_claim_task
        worker.claim_diff_job = MagicMock(return_value=None)

        with patch.object(worker, 'process_task') as mock_process:
            with patch('workers.time.sleep'):
                worker.run()

            mock_process.assert_called_once_with(mock_task)

    def test_processes_claimed_diff_job(self, worker):
        """Processes claimed diff job."""
        mock_diff_job = {"_id": "job-1", "pair_key": "pair-1"}
        call_count = [0]
        
        def mock_claim_task():
            call_count[0] += 1
            return None
            
        def mock_claim_diff_job():
            if call_count[0] > 0:
                worker.running = False
            return mock_diff_job
        
        worker.claim_task = mock_claim_task
        worker.claim_diff_job = mock_claim_diff_job

        with patch.object(worker, 'process_diff_job') as mock_process:
            with patch('workers.time.sleep'):
                worker.run()

            mock_process.assert_called_once_with(mock_diff_job)

    def test_catches_unexpected_errors_and_continues(self, worker, caplog):
        """Catches unexpected errors and continues."""
        call_count = [0]

        def mock_claim_task():
            call_count[0] += 1
            if call_count[0] == 1:
                raise Exception("Unexpected error")
            worker.running = False
            return None

        worker.claim_task = mock_claim_task
        worker.claim_diff_job = MagicMock(return_value=None)

        with patch('workers.time.sleep'):
            with caplog.at_level("ERROR"):
                worker.run()

        assert "Unexpected error in worker loop" in caplog.text
        assert call_count[0] >= 2  # Should have continued after error

    def test_logs_worker_stop_message(self, worker, caplog):
        """Logs worker stop message."""
        worker.running = False

        with caplog.at_level("INFO"):
            worker.run()

        assert "stopped" in caplog.text
        assert worker.worker_id in caplog.text

    def test_exits_gracefully_when_running_false(self, worker):
        """Exits gracefully when running=False."""
        worker.running = False
        worker.claim_task = MagicMock()

        with patch('workers.time.sleep'):
            worker.run()

        # When running is False from start, the while loop condition is False
        # so claim_task should never be called
        worker.claim_task.assert_not_called()
