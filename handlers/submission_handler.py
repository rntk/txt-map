from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Form
from pydantic import BaseModel
from typing import Any
import hashlib
import re
import requests as http_requests

from lib.constants import AUTO_TASKS, TASK_PRIORITIES
from lib.nlp import compute_bigram_heatmap, normalize_text_tokens
from lib.storage.submissions import SubmissionsStorage
from lib.storage.task_queue import TaskQueueStorage, make_task_document
from lib.storage.llm_cache import MongoLLMCacheStore
from lib.llm_queue.store import LLMQueueStore
from lib.llm_queue.client import QueuedLLMClient
from lib.llm import create_llm_client
from lib.tasks.word_context_highlights import (
    WORD_CONTEXT_HIGHLIGHT_PROMPT_VERSION,
    _cache_namespace,
    build_word_context_job_signature,
    submit_topic_requests,
    process_pending_requests,
)
from handlers.dependencies import (
    get_db,
    get_submissions_storage,
    get_task_queue_storage,
    get_llm_queue_store,
    get_cache_store,
    require_submission,
)


class SubmitRequest(BaseModel):
    html: str
    source_url: str | None = ""


class FetchUrlRequest(BaseModel):
    url: str
    embed_images: bool = False


class RefreshRequest(BaseModel):
    tasks: list[str] | None = None


class ReadTopicsRequest(BaseModel):
    read_topics: list[str]


class TagFrequencyTopicLink(BaseModel):
    label: str
    full_path: str
    frequency: int


class TagFrequencyRow(BaseModel):
    word: str
    frequency: int
    topics: list[TagFrequencyTopicLink]


class TagFrequencyResponse(BaseModel):
    scope_path: list[str]
    sentence_count: int
    rows: list[TagFrequencyRow]


class WordContextHighlightsRequest(BaseModel):
    word: str
    refresh: bool = False


def _word_storage_key(word: str) -> str:
    """Return a stable MongoDB field-name key for a word.

    Uses a SHA-1 hex digest so that characters illegal in MongoDB field names
    (dots, dollar signs) and collisions from normalisation (e.g. "a.b" vs "a_b")
    are never an issue.
    """
    return hashlib.sha1(word.lower().encode()).hexdigest()[:20]


def _count_matching_topics(
    all_topics: list[dict[str, Any]],
    all_sentences: list[str],
    pattern: re.Pattern,
) -> int:
    """Count topics that contain at least one sentence matching the word pattern."""
    return sum(
        1
        for t in all_topics
        if any(
            pattern.search(all_sentences[i - 1])
            for i in (t.get("sentences") or [])
            if 1 <= i <= len(all_sentences)
        )
    )


router = APIRouter()
EMBEDDED_PDF_IMAGE_RE = re.compile(
    r"""<img\b[^>]*\bsrc=["']data:image/(?:png|jpeg|jpg|gif|webp);base64,""",
    re.IGNORECASE,
)


def _queue_all_tasks(task_queue_storage: TaskQueueStorage, submission_id: str) -> None:
    """Queue the auto-run tasks for a new submission. Other tasks are manual-only."""
    for task_type in AUTO_TASKS:
        task_queue_storage.create(
            make_task_document(
                submission_id, task_type, TASK_PRIORITIES.get(task_type, 3)
            )
        )


def _topic_sentence_texts(
    submission: dict[str, Any], topic_name: str
) -> tuple[dict[str, Any], list[str], list[str]]:
    """Resolve a topic by name and return topic and non-topic sentence texts."""
    results = submission.get("results") or {}
    topics = results.get("topics") or []
    sentences = results.get("sentences") or []

    topic = next((item for item in topics if item.get("name") == topic_name), None)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    sentence_indices: list[int] = topic.get("sentences") or []
    topic_sentence_index_set: set[int] = {
        index
        for index in sentence_indices
        if isinstance(index, int) and 1 <= index <= len(sentences)
    }
    topic_sentences: list[str] = [
        sentences[index - 1] for index in sorted(topic_sentence_index_set)
    ]
    background_sentences: list[str] = [
        sentence
        for index, sentence in enumerate(sentences, start=1)
        if index not in topic_sentence_index_set
    ]
    return topic, topic_sentences, background_sentences


