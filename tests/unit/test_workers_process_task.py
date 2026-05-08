"""Direct tests for Worker.process_task to cover remaining lines."""

from unittest.mock import MagicMock, patch

from workers import TASK_HANDLERS, Worker


def test_process_task_without_queue_store() -> None:
    """Test process_task when queue_store is None (synchronous path)."""
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        db = MagicMock()
        w = Worker(db, llm=MagicMock(), cache_store=MagicMock())

    w.submissions_storage.get_by_id.return_value = {
        "submission_id": "sub-1",
        "tasks": {},
        "results": {"sentences": ["s1"], "topics": [{"name": "A", "sentences": [1]}]},
    }

    original_handler = TASK_HANDLERS["split_topic_generation"]
    handler = MagicMock()
    TASK_HANDLERS["split_topic_generation"] = handler
    try:
        with patch("workers.create_llm_client", return_value=MagicMock()):
            w.process_task(
                {
                    "_id": "t1",
                    "task_type": "split_topic_generation",
                    "submission_id": "sub-1",
                }
            )
    finally:
        TASK_HANDLERS["split_topic_generation"] = original_handler

    handler.assert_called_once()
    call_kwargs = handler.call_args.kwargs
    assert "cache_store" in call_kwargs


def test_process_task_non_cache_task() -> None:
    """Test process_task for a task NOT in cache_tasks."""
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        db = MagicMock()
        w = Worker(db, llm=MagicMock())

    w.submissions_storage.get_by_id.return_value = {
        "submission_id": "sub-1",
        "tasks": {},
    }

    original_handler = TASK_HANDLERS["clustering_generation"]
    handler = MagicMock()
    TASK_HANDLERS["clustering_generation"] = handler
    try:
        with patch("workers.create_llm_client", return_value=MagicMock()):
            w.process_task(
                {
                    "_id": "t1",
                    "task_type": "clustering_generation",
                    "submission_id": "sub-1",
                }
            )
    finally:
        TASK_HANDLERS["clustering_generation"] = original_handler

    handler.assert_called_once()
    call_kwargs = handler.call_args.kwargs
    assert "cache_store" not in call_kwargs
