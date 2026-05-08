"""Additional unit tests for workers module."""

from unittest.mock import MagicMock, patch

from workers import Worker


def test_process_task_with_cache_store() -> None:
    """Test process_task with a task that uses cache_store."""
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(MagicMock(), llm=MagicMock(), cache_store=MagicMock())

    w.submissions_storage.get_by_id.return_value = {
        "submission_id": "sub-1",
        "tasks": {},
        "results": {"sentences": ["s1"], "topics": [{"name": "A", "sentences": [1]}]},
    }

    handler = MagicMock()
    with (
        patch.dict("workers.TASK_HANDLERS", {"split_topic_generation": handler}),
        patch("workers.create_llm_client", return_value=MagicMock()),
        patch("workers.QueuedLLMClient") as mock_queued,
    ):
        mock_queued.return_value = MagicMock()
        w.process_task(
            {
                "_id": "t1",
                "task_type": "split_topic_generation",
                "submission_id": "sub-1",
            }
        )

    handler.assert_called_once()
    # Check that cache_store was passed
    call_kwargs = handler.call_args.kwargs
    assert "cache_store" in call_kwargs


def test_process_task_handler_error() -> None:
    """Test process_task when handler raises an exception."""
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(MagicMock())

    w.submissions_storage.get_by_id.return_value = {
        "submission_id": "sub-1",
        "tasks": {},
    }

    handler = MagicMock(side_effect=RuntimeError("handler error"))
    with (
        patch.dict("workers.TASK_HANDLERS", {"split_topic_generation": handler}),
        patch("workers.create_llm_client", return_value=MagicMock()),
    ):
        w.process_task(
            {
                "_id": "t1",
                "task_type": "split_topic_generation",
                "submission_id": "sub-1",
            }
        )

    w.submissions_storage.update_task_status.assert_any_call(
        "sub-1", "split_topic_generation", "failed", error="handler error"
    )