def _article_sentence_texts(submission: dict[str, Any]) -> list[str]:
    """Return all non-empty sentence texts for a submission."""
    results = submission.get("results") or {}
    sentences = results.get("sentences") or []
    return [
        sentence for sentence in sentences if isinstance(sentence, str) and sentence
    ]


def _topic_name_parts(topic_name: str) -> list[str]:
    """Split a hierarchical topic name into trimmed path segments."""
    return [part.strip() for part in str(topic_name or "").split(">") if part.strip()]


def _is_within_scope(topic_parts: list[str], scope_path: list[str]) -> bool:
    """Return True when the topic path lies inside the requested scope."""
    if len(scope_path) == 0:
        return True
    if len(topic_parts) < len(scope_path):
        return False
    return topic_parts[: len(scope_path)] == scope_path


def _build_tag_frequency_rows(
    submission: dict[str, Any], scope_path: list[str], limit: int | None
) -> TagFrequencyResponse:
    """Aggregate lemmatized word frequencies and scoped topic associations."""
    results: dict[str, Any] = submission.get("results") or {}
    topics: list[dict[str, Any]] = results.get("topics") or []
    sentences: list[str] = results.get("sentences") or []

    scoped_sentence_indices: set[int] = set()
    child_topic_sentence_sets: dict[str, set[int]] = {}

    for topic in topics:
        topic_name = topic.get("name")
        if not isinstance(topic_name, str) or not topic_name.strip():
            continue

        topic_parts = _topic_name_parts(topic_name)
        if not _is_within_scope(topic_parts, scope_path):
            continue

        sentence_indices = {
            sentence_index
            for sentence_index in (topic.get("sentences") or [])
            if isinstance(sentence_index, int) and 1 <= sentence_index <= len(sentences)
        }
        if not sentence_indices:
            continue

        scoped_sentence_indices.update(sentence_indices)

        if len(topic_parts) > len(scope_path):
            child_parts = topic_parts[: len(scope_path) + 1]
            child_full_path = ">".join(child_parts)
            child_topic_sentence_sets.setdefault(child_full_path, set()).update(
                sentence_indices
            )

    if len(scope_path) == 0:
        selected_sentence_indices: list[int] = list(range(1, len(sentences) + 1))
    else:
        selected_sentence_indices = sorted(scoped_sentence_indices)

    sentence_word_counts: dict[int, dict[str, int]] = {}
    total_counts: dict[str, int] = {}

    for sentence_index in selected_sentence_indices:
        sentence_text = sentences[sentence_index - 1]
        if not isinstance(sentence_text, str) or not sentence_text:
            continue

        normalized_tokens = normalize_text_tokens(sentence_text)
        token_counts: dict[str, int] = {}
        for token in normalized_tokens:
            token_counts[token] = token_counts.get(token, 0) + 1
            total_counts[token] = total_counts.get(token, 0) + 1

        if token_counts:
            sentence_word_counts[sentence_index] = token_counts

    rows: list[TagFrequencyRow] = []
    sorted_words = sorted(total_counts.items(), key=lambda item: (-item[1], item[0]))
    limited_words = sorted_words if limit is None else sorted_words[:limit]
    for word, frequency in limited_words:
        topic_links: list[TagFrequencyTopicLink] = []
        for (
            child_full_path,
            child_sentence_indices,
        ) in child_topic_sentence_sets.items():
            child_frequency = 0
            for sentence_index in child_sentence_indices:
                if sentence_index not in sentence_word_counts:
                    continue
                child_frequency += sentence_word_counts[sentence_index].get(word, 0)

            if child_frequency <= 0:
                continue

            child_parts = _topic_name_parts(child_full_path)
            topic_links.append(
                TagFrequencyTopicLink(
                    label=child_parts[-1] if child_parts else child_full_path,
                    full_path=child_full_path,
                    frequency=child_frequency,
                )
            )

        topic_links.sort(key=lambda item: (-item.frequency, item.label.lower()))
        rows.append(TagFrequencyRow(word=word, frequency=frequency, topics=topic_links))

    return TagFrequencyResponse(
        scope_path=scope_path,
        sentence_count=len(selected_sentence_indices),
        rows=rows,
    )


