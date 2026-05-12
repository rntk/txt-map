"""Unit tests for workers module."""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from bson import ObjectId

from workers import TASK_DEPENDENCIES, TASK_HANDLERS, TASK_PRIORITIES, Worker


@pytest.fixture
def mock_db() -> MagicMock:
    db = MagicMock()
    db.task_queue = MagicMock()
    return db


@pytest.fixture
def worker(mock_db: MagicMock) -> Worker:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        return Worker(mock_db)


def test_task_constants_are_consistent() -> None:
    assert set(TASK_HANDLERS) == set(TASK_DEPENDENCIES) == set(TASK_PRIORITIES)
    assert TASK_DEPENDENCIES["split_topic_generation"] == []
    assert TASK_DEPENDENCIES["subtopics_generation"] == ["split_topic_generation"]
    assert TASK_DEPENDENCIES["mindmap"] == ["subtopics_generation"]
    assert TASK_PRIORITIES["split_topic_generation"] == 1
    assert TASK_PRIORITIES["subtopics_generation"] == 2
    assert all(callable(handler) for handler in TASK_HANDLERS.values())


def test_worker_init(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    assert w.worker_id.startswith("worker-")
    assert w.running is True


def test_worker_signal_handler(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    w._signal_handler(15, None)
    assert w.running is False


def test_worker_record_heartbeat(mock_db: MagicMock) -> None:
    with (
        patch("workers.Path.touch") as mock_touch,
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db, heartbeat_file="/tmp/hb")
        w._record_heartbeat()
        mock_touch.assert_called_once()


def test_dependencies_met_no_deps(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    task = {"task_type": "split_topic_generation", "submission_id": "sub-1"}
    assert w._dependencies_met(task) is True


def test_dependencies_met_all_met(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    w.submissions_storage.get_by_id.return_value = {
        "tasks": {
            "split_topic_generation": {"status": "completed"},
        }
    }
    task = {"task_type": "subtopics_generation", "submission_id": "sub-1"}
    assert w._dependencies_met(task) is True


def test_dependencies_met_not_met(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    w.submissions_storage.get_by_id.return_value = {
        "tasks": {
            "split_topic_generation": {"status": "pending"},
        }
    }
    task = {"task_type": "subtopics_generation", "submission_id": "sub-1"}
    assert w._dependencies_met(task) is False


def test_dependencies_met_submission_not_found(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    w.submissions_storage.get_by_id.return_value = None
    task = {"task_type": "subtopics_generation", "submission_id": "sub-1"}
    assert w._dependencies_met(task) is False


def test_claim_task_found(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    task = {
        "_id": ObjectId(),
        "task_type": "split_topic_generation",
        "submission_id": "sub-1",
        "lease_id": "lease-1",
    }
    mock_db.task_queue.find_one_and_update.return_value = task
    w.submissions_storage.get_by_id.return_value = {"tasks": {}}
    result = w.claim_task()
    assert result == task
    query = mock_db.task_queue.find_one_and_update.call_args.args[0]
    update = mock_db.task_queue.find_one_and_update.call_args.args[1]
    assert query["task_type"] == "split_topic_generation"
    assert query["$or"][0]["status"] == "pending"
    assert query["$or"][1]["status"] == "processing"
    assert update["$set"]["status"] == "processing"
    assert update["$set"]["worker_id"] == w.worker_id
    assert "lease_id" in update["$set"]
    assert "lease_expires_at" in update["$set"]


def test_claim_task_tries_task_types_in_priority_order(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    mock_db.task_queue.find_one_and_update.return_value = None

    assert w.claim_task() is None

    claimed_task_types = [
        call.args[0]["task_type"]
        for call in mock_db.task_queue.find_one_and_update.call_args_list
    ]
    assert claimed_task_types == sorted(
        TASK_HANDLERS,
        key=lambda task_type: TASK_PRIORITIES.get(task_type, 99),
    )


def test_claim_task_dependencies_not_met(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    task = {
        "_id": ObjectId(),
        "task_type": "subtopics_generation",
        "submission_id": "sub-1",
        "lease_id": "lease-1",
    }
    mock_db.task_queue.find_one_and_update.side_effect = [task] + [None] * len(
        TASK_HANDLERS
    )
    w.submissions_storage.get_by_id.return_value = {
        "tasks": {"split_topic_generation": {"status": "pending"}}
    }
    result = w.claim_task()
    assert result is None
    query = mock_db.task_queue.update_one.call_args.args[0]
    update = mock_db.task_queue.update_one.call_args.args[1]
    assert query == {
        "_id": task["_id"],
        "worker_id": w.worker_id,
        "lease_id": "lease-1",
        "status": "processing",
    }
    assert update["$set"]["status"] == "pending"
    assert update["$set"]["started_at"] is None
    assert update["$set"]["worker_id"] is None
    assert update["$set"]["lease_id"] is None
    assert update["$set"]["lease_expires_at"] is None
    assert "blocked_until" in update["$set"]


def test_claim_task_none_available(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    mock_db.task_queue.find_one_and_update.return_value = None
    result = w.claim_task()
    assert result is None


def test_claim_diff_job(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    w.semantic_diffs_storage.claim_job.return_value = {"job_id": "j1"}
    result = w.claim_diff_job()
    assert result == {"job_id": "j1"}


def test_mark_task_completed(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    task: dict[str, Any] = {
        "_id": ObjectId(),
        "submission_id": "sub-1",
        "task_type": "split",
        "lease_id": "lease-1",
    }
    mock_db.task_queue.update_one.return_value.matched_count = 1
    mock_db.task_queue.delete_one.return_value.deleted_count = 1
    w._mark_task_completed(task)
    update_query = mock_db.task_queue.update_one.call_args.args[0]
    assert update_query == {
        "_id": task["_id"],
        "worker_id": w.worker_id,
        "lease_id": "lease-1",
        "status": "processing",
    }
    mock_db.task_queue.delete_one.assert_called_once_with(
        {
            "_id": task["_id"],
            "worker_id": w.worker_id,
            "lease_id": "lease-1",
            "status": "completed",
        }
    )
    w.submissions_storage.update_task_status.assert_called_once_with(
        "sub-1", "split", "completed"
    )


def test_mark_task_completed_does_not_delete_when_submission_update_fails(
    mock_db: MagicMock,
) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)

    task: dict[str, Any] = {
        "_id": ObjectId(),
        "submission_id": "sub-1",
        "task_type": "split",
        "lease_id": "lease-1",
    }
    mock_db.task_queue.update_one.return_value.matched_count = 1
    w.submissions_storage.update_task_status.side_effect = RuntimeError(
        "submission write failed"
    )

    with pytest.raises(RuntimeError, match="submission write failed"):
        w._mark_task_completed(task)

    mock_db.task_queue.delete_one.assert_not_called()


def test_mark_task_failed(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    task = {
        "_id": ObjectId(),
        "submission_id": "sub-1",
        "task_type": "split",
        "lease_id": "lease-1",
    }
    mock_db.task_queue.update_one.return_value.matched_count = 1
    w._mark_task_failed(task, "boom")
    update_query = mock_db.task_queue.update_one.call_args.args[0]
    update_doc = mock_db.task_queue.update_one.call_args.args[1]
    assert update_query == {
        "_id": task["_id"],
        "worker_id": w.worker_id,
        "lease_id": "lease-1",
        "status": "processing",
    }
    assert update_doc["$set"]["status"] == "failed"
    assert update_doc["$set"]["error"] == "boom"
    assert update_doc["$inc"] == {"retry_count": 1}
    w.submissions_storage.update_task_status.assert_called_once_with(
        "sub-1", "split", "failed", error="boom"
    )


def test_mark_diff_job_completed(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    w._mark_diff_job_completed({"_id": "job1"})
    w.semantic_diffs_storage.mark_job_completed.assert_called_once_with("job1")


def test_mark_diff_job_failed(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    w._mark_diff_job_failed({"_id": "job1"}, "error")
    w.semantic_diffs_storage.mark_job_failed.assert_called_once_with("job1", "error")


def test_process_diff_job_invalid_payload(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    w.process_diff_job({"_id": "job1"})
    w.semantic_diffs_storage.mark_job_failed.assert_called_once()


def test_process_diff_job_submissions_missing(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    w.submissions_storage.get_by_id.return_value = None
    w.process_diff_job(
        {
            "_id": "job1",
            "pair_key": "pk",
            "submission_a_id": "a",
            "submission_b_id": "b",
        }
    )
    w.semantic_diffs_storage.mark_job_failed.assert_called_once()


def test_process_task_no_handler(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    with patch("workers.create_llm_client"):
        w.process_task(
            {
                "_id": ObjectId(),
                "task_type": "unknown_task",
                "submission_id": "sub-1",
                "lease_id": "lease-1",
            }
        )
    w.submissions_storage.update_task_status.assert_any_call(
        "sub-1",
        "unknown_task",
        "failed",
        error="No handler for task type: unknown_task",
    )


def test_process_task_submission_not_found(mock_db: MagicMock) -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(mock_db)
    w.submissions_storage.get_by_id.return_value = None
    with patch("workers.create_llm_client", return_value=MagicMock()):
        w.process_task(
            {
                "_id": ObjectId(),
                "task_type": "split_topic_generation",
                "submission_id": "sub-1",
                "lease_id": "lease-1",
            }
        )
    w.submissions_storage.update_task_status.assert_any_call(
        "sub-1", "split_topic_generation", "failed", error="Submission sub-1 not found"
    )
