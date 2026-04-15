"""MongoDB operations for the LLM request queue."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Optional, Sequence

from pymongo import ReturnDocument
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
        try:
            self._col.create_index([("status", 1), ("lease_expires_at", 1)])
        except Exception:
            pass
        try:
            self._col.create_index(
                [("status", 1), ("requested_model_id", 1), ("created_at", 1)]
            )
        except Exception:
            pass

    def submit(
        self,
        prompt: str,
        temperature: float,
        model_id: Optional[str] = None,
        requested_provider: Optional[str] = None,
        requested_model: Optional[str] = None,
        requested_model_id: Optional[str] = None,
        cache_key: Optional[str] = None,
        cache_namespace: Optional[str] = None,
        prompt_version: Optional[str] = None,
    ) -> str:
        """Insert a pending LLM request; return its request_id."""
        request_id = str(uuid.uuid4())
        snapshot_model_id = requested_model_id or model_id
        self._col.insert_one(
            {
                "request_id": request_id,
                "prompt": prompt,
                "temperature": temperature,
                "model_id": model_id,
                "requested_provider": requested_provider,
                "requested_model": requested_model,
                "requested_model_id": snapshot_model_id,
                "status": "pending",
                "response": None,
                "error": None,
                "created_at": datetime.now(UTC),
                "started_at": None,
                "completed_at": None,
                "worker_id": None,
                "worker_kind": None,
                "lease_id": None,
                "lease_expires_at": None,
                "last_heartbeat_at": None,
                "executed_provider": None,
                "executed_model": None,
                "executed_model_id": None,
                "cache_key": cache_key,
                "cache_namespace": cache_namespace,
                "prompt_version": prompt_version,
            }
        )
        return request_id

    def claim(
        self,
        worker_id: str,
        *,
        worker_kind: str = "local",
        lease_seconds: int = 60,
        supported_model_ids: Optional[Sequence[str]] = None,
        include_legacy_model_ids: bool = True,
    ) -> Optional[dict[str, Any]]:
        """Atomically claim the oldest pending request; return the updated doc or None."""
        now = datetime.now(UTC)
        lease_id = str(uuid.uuid4())
        query: dict[str, Any] = {"status": "pending"}
        if supported_model_ids:
            if include_legacy_model_ids:
                query["$or"] = [
                    {"requested_model_id": {"$in": list(supported_model_ids)}},
                    {
                        "requested_model_id": {"$exists": False},
                        "model_id": {"$in": list(supported_model_ids)},
                    },
                ]
            else:
                query["requested_model_id"] = {"$in": list(supported_model_ids)}

        return self._col.find_one_and_update(
            query,
            {
                "$set": {
                    "status": "processing",
                    "started_at": now,
                    "worker_id": worker_id,
                    "worker_kind": worker_kind,
                    "lease_id": lease_id,
                    "lease_expires_at": now + timedelta(seconds=lease_seconds),
                    "last_heartbeat_at": now,
                    "error": None,
                }
            },
            sort=[("created_at", 1)],
            return_document=ReturnDocument.AFTER,
        )

    def heartbeat(
        self, request_id: str, worker_id: str, lease_id: str, *, lease_seconds: int = 60
    ) -> Optional[dict[str, Any]]:
        """Extend a processing lease when the same worker still owns it."""
        now = datetime.now(UTC)
        return self._col.find_one_and_update(
            {
                "request_id": request_id,
                "status": "processing",
                "worker_id": worker_id,
                "lease_id": lease_id,
            },
            {
                "$set": {
                    "lease_expires_at": now + timedelta(seconds=lease_seconds),
                    "last_heartbeat_at": now,
                }
            },
            return_document=ReturnDocument.AFTER,
        )

    def complete(
        self,
        request_id: str,
        response: str,
        *,
        worker_id: Optional[str] = None,
        lease_id: Optional[str] = None,
        executed_provider: Optional[str] = None,
        executed_model: Optional[str] = None,
        executed_model_id: Optional[str] = None,
    ) -> bool:
        """Mark a request as completed with its response."""
        query: dict[str, Any] = {"request_id": request_id}
        if worker_id is not None and lease_id is not None:
            query.update(
                {
                    "status": "processing",
                    "worker_id": worker_id,
                    "lease_id": lease_id,
                }
            )

        result = self._col.update_one(
            query,
            {
                "$set": {
                    "status": "completed",
                    "response": response,
                    "completed_at": datetime.now(UTC),
                    "executed_provider": executed_provider,
                    "executed_model": executed_model,
                    "executed_model_id": executed_model_id,
                }
            },
        )
        return result.modified_count == 1

    def fail(
        self,
        request_id: str,
        error: str,
        *,
        worker_id: Optional[str] = None,
        lease_id: Optional[str] = None,
    ) -> bool:
        """Mark a request as failed with an error message."""
        query: dict[str, Any] = {"request_id": request_id}
        if worker_id is not None and lease_id is not None:
            query.update(
                {
                    "status": "processing",
                    "worker_id": worker_id,
                    "lease_id": lease_id,
                }
            )

        result = self._col.update_one(
            query,
            {
                "$set": {
                    "status": "failed",
                    "error": error,
                    "completed_at": datetime.now(UTC),
                }
            },
        )
        return result.modified_count == 1

    def get_result(self, request_id: str) -> Optional[dict[str, Any]]:
        """Fetch a request document by ID (for polling)."""
        return self._col.find_one({"request_id": request_id}, {"_id": 0})

    def get_results(self, request_ids: list[str]) -> list[dict[str, Any]]:
        """Batch fetch multiple request documents."""
        docs = self._col.find({"request_id": {"$in": request_ids}}, {"_id": 0})
        by_id = {d["request_id"]: d for d in docs}
        return [by_id.get(rid) for rid in request_ids]

    def list(
        self, filters: Optional[dict[str, Any]] = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        """List LLM queue entries with optional filters, sorted by created_at desc."""
        return list(
            self._col.find(filters or {}, {"_id": 0})
            .sort("created_at", -1)
            .limit(limit)
        )

    def delete_by_id(self, request_id: str) -> bool:
        """Delete an LLM request queue entry by its request_id. Returns True if deleted."""
        result = self._col.delete_one({"request_id": request_id})
        return result.deleted_count > 0

    def reclaim_stale_processing(
        self,
        stale_after_minutes: int = 10,
        *,
        lease_seconds: Optional[int] = None,
    ) -> int:
        """
        Reset requests stuck in "processing" back to "pending".

        If an LLM worker crashes mid-execution the request stays in
        "processing" forever and the polling task worker would wait
        indefinitely.  Any request that has been in "processing" for
        longer than *stale_after_minutes* is considered orphaned and is
        reset so another worker can pick it up.
        """
        cutoff = datetime.now(UTC) - timedelta(minutes=stale_after_minutes)
        stale_clauses: list[dict[str, Any]] = [
            {"lease_expires_at": {"$lt": datetime.now(UTC)}},
            {
                "lease_expires_at": None,
                "started_at": {"$lt": cutoff},
            },
            {
                "lease_expires_at": {"$exists": False},
                "started_at": {"$lt": cutoff},
            },
        ]
        if lease_seconds is not None:
            lease_cutoff = datetime.now(UTC) - timedelta(seconds=lease_seconds)
            stale_clauses.append(
                {
                    "last_heartbeat_at": {"$lt": lease_cutoff},
                }
            )
        result = self._col.update_many(
            {"status": "processing", "$or": stale_clauses},
            {
                "$set": {
                    "status": "pending",
                    "started_at": None,
                    "worker_id": None,
                    "worker_kind": None,
                    "lease_id": None,
                    "lease_expires_at": None,
                    "last_heartbeat_at": None,
                }
            },
        )
        return result.modified_count

    def cleanup_old(
        self,
        max_age_hours: int = 24,
        statuses: Optional[Sequence[str]] = None,
    ) -> int:
        """Delete old requests for the given terminal statuses."""
        cutoff = datetime.now(UTC) - timedelta(hours=max_age_hours)
        statuses_to_delete = (
            list(statuses) if statuses is not None else ["completed", "failed"]
        )
        result = self._col.delete_many(
            {
                "status": {"$in": statuses_to_delete},
                "completed_at": {"$lt": cutoff},
            }
        )
        return result.deleted_count
