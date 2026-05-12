"""
Background worker for processing submission tasks
"""

import logging
import os
import signal
import threading
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import FrameType
from typing import Any, Callable
from uuid import uuid4

from pymongo import MongoClient
from pymongo.database import Database

from lib.constants import TASK_DEPENDENCIES, TASK_PRIORITIES, TASKS_USING_LLM_CACHE
from lib.diff.semantic_diff import (
    ALGORITHM_VERSION,
    check_submission_topic_readiness,
    compute_topic_aware_semantic_diff,
    stale_reasons,
)
from lib.llm import create_llm_client
from lib.llm_queue import LLMQueueStore, QueuedLLMClient
from lib.storage.llm_cache import MongoLLMCacheStore
from lib.storage.semantic_diffs import SemanticDiffsStorage
from lib.storage.submissions import SubmissionsStorage
from lib.storage.task_queue import (
    DEFAULT_TASK_LEASE_SECONDS,
    DEPENDENCY_BLOCK_SECONDS,
    TaskDocument,
    TaskQueueStorage,
)

# Task handlers
from lib.tasks.split_topic_generation import process_split_topic_generation
from lib.tasks.subtopics_generation import process_subtopics_generation
from lib.tasks.summarization import process_summarization
from lib.tasks.mindmap import process_mindmap
from lib.tasks.prefix_tree import process_prefix_tree
from lib.tasks.insights_generation import process_insights_generation
from lib.tasks.markup_generation import process_markup_generation
from lib.tasks.topic_marker_summary_generation import (
    process_topic_marker_summary_generation,
)
from lib.tasks.topic_temperature_generation import (
    process_topic_temperature_generation,
)
from lib.tasks.topic_tag_ranking_generation import (
    process_topic_tag_ranking_generation,
)
from lib.tasks.clustering_generation import process_clustering_generation
from lib.tasks.topic_modeling_generation import process_topic_modeling_generation

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("worker")

# Task handlers mapping
TaskHandler = Callable[..., Any]
TASK_HANDLERS: dict[str, TaskHandler] = {
    "split_topic_generation": process_split_topic_generation,
    "subtopics_generation": process_subtopics_generation,
    "summarization": process_summarization,
    "mindmap": process_mindmap,
    "prefix_tree": process_prefix_tree,
    "insights_generation": process_insights_generation,
    "markup_generation": process_markup_generation,
    "topic_marker_summary_generation": process_topic_marker_summary_generation,
    "topic_temperature_generation": process_topic_temperature_generation,
    "topic_tag_ranking_generation": process_topic_tag_ranking_generation,
    "clustering_generation": process_clustering_generation,
    "topic_modeling_generation": process_topic_modeling_generation,
}


class _TaskLeaseHeartbeat:
    """Renews task_queue.lease_expires_at while a task is running."""

    def __init__(
        self,
        task_queue_storage: TaskQueueStorage,
        task_id: Any,
        worker_id: str,
        lease_id: str,
        *,
        lease_seconds: int,
        interval_seconds: float,
    ) -> None:
        self._task_queue_storage = task_queue_storage
        self._task_id = task_id
        self._worker_id = worker_id
        self._lease_id = lease_id
        self._lease_seconds = lease_seconds
        self._interval_seconds = interval_seconds
        self._stop_event = threading.Event()
        self._lost_lease = False
        self._thread = threading.Thread(target=self._run, daemon=True)

    @property
    def lost_lease(self) -> bool:
        return self._lost_lease

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._thread.join()

    def _run(self) -> None:
        while not self._stop_event.wait(self._interval_seconds):
            try:
                renewed = self._task_queue_storage.renew_lease(
                    self._task_id,
                    self._worker_id,
                    self._lease_id,
                    lease_seconds=self._lease_seconds,
                )
                if not renewed:
                    logger.warning(
                        "Worker %s lost lease for task %s",
                        self._worker_id,
                        self._task_id,
                    )
                    self._lost_lease = True
                    self._stop_event.set()
                    return
            except Exception:
                logger.warning(
                    "Failed to renew task lease for %s", self._task_id, exc_info=True
                )


