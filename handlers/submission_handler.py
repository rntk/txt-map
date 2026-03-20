from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Tuple, Set
import re

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


def _queue_all_tasks(task_queue_storage: TaskQueueStorage, submission_id: str) -> None:
    """Insert task queue entries for a new submission."""
    for task_type, priority in TASK_PRIORITIES.items():
        task_queue_storage.create(make_task_document(submission_id, task_type, priority))


@router.post("/submit")
def post_submit(
    request: SubmitRequest,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
    task_queue_storage: TaskQueueStorage = Depends(get_task_queue_storage),
) -> Dict[str, str]:
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


def _extract_content_from_upload(filename: str, data: bytes) -> Tuple[str, str]:
    """
    Extract (html_content, text_content) from uploaded file bytes.
    Returns (html_content, text_content) — for plain text types both are the same.
    """
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""

    if ext in (".html", ".htm", ".txt"):
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
) -> Dict[str, str]:
    """
    Accept an uploaded file (html, htm, txt, md, pdf), extract its text/html
    content, and process it the same way as a browser-extension submission.
    """
    filename = file.filename or ""
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
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
) -> Dict[str, Any]:
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
) -> Dict[str, Any]:
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
) -> Dict[str, Any]:
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
) -> Dict[str, str]:
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
) -> Dict[str, Any]:
    """
    Clear results and re-queue tasks for recalculation
    """
    submission_id = submission["submission_id"]

    requested_tasks = refresh_request.tasks or ["all"]
    valid_task_names = submissions_storage.task_names
    invalid_tasks = [t for t in requested_tasks if t != "all" and t not in valid_task_names]
    
    if invalid_tasks:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported task(s): {', '.join(invalid_tasks)}"
        )
        
    task_names = submissions_storage.expand_recalculation_tasks(requested_tasks)

    # Reset existing data and queue
    submissions_storage.clear_results(submission_id, task_names)
    task_queue_storage.delete_by_submission(submission_id, task_types=task_names)

    # Re-queue
    for task_name in task_names:
        priority = TASK_PRIORITIES.get(task_name, 3)
        task_queue_storage.create(make_task_document(submission_id, task_name, priority))

    return {
        "message": "Tasks queued for recalculation",
        "tasks_queued": task_names
    }


@router.get("/submission/{submission_id}/word-cloud")
def get_word_cloud(
    path: List[str] = Query(default=[]),
    word: Optional[str] = Query(default=None),
    top_n: int = Query(default=60, ge=1, le=200),
    submission: dict = Depends(require_submission),
) -> Dict[str, Any]:
    """
    Return a word-frequency cloud for the sentences. If *word* is provided,
    it filters for sentences containing that word. Otherwise, it filters by *path*
    (a hierarchical list of topic segments, e.g. ["Sport", "Tennis"]).
    """
    results = submission.get("results") or {}
    topics = results.get("topics") or []
    sentences = results.get("sentences") or []

    if not sentences:
        return {"words": [], "sentence_count": 0}

    # Collect sentence indices
    sentence_indices: Set[int] = set()
    
    if word:
        # Regex to match exact word with boundaries, case-insensitive
        pattern = re.compile(rf'\b{re.escape(word)}\b', re.IGNORECASE)
        for idx, sentence in enumerate(sentences):
            if pattern.search(sentence):
                sentence_indices.add(idx + 1)
    else:
        for topic in topics:
            name = topic.get("name", "")
            parts = [p.strip() for p in name.split(">")]
            
            # Check if topic matches hierarchical path
            if len(parts) >= len(path) and all(parts[i] == path[i] for i in range(len(path))):
                for idx in (topic.get("sentences") or []):
                    sentence_indices.add(int(idx))

    filtered_texts = [
        sentences[idx - 1]
        for idx in sentence_indices
        if 1 <= idx <= len(sentences)
    ]

    words = compute_word_frequencies(filtered_texts, top_n=top_n)
    return {"words": words, "sentence_count": len(sentence_indices)}


