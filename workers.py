"""
Background worker for processing submission tasks
"""
import time
import signal
import logging
import os
from datetime import datetime, UTC
from pymongo import MongoClient

from lib.diff.semantic_diff import (
    ALGORITHM_VERSION,
    check_submission_topic_readiness,
    compute_topic_aware_semantic_diff,
    stale_reasons,
)
from lib.llm import create_llm_client
from lib.storage.llm_cache import MongoLLMCacheStore
from lib.storage.semantic_diffs import SemanticDiffsStorage
from lib.storage.submissions import SubmissionsStorage

# Task handlers
from lib.tasks.split_topic_generation import process_split_topic_generation
from lib.tasks.subtopics_generation import process_subtopics_generation
from lib.tasks.summarization import process_summarization
from lib.tasks.mindmap import process_mindmap
from lib.tasks.prefix_tree import process_prefix_tree
from lib.tasks.insights_generation import process_insights_generation
from lib.tasks.storytelling_generation import process_storytelling_generation

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("worker")

# Task dependencies - tasks can only run if their dependencies are completed
TASK_DEPENDENCIES = {
    "split_topic_generation": [],
    "subtopics_generation": ["split_topic_generation"],
    "summarization": ["split_topic_generation"],
    "mindmap": ["subtopics_generation"],
    "prefix_tree": ["split_topic_generation"],
    "insights_generation": ["split_topic_generation"],
    "storytelling_generation": ["summarization", "mindmap", "insights_generation"],
}

# Task priorities (lower = higher priority)
TASK_PRIORITIES = {
    "split_topic_generation": 1,
    "subtopics_generation": 2,
    "summarization": 3,
    "mindmap": 3,
    "prefix_tree": 3,
    "insights_generation": 4,
    "storytelling_generation": 5,
}

# Task handlers mapping
TASK_HANDLERS = {
    "split_topic_generation": process_split_topic_generation,
    "subtopics_generation": process_subtopics_generation,
    "summarization": process_summarization,
    "mindmap": process_mindmap,
    "prefix_tree": process_prefix_tree,
    "insights_generation": process_insights_generation,
    "storytelling_generation": process_storytelling_generation,
}


