from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from typing import Optional, List

from lib.constants import TASK_PRIORITIES
from lib.storage.submissions import SubmissionsStorage
from lib.storage.task_queue import TaskQueueStorage, make_task_document
from lib.nlp import compute_word_frequencies
from handlers.dependencies import get_submissions_storage, get_task_queue_storage, require_submission


class SubmitRequest(BaseModel):
    html: str
    source_url: Optional[str] = ""


class RefreshRequest(BaseModel):
    tasks: Optional[List[str]] = None


class ReadTopicsRequest(BaseModel):
    read_topics: List[str]


router = APIRouter()


def _queue_all_tasks(task_queue_storage: TaskQueueStorage, submission_id: str):
    """Insert task queue entries for a new submission."""
    for task_type, priority in TASK_PRIORITIES.items():
        task_queue_storage.create(make_task_document(submission_id, task_type, priority))


@router.post("/submit")
def post_submit(
    request: SubmitRequest,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
    task_queue_storage: TaskQueueStorage = Depends(get_task_queue_storage),
):
    """
    Accept HTML content, save to DB, queue tasks, and return submission ID
    """
    submission = submissions_storage.create(
        html_content=request.html,
        # Keep raw HTML in text_content as well to avoid any pre-cleaning.
        text_content=request.html,
        source_url=request.source_url
    )

    _queue_all_tasks(task_queue_storage, submission["submission_id"])

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