@router.get("/global-topics")
def get_global_topics(
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
) -> Dict[str, Any]:
    """
    Return aggregated topic tree across all completed submissions.
    """
    return {"topics": submissions_storage.aggregate_global_topics()}


@router.get("/global-topics/sentences")
def get_global_topics_sentences(
    topic_name: List[str] = Query(default=[]),
    include_context: bool = Query(default=False),
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
) -> Dict[str, List[Dict[str, Any]]]:
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
    for sub in submissions:
        results = sub.get("results") or {}
        all_sentences = results.get("sentences") or []
        topics = results.get("topics") or []
        
        for topic in topics:
            if topic.get("name") not in topic_name:
                continue
                
            indices = topic.get("sentences") or []
            texts = [all_sentences[i-1] for i in indices if 1 <= i <= len(all_sentences)]
            
            if texts:
                group = {
                    "submission_id": sub["submission_id"],
                    "source_url": sub.get("source_url", ""),
                    "topic_name": topic["name"],
                    "sentences": texts
                }
                if include_context:
                    group.update({"all_sentences": all_sentences, "topics": topics, "indices": indices})
                groups.append(group)
                
    return {"groups": groups}


def _calculate_read_indices(topics: List[Dict], read_topics: Set[str]) -> Set[int]:
    """Helper to get unique sentence indices for read topics."""
    indices = set()
    for topic in topics:
        if topic.get("name") in read_topics:
            indices.update(topic.get("sentences") or [])
    return indices


@router.get("/submissions/read-progress")
def get_global_read_progress(
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
) -> Dict[str, int]:
    submissions = submissions_storage.list_with_projection(
        {},
        {"results.sentences": 1, "results.topics.name": 1, "results.topics.sentences": 1, "read_topics": 1}
    )
    
    total_sentences = 0
    total_read = 0
    
    for sub in submissions:
        results = sub.get("results") or {}
        sentences = results.get("sentences") or []
        if not sentences:
            continue
            
        read_topics = set(sub.get("read_topics") or [])
        read_indices = _calculate_read_indices(results.get("topics") or [], read_topics)
                    
        total_sentences += len(sentences)
        total_read += len(read_indices)
        
    return {"read_count": total_read, "total_count": total_sentences}


@router.get("/submission/{submission_id}/read-progress")
def get_submission_read_progress(
    submission: dict = Depends(require_submission),
) -> Dict[str, int]:
    results = submission.get("results") or {}
    sentences = results.get("sentences") or []
    total_sentences = len(sentences)
    
    if total_sentences == 0:
        return {"read_count": 0, "total_count": 0}
        
    read_topics = set(submission.get("read_topics") or [])
    read_indices = _calculate_read_indices(results.get("topics") or [], read_topics)
                
    return {"read_count": len(read_indices), "total_count": total_sentences}


@router.get("/submissions")
def list_submissions(
    submission_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
) -> Dict[str, Any]:
    """
    List submissions with optional filters.
    """
    if limit <= 0:
        raise HTTPException(status_code=400, detail="Limit must be positive")

    query = {"submission_id": submission_id} if submission_id else {}
    # Fetch more if status filter is active since we filter in-memory
    fetch_limit = limit if not status else min(max(limit * 5, limit), 1000)
    submissions = submissions_storage.list(query, fetch_limit)

    items = []
    for sub in submissions:
        overall_status = submissions_storage.get_overall_status(sub)
        if status and overall_status != status:
            continue

        results = sub.get("results") or {}
        items.append({
            "submission_id": sub.get("submission_id"),
            "source_url": sub.get("source_url", ""),
            "created_at": sub.get("created_at"),
            "updated_at": sub.get("updated_at"),
            "overall_status": overall_status,
            "text_characters": len(sub.get("text_content") or ""),
            "sentence_count": len(results.get("sentences") or []),
            "topic_count": len(results.get("topics") or [])
        })

        if len(items) >= limit:
            break

    return {"submissions": items, "count": len(items)}
