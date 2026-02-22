import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from lib.diff.semantic_diff import (
    ALGORITHM_VERSION,
    canonical_pair,
    check_submission_topic_readiness,
    orient_payload,
    stale_reasons,
)
from lib.storage.semantic_diffs import SemanticDiffsStorage
from lib.storage.submissions import SubmissionsStorage


router = APIRouter()


def get_submissions_storage(request: Request) -> SubmissionsStorage:
    return request.app.state.submissions_storage


def get_semantic_diffs_storage(request: Request) -> SemanticDiffsStorage:
    return request.app.state.semantic_diffs_storage


class DiffCalculateRequest(BaseModel):
    left_submission_id: str
    right_submission_id: str
    force: bool = False


def _ensure_submissions(
    submissions_storage: SubmissionsStorage, left_submission_id: str, right_submission_id: str
):
    if left_submission_id == right_submission_id:
        raise HTTPException(status_code=400, detail="Please select two different submissions")

    left_submission = submissions_storage.get_by_id(left_submission_id)
    right_submission = submissions_storage.get_by_id(right_submission_id)

    if not left_submission:
        raise HTTPException(status_code=404, detail=f"Submission not found: {left_submission_id}")
    if not right_submission:
        raise HTTPException(status_code=404, detail=f"Submission not found: {right_submission_id}")

    return left_submission, right_submission


def _serialize_job(job: Optional[dict]) -> Optional[dict]:
    if not job:
        return None
    return {
        "job_id": job.get("job_id"),
        "status": job.get("status"),
        "error": job.get("error"),
        "created_at": job.get("created_at"),
        "started_at": job.get("started_at"),
        "completed_at": job.get("completed_at"),
        "force_recalculate": bool(job.get("force_recalculate")),
    }


@router.get("/diff")
def get_diff(
    left_submission_id: str,
    right_submission_id: str,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
    semantic_diffs_storage: SemanticDiffsStorage = Depends(get_semantic_diffs_storage),
):
    left_submission, right_submission = _ensure_submissions(
        submissions_storage, left_submission_id, right_submission_id
    )

    pair_key, submission_a_id, submission_b_id = canonical_pair(left_submission_id, right_submission_id)
    diff_doc = semantic_diffs_storage.get_diff_by_pair_key(pair_key)
    latest_job = semantic_diffs_storage.get_latest_job(pair_key)
    active_job = semantic_diffs_storage.get_active_job(pair_key)

    left_prereq = check_submission_topic_readiness(left_submission)
    right_prereq = check_submission_topic_readiness(right_submission)
    prereq = {"left": left_prereq, "right": right_prereq}
    if not left_prereq["ready"] or not right_prereq["ready"]:
        return {
            "pair": {
                "left_submission_id": left_submission_id,
                "right_submission_id": right_submission_id,
                "pair_key": pair_key,
                "submission_a_id": submission_a_id,
                "submission_b_id": submission_b_id,
            },
            "state": "waiting_prerequisites",
            "prereq": prereq,
            "stale_reasons": [],
            "latest_job": _serialize_job(latest_job),
            "diff": None,
        }

    reasons = stale_reasons(
        diff_doc, left_submission, right_submission, algorithm_version=ALGORITHM_VERSION
    ) if diff_doc else []
    is_stale = len(reasons) > 0

    if active_job:
        if active_job.get("status") == "processing":
            state = "processing"
        else:
            state = "queued"
    elif diff_doc and is_stale:
        state = "stale"
    elif diff_doc:
        state = "ready"
    elif latest_job and latest_job.get("status") == "failed":
        state = "failed"
    else:
        state = "missing"

    oriented = None
    if diff_doc and diff_doc.get("payload"):
        oriented = orient_payload(
            diff_doc["payload"],
            diff_doc.get("submission_a_id"),
            diff_doc.get("submission_b_id"),
            left_submission_id,
            right_submission_id,
        )

    return {
        "pair": {
            "left_submission_id": left_submission_id,
            "right_submission_id": right_submission_id,
            "pair_key": pair_key,
            "submission_a_id": submission_a_id,
            "submission_b_id": submission_b_id,
        },
        "state": state,
        "prereq": prereq,
        "stale_reasons": reasons,
        "latest_job": _serialize_job(latest_job),
        "diff": oriented,
    }


@router.post("/diff/calculate")
def post_diff_calculate(
    payload: DiffCalculateRequest,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
    semantic_diffs_storage: SemanticDiffsStorage = Depends(get_semantic_diffs_storage),
):
    left_submission, right_submission = _ensure_submissions(
        submissions_storage, payload.left_submission_id, payload.right_submission_id
    )

    left_prereq = check_submission_topic_readiness(left_submission)
    right_prereq = check_submission_topic_readiness(right_submission)
    if not left_prereq["ready"] or not right_prereq["ready"]:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Topic prerequisites are not ready for one or both submissions",
                "left": left_prereq,
                "right": right_prereq,
            },
        )

    pair_key, submission_a_id, submission_b_id = canonical_pair(
        payload.left_submission_id, payload.right_submission_id
    )
    active_job = semantic_diffs_storage.get_active_job(pair_key)
    if active_job:
        return {
            "job_id": active_job.get("job_id"),
            "status": active_job.get("status"),
            "pair_key": pair_key,
            "submission_a_id": submission_a_id,
            "submission_b_id": submission_b_id,
            "force_recalculate": bool(active_job.get("force_recalculate")),
        }

    job = semantic_diffs_storage.create_job(
        job_id=str(uuid.uuid4()),
        pair_key=pair_key,
        submission_a_id=submission_a_id,
        submission_b_id=submission_b_id,
        requested_left_id=payload.left_submission_id,
        requested_right_id=payload.right_submission_id,
        force_recalculate=payload.force,
    )
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "pair_key": pair_key,
        "submission_a_id": submission_a_id,
        "submission_b_id": submission_b_id,
        "force_recalculate": payload.force,
    }