@router.post("/upload")
async def post_upload(
    file: UploadFile = File(...),
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
    task_queue_storage: TaskQueueStorage = Depends(get_task_queue_storage),
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

    _queue_all_tasks(task_queue_storage, submission["submission_id"])

    return {
        "submission_id": submission["submission_id"],
        "redirect_url": f"/page/text/{submission['submission_id']}"
    }


@router.get("/submission/{submission_id}/status")
def get_submission_status(
    submission: dict = Depends(require_submission),
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
):
    """
    Return current task statuses for polling
    """
    overall_status = submissions_storage.get_overall_status(submission)

    return {
        "submission_id": submission["submission_id"],
        "tasks": submission["tasks"],
        "overall_status": overall_status
    }


@router.get("/submission/{submission_id}")
def get_submission(
    submission: dict = Depends(require_submission),
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
):
    """
    Return all available results from DB
    """
    overall_status = submissions_storage.get_overall_status(submission)

    return {
        "submission_id": submission["submission_id"],
        "source_url": submission.get("source_url", ""),
        "text_content": submission.get("text_content", ""),
        "html_content": submission.get("html_content", ""),
        "created_at": submission["created_at"],
        "status": {
            "overall": overall_status,
            "tasks": submission["tasks"]
        },
        "results": submission["results"],
        "read_topics": submission.get("read_topics", [])
    }


@router.put("/submission/{submission_id}/read-topics")
def put_read_topics(
    body: ReadTopicsRequest,
    submission: dict = Depends(require_submission),
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
):
    """
    Persist the list of read topic names for a submission
    """
    submission_id = submission["submission_id"]
    submissions_storage.update_read_topics(submission_id, body.read_topics)

    return {
        "submission_id": submission_id,
        "read_topics": body.read_topics
    }


@router.delete("/submission/{submission_id}")
def delete_submission(
    submission: dict = Depends(require_submission),
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
    task_queue_storage: TaskQueueStorage = Depends(get_task_queue_storage),
):
    """
    Delete a submission and any queued tasks
    """
    submission_id = submission["submission_id"]
    task_queue_storage.delete_by_submission(submission_id)
    deleted = submissions_storage.delete_by_id(submission_id)

    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete submission")

    return {
        "message": "Submission deleted",
        "submission_id": submission_id
    }


@router.post("/submission/{submission_id}/refresh")
def post_refresh(
    refresh_request: RefreshRequest,
    submission: dict = Depends(require_submission),
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
    task_queue_storage: TaskQueueStorage = Depends(get_task_queue_storage),
):
    """
    Clear results and re-queue tasks for recalculation
    """
    submission_id = submission["submission_id"]

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
    task_queue_storage.delete_by_submission(submission_id, task_types=task_names)

    # Re-queue tasks
    tasks_queued = []
    for task_name in task_names:
        priority = TASK_PRIORITIES.get(task_name, 3)
        task_queue_storage.create(make_task_document(submission_id, task_name, priority))
        tasks_queued.append(task_name)

    return {
        "message": "Tasks queued for recalculation",
        "tasks_queued": tasks_queued
    }


@router.get("/submission/{submission_id}/word-cloud")
def get_word_cloud(
    path: List[str] = Query(default=[]),
    top_n: int = Query(default=60, ge=1, le=200),
    submission: dict = Depends(require_submission),
):
    """
    Return a word-frequency cloud for the sentences that belong to topics
    matching *path* (a hierarchical list of topic segments, e.g. ["Sport", "Tennis"]).
    An empty *path* covers all topics.
    Uses NLTK tokenisation, POS tagging, and lemmatisation on the backend.
    """
    results = submission.get("results") or {}
    topics = results.get("topics") or []
    sentences = results.get("sentences") or []

    if not sentences:
        return {"words": [], "sentence_count": 0}

    # Filter topics whose name starts with the requested path segments.
    def topic_matches(name: str) -> bool:
        parts = [p.strip() for p in name.split(">")]
        if len(parts) < len(path):
            return False
        return all(parts[i] == path[i] for i in range(len(path)))

    matching_topics = [t for t in topics if topic_matches(t.get("name", ""))]

    # Collect unique 1-based sentence indices.
    sentence_indices: set = set()
    for topic in matching_topics:
        for idx in (topic.get("sentences") or []):
            sentence_indices.add(int(idx))

    texts = [
        sentences[idx - 1]
        for idx in sentence_indices
        if 1 <= idx <= len(sentences)
    ]

    words = compute_word_frequencies(texts, top_n=top_n)
    return {"words": words, "sentence_count": len(sentence_indices)}


@router.get("/global-topics")
def get_global_topics(
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
):
    """
    Return aggregated topic tree across all completed submissions.
    """
    topics = submissions_storage.aggregate_global_topics()
    return {"topics": topics}


@router.get("/global-topics/sentences")
def get_global_topics_sentences(
    topic_name: List[str] = Query(default=[]),
    include_context: bool = Query(default=False),
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
):
    """
    Return sentence texts for selected topics across all submissions.
    """
    if not topic_name:
        return {"groups": []}

    submissions = submissions_storage.list_with_projection(
        {"tasks.split_topic_generation.status": "completed"},
        {"submission_id": 1, "source_url": 1, "results.topics": 1, "results.sentences": 1},
    )

    groups = []
    for submission in submissions:
        results = submission.get("results") or {}
        all_sentences = results.get("sentences") or []
        topics = results.get("topics") or []
        for topic in topics:
            if topic.get("name") not in topic_name:
                continue
            indices = topic.get("sentences") or []
            texts = [
                all_sentences[idx - 1]
                for idx in indices
                if 1 <= idx <= len(all_sentences)
            ]
            if texts:
                group_data = {
                    "submission_id": submission["submission_id"],
                    "source_url": submission.get("source_url", ""),
                    "topic_name": topic["name"],
                    "sentences": texts
                }
                if include_context:
                    group_data["all_sentences"] = all_sentences
                    group_data["topics"] = topics
                    group_data["indices"] = indices
                groups.append(group_data)
    return {"groups": groups}


@router.get("/submissions/read-progress")
def get_global_read_progress(
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
):
    submissions = submissions_storage.list_with_projection(
        {},
        {"results.sentences": 1, "results.topics.name": 1, "results.topics.sentences": 1, "read_topics": 1}
    )
    total_sentences = 0
    total_read = 0
    
    for submission in submissions:
        results = submission.get("results") or {}
        sentences = results.get("sentences") or []
        topics = results.get("topics") or []
        read_topics = set(submission.get("read_topics") or [])
        
        t_count = len(sentences)
        if t_count == 0:
            continue
            
        r_indices = set()
        for topic in topics:
            if topic.get("name") in read_topics:
                for idx in topic.get("sentences", []):
                    r_indices.add(idx)
                    
        total_sentences += t_count
        total_read += len(r_indices)
        
    return {"read_count": total_read, "total_count": total_sentences}


@router.get("/submission/{submission_id}/read-progress")
def get_submission_read_progress(
    submission: dict = Depends(require_submission),
):
    results = submission.get("results") or {}
    sentences = results.get("sentences") or []
    topics = results.get("topics") or []
    read_topics = set(submission.get("read_topics") or [])
    
    total_sentences = len(sentences)
    if total_sentences == 0:
        return {"read_count": 0, "total_count": 0}
        
    read_indices = set()
    for topic in topics:
        if topic.get("name") in read_topics:
            for idx in topic.get("sentences", []):
                read_indices.add(idx)
                
    return {"read_count": len(read_indices), "total_count": total_sentences}


@router.get("/submissions")
def list_submissions(
    submission_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
):
    """
    List submissions with optional filters.
    """
    if limit <= 0:
        raise HTTPException(status_code=400, detail="Limit must be positive")

    query = {}
    if submission_id:
        query["submission_id"] = submission_id

    fetch_limit = limit if not status else min(max(limit * 5, limit), 1000)
    submissions = submissions_storage.list(query, fetch_limit)

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
