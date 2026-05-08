import logging
from datetime import datetime, UTC
from typing import Optional, List, Any

from bson import ObjectId
from pymongo.database import Database


def make_task_document(
    submission_id: str,
    task_type: str,
    priority: int = 3,  # pragma: no mutate
) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "submission_id": submission_id,
        "task_type": task_type,
        "priority": priority,
        "status": "pending",
        "created_at": now,
        "started_at": None,
        "completed_at": None,
        "worker_id": None,
        "retry_count": 0,
        "error": None,
    }


class TaskQueueStorage:
    def __init__(self, db: Database) -> None:
        self._db: Database = db
        self._log = logging.getLogger("task_queue")

    def list(
        self,
        filters: Optional[dict[str, Any]] = None,
        limit: int = 100,  # pragma: no mutate
    ) -> List[dict[str, Any]]:
        """List task queue entries with optional filters, sorted by created_at desc."""
        return list(
            self._db.task_queue.find(filters or {}).sort("created_at", -1).limit(limit)
        )

    def get_by_id(self, task_id: str) -> Optional[dict[str, Any]]:
        """Get a task queue entry by its ObjectId string. Raises ValueError on invalid ID."""
        try:
            obj_id = ObjectId(task_id)
        except Exception:
            raise ValueError(f"Invalid task ID: {task_id}")
        return self._db.task_queue.find_one({"_id": obj_id})

    def create(self, doc: dict[str, Any]) -> str:
        """Insert a task document and return the inserted ObjectId as a string."""
        result = self._db.task_queue.insert_one(doc)
        return str(result.inserted_id)

    def delete_by_id(self, task_id: str) -> bool:
        """Delete a task queue entry by its ObjectId string. Returns True if deleted."""
        try:
            obj_id = ObjectId(task_id)
        except Exception:
            raise ValueError(f"Invalid task ID: {task_id}")
        result = self._db.task_queue.delete_one({"_id": obj_id})
        return result.deleted_count > 0

    def delete_by_submission(
        self,
        submission_id: str,
        task_types: Optional[List[str]] = None,
        statuses: Optional[List[str]] = None,
    ) -> int:
        """Delete task queue entries for a submission. Returns deleted count."""
        query: dict[str, Any] = {"submission_id": submission_id}
        if task_types:
            query["task_type"] = {"$in": task_types}
        if statuses:
            query["status"] = {"$in": statuses}
        return self._db.task_queue.delete_many(query).deleted_count
