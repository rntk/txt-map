"""Unit tests for workers main() and run() methods."""

from unittest.mock import MagicMock, patch

from bson import ObjectId

from workers import Worker, main


def test_worker_run_claims_task() -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(MagicMock())

    task = {
        "_id": ObjectId(),
        "task_type": "split_topic_generation",
        "submission_id": "sub-1",
    }
    w.claim_task = MagicMock(return_value=task)
    w.process_task = MagicMock()
    w.running = True

    # Stop after one iteration
    def stop_after_one():
        w.running = False

    w.process_task.side_effect = lambda t: stop_after_one()
    w.run(poll_interval=0.01)
    w.process_task.assert_called_once_with(task)


def test_worker_run_claims_diff_job() -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(MagicMock())

    w.claim_task = MagicMock(return_value=None)
    job = {"job_id": "j1"}
    w.claim_diff_job = MagicMock(return_value=job)
    w.process_diff_job = MagicMock()
    w.running = True

    def stop_after_one():
        w.running = False

    w.process_diff_job.side_effect = lambda j: stop_after_one()
    w.run(poll_interval=0.01)
    w.process_diff_job.assert_called_once_with(job)


def test_worker_run_no_jobs() -> None:
    with (
        patch("workers.signal.signal"),
        patch("workers.SubmissionsStorage") as mock_sub,
        patch("workers.SemanticDiffsStorage") as mock_diff,
    ):
        mock_sub.return_value = MagicMock()
        mock_diff.return_value = MagicMock()
        w = Worker(MagicMock())

    w.claim_task = MagicMock(return_value=None)
    w.claim_diff_job = MagicMock(return_value=None)
    w.running = True

    # Stop after first sleep
    call_count = 0

    def stop_after_sleep(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count >= 1:
            w.running = False

    with patch("workers.time.sleep", side_effect=stop_after_sleep):
        w.run(poll_interval=0.01)

    assert call_count == 1


@patch("workers.MongoClient")
@patch("workers.create_llm_client")
@patch("workers.SubmissionsStorage")
@patch("workers.SemanticDiffsStorage")
@patch("workers.MongoLLMCacheStore")
@patch("workers.LLMQueueStore")
@patch("workers.Worker")
def test_main(
    mock_worker_cls: MagicMock,
    mock_queue: MagicMock,
    mock_cache: MagicMock,
    mock_diff: MagicMock,
    mock_sub: MagicMock,
    mock_create_llm: MagicMock,
    mock_mongo: MagicMock,
) -> None:
    with (
        patch.dict("os.environ", {"MONGODB_URL": "mongodb://localhost:8765/"}),
        patch("workers.signal.signal"),
    ):
        mock_worker = MagicMock()
        mock_worker_cls.return_value = mock_worker
        main()
    mock_mongo.assert_called_once_with("mongodb://localhost:8765/")
    mock_worker_cls.assert_called_once()
    mock_worker.run.assert_called_once()
