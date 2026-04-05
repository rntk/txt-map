from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Tuple, Set
import re
import requests as http_requests

from lib.constants import TASK_PRIORITIES
from lib.storage.submissions import SubmissionsStorage
from lib.storage.task_queue import TaskQueueStorage, make_task_document
from lib.nlp import compute_word_frequencies
from handlers.dependencies import (
    get_submissions_storage,
    get_task_queue_storage,
    require_submission,
)


class SubmitRequest(BaseModel):
    html: str
    source_url: Optional[str] = ""


class FetchUrlRequest(BaseModel):
    url: str


class RefreshRequest(BaseModel):
    tasks: Optional[List[str]] = None


class ReadTopicsRequest(BaseModel):
    read_topics: List[str]


router = APIRouter()
EMBEDDED_PDF_IMAGE_RE = re.compile(
    r"""<img\b[^>]*\bsrc=["']data:image/(?:png|jpeg|jpg|gif|webp);base64,""",
    re.IGNORECASE,
)


def _queue_all_tasks(task_queue_storage: TaskQueueStorage, submission_id: str) -> None:
    """Insert task queue entries for a new submission."""
    for task_type, priority in TASK_PRIORITIES.items():
        task_queue_storage.create(
            make_task_document(submission_id, task_type, priority)
        )


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
        source_url=request.source_url,
    )

    _queue_all_tasks(task_queue_storage, submission["submission_id"])

    return {
        "submission_id": submission["submission_id"],
        "redirect_url": f"/page/text/{submission['submission_id']}",
    }


ALLOWED_UPLOAD_EXTENSIONS = {".html", ".htm", ".txt", ".md", ".pdf", ".fb2", ".epub"}


def _html_contains_embedded_pdf_images(html_content: str) -> bool:
    """Return True when converted PDF HTML contains at least one embedded raster image."""
    return bool(EMBEDDED_PDF_IMAGE_RE.search(html_content))


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
        html = md_lib.markdown(text, extensions=["extra", "codehilite"])
        return html, text

    if ext == ".pdf":
        from lib.pdf_to_html import convert_pdf_to_html, extract_text_from_pdf

        try:
            # Generate semantic HTML with headings, paragraphs, bold, italic
            html_content = convert_pdf_to_html(data)
            # Extract plain text for text_content
            text_content = extract_text_from_pdf(data)
            if not text_content.strip() and not _html_contains_embedded_pdf_images(
                html_content
            ):
                raise HTTPException(
                    status_code=400,
                    detail="PDF appears to contain no extractable text (may be scanned/image-only).",
                )
            return html_content, text_content
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not parse PDF: {e}")

    if ext == ".fb2":
        from lib.fb2_to_html import convert_fb2_to_html, extract_text_from_fb2

        try:
            html_content = convert_fb2_to_html(data)
            text_content = extract_text_from_fb2(data)
            if not text_content.strip():
                raise HTTPException(
                    status_code=400,
                    detail="FB2 appears to contain no extractable text.",
                )
            return html_content, text_content
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not parse FB2: {e}")

    if ext == ".epub":
        from lib.epub_to_html import convert_epub_to_html, extract_text_from_epub

        try:
            html_content = convert_epub_to_html(data)
            text_content = extract_text_from_epub(data)
            if not text_content.strip():
                raise HTTPException(
                    status_code=400,
                    detail="EPUB appears to contain no extractable text.",
                )
            return html_content, text_content
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not parse EPUB: {e}")

    raise HTTPException(
        status_code=415,
        detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))}",
    )


@router.post("/upload")
async def post_upload(
    file: UploadFile = File(...),
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
    task_queue_storage: TaskQueueStorage = Depends(get_task_queue_storage),
) -> Dict[str, str]:
    """
    Accept an uploaded file (html, htm, txt, md, pdf, fb2, epub), extract its text/html
    content, and process it the same way as a browser-extension submission.
    """
    filename = file.filename or ""
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type. Allowed extensions: {', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))}",
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
        "redirect_url": f"/page/text/{submission['submission_id']}",
    }


