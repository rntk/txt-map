from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List

from lib.constants import ALLOWED_TASKS, TASK_PRIORITIES
from lib.storage.submissions import SubmissionsStorage
from lib.storage.task_queue import TaskQueueStorage, make_task_document
from handlers.dependencies import get_submissions_storage, get_task_queue_storage, require_submission


router = APIRouter()


class AddTaskRequest(BaseModel):
    submission_id: str
    task_type: str
    priority: Optional[int] = Field(default=None, ge=1, le=10)


@router.get("/task-queue")
def list_task_queue(
    submission_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    task_queue_storage: TaskQueueStorage = Depends(get_task_queue_storage),
):
    """List task queue entries with optional filters."""
    if limit <= 0:
        raise HTTPException(status_code=400, detail="Limit must be positive")

    query = {}
    if submission_id:
        query["submission_id"] = submission_id
    if status:
        query["status"] = status

    tasks = task_queue_storage.list(query, limit)

    serialized = []
    for task in tasks:
        task_copy = {**task}
        task_copy["id"] = str(task_copy.pop("_id"))
        serialized.append(task_copy)

    return {"tasks": serialized}


@router.delete("/task-queue/{task_id}")
def delete_task_queue_entry(
    task_id: str,
    task_queue_storage: TaskQueueStorage = Depends(get_task_queue_storage),
):
    """Delete a task queue entry by its ID."""
    try:
        deleted = task_queue_storage.delete_by_id(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid task ID")

    if not deleted:
        raise HTTPException(status_code=404, detail="Task not found")

    return {"deleted": True, "task_id": task_id}


@router.post("/task-queue/{task_id}/repeat")
def repeat_task_queue_entry(
    task_id: str,
    task_queue_storage: TaskQueueStorage = Depends(get_task_queue_storage),
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
):
    """Re-queue a task based on an existing queue entry."""
    try:
        task = task_queue_storage.get_by_id(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid task ID")

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task_type = task.get("task_type")
    submission_id = task.get("submission_id")

    if task_type not in ALLOWED_TASKS:
        raise HTTPException(status_code=400, detail="Unsupported task type")

    submission = submissions_storage.get_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    expanded_tasks = submissions_storage.expand_recalculation_tasks([task_type])
    submissions_storage.clear_results(submission_id, expanded_tasks)

    task_queue_storage.delete_by_submission(
        submission_id,
        task_types=expanded_tasks,
        statuses=["pending", "processing"],
    )

    inserted_ids = []
    for expanded_task in expanded_tasks:
        doc = make_task_document(submission_id, expanded_task, TASK_PRIORITIES.get(expanded_task, 3))
        inserted_ids.append(task_queue_storage.create(doc))

    return {"requeued": True, "tasks": expanded_tasks, "task_ids": inserted_ids}


@router.post("/task-queue/add")
def add_task_queue_entry(
    payload: AddTaskRequest,
    task_queue_storage: TaskQueueStorage = Depends(get_task_queue_storage),
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
):
    """Add a new task queue entry for a submission."""
    if payload.task_type not in ALLOWED_TASKS:
        raise HTTPException(status_code=400, detail="Unsupported task type")

    submission = submissions_storage.get_by_id(payload.submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    expanded_tasks = submissions_storage.expand_recalculation_tasks([payload.task_type])
    submissions_storage.clear_results(payload.submission_id, expanded_tasks)

    inserted_ids = []
    for expanded_task in expanded_tasks:
        priority = payload.priority if payload.priority is not None else TASK_PRIORITIES.get(expanded_task, 3)
        doc = make_task_document(payload.submission_id, expanded_task, priority)
        inserted_ids.append(task_queue_storage.create(doc))

    return {"queued": True, "tasks": expanded_tasks, "task_ids": inserted_ids}
