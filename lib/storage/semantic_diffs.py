import logging
from datetime import UTC, datetime


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
            self._db.semantic_diff_jobs.create_index("status")
        except Exception as exc:
            self._log.warning("Can't create semantic_diff_jobs status index: %s", exc)

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