@router.post("/fetch-url")
def post_fetch_url(
    request: FetchUrlRequest,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
    task_queue_storage: TaskQueueStorage = Depends(get_task_queue_storage),
) -> Dict[str, str]:
    """
    Fetch a URL, detect its content type, extract content (HTML, PDF, etc.),
    and create a submission just like a file upload.
    """
    url = request.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400, detail="URL must start with http:// or https://"
        )

    try:
        response = http_requests.get(
            url,
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0 (compatible; TextAnalyzer/1.0)"},
            allow_redirects=True,
        )
        response.raise_for_status()
    except http_requests.exceptions.Timeout:
        raise HTTPException(
            status_code=502, detail="Request timed out while fetching the URL."
        )
    except http_requests.exceptions.ConnectionError as e:
        raise HTTPException(status_code=502, detail=f"Could not connect to URL: {e}")
    except http_requests.exceptions.HTTPError as e:
        raise HTTPException(
            status_code=502, detail=f"Remote server returned an error: {e}"
        )
    except http_requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch URL: {e}")

    content_type = (
        response.headers.get("Content-Type", "").lower().split(";")[0].strip()
    )
    data = response.content

    if content_type == "application/pdf":
        html_content, text_content = _extract_content_from_upload("document.pdf", data)
    elif (
        content_type.startswith("text/")
        or content_type in ("application/xhtml+xml",)
        or not content_type
    ):
        decoded = data.decode("utf-8", errors="replace")
        html_content = decoded
        text_content = decoded
    else:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported content type '{content_type}'. Supported: HTML pages and PDFs.",
        )

    submission = submissions_storage.create(
        html_content=html_content,
        text_content=text_content,
        source_url=url,
    )

    _queue_all_tasks(task_queue_storage, submission["submission_id"])

    return {
        "submission_id": submission["submission_id"],
        "redirect_url": f"/page/text/{submission['submission_id']}",
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
        "tasks": submissions_storage.get_known_tasks(submission),
        "overall_status": overall_status,
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
            "tasks": submissions_storage.get_known_tasks(submission),
        },
        "results": submission["results"],
        "read_topics": submission.get("read_topics", []),
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

    return {"submission_id": submission_id, "read_topics": body.read_topics}


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

    return {"message": "Submission deleted", "submission_id": submission_id}


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
    invalid_tasks = [
        t for t in requested_tasks if t != "all" and t not in valid_task_names
    ]

    if invalid_tasks:
        raise HTTPException(
            status_code=400, detail=f"Unsupported task(s): {', '.join(invalid_tasks)}"
        )

    task_names = submissions_storage.expand_recalculation_tasks(requested_tasks)

    # Reset existing data and queue
    submissions_storage.clear_results(submission_id, task_names)
    task_queue_storage.delete_by_submission(submission_id, task_types=task_names)

    # Re-queue
    for task_name in task_names:
        priority = TASK_PRIORITIES.get(task_name, 3)
        task_queue_storage.create(
            make_task_document(submission_id, task_name, priority)
        )

    return {"message": "Tasks queued for recalculation", "tasks_queued": task_names}


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
        pattern = re.compile(rf"\b{re.escape(word)}\b", re.IGNORECASE)
        for idx, sentence in enumerate(sentences):
            if pattern.search(sentence):
                sentence_indices.add(idx + 1)
    else:
        for topic in topics:
            name = topic.get("name", "")
            parts = [p.strip() for p in name.split(">")]

            # Check if topic matches hierarchical path
            if len(parts) >= len(path) and all(
                parts[i] == path[i] for i in range(len(path))
            ):
                for idx in topic.get("sentences") or []:
                    sentence_indices.add(int(idx))

    filtered_texts = [
        sentences[idx - 1] for idx in sentence_indices if 1 <= idx <= len(sentences)
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
        {
            "submission_id": 1,
            "source_url": 1,
            "results.topics": 1,
            "results.sentences": 1,
        },
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
            texts = [
                all_sentences[i - 1] for i in indices if 1 <= i <= len(all_sentences)
            ]

            if texts:
                group = {
                    "submission_id": sub["submission_id"],
                    "source_url": sub.get("source_url", ""),
                    "topic_name": topic["name"],
                    "sentences": texts,
                }
                if include_context:
                    group.update(
                        {
                            "all_sentences": all_sentences,
                            "topics": topics,
                            "indices": indices,
                        }
                    )
                groups.append(group)

    return {"groups": groups}


def _is_topic_read(topic_name: str, read_topics: Set[str]) -> bool:
    """Return True when the exact topic or one of its parent paths is marked read."""
    if not topic_name:
        return False

    parts = [part.strip() for part in topic_name.split(">") if part.strip()]
    current_path = ""

    for index, part in enumerate(parts):
        current_path = part if index == 0 else f"{current_path}>{part}"
        if current_path in read_topics:
            return True

    return False


def _calculate_read_indices(topics: List[Dict], read_topics: Set[str]) -> Set[int]:
    """Helper to get unique sentence indices for read topics."""
    indices = set()
    for topic in topics:
        if _is_topic_read(topic.get("name") or "", read_topics):
            indices.update(topic.get("sentences") or [])
    return indices


@router.get("/submissions/read-progress")
def get_global_read_progress(
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
) -> Dict[str, int]:
    submissions = submissions_storage.list_with_projection(
        {},
        {
            "results.sentences": 1,
            "results.topics.name": 1,
            "results.topics.sentences": 1,
            "read_topics": 1,
        },
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


@router.get("/submission/{submission_id}/topic-analysis")
def get_topic_analysis(
    submission: dict = Depends(require_submission),
) -> Dict[str, Any]:
    results = submission.get("results") or {}
    tasks = submission.get("tasks") or {}
    return {
        "submission_id": submission["submission_id"],
        "source_url": submission.get("source_url", ""),
        "topics": results.get("topics", []),
        "sentences": results.get("sentences", []),
        "clusters": results.get("clusters", []),
        "topic_model": results.get("topic_model", {}),
        "subtopics": results.get("subtopics", []),
        "topic_summaries": results.get("topic_summaries", {}),
        "task_status": {
            "clustering_generation": tasks.get("clustering_generation", {}).get(
                "status"
            ),
            "topic_modeling_generation": tasks.get("topic_modeling_generation", {}).get(
                "status"
            ),
            "split_topic_generation": tasks.get("split_topic_generation", {}).get(
                "status"
            ),
        },
    }


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
        items.append(
            {
                "submission_id": sub.get("submission_id"),
                "source_url": sub.get("source_url", ""),
                "created_at": sub.get("created_at"),
                "updated_at": sub.get("updated_at"),
                "overall_status": overall_status,
                "text_characters": len(sub.get("text_content") or ""),
                "sentence_count": len(results.get("sentences") or []),
                "topic_count": len(results.get("topics") or []),
            }
        )

        if len(items) >= limit:
            break

    return {"submissions": items, "count": len(items)}