class Worker:
    def __init__(self, db, llm=None, cache_store=None):
        self.db = db
        self.llm = llm
        self.cache_store = cache_store
        self.running = True
        self.worker_id = f"worker-{os.getpid()}"
        self.submissions_storage = SubmissionsStorage(db)
        self.semantic_diffs_storage = SemanticDiffsStorage(db)

        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully"""
        logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.running = False

    def _dependencies_met(self, task):
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

    def claim_task(self):
        """
        Atomically claim a pending task from the queue.
        Returns the task document if claimed, None otherwise.
        """
        # Try to claim tasks in priority order
        for task_type in sorted(TASK_HANDLERS.keys(), key=lambda t: TASK_PRIORITIES.get(t, 99)):
            task = self.db.task_queue.find_one_and_update(
                {
                    "status": "pending",
                    "task_type": task_type
                },
                {
                    "$set": {
                        "status": "processing",
                        "started_at": datetime.now(UTC),
                        "worker_id": self.worker_id
                    }
                },
                sort=[("priority", 1), ("created_at", 1)]
            )

            if task:
                # Check if dependencies are met
                if self._dependencies_met(task):
                    logger.info(
                        f"Claimed task {task['task_type']} for submission {task['submission_id']}"
                    )
                    return task
                else:
                    # Dependencies not met, put back as pending
                    self.db.task_queue.update_one(
                        {"_id": task["_id"]},
                        {
                            "$set": {
                                "status": "pending",
                                "started_at": None,
                                "worker_id": None
                            }
                        }
                    )

        return None

    def claim_diff_job(self):
        """
        Atomically claim a pending semantic diff job.
        Returns the job document if claimed, None otherwise.
        """
        return self.semantic_diffs_storage.claim_job(self.worker_id)

    def process_task(self, task):
        """Execute the task handler"""
        task_type = task["task_type"]
        submission_id = task["submission_id"]

        handler = TASK_HANDLERS.get(task_type)
        if not handler:
            logger.error(f"No handler found for task type: {task_type}")
            self._mark_task_failed(task, f"No handler for task type: {task_type}")
            return

        try:
            logger.info(f"Processing {task_type} for submission {submission_id}")
            llm = create_llm_client(db=self.db)
            logger.info(f"Using LLM provider: {llm.provider_name}, model: {llm.model_name}")

            # Update submission task status to processing
            self.submissions_storage.update_task_status(
                submission_id, task_type, "processing"
            )

            # Get submission document
            submission = self.submissions_storage.get_by_id(submission_id)
            if not submission:
                raise ValueError(f"Submission {submission_id} not found")

            # Execute the handler (pass cache_store to LLM-using tasks)
            cache_tasks = {"split_topic_generation", "subtopics_generation", "summarization", "insights_generation", "storytelling_generation"}
            if task_type in cache_tasks:
                handler(submission, self.db, llm, cache_store=self.cache_store)
            else:
                handler(submission, self.db, llm)

            # Mark task as completed
            self._mark_task_completed(task)
            logger.info(f"Completed {task_type} for submission {submission_id}")

        except Exception as e:
            logger.error(
                f"Error processing {task_type} for submission {submission_id}: {e}",
                exc_info=True
            )
            self._mark_task_failed(task, str(e))

    def _mark_task_completed(self, task):
        """Mark task as completed in both task_queue and submission, then remove from DB"""
        now = datetime.now(UTC)

        # Update task queue
        self.db.task_queue.update_one(
            {"_id": task["_id"]},
            {
                "$set": {
                    "status": "completed",
                    "completed_at": now
                }
            }
        )

        # Update submission
        self.submissions_storage.update_task_status(
            task["submission_id"],
            task["task_type"],
            "completed"
        )

        # Remove the completed task from the database
        self.db.task_queue.delete_one({"_id": task["_id"]})

    def _mark_task_failed(self, task, error_msg):
        """Mark task as failed in both task_queue and submission"""
        now = datetime.now(UTC)

        # Update task queue
        self.db.task_queue.update_one(
            {"_id": task["_id"]},
            {
                "$set": {
                    "status": "failed",
                    "completed_at": now,
                    "error": error_msg
                },
                "$inc": {"retry_count": 1}
            }
        )

        # Update submission
        self.submissions_storage.update_task_status(
            task["submission_id"],
            task["task_type"],
            "failed",
            error=error_msg
        )

    def process_diff_job(self, job):
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
                existing_diff = self.semantic_diffs_storage.get_diff_by_pair_key(pair_key)
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
            logger.error("Error processing semantic diff job %s: %s", job.get("job_id"), exc, exc_info=True)
            self._mark_diff_job_failed(job, str(exc))

    def _mark_diff_job_completed(self, job):
        self.semantic_diffs_storage.mark_job_completed(job["_id"])

    def _mark_diff_job_failed(self, job, error_msg):
        self.semantic_diffs_storage.mark_job_failed(job["_id"], error_msg)

    def run(self, poll_interval=2):
        """Main worker loop"""
        logger.info(f"Worker {self.worker_id} started")

        while self.running:
            try:
                # Try to claim and process a task
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


def main():
    """Main entry point for the worker process"""
    # Get configuration from environment
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:8765/")

    logger.info(f"Connecting to MongoDB: {mongodb_url}")

    # Initialize connections
    client = MongoClient(mongodb_url)
    db = client["rss"]
    llm = create_llm_client(db=db)
    logger.info(f"Initial LLM provider: {llm.provider_name}, model: {llm.model_name}")

    # Create and run worker
    SubmissionsStorage(db).prepare()
    SemanticDiffsStorage(db).prepare()
    cache_store = MongoLLMCacheStore(db)
    cache_store.prepare()
    worker = Worker(db, llm, cache_store=cache_store)

    try:
        worker.run()
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt, shutting down...")
    finally:
        client.close()


if __name__ == "__main__":
    main()
