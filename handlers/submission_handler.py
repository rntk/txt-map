from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from lib.storage.submissions import SubmissionsStorage
from lib.html_cleaner import HTMLCleaner
from datetime import datetime


class SubmitRequest(BaseModel):
    html: str
    source_url: Optional[str] = ""


class RefreshRequest(BaseModel):
    tasks: Optional[List[str]] = None


router = APIRouter()


def get_submissions_storage(request: Request) -> SubmissionsStorage:
    return request.app.state.submissions_storage


@router.post("/submit")
def post_submit(
    request: SubmitRequest,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage)
):
    """
    Accept HTML content, save to DB, queue tasks, and return submission ID
    """
    # Extract plain text from HTML
    cleaner = HTMLCleaner()
    text_content = cleaner.clean(request.html)

    # Create submission in database
    submission = submissions_storage.create(
        html_content=request.html,
        text_content=text_content,
        source_url=request.source_url
    )

    # Create task queue entries for text_splitting (other tasks will be queued after dependencies complete)
    db = submissions_storage._db
    db.task_queue.insert_one({
        "submission_id": submission["submission_id"],
        "task_type": "text_splitting",
        "priority": 1,
        "status": "pending",
        "created_at": datetime.utcnow(),
        "started_at": None,
        "completed_at": None,
        "worker_id": None,
        "retry_count": 0,
        "error": None
    })

    # Queue other tasks (they will wait for dependencies)
    for task_type, priority in [
        ("topic_extraction", 2),
        ("summarization", 3),
        ("mindmap", 3),
        ("insides", 3)
    ]:
        db.task_queue.insert_one({
            "submission_id": submission["submission_id"],
            "task_type": task_type,
            "priority": priority,
            "status": "pending",
            "created_at": datetime.utcnow(),
            "started_at": None,
            "completed_at": None,
            "worker_id": None,
            "retry_count": 0,
            "error": None
        })

    return {
        "submission_id": submission["submission_id"],
        "redirect_url": f"/page/text/{submission['submission_id']}"
    }


@router.get("/submission/{submission_id}/status")
def get_submission_status(
    submission_id: str,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage)
):
    """
    Return current task statuses for polling
    """
    submission = submissions_storage.get_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    overall_status = submissions_storage.get_overall_status(submission)

    return {
        "submission_id": submission_id,
        "tasks": submission["tasks"],
        "overall_status": overall_status
    }


@router.get("/submission/{submission_id}")
def get_submission(
    submission_id: str,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage)
):
    """
    Return all available results from DB
    """
    submission = submissions_storage.get_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    overall_status = submissions_storage.get_overall_status(submission)

    return {
        "submission_id": submission_id,
        "source_url": submission.get("source_url", ""),
        "text_content": submission.get("text_content", ""),
        "html_content": submission.get("html_content", ""),
        "created_at": submission["created_at"],
        "status": {
            "overall": overall_status,
            "tasks": submission["tasks"]
        },
        "results": submission["results"]
    }


@router.delete("/submission/{submission_id}")
def delete_submission(
    submission_id: str,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage)
):
    """
    Delete a submission and any queued tasks
    """
    submission = submissions_storage.get_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    db = submissions_storage._db
    db.task_queue.delete_many({"submission_id": submission_id})
    delete_result = db.submissions.delete_one({"submission_id": submission_id})

    if delete_result.deleted_count == 0:
        raise HTTPException(status_code=500, detail="Failed to delete submission")

    return {
        "message": "Submission deleted",
        "submission_id": submission_id
    }


@router.post("/submission/{submission_id}/refresh")
def post_refresh(
    submission_id: str,
    refresh_request: RefreshRequest,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage)
):
    """
    Clear results and re-queue tasks for recalculation
    """
    submission = submissions_storage.get_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Determine which tasks to refresh and validate user input
    requested_tasks = refresh_request.tasks or ["all"]
    invalid_tasks = [t for t in requested_tasks if t != "all" and t not in submissions_storage.task_names]
    if invalid_tasks:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported task(s): {', '.join(invalid_tasks)}"
        )
    task_names = submissions_storage.expand_recalculation_tasks(requested_tasks)

    # Clear results and reset task statuses
    submissions_storage.clear_results(submission_id, task_names)

    # Delete existing task queue entries for this submission
    db = submissions_storage._db
    db.task_queue.delete_many({
        "submission_id": submission_id,
        "task_type": {"$in": task_names}
    })

    # Re-queue tasks
    now = datetime.utcnow()
    tasks_queued = []

    task_priorities = {
        "text_splitting": 1,
        "topic_extraction": 2,
        "summarization": 3,
        "mindmap": 3,
        "insides": 3
    }

    for task_name in task_names:
        db.task_queue.insert_one({
            "submission_id": submission_id,
            "task_type": task_name,
            "priority": task_priorities.get(task_name, 3),
            "status": "pending",
            "created_at": now,
            "started_at": None,
            "completed_at": None,
            "worker_id": None,
            "retry_count": 0,
            "error": None
        })
        tasks_queued.append(task_name)

    return {
        "message": "Tasks queued for recalculation",
        "tasks_queued": tasks_queued
    }


@router.get("/submissions")
def list_submissions(
    submission_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage)
):
    """
    List submissions with optional filters.
    """
    if limit <= 0:
        raise HTTPException(status_code=400, detail="Limit must be positive")

    query = {}
    if submission_id:
        query["submission_id"] = submission_id

    db = submissions_storage._db
    fetch_limit = limit if not status else min(max(limit * 5, limit), 1000)
    submissions = list(db.submissions.find(query).sort("created_at", -1).limit(fetch_limit))

    items = []
    for submission in submissions:
        overall_status = submissions_storage.get_overall_status(submission)
        if status and overall_status != status:
            continue

        text_content = submission.get("text_content") or ""
        results = submission.get("results") or {}
        sentences = results.get("sentences") or []
        topics = results.get("topics") or []

        items.append({
            "submission_id": submission.get("submission_id"),
            "source_url": submission.get("source_url", ""),
            "created_at": submission.get("created_at"),
            "updated_at": submission.get("updated_at"),
            "overall_status": overall_status,
            "text_characters": len(text_content),
            "sentence_count": len(sentences),
            "topic_count": len(topics)
        })

        if len(items) >= limit:
            break

    return {
        "submissions": items,
        "count": len(items)
    }
