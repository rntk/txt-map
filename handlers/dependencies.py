from fastapi import Depends, HTTPException, Request

from lib.storage.submissions import SubmissionsStorage
from lib.storage.semantic_diffs import SemanticDiffsStorage
from lib.storage.task_queue import TaskQueueStorage


def get_submissions_storage(request: Request) -> SubmissionsStorage:
    return request.app.state.submissions_storage


def get_task_queue_storage(request: Request) -> TaskQueueStorage:
    return request.app.state.task_queue_storage


def get_semantic_diffs_storage(request: Request) -> SemanticDiffsStorage:
    return request.app.state.semantic_diffs_storage


def require_submission(
    submission_id: str,
    storage: SubmissionsStorage = Depends(get_submissions_storage),
) -> dict:
    """Dependency that resolves {submission_id} from the path and raises 404 if not found."""
    sub = storage.get_by_id(submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    return sub
