from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, UTC
from bson import ObjectId

from lib.storage.submissions import SubmissionsStorage


router = APIRouter()


def get_submissions_storage(request: Request) -> SubmissionsStorage:
    return request.app.state.submissions_storage


ALLOWED_TASKS = ["split_topic_generation", "subtopics_generation", "summarization", "mindmap", "prefix_tree"]

TASK_PRIORITIES = {
    "split_topic_generation": 1,
    "subtopics_generation": 2,
    "summarization": 3,
    "mindmap": 3,
    "prefix_tree": 3,
}


class AddTaskRequest(BaseModel):
    submission_id: str
    task_type: str
    priority: Optional[int] = Field(default=None, ge=1, le=10)


@router.get("/task-queue")
def list_task_queue(
    submission_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
):
    """List task queue entries with optional filters."""
    if limit <= 0:
        raise HTTPException(status_code=400, detail="Limit must be positive")

    query = {}
    if submission_id:
        query["submission_id"] = submission_id
    if status:
        query["status"] = status

    db = submissions_storage._db
    tasks = list(db.task_queue.find(query).sort("created_at", -1).limit(limit))

    serialized = []
    for task in tasks:
        task_copy = {**task}
        task_copy["id"] = str(task_copy.pop("_id"))
        serialized.append(task_copy)

    return {"tasks": serialized}


@router.delete("/task-queue/{task_id}")
def delete_task_queue_entry(
    task_id: str,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
):
    """Delete a task queue entry by its ID."""
    try:
        task_obj_id = ObjectId(task_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task ID")

    db = submissions_storage._db
    result = db.task_queue.delete_one({"_id": task_obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")

    return {"deleted": True, "task_id": task_id}


@router.post("/task-queue/{task_id}/repeat")
def repeat_task_queue_entry(
    task_id: str,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
):
    """Re-queue a task based on an existing queue entry."""
    try:
        task_obj_id = ObjectId(task_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task ID")

    db = submissions_storage._db
    task = db.task_queue.find_one({"_id": task_obj_id})
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

    db.task_queue.delete_many({
        "submission_id": submission_id,
        "task_type": {"$in": expanded_tasks},
        "status": {"$in": ["pending", "processing"]}
    })

    now = datetime.now(UTC)
    inserted_ids = []
    for expanded_task in expanded_tasks:
        new_entry = {
            "submission_id": submission_id,
            "task_type": expanded_task,
            "priority": TASK_PRIORITIES.get(expanded_task, 3),
            "status": "pending",
            "created_at": now,
            "started_at": None,
            "completed_at": None,
            "worker_id": None,
            "retry_count": 0,
            "error": None,
        }
        result = db.task_queue.insert_one(new_entry)
        inserted_ids.append(str(result.inserted_id))

    return {"requeued": True, "tasks": expanded_tasks, "task_ids": inserted_ids}


@router.post("/task-queue/add")
def add_task_queue_entry(
    payload: AddTaskRequest,
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

    now = datetime.now(UTC)
    db = submissions_storage._db
    inserted_ids = []
    for expanded_task in expanded_tasks:
        priority = payload.priority if payload.priority is not None else TASK_PRIORITIES.get(expanded_task, 3)
        entry = {
            "submission_id": payload.submission_id,
            "task_type": expanded_task,
            "priority": priority,
            "status": "pending",
            "created_at": now,
            "started_at": None,
            "completed_at": None,
            "worker_id": None,
            "retry_count": 0,
            "error": None,
        }
        result = db.task_queue.insert_one(entry)
        inserted_ids.append(str(result.inserted_id))

    return {"queued": True, "tasks": expanded_tasks, "task_ids": inserted_ids}
