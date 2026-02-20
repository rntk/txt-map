from fastapi import APIRouter, Depends, Request, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
from lib.storage.submissions import SubmissionsStorage
from datetime import datetime, UTC
import io


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
    # Create submission in database
    submission = submissions_storage.create(
        html_content=request.html,
        # Keep raw HTML in text_content as well to avoid any pre-cleaning.
        text_content=request.html,
        source_url=request.source_url
    )

    db = submissions_storage._db
    _queue_all_tasks(db, submission["submission_id"])

    return {
        "submission_id": submission["submission_id"],
        "redirect_url": f"/page/text/{submission['submission_id']}"
    }


ALLOWED_UPLOAD_EXTENSIONS = {".html", ".htm", ".txt", ".md", ".pdf"}


def _extract_content_from_upload(filename: str, data: bytes) -> tuple[str, str]:
    """
    Extract (html_content, text_content) from uploaded file bytes.
    Returns (html_content, text_content) — for plain text types both are the same.
    """
    ext = ""
    if filename:
        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext in (".html", ".htm"):
        content = data.decode("utf-8", errors="replace")
        return content, content

    if ext == ".txt":
        content = data.decode("utf-8", errors="replace")
        return content, content

    if ext == ".md":
        import markdown as md_lib
        text = data.decode("utf-8", errors="replace")
        html = md_lib.markdown(text, extensions=['extra', 'codehilite'])
        return html, text

    if ext == ".pdf":
        from lib.pdf_to_html import convert_pdf_to_html, extract_text_from_pdf
        try:
            # Generate semantic HTML with headings, paragraphs, bold, italic
            html_content = convert_pdf_to_html(data)
            # Extract plain text for text_content
            text_content = extract_text_from_pdf(data)
            if not text_content.strip():
                raise HTTPException(
                    status_code=400,
                    detail="PDF appears to contain no extractable text (may be scanned/image-only)."
                )
            return html_content, text_content
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not parse PDF: {e}")

    raise HTTPException(
        status_code=415,
        detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))}"
    )


def _queue_all_tasks(db, submission_id: str):
    """Insert task queue entries for a new submission (same as /submit)."""
    now = datetime.now(UTC)
    base = {
        "submission_id": submission_id,
        "status": "pending",
        "created_at": now,
        "started_at": None,
        "completed_at": None,
        "worker_id": None,
        "retry_count": 0,
        "error": None,
    }
    for task_type, priority in [
        ("split_topic_generation", 1),
        ("subtopics_generation", 2),
        ("summarization", 3),
        ("mindmap", 3),
        ("prefix_tree", 3),
    ]:
        db.task_queue.insert_one({**base, "task_type": task_type, "priority": priority})


@router.post("/upload")
async def post_upload(
    file: UploadFile = File(...),
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage)
):
    """
    Accept an uploaded file (html, htm, txt, md, pdf), extract its text/html
    content, and process it the same way as a browser-extension submission.
    """
    filename = file.filename or ""
    if "." not in filename or \
            ("." + filename.rsplit(".", 1)[-1].lower()) not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type. Allowed extensions: {', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))}"
        )

    data = await file.read()
    html_content, text_content = _extract_content_from_upload(filename, data)

    submission = submissions_storage.create(
        html_content=html_content,
        text_content=text_content,
        source_url=filename,
    )

    db = submissions_storage._db
    _queue_all_tasks(db, submission["submission_id"])

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
    now = datetime.now(UTC)
    tasks_queued = []

    task_priorities = {
        "split_topic_generation": 1,
        "subtopics_generation": 2,
        "summarization": 3,
        "mindmap": 3,
        "prefix_tree": 3
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
