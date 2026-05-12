from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from bson import ObjectId
from bson.objectid import ObjectId as ObjectIdType
from pymongo import ReturnDocument
from pymongo.database import Database

TaskDocument = dict[str, Any]
DEFAULT_TASK_LEASE_SECONDS = 60 * 60
DEPENDENCY_BLOCK_SECONDS = 10


def make_task_document(
    submission_id: str,
    task_type: str,
    priority: int = 3,  # pragma: no mutate
) -> TaskDocument:
    now: datetime = datetime.now(UTC)
    return {
        "submission_id": submission_id,
        "task_type": task_type,
        "priority": priority,
        "status": "pending",
        "created_at": now,
        "started_at": None,
        "completed_at": None,
        "worker_id": None,
        "lease_id": None,
        "lease_expires_at": None,
        "retry_count": 0,
        "error": None,
    }


class TaskQueueStorage:
    def __init__(self, db: Database) -> None:
        self._db: Database = db
        self._log = logging.getLogger("task_queue")

    def prepare(self) -> None:
        """Create indexes used by queue listing and worker claiming."""
        try:
            self._db.task_queue.create_index(
                [("status", 1), ("task_type", 1), ("priority", 1), ("created_at", 1)]
            )
            self._db.task_queue.create_index("lease_expires_at")
            self._db.task_queue.create_index("lease_id")
            self._db.task_queue.create_index("submission_id")
        except Exception as exc:
            self._log.warning("Failed to prepare task queue indexes: %s", exc)

    def list(
        self,
        filters: dict[str, Any] | None = None,
        limit: int = 100,  # pragma: no mutate
    ) -> list[TaskDocument]:
        """List task queue entries with optional filters, sorted by created_at desc."""
        return list(
            self._db.task_queue.find(filters or {}).sort("created_at", -1).limit(limit)
        )

    def get_by_id(self, task_id: str) -> TaskDocument | None:
        """Get a task queue entry by its ObjectId string. Raises ValueError on invalid ID."""
        return self._db.task_queue.find_one({"_id": self._parse_object_id(task_id)})

    def create(self, doc: TaskDocument) -> str:
        """Insert a task document and return the inserted ObjectId as a string."""
        return str(self._db.task_queue.insert_one(doc).inserted_id)

    def delete_by_id(self, task_id: str) -> bool:
        """Delete a task queue entry by its ObjectId string. Returns True if deleted."""
        result = self._db.task_queue.delete_one({"_id": self._parse_object_id(task_id)})
        return result.deleted_count > 0

    def delete_by_submission(
        self,
        submission_id: str,
        task_types: list[str] | None = None,
        statuses: list[str] | None = None,
    ) -> int:
        """Delete task queue entries for a submission. Returns deleted count."""
        query: dict[str, Any] = {"submission_id": submission_id}
        if task_types:
            query["task_type"] = {"$in": task_types}
        if statuses:
            query["status"] = {"$in": statuses}
        return self._db.task_queue.delete_many(query).deleted_count

    def claim_next_task(
        self,
        worker_id: str,
        task_types: Sequence[str],
        lease_seconds: int = DEFAULT_TASK_LEASE_SECONDS,
        now: datetime | None = None,
    ) -> TaskDocument | None:
        """Atomically claim the next pending or stale processing task."""
        claim_time = now or datetime.now(UTC)
        stale_started_before = claim_time - timedelta(seconds=lease_seconds)
        lease_expires_at = claim_time + timedelta(seconds=lease_seconds)

        for task_type in task_types:
            lease_id = str(uuid4())
            task = self._db.task_queue.find_one_and_update(
                self._claim_query(task_type, claim_time, stale_started_before),
                {
                    "$set": {
                        "status": "processing",
                        "started_at": claim_time,
                        "worker_id": worker_id,
                        "lease_id": lease_id,
                        "lease_expires_at": lease_expires_at,
                    },
                    "$unset": {"blocked_until": ""},
                },
                sort=[("priority", 1), ("created_at", 1)],
                return_document=ReturnDocument.AFTER,
            )
            if task:
                return task
        return None

    def renew_lease(
        self,
        task_id: ObjectIdType,
        worker_id: str,
        lease_id: str,
        lease_seconds: int = DEFAULT_TASK_LEASE_SECONDS,
        now: datetime | None = None,
    ) -> bool:
        """Extend lease_expires_at for an in-flight task. Returns False if the
        task is no longer owned by this worker (e.g. another worker took it over
        after the previous lease expired)."""
        claim_time = now or datetime.now(UTC)
        result = self._db.task_queue.update_one(
            {
                "_id": task_id,
                "worker_id": worker_id,
                "lease_id": lease_id,
                "status": "processing",
            },
            {
                "$set": {
                    "lease_expires_at": claim_time + timedelta(seconds=lease_seconds)
                }
            },
        )
        return bool(result.matched_count)

    def release_claim(
        self,
        task_id: ObjectIdType,
        worker_id: str,
        lease_id: str,
        blocked_until: datetime,
    ) -> bool:
        """Release a claimed task back to pending after dependencies are blocked."""
        result = self._db.task_queue.update_one(
            {
                "_id": task_id,
                "worker_id": worker_id,
                "lease_id": lease_id,
                "status": "processing",
            },
            {
                "$set": {
                    "status": "pending",
                    "started_at": None,
                    "worker_id": None,
                    "lease_id": None,
                    "lease_expires_at": None,
                    "blocked_until": blocked_until,
                }
            },
        )
        return bool(result.matched_count)

    def mark_completed(
        self,
        task_id: ObjectIdType,
        worker_id: str,
        lease_id: str,
        now: datetime | None = None,
    ) -> bool:
        """Mark a task completed if the same worker still owns the lease."""
        completed_at = now or datetime.now(UTC)
        result = self._db.task_queue.update_one(
            {
                "_id": task_id,
                "worker_id": worker_id,
                "lease_id": lease_id,
                "status": "processing",
            },
            {
                "$set": {
                    "status": "completed",
                    "completed_at": completed_at,
                    "lease_expires_at": None,
                }
            },
        )
        return bool(result.matched_count)

    def delete_completed(
        self,
        task_id: ObjectIdType,
        worker_id: str,
        lease_id: str,
    ) -> bool:
        """Remove a completed task if it was completed by the same lease."""
        result = self._db.task_queue.delete_one(
            {
                "_id": task_id,
                "worker_id": worker_id,
                "lease_id": lease_id,
                "status": "completed",
            }
        )
        return bool(result.deleted_count)

    def mark_failed(
        self,
        task_id: ObjectIdType,
        worker_id: str,
        lease_id: str,
        error_msg: str,
        now: datetime | None = None,
    ) -> bool:
        """Mark a task failed and record the error."""
        completed_at = now or datetime.now(UTC)
        result = self._db.task_queue.update_one(
            {
                "_id": task_id,
                "worker_id": worker_id,
                "lease_id": lease_id,
                "status": "processing",
            },
            {
                "$set": {
                    "status": "failed",
                    "completed_at": completed_at,
                    "error": error_msg,
                    "lease_expires_at": None,
                },
                "$inc": {"retry_count": 1},
            },
        )
        return bool(result.matched_count)

    def _claim_query(
        self,
        task_type: str,
        now: datetime,
        stale_started_before: datetime,
    ) -> dict[str, Any]:
        return {
            "task_type": task_type,
            "$or": [
                {
                    "status": "pending",
                    "$or": [
                        {"blocked_until": {"$exists": False}},
                        {"blocked_until": {"$lte": now}},
                    ],
                },
                {
                    "status": "processing",
                    "$or": [
                        {"lease_expires_at": {"$lte": now}},
                        {
                            "lease_expires_at": {"$exists": False},
                            "started_at": {"$lte": stale_started_before},
                        },
                    ],
                },
            ],
        }

    def _parse_object_id(self, task_id: str) -> ObjectIdType:
        try:
            return ObjectId(task_id)
        except Exception:
            raise ValueError(f"Invalid task ID: {task_id}") from None