@router.post("/submit")
def post_submit(
    request: SubmitRequest,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
    task_queue_storage: TaskQueueStorage = Depends(get_task_queue_storage),
) -> dict[str, str]:
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

# 50 MB upload size cap to prevent unbounded memory consumption
MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024


def _html_contains_embedded_pdf_images(html_content: str) -> bool:
    """Return True when converted PDF HTML contains at least one embedded raster image."""
    return bool(EMBEDDED_PDF_IMAGE_RE.search(html_content))


def _extract_content_from_upload(
    filename: str, data: bytes, embed_images: bool = False
) -> tuple[str, str]:
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
            html_content = convert_pdf_to_html(data, embed_images=embed_images)
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
    embed_images: bool = Form(False),
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
    task_queue_storage: TaskQueueStorage = Depends(get_task_queue_storage),
) -> dict[str, str]:
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

    if file.size is not None and file.size > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {MAX_UPLOAD_SIZE // (1024 * 1024)} MB.",
        )

    data = await file.read()
    html_content, text_content = _extract_content_from_upload(
        filename, data, embed_images=embed_images
    )

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
) -> dict[str, str]:
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
        html_content, text_content = _extract_content_from_upload(
            "document.pdf", data, embed_images=request.embed_images
        )
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
) -> dict[str, Any]:
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
) -> dict[str, Any]:
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
) -> dict[str, Any]:
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
) -> dict[str, str]:
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
) -> dict[str, Any]:
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


@router.get("/submission/{submission_id}/tag-frequency")
def get_tag_frequency(
    path: list[str] = Query(default=[]),
    limit: int | None = Query(default=None, ge=1, le=5000),
    submission: dict[str, Any] = Depends(require_submission),
) -> dict[str, Any]:
    """Return lemmatized word frequencies for the article or a scoped topic branch."""
    response = _build_tag_frequency_rows(submission, path, limit)
    return response.model_dump()


@router.get("/submission/{submission_id}/similar-words")
def get_similar_words(
    word: str = Query(...),
    submission: dict = Depends(require_submission),
) -> dict[str, Any]:
    """
    Return top 10 similar words from the article using a multi-stage approach.
    1. Lemma matches, 2. Fuzzy matches, 3. Topic-based keywords, 4. Frequent words.
    """
    results = submission.get("results") or {}
    sentences = results.get("sentences") or []
    topics = results.get("topics") or []

    from lib.nlp import _lemmatizer_instance, _stop_words_set

    lemmatizer = _lemmatizer_instance()
    stop_words = _stop_words_set()
    import difflib
    from collections import Counter

    word_lower = word.lower()
    word_lemma = lemmatizer.lemmatize(word_lower, pos="v")

    # Collect unique candidate words
    all_tokens = []
    for sent in sentences:
        all_tokens.extend(re.findall(r"\b[a-z]{3,}\b", sent.lower()))

    candidate_counts = Counter([t for t in all_tokens if t not in stop_words])
    unique_candidates = sorted(
        candidate_counts.keys(), key=lambda x: candidate_counts[x], reverse=True
    )

    similar_words = []

    # 1. Lemma / Exact matches
    for candidate in unique_candidates:
        if (
            lemmatizer.lemmatize(candidate, pos="v") == word_lemma
            or candidate == word_lower
        ):
            if candidate != word_lower:
                similar_words.append(candidate)

    # 2. Fuzzy / Substring matches (if not enough from stage 1)
    if len(similar_words) < 10:
        fuzzy_matches = difflib.get_close_matches(
            word_lower, unique_candidates, n=10, cutoff=0.7
        )
        for fm in fuzzy_matches:
            if fm not in similar_words and fm != word_lower:
                similar_words.append(fm)

        # Substring search
        for candidate in unique_candidates:
            if word_lower in candidate or candidate in word_lower:
                if candidate not in similar_words and candidate != word_lower:
                    similar_words.append(candidate)

    # 3. Topic-based neighbors (words that appear in the same topic as the word, if any)
    pattern = re.compile(rf"\b{re.escape(word)}\b", re.IGNORECASE)
    related_topics = [
        t
        for t in topics
        if any(pattern.search(sentences[i - 1]) for i in t.get("sentences", []))
    ]

    if related_topics:
        for t in related_topics:
            for i in t.get("sentences", []):
                for w in re.findall(r"\b[a-z]{3,}\b", sentences[i - 1].lower()):
                    if (
                        w not in stop_words
                        and w != word_lower
                        and w not in similar_words
                    ):
                        similar_words.append(w)

    # 4. Fallback (top frequent words)
    if len(similar_words) < 10:
        for w, _ in candidate_counts.most_common(20):
            if w not in similar_words and w != word_lower:
                similar_words.append(w)

    return {"similar_words": list(dict.fromkeys(similar_words))[:10]}


