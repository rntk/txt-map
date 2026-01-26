from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from bson import ObjectId

from lib.storage.submissions import SubmissionsStorage


router = APIRouter()


def get_submissions_storage(request: Request) -> SubmissionsStorage:
    return request.app.state.submissions_storage


ALLOWED_TASKS = ["text_splitting", "topic_extraction", "summarization", "mindmap", "insides"]

TASK_PRIORITIES = {
    "text_splitting": 1,
    "topic_extraction": 2,
    "summarization": 3,
    "mindmap": 3,
    "insides": 3,
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

    submissions_storage.clear_results(submission_id, [task_type])

    db.task_queue.delete_many({
        "submission_id": submission_id,
        "task_type": task_type,
        "status": {"$in": ["pending", "processing"]}
    })

    now = datetime.utcnow()
    new_entry = {
        "submission_id": submission_id,
        "task_type": task_type,
        "priority": TASK_PRIORITIES.get(task_type, 3),
        "status": "pending",
        "created_at": now,
        "started_at": None,
        "completed_at": None,
        "worker_id": None,
        "retry_count": 0,
        "error": None,
    }
    result = db.task_queue.insert_one(new_entry)

    return {"requeued": True, "task_id": str(result.inserted_id)}


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

    submissions_storage.clear_results(payload.submission_id, [payload.task_type])

    now = datetime.utcnow()
    priority = payload.priority if payload.priority is not None else TASK_PRIORITIES.get(payload.task_type, 3)
    entry = {
        "submission_id": payload.submission_id,
        "task_type": payload.task_type,
        "priority": priority,
        "status": "pending",
        "created_at": now,
        "started_at": None,
        "completed_at": None,
        "worker_id": None,
        "retry_count": 0,
        "error": None,
    }

    db = submissions_storage._db
    result = db.task_queue.insert_one(entry)

    return {"queued": True, "task_id": str(result.inserted_id)}
