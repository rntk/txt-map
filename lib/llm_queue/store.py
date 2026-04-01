"""MongoDB operations for the LLM request queue."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Optional, Sequence

from pymongo.database import Database


class LLMQueueStore:
    """MongoDB-backed queue for LLM call requests."""

    COLLECTION = "llm_queue"

    def __init__(self, db: Database) -> None:
        self._col = db[self.COLLECTION]

    def prepare(self) -> None:
        """Create indexes."""
        try:
            self._col.create_index("request_id", unique=True)
        except Exception:
            pass
        try:
            self._col.create_index([("status", 1), ("created_at", 1)])
        except Exception:
            pass

    def submit(
        self,
        prompt: str,
        temperature: float,
        model_id: Optional[str] = None,
        cache_key: Optional[str] = None,
        cache_namespace: Optional[str] = None,
        prompt_version: Optional[str] = None,
    ) -> str:
        """Insert a pending LLM request; return its request_id."""
        request_id = str(uuid.uuid4())
        self._col.insert_one(
            {
                "request_id": request_id,
                "prompt": prompt,
                "temperature": temperature,
                "model_id": model_id,
                "status": "pending",
                "response": None,
                "error": None,
                "created_at": datetime.now(UTC),
                "started_at": None,
                "completed_at": None,
                "worker_id": None,
                "cache_key": cache_key,
                "cache_namespace": cache_namespace,
                "prompt_version": prompt_version,
            }
        )
        return request_id

    def claim(self, worker_id: str) -> Optional[dict[str, Any]]:
        """Atomically claim the oldest pending request; return the doc or None."""
        return self._col.find_one_and_update(
            {"status": "pending"},
            {
                "$set": {
                    "status": "processing",
                    "started_at": datetime.now(UTC),
                    "worker_id": worker_id,
                }
            },
            sort=[("created_at", 1)],
            return_document=True,
        )

    def complete(self, request_id: str, response: str) -> None:
        """Mark a request as completed with its response."""
        self._col.update_one(
            {"request_id": request_id},
            {
                "$set": {
                    "status": "completed",
                    "response": response,
                    "completed_at": datetime.now(UTC),
                }
            },
        )

    def fail(self, request_id: str, error: str) -> None:
        """Mark a request as failed with an error message."""
        self._col.update_one(
            {"request_id": request_id},
            {
                "$set": {
                    "status": "failed",
                    "error": error,
                    "completed_at": datetime.now(UTC),
                }
            },
        )

    def get_result(self, request_id: str) -> Optional[dict[str, Any]]:
        """Fetch a request document by ID (for polling)."""
        return self._col.find_one({"request_id": request_id}, {"_id": 0})

    def get_results(self, request_ids: list[str]) -> list[dict[str, Any]]:
        """Batch fetch multiple request documents."""
        docs = self._col.find(
            {"request_id": {"$in": request_ids}}, {"_id": 0}
        )
        by_id = {d["request_id"]: d for d in docs}
        return [by_id.get(rid) for rid in request_ids]

    def list(self, filters: Optional[dict[str, Any]] = None, limit: int = 100) -> list[dict[str, Any]]:
        """List LLM queue entries with optional filters, sorted by created_at desc."""
        return list(self._col.find(filters or {}, {"_id": 0}).sort("created_at", -1).limit(limit))

    def delete_by_id(self, request_id: str) -> bool:
        """Delete an LLM request queue entry by its request_id. Returns True if deleted."""
        result = self._col.delete_one({"request_id": request_id})
        return result.deleted_count > 0

    def cleanup_old(
        self,
        max_age_hours: int = 24,
        statuses: Optional[Sequence[str]] = None,
    ) -> int:
        """Delete old requests for the given terminal statuses."""
        cutoff = datetime.now(UTC) - timedelta(hours=max_age_hours)
        statuses_to_delete = list(statuses) if statuses is not None else ["completed", "failed"]
        result = self._col.delete_many(
            {
                "status": {"$in": statuses_to_delete},
                "completed_at": {"$lt": cutoff},
            }
        )
        return result.deleted_count