@router.post("/submission/{submission_id}/word-context-highlights")
def start_word_context_highlights(
    body: WordContextHighlightsRequest,
    submission: dict[str, Any] = Depends(require_submission),
    storage: SubmissionsStorage = Depends(get_submissions_storage),
    db: Any = Depends(get_db),
    llm_queue_store: LLMQueueStore = Depends(get_llm_queue_store),
    cache_store: MongoLLMCacheStore = Depends(get_cache_store),
) -> dict[str, Any]:
    """Submit word-context highlight requests (one LLM call per topic) to the queue.

    Returns immediately with current progress. Poll GET to track completion.
    """
    word = body.word.strip()
    if not word:
        raise HTTPException(status_code=422, detail="word must not be empty")

    submission_id: str = submission["submission_id"]
    results: dict[str, Any] = submission.get("results") or {}
    all_sentences: list[str] = results.get("sentences") or []
    all_topics: list[dict[str, Any]] = results.get("topics") or []

    if not all_sentences or not all_topics:
        return {
            "status": "completed",
            "word": word,
            "total": 0,
            "completed": 0,
            "highlights": {},
        }

    # Find topics that contain at least one sentence matching the word
    pattern = re.compile(rf"\b{re.escape(word)}\b", re.IGNORECASE)
    matching_topics = [
        t
        for t in all_topics
        if any(
            pattern.search(all_sentences[i - 1])
            for i in (t.get("sentences") or [])
            if 1 <= i <= len(all_sentences)
        )
    ]

    if not matching_topics:
        return {
            "status": "completed",
            "word": word,
            "total": 0,
            "completed": 0,
            "highlights": {},
        }

    # Build LLM client to get model metadata (respects runtime config overrides), then wrap in QueuedLLMClient
    llm_meta = create_llm_client(db=db)
    namespace = _cache_namespace(llm_meta, word)
    job_signature = build_word_context_job_signature(llm_meta, word)
    word_key = _word_storage_key(word)
    stored_job: dict[str, Any] = (results.get("word_context_highlights") or {}).get(
        word_key
    ) or {}
    existing_job: dict[str, Any] = {}
    if not body.refresh and stored_job.get("signature") == job_signature:
        existing_job = stored_job
    existing_pending: dict[str, Any] = existing_job.get("pending") or {}
    existing_highlights: dict[str, Any] = existing_job.get("highlights") or {}

    queued_llm = QueuedLLMClient(
        store=llm_queue_store,
        model_id=llm_meta.model_id,
        max_context_tokens=llm_meta.max_context_tokens,
        provider_key=llm_meta.provider_key,
        provider_name=llm_meta.provider_name,
        model_name=llm_meta.model_name,
        cache_store=cache_store,
        namespace=namespace,
        prompt_version=WORD_CONTEXT_HIGHLIGHT_PROMPT_VERSION,
    )

    # Only submit topics that don't already have results or pending requests
    topics_to_submit = [
        t
        for t in matching_topics
        if t.get("name") not in existing_highlights
        and t.get("name") not in existing_pending
    ]

    new_pending: dict[str, Any] = {}
    new_resolved_highlights: dict[str, Any] = {}
    if topics_to_submit:
        new_pending, new_resolved_highlights = submit_topic_requests(
            word, topics_to_submit, all_sentences, queued_llm
        )

    # Merge queue entries with any pre-existing pending
    still_pending: dict[str, Any] = {**existing_pending, **new_pending}

    merged_highlights = {**existing_highlights, **new_resolved_highlights}

    # Persist updated job state
    storage.update_results(
        submission_id,
        {
            f"word_context_highlights.{word_key}": {
                "signature": job_signature,
                "prompt_version": WORD_CONTEXT_HIGHLIGHT_PROMPT_VERSION,
                "model_id": llm_meta.model_id,
                "namespace": namespace,
                "pending": still_pending,
                "highlights": merged_highlights,
            }
        },
    )

    total = len(matching_topics)
    completed_count = len(merged_highlights)
    status = "completed" if len(still_pending) == 0 else "pending"

    return {
        "status": status,
        "word": word,
        "total": total,
        "completed": completed_count,
        "highlights": merged_highlights,
    }