class Worker:
    def __init__(
        self,
        db: Database,
        cache_store: MongoLLMCacheStore | None = None,
        queue_store: LLMQueueStore | None = None,
        heartbeat_file: str | None = None,
        task_queue_storage: TaskQueueStorage | None = None,
        task_lease_seconds: int = DEFAULT_TASK_LEASE_SECONDS,
        register_signal_handlers: bool = True,
    ) -> None:
        self.db = db
        self.cache_store = cache_store
        self.queue_store = queue_store
        self.running = True
        self.worker_id = f"worker-{os.getpid()}-{uuid4().hex[:8]}"
        self.submissions_storage = SubmissionsStorage(db)
        self.semantic_diffs_storage = SemanticDiffsStorage(db)
        self.task_queue_storage = task_queue_storage or TaskQueueStorage(db)
        self.heartbeat_file = heartbeat_file
        self.task_lease_seconds = task_lease_seconds
        self.lease_renewal_interval = max(1.0, task_lease_seconds / 3)

        if register_signal_handlers:
            signal.signal(signal.SIGINT, self._signal_handler)
            signal.signal(signal.SIGTERM, self._signal_handler)

    def _signal_handler(self, signum: int, frame: FrameType | None) -> None:
        """Handle shutdown signals gracefully"""
        logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.running = False

    def _record_heartbeat(self) -> None:
        """Update the heartbeat file timestamp."""
        if self.heartbeat_file:
            try:
                Path(self.heartbeat_file).touch()
            except Exception:
                logger.warning(f"Failed to record heartbeat at {self.heartbeat_file}")

    def _dependencies_met(self, task: TaskDocument) -> bool:
        """Check if all dependency tasks are completed"""
        deps = TASK_DEPENDENCIES.get(task["task_type"], [])
        if not deps:
            return True

        submission = self.submissions_storage.get_by_id(task["submission_id"])
        if not submission:
            logger.warning(f"Submission {task['submission_id']} not found")
            return False

        for dep in deps:
            task_status = submission["tasks"].get(dep, {}).get("status")
            if task_status != "completed":
                logger.debug(
                    f"Task {task['task_type']} blocked - dependency {dep} is {task_status}"
                )
                return False

        return True

    def claim_task(self) -> TaskDocument | None:
        """
        Atomically claim a pending task from the queue.
        Returns the task document if claimed, None otherwise.
        """
        task_types = sorted(
            TASK_HANDLERS.keys(), key=lambda t: TASK_PRIORITIES.get(t, 99)
        )

        while True:
            now = datetime.now(UTC)
            task = self.task_queue_storage.claim_next_task(
                self.worker_id,
                task_types,
                lease_seconds=self.task_lease_seconds,
                now=now,
            )

            if not task:
                return None

            if self._dependencies_met(task):
                logger.info(
                    f"Claimed task {task['task_type']} for submission {task['submission_id']}"
                )
                return task

            # Dependencies not met — put back with a short cooldown so this task
            # isn't re-claimed on the very next poll cycle.
            self.task_queue_storage.release_claim(
                task["_id"],
                self.worker_id,
                task["lease_id"],
                now + timedelta(seconds=DEPENDENCY_BLOCK_SECONDS),
            )

    def claim_diff_job(self) -> dict[str, Any] | None:
        """
        Atomically claim a pending semantic diff job.
        Returns the job document if claimed, None otherwise.
        """
        return self.semantic_diffs_storage.claim_job(self.worker_id)

    def process_task(self, task: TaskDocument) -> None:
        """Execute the task handler"""
        task_type = task["task_type"]
        submission_id = task["submission_id"]

        handler = TASK_HANDLERS.get(task_type)
        if not handler:
            logger.error(f"No handler found for task type: {task_type}")
            self._mark_task_failed(task, f"No handler for task type: {task_type}")
            return

        lease_heartbeat = _TaskLeaseHeartbeat(
            self.task_queue_storage,
            task["_id"],
            self.worker_id,
            task["lease_id"],
            lease_seconds=self.task_lease_seconds,
            interval_seconds=self.lease_renewal_interval,
        )
        lease_heartbeat.start()

        try:
            logger.info(f"Processing {task_type} for submission {submission_id}")
            llm_meta = create_llm_client(db=self.db)
            logger.debug(
                f"Using LLM provider: {llm_meta.provider_name}, model: {llm_meta.model_name}"
            )

            if self.queue_store is not None:
                # Queued path: dispatch LLM calls through llm_queue so that
                # llm_workers.py executes them (potentially in parallel).
                llm = QueuedLLMClient(
                    store=self.queue_store,
                    model_id=llm_meta.model_id,
                    max_context_tokens=llm_meta.max_context_tokens,
                    provider_key=llm_meta.provider_key,
                    provider_name=llm_meta.provider_name,
                    model_name=llm_meta.model_name,
                    cache_store=self.cache_store,
                )
            else:
                logger.warning(
                    "No queue_store configured — falling back to synchronous LLM calls. "
                    "Start llm_workers.py for parallel execution."
                )
                llm = llm_meta

            self.submissions_storage.update_task_status(
                submission_id, task_type, "processing"
            )

            submission = self.submissions_storage.get_by_id(submission_id)
            if not submission:
                raise ValueError(f"Submission {submission_id} not found")

            if task_type in TASKS_USING_LLM_CACHE:
                handler(submission, self.db, llm, cache_store=self.cache_store)
            else:
                handler(submission, self.db, llm)

            lease_heartbeat.stop()
            if lease_heartbeat.lost_lease:
                logger.warning(
                    "Skipping completion for %s on submission %s because the lease was lost",
                    task_type,
                    submission_id,
                )
                return

            self._mark_task_completed(task)
            logger.info(f"Completed {task_type} for submission {submission_id}")

        except Exception as e:
            logger.error(
                f"Error processing {task_type} for submission {submission_id}: {e}",
                exc_info=True,
            )
            lease_heartbeat.stop()
            if lease_heartbeat.lost_lease:
                logger.warning(
                    "Skipping failure update for %s on submission %s because the lease was lost",
                    task_type,
                    submission_id,
                )
                return
            self._mark_task_failed(task, str(e))
        finally:
            lease_heartbeat.stop()

    def _mark_task_completed(self, task: TaskDocument) -> None:
        """Mark task as completed in both task_queue and submission, then remove from DB"""
        marked = self.task_queue_storage.mark_completed(
            task["_id"],
            self.worker_id,
            task["lease_id"],
        )
        if not marked:
            logger.warning(
                "Could not mark task %s completed because the lease is no longer valid",
                task["_id"],
            )
            return

        self.submissions_storage.update_task_status(
            task["submission_id"], task["task_type"], "completed"
        )
        self.task_queue_storage.delete_completed(
            task["_id"],
            self.worker_id,
            task["lease_id"],
        )

    def _mark_task_failed(self, task: TaskDocument, error_msg: str) -> None:
        """Mark task as failed in both task_queue and submission"""
        marked = self.task_queue_storage.mark_failed(
            task["_id"],
            self.worker_id,
            task["lease_id"],
            error_msg,
        )
        if not marked:
            logger.warning(
                "Could not mark task %s failed because the lease is no longer valid",
                task["_id"],
            )
            return

        # Update submission
        self.submissions_storage.update_task_status(
            task["submission_id"], task["task_type"], "failed", error=error_msg
        )

    def process_diff_job(self, job: dict[str, Any]) -> None:
        """Compute and persist a topic-aware semantic diff job."""
        pair_key = job.get("pair_key")
        submission_a_id = job.get("submission_a_id")
        submission_b_id = job.get("submission_b_id")
        force_recalculate = bool(job.get("force_recalculate"))

        if not pair_key or not submission_a_id or not submission_b_id:
            self._mark_diff_job_failed(job, "Invalid job payload")
            return

        try:
            submission_a = self.submissions_storage.get_by_id(submission_a_id)
            submission_b = self.submissions_storage.get_by_id(submission_b_id)
            if not submission_a or not submission_b:
                raise ValueError("One or both submissions no longer exist")

            readiness_a = check_submission_topic_readiness(submission_a)
            readiness_b = check_submission_topic_readiness(submission_b)
            if not readiness_a["ready"] or not readiness_b["ready"]:
                raise ValueError(
                    "Topic prerequisites are not ready: "
                    f"left={readiness_a['missing']}, right={readiness_b['missing']}"
                )

            if not force_recalculate:
                existing_diff = self.semantic_diffs_storage.get_diff_by_pair_key(
                    pair_key
                )
                if existing_diff:
                    reasons = stale_reasons(
                        existing_diff,
                        submission_a,
                        submission_b,
                        algorithm_version=ALGORITHM_VERSION,
                    )
                    if not reasons:
                        self._mark_diff_job_completed(job)
                        logger.info(
                            "Skipped semantic diff job %s (%s vs %s): diff is already up to date",
                            job.get("job_id"),
                            submission_a_id,
                            submission_b_id,
                        )
                        return

            payload = compute_topic_aware_semantic_diff(submission_a, submission_b)

            self.semantic_diffs_storage.upsert_diff(
                pair_key=pair_key,
                submission_a_id=submission_a_id,
                submission_b_id=submission_b_id,
                algorithm_version=ALGORITHM_VERSION,
                submission_a_updated_at=submission_a.get("updated_at"),
                submission_b_updated_at=submission_b.get("updated_at"),
                payload=payload,
            )
            self._mark_diff_job_completed(job)
            logger.info(
                "Completed semantic diff job %s (%s vs %s)",
                job.get("job_id"),
                submission_a_id,
                submission_b_id,
            )
        except Exception as exc:
            logger.error(
                "Error processing semantic diff job %s: %s",
                job.get("job_id"),
                exc,
                exc_info=True,
            )
            self._mark_diff_job_failed(job, str(exc))

    def _mark_diff_job_completed(self, job: dict[str, Any]) -> None:
        self.semantic_diffs_storage.mark_job_completed(job["_id"])

    def _mark_diff_job_failed(self, job: dict[str, Any], error_msg: str) -> None:
        self.semantic_diffs_storage.mark_job_failed(job["_id"], error_msg)

    def run(self, poll_interval: int = 2) -> None:
        """Main worker loop"""
        logger.info(f"Worker {self.worker_id} started")

        while self.running:
            self._record_heartbeat()
            try:
                task = self.claim_task()

                if task:
                    self.process_task(task)
                else:
                    diff_job = self.claim_diff_job()
                    if diff_job:
                        self.process_diff_job(diff_job)
                    else:
                        # No jobs available, sleep for a bit
                        time.sleep(poll_interval)

            except Exception as e:
                logger.error(f"Unexpected error in worker loop: {e}", exc_info=True)
                time.sleep(poll_interval)

        logger.info(f"Worker {self.worker_id} stopped")


def main() -> None:
    """Main entry point for the worker process"""
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:8765/")
    heartbeat_file = os.getenv("WORKER_HEARTBEAT_FILE")

    logger.info(f"Connecting to MongoDB: {mongodb_url}")

    client: MongoClient = MongoClient(mongodb_url)
    db = client["rss"]

    SubmissionsStorage(db).prepare()
    SemanticDiffsStorage(db).prepare()
    task_queue_storage = TaskQueueStorage(db)
    task_queue_storage.prepare()
    cache_store = MongoLLMCacheStore(db)
    cache_store.prepare()
    queue_store = LLMQueueStore(db)
    queue_store.prepare()
    worker = Worker(
        db,
        cache_store=cache_store,
        queue_store=queue_store,
        heartbeat_file=heartbeat_file,
        task_queue_storage=task_queue_storage,
    )

    try:
        worker.run()
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt, shutting down...")
    finally:
        client.close()


if __name__ == "__main__":
    main()
