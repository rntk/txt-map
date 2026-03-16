import logging
from datetime import UTC, datetime

from pymongo.errors import DuplicateKeyError


class SemanticDiffsStorage:
    def __init__(self, db) -> None:
        self._db = db
        self._log = logging.getLogger("semantic_diffs")

    def prepare(self) -> None:
        try:
            self._db.semantic_diffs.create_index("pair_key", unique=True)
        except Exception as exc:
            self._log.warning("Can't create semantic_diffs index pair_key: %s", exc)
        try:
            self._db.semantic_diff_jobs.create_index([("pair_key", 1), ("created_at", -1)])
        except Exception as exc:
            self._log.warning("Can't create semantic_diff_jobs pair_key/created_at index: %s", exc)
        try:
            self._db.semantic_diff_jobs.create_index(
                [("pair_key", 1)],
                unique=True,
                partialFilterExpression={"status": {"$in": ["pending", "processing"]}},
            )
        except Exception as exc:
            self._log.warning("Can't create semantic_diff_jobs active pair_key unique index: %s", exc)
        try:
            self._db.semantic_diff_jobs.create_index("status")
        except Exception as exc:
            self._log.warning("Can't create semantic_diff_jobs status index: %s", exc)
        try:
            self._db.semantic_diff_jobs.create_index(
                [("status", 1), ("force_recalculate", -1), ("created_at", 1)]
            )
        except Exception as exc:
            self._log.warning("Can't create semantic_diff_jobs status/force/created_at index: %s", exc)

    def get_diff_by_pair_key(self, pair_key: str):
        return self._db.semantic_diffs.find_one({"pair_key": pair_key})

    def get_latest_job(self, pair_key: str):
        return self._db.semantic_diff_jobs.find_one({"pair_key": pair_key}, sort=[("created_at", -1)])

    def get_active_job(self, pair_key: str):
        return self._db.semantic_diff_jobs.find_one(
            {"pair_key": pair_key, "status": {"$in": ["pending", "processing"]}},
            sort=[("created_at", -1)],
        )

    def create_job(
        self,
        *,
        job_id: str,
        pair_key: str,
        submission_a_id: str,
        submission_b_id: str,
        requested_left_id: str,
        requested_right_id: str,
        force_recalculate: bool = False,
    ) -> dict:
        now = datetime.now(UTC)
        job = {
            "job_id": job_id,
            "pair_key": pair_key,
            "submission_a_id": submission_a_id,
            "submission_b_id": submission_b_id,
            "requested_left_id": requested_left_id,
            "requested_right_id": requested_right_id,
            "force_recalculate": force_recalculate,
            "status": "pending",
            "created_at": now,
            "started_at": None,
            "completed_at": None,
            "worker_id": None,
            "error": None,
        }
        self._db.semantic_diff_jobs.insert_one(job)
        return job

    def create_or_get_active_job(
        self,
        *,
        job_id: str,
        pair_key: str,
        submission_a_id: str,
        submission_b_id: str,
        requested_left_id: str,
        requested_right_id: str,
        force_recalculate: bool = False,
    ) -> tuple[dict, bool]:
        now = datetime.now(UTC)
        job = {
            "job_id": job_id,
            "pair_key": pair_key,
            "submission_a_id": submission_a_id,
            "submission_b_id": submission_b_id,
            "requested_left_id": requested_left_id,
            "requested_right_id": requested_right_id,
            "force_recalculate": force_recalculate,
            "status": "pending",
            "created_at": now,
            "started_at": None,
            "completed_at": None,
            "worker_id": None,
            "error": None,
        }
        try:
            self._db.semantic_diff_jobs.insert_one(job)
            return job, True
        except DuplicateKeyError:
            active_job = self.get_active_job(pair_key)
            if active_job:
                return active_job, False
            raise

    def upsert_diff(
        self,
        *,
        pair_key: str,
        submission_a_id: str,
        submission_b_id: str,
        algorithm_version: str,
        submission_a_updated_at,
        submission_b_updated_at,
        payload: dict,
    ) -> None:
        now = datetime.now(UTC)
        self._db.semantic_diffs.update_one(
            {"pair_key": pair_key},
            {
                "$set": {
                    "pair_key": pair_key,
                    "submission_a_id": submission_a_id,
                    "submission_b_id": submission_b_id,
                    "algorithm_version": algorithm_version,
                    "computed_at": now,
                    "updated_at": now,
                    "source_fingerprint": {
                        "submission_a_updated_at": submission_a_updated_at,
                        "submission_b_updated_at": submission_b_updated_at,
                    },
                    "payload": payload,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )

    def claim_job(self, worker_id: str):
        return self._db.semantic_diff_jobs.find_one_and_update(
            {"status": "pending"},
            {
                "$set": {
                    "status": "processing",
                    "started_at": datetime.now(UTC),
                    "worker_id": worker_id,
                    "error": None,
                }
            },
            sort=[("force_recalculate", -1), ("created_at", 1)],
        )

    def set_job_force_recalculate(self, job_id, force_recalculate: bool) -> None:
        self._db.semantic_diff_jobs.update_one(
            {"_id": job_id},
            {"$set": {"force_recalculate": force_recalculate}},
        )

    def mark_job_completed(self, job_id) -> None:
        self._db.semantic_diff_jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "completed", "completed_at": datetime.now(UTC)}},
        )

    def mark_job_failed(self, job_id, error_msg: str) -> None:
        self._db.semantic_diff_jobs.update_one(
            {"_id": job_id},
            {
                "$set": {
                    "status": "failed",
                    "completed_at": datetime.now(UTC),
                    "error": error_msg,
                }
            },
        )

    def delete_by_pair_key(self, pair_key: str) -> tuple[int, int]:
        """Delete all diffs and jobs for a pair key. Returns (deleted_diff_count, deleted_job_count)."""
        deleted_diff_count = self._db.semantic_diffs.delete_many({"pair_key": pair_key}).deleted_count
        deleted_job_count = self._db.semantic_diff_jobs.delete_many({"pair_key": pair_key}).deleted_count
        return deleted_diff_count, deleted_job_count