@router.get("/submission/{submission_id}/word-context-highlights")
def get_word_context_highlights(
    word: str = Query(...),
    submission: dict[str, Any] = Depends(require_submission),
    storage: SubmissionsStorage = Depends(get_submissions_storage),
    llm_queue_store: LLMQueueStore = Depends(get_llm_queue_store),
) -> dict[str, Any]:
    """Poll word-context highlight progress and return available results."""
    word = word.strip()
    if not word:
        raise HTTPException(status_code=422, detail="word must not be empty")

    submission_id: str = submission["submission_id"]
    results: dict[str, Any] = submission.get("results") or {}
    all_sentences: list[str] = results.get("sentences") or []
    all_topics: list[dict[str, Any]] = results.get("topics") or []

    word_key = _word_storage_key(word)
    job: dict[str, Any] = (results.get("word_context_highlights") or {}).get(
        word_key
    ) or {}

    if not job:
        return {"status": "not_found", "total": 0, "completed": 0, "highlights": {}}

    pending: dict[str, Any] = job.get("pending") or {}
    highlights: dict[str, Any] = job.get("highlights") or {}

    if pending:
        topics_by_name = {t.get("name", ""): t for t in all_topics}
        still_pending, newly_completed = process_pending_requests(
            pending, topics_by_name, all_sentences, llm_queue_store
        )

        if newly_completed:
            merged_highlights = {**highlights, **newly_completed}
            storage.update_results(
                submission_id,
                {
                    f"word_context_highlights.{word_key}": {
                        "signature": job.get("signature"),
                        "prompt_version": job.get("prompt_version"),
                        "model_id": job.get("model_id"),
                        "namespace": job.get("namespace"),
                        "pending": still_pending,
                        "highlights": merged_highlights,
                    }
                },
            )
            highlights = merged_highlights
            pending = still_pending

    pattern = re.compile(rf"\b{re.escape(word)}\b", re.IGNORECASE)
    total = _count_matching_topics(all_topics, all_sentences, pattern)

    status = "completed" if len(pending) == 0 else "pending"
    return {
        "status": status,
        "total": total,
        "completed": len(highlights),
        "highlights": highlights,
    }


@router.get("/global-topics")
def get_global_topics(
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
) -> dict[str, Any]:
    """
    Return aggregated topic tree across all completed submissions.
    """
    return {"topics": submissions_storage.aggregate_global_topics()}


@router.get("/global-topics/sentences")
def get_global_topics_sentences(
    topic_name: list[str] = Query(default=[]),
    include_context: bool = Query(default=False),
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
) -> dict[str, list[dict[str, Any]]]:
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


def _is_topic_read(topic_name: str, read_topics: set[str]) -> bool:
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


def _calculate_read_indices(
    topics: list[dict[str, Any]], read_topics: set[str]
) -> set[int]:
    """Helper to get unique sentence indices for read topics."""
    indices: set[int] = set()
    for topic in topics:
        if _is_topic_read(topic.get("name") or "", read_topics):
            indices.update(topic.get("sentences") or [])
    return indices


@router.get("/submissions/read-progress")
def get_global_read_progress(
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
) -> dict[str, int]:
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
) -> dict[str, int]:
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
) -> dict[str, Any]:
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
        "topic_tag_rankings": results.get("topic_tag_rankings", {}),
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


@router.get("/submission/{submission_id}/topic-analysis/heatmap")
def get_topic_analysis_heatmap(
    topic_name: str | None = Query(default=None, min_length=1),
    scope: str = Query(default="topic", pattern="^(topic|article)$"),
    submission: dict = Depends(require_submission),
) -> dict[str, Any]:
    """Return a normalized co-occurrence heatmap for a topic or whole article."""
    resolved_topic_name: str | None = None

    if scope == "article":
        topic_sentences = _article_sentence_texts(submission)
        background_sentences = []
    else:
        if not topic_name:
            raise HTTPException(status_code=422, detail="topic_name is required")
        topic, topic_sentences, background_sentences = _topic_sentence_texts(
            submission, topic_name
        )
        resolved_topic_name = topic.get("name", topic_name)

    heatmap_data = compute_bigram_heatmap(
        topic_sentences,
        background_sentences,
        window_size=3,
        default_visible_word_count=40,
    )
    return {
        "submission_id": submission["submission_id"],
        "scope": scope,
        "topic_name": resolved_topic_name,
        "window_size": heatmap_data["window_size"],
        "normalization": "lemma",
        "words": heatmap_data["words"],
        "col_words": heatmap_data["col_words"],
        "matrix": heatmap_data["matrix"],
        "max_value": heatmap_data["max_value"],
        "default_visible_word_count": heatmap_data["default_visible_word_count"],
        "total_word_count": heatmap_data["total_word_count"],
    }


@router.get("/submission/{submission_id}/topic-analysis/topic-word-heatmap")
def get_topic_word_heatmap(
    top_words: int = Query(default=80, ge=1, le=500),
    submission: dict = Depends(require_submission),
) -> dict[str, Any]:
    """Return a matrix of word frequencies per topic (rows=words, cols=topics)."""
    import collections

    results = submission.get("results") or {}
    topics: list[dict[str, Any]] = results.get("topics") or []
    sentences: list[str] = results.get("sentences") or []

    topic_entries: list[tuple[str, collections.Counter]] = []
    word_totals: collections.Counter[str] = collections.Counter()

    for topic in topics:
        topic_name = topic.get("name")
        if not isinstance(topic_name, str) or not topic_name.strip():
            continue

        sentence_indices = [
            index
            for index in (topic.get("sentences") or [])
            if isinstance(index, int) and 1 <= index <= len(sentences)
        ]
        if not sentence_indices:
            continue

        word_counts: collections.Counter[str] = collections.Counter()
        for sentence_index in sentence_indices:
            sentence_text = sentences[sentence_index - 1]
            if isinstance(sentence_text, str) and sentence_text:
                word_counts.update(normalize_text_tokens(sentence_text))

        if not word_counts:
            continue

        topic_entries.append((topic_name, word_counts))
        word_totals.update(word_counts)

    selected_words = [word for word, _ in word_totals.most_common(top_words)]
    word_index = {word: i for i, word in enumerate(selected_words)}

    matrix: list[list[int]] = [
        [0 for _ in range(len(topic_entries))] for _ in selected_words
    ]
    for col, (_topic_name, word_counts) in enumerate(topic_entries):
        for word, count in word_counts.items():
            row = word_index.get(word)
            if row is not None:
                matrix[row][col] = count

    word_entries = [
        {
            "word": word,
            "frequency": word_totals[word],
            "specificity_score": 0.0,
            "outside_topic_frequency": 0,
        }
        for word in selected_words
    ]
    col_entries = [
        {
            "word": topic_name,
            "frequency": sum(word_counts.values()),
            "specificity_score": 0.0,
            "outside_topic_frequency": 0,
        }
        for topic_name, word_counts in topic_entries
    ]
    max_value = max((max(row, default=0) for row in matrix), default=0)

    return {
        "submission_id": submission["submission_id"],
        "scope": "topic_word",
        "topic_name": None,
        "window_size": 0,
        "normalization": "lemma",
        "words": word_entries,
        "col_words": col_entries,
        "matrix": matrix,
        "max_value": max_value,
        "default_visible_word_count": 40,
        "total_word_count": len(word_entries),
    }


@router.get("/submissions")
def list_submissions(
    submission_id: str | None = None,
    status: str | None = None,
    limit: int = 100,
    submissions_storage: SubmissionsStorage = Depends(get_submissions_storage),
) -> dict[str, Any]:
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
