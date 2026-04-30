import json
import logging
import re
import threading
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, List, Literal, Optional, Protocol

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from handlers.dependencies import get_db
from lib.llm import create_llm_client
from lib.llm.base import LLMMessage, ToolDefinition
from lib.storage.canvas_chats import CanvasChatsStorage
from lib.storage.canvas_events import CanvasEventsStorage
from lib.storage.submissions import SubmissionsStorage

router = APIRouter()
log = logging.getLogger("canvas_handler")
log.setLevel(logging.DEBUG)

CANVAS_CHAT_JOB_TTL = timedelta(hours=6)

HIGHLIGHT_TOOL = ToolDefinition(
    name="highlight_span",
    description=(
        "Highlight a range of granular article pieces to draw the user's "
        "attention to a specific passage. Identify pieces by the line "
        "numbers shown in the <article> tag (e.g. '3: ...' is line 3)."
    ),
    parameters={
        "type": "object",
        "properties": {
            "start_line": {
                "type": "integer",
                "description": "First line number of the span (1-based, inclusive).",
            },
            "end_line": {
                "type": "integer",
                "description": (
                    "Last line number of the span (1-based, inclusive). "
                    "Use the same value as start_line to highlight a single article piece."
                ),
            },
            "label": {
                "type": "string",
                "description": "Optional short label or reason for the highlight.",
            },
        },
        "required": ["start_line", "end_line"],
        "additionalProperties": False,
    },
)

CANVAS_SYSTEM_PROMPT = """\
You are an intelligent assistant helping users explore and analyze a single article.
The article is provided after the user's question, enclosed in <article> tags.
The article is split into granular pieces, not always complete sentences. Each piece is
prefixed with its 1-based line number (e.g. "3: First clause;").
Reference article pieces by these line numbers.

Your role:
- Answer the user's question about the article.
- Help the user understand difficult passages and identify key themes, arguments, or facts.
- Reply in the same language as the article.

Highlighting rules (highlight_span tool):
- Only call highlight_span when the user asks about, refers to, or would benefit from seeing
  specific article pieces, or when you want to point to evidence that supports your answer.
- Prefer the shortest span that conveys the point; a single line is usually enough.
  Only extend across multiple lines when the passage is genuinely continuous.
- You may call highlight_span multiple times in one turn for several distinct passages.
- Previously created highlights stay visible on the canvas between turns. Do not re-highlight
  the same span you already highlighted earlier in this conversation unless the user asks.
- CRITICAL: Always read the tool results from your previous highlight_span calls in this
  conversation (messages with role "tool" containing text like "Highlighted lines X-Y").
  Before issuing a new highlight_span call, check that the (start_line, end_line) pair you
  are about to send does NOT match or overlap any (X, Y) you have already highlighted in
  this turn or earlier turns. Never call highlight_span with the same line range twice.
  If every relevant passage is already highlighted, stop calling the tool and write your
  reply instead.
- Do not highlight when the user is asking a general question that is not tied to a specific
  passage (e.g. summarization, opinion, or meta questions).
- When you have finished highlighting all relevant passages, stop calling tools and produce
  a normal text reply. Do not keep calling highlight_span in a loop.
"""


def _get_canvas_events_storage(request: Request) -> CanvasEventsStorage:
    return request.app.state.canvas_events_storage


def _get_canvas_chats_storage(request: Request) -> CanvasChatsStorage:
    return request.app.state.canvas_chats_storage


def _get_submissions_storage(request: Request) -> SubmissionsStorage:
    return request.app.state.submissions_storage


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text)


ARTICLE_PIECE_SPLIT_RE = re.compile(r"(?<=[.!?;:,。！？；：])\s+|(?<=\S)\s+(?=[—–-]\s)")

# Rough character budget per "page" for the visual canvas splitter.
# This keeps each page to a screenful of text while preserving word boundaries.
PAGE_SIZE_CHARS = 3000


@dataclass(frozen=True)
class ArticlePiece:
    text: str
    start: int
    end: int


@dataclass(frozen=True)
class CanvasArticlePage:
    page_number: int
    start: int
    end: int


@dataclass(frozen=True)
class CanvasArticleText:
    display_text: str
    numbered_text: str
    pieces: list[ArticlePiece]
    pages: list[CanvasArticlePage]


CanvasChatJobStatus = Literal["pending", "processing", "completed", "failed"]


@dataclass
class CanvasChatJob:
    article_id: str
    status: CanvasChatJobStatus
    created_at: datetime
    updated_at: datetime
    chat_id: str | None = None
    reply: str | None = None
    error: str | None = None


class _EventSinkProtocol(Protocol):
    """Protocol for event sink implementations."""

    def add_event(
        self, article_id: str, event_type: str, data: dict[str, Any]
    ) -> Optional[dict[str, Any]]:
        """Add an event to storage."""
        ...


class _ChatEventSink:
    """Adapter that exposes the legacy ``add_event(article_id, event_type, data)``
    contract while persisting events into a specific chat document.
    """

    def __init__(self, storage: CanvasChatsStorage, chat_id: str) -> None:
        self._storage: CanvasChatsStorage = storage
        self._chat_id: str = chat_id

    def add_event(
        self, article_id: str, event_type: str, data: dict[str, Any]
    ) -> Optional[dict[str, Any]]:
        return self._storage.add_event(
            article_id=article_id,
            chat_id=self._chat_id,
            event_type=event_type,
            data=data,
        )


_canvas_chat_jobs: dict[str, CanvasChatJob] = {}
_canvas_chat_jobs_lock = threading.Lock()


def _cleanup_canvas_chat_jobs(now: datetime) -> None:
    expired_before = now - CANVAS_CHAT_JOB_TTL
    expired_ids: list[str] = [
        request_id
        for request_id, job in _canvas_chat_jobs.items()
        if job.updated_at < expired_before
    ]
    for request_id in expired_ids:
        del _canvas_chat_jobs[request_id]


def _create_canvas_chat_job(article_id: str, chat_id: str | None = None) -> str:
    now = datetime.now(UTC)
    request_id = uuid.uuid4().hex
    with _canvas_chat_jobs_lock:
        _cleanup_canvas_chat_jobs(now)
        _canvas_chat_jobs[request_id] = CanvasChatJob(
            article_id=article_id,
            chat_id=chat_id,
            status="pending",
            created_at=now,
            updated_at=now,
        )
    return request_id


def _update_canvas_chat_job(
    request_id: str,
    *,
    status: CanvasChatJobStatus,
    reply: str | None = None,
    error: str | None = None,
) -> None:
    now = datetime.now(UTC)
    with _canvas_chat_jobs_lock:
        job = _canvas_chat_jobs.get(request_id)
        if job is None:
            return
        job.status = status
        job.updated_at = now
        job.reply = reply
        job.error = error


def _get_canvas_chat_job(request_id: str) -> CanvasChatJob | None:
    with _canvas_chat_jobs_lock:
        return _canvas_chat_jobs.get(request_id)


def _run_canvas_chat_job(
    request_id: str,
    article_id: str,
    submission: dict[str, Any],
    user_message: str,
    history: list[dict[str, str]],
    canvas_storage: CanvasEventsStorage | _ChatEventSink,
    db: Any,
    selected_pages: list[int] | None = None,
    chats_storage: CanvasChatsStorage | None = None,
    chat_id: str | None = None,
) -> None:
    _update_canvas_chat_job(request_id, status="processing")
    try:
        reply = _run_canvas_chat(
            article_id=article_id,
            submission=submission,
            user_message=user_message,
            history=history,
            canvas_storage=canvas_storage,
            db=db,
            selected_pages=selected_pages,
        )
    except Exception as exc:
        log.exception("Canvas chat job error for article %s", article_id)
        _update_canvas_chat_job(request_id, status="failed", error=str(exc))
        return

    if chats_storage is not None and chat_id:
        try:
            chats_storage.add_message(
                article_id=article_id,
                chat_id=chat_id,
                role="assistant",
                content=reply or "",
            )
        except (OSError, ValueError) as exc:
            log.exception(
                "Canvas chat assistant message persist failed | article=%s chat=%s: %s",
                article_id,
                chat_id,
                exc,
            )

    _update_canvas_chat_job(request_id, status="completed", reply=reply)


def _split_article_piece(text: str, offset: int = 0) -> list[ArticlePiece]:
    """Split article text into granular pieces with offsets into display text."""
    pieces: list[ArticlePiece] = []
    start: int = 0

    for match in ARTICLE_PIECE_SPLIT_RE.finditer(text):
        end: int = match.start()
        piece_text: str = text[start:end].strip()
        if piece_text:
            leading_space_count: int = len(text[start:end]) - len(
                text[start:end].lstrip()
            )
            piece_start: int = offset + start + leading_space_count
            pieces.append(
                ArticlePiece(
                    text=piece_text,
                    start=piece_start,
                    end=piece_start + len(piece_text),
                )
            )
        start = match.end()

    tail_text: str = text[start:].strip()
    if tail_text:
        leading_space_count = len(text[start:]) - len(text[start:].lstrip())
        piece_start = offset + start + leading_space_count
        pieces.append(
            ArticlePiece(
                text=tail_text, start=piece_start, end=piece_start + len(tail_text)
            )
        )

    return pieces


def _cp_offsets_to_js(text: str, cp_offsets: list[int]) -> list[int]:
    """Convert Python Unicode code-point offsets to JavaScript UTF-16 code-unit offsets.

    Python's len() and string indexing count Unicode code points; JavaScript's
    String.length and slice() count UTF-16 code units.  For characters above U+FFFF
    (e.g. mathematical bold/italic symbols common in AI papers) Python counts 1 while
    JavaScript counts 2 (a surrogate pair).  Page start/end offsets computed in Python
    must be mapped to UTF-16 units before being sent to the frontend.
    """
    if not cp_offsets:
        return []
    # Fast path: no supplementary characters in the text.
    if not any(ord(c) > 0xFFFF for c in text):
        return list(cp_offsets)

    targets = sorted(set(cp_offsets))
    mapping: dict[int, int] = {}
    target_idx = 0
    utf16 = 0
    for cp_pos, c in enumerate(text):
        while target_idx < len(targets) and targets[target_idx] == cp_pos:
            mapping[targets[target_idx]] = utf16
            target_idx += 1
        utf16 += 2 if ord(c) > 0xFFFF else 1

    # Handle offsets equal to len(text) (end-of-string).
    while target_idx < len(targets):
        mapping[targets[target_idx]] = utf16
        target_idx += 1

    return [mapping[off] for off in cp_offsets]


def _build_article_pages(
    display_text: str, pieces: list[ArticlePiece] | None = None
) -> list[CanvasArticlePage]:
    """Split the full display text into pages of ~PAGE_SIZE_CHARS each.

    When `pieces` is provided, page boundaries are snapped forward to the next
    piece end so a single piece (and any highlight over it) is never cut across
    a page splitter.
    """
    if not display_text:
        return []

    piece_ends = sorted({p.end for p in pieces or [] if p.end > 0})

    pages: list[CanvasArticlePage] = []
    text_len = len(display_text)
    offset = 0
    page_num = 1

    while offset < text_len:
        end = min(offset + PAGE_SIZE_CHARS, text_len)
        if end < text_len:
            snapped = None
            for pe in piece_ends:
                if pe > offset and pe >= end:
                    snapped = pe
                    break
            if snapped is not None:
                end = snapped
            else:
                search_start = max(offset, end - 80)
                for i in range(end - 1, search_start - 1, -1):
                    if display_text[i].isspace():
                        end = i + 1
                        break
        pages.append(CanvasArticlePage(page_number=page_num, start=offset, end=end))
        offset = end
        page_num += 1

    return pages


def _build_article_text_with_lines(
    submission: dict[str, Any],
) -> CanvasArticleText:
    """Return readable article text and granular LLM line references."""
    sentences: list[str] = submission.get("results", {}).get("sentences") or []
    text_content: str = submission.get("text_content", "") or ""
    source_pieces: list[tuple[str, int]] = []

    if sentences:
        clean_sentences: list[str] = [
            s for s in (_strip_html(sentence).strip() for sentence in sentences) if s
        ]
        display_text: str = "\n".join(clean_sentences)
        offset: int = 0
        for sentence in clean_sentences:
            source_pieces.append((sentence, offset))
            offset += len(sentence) + 1
    else:
        display_text = _strip_html(text_content).strip()
        source_pieces = [(display_text, 0)]

    mapped_pieces: list[ArticlePiece] = []
    for source_piece, offset in source_pieces:
        mapped_pieces.extend(_split_article_piece(source_piece, offset=offset))

    article_pieces: list[str] = [piece.text for piece in mapped_pieces]
    numbered_text = "\n".join(f"{i + 1}: {s}" for i, s in enumerate(article_pieces))

    pages = _build_article_pages(display_text, mapped_pieces)

    return CanvasArticleText(
        display_text=display_text,
        numbered_text=numbered_text,
        pieces=mapped_pieces,
        pages=pages,
    )


def _estimate_tokens(llm: Any, text: str) -> int:
    estimator = getattr(llm, "estimate_tokens", None)
    if callable(estimator):
        estimated = estimator(text)
        if isinstance(estimated, int):
            return estimated
    return len(text) // 4


def _estimate_messages_tokens(llm: Any, messages: list[LLMMessage]) -> int:
    total = 0
    for msg in messages:
        if msg.content:
            total += _estimate_tokens(llm, msg.content)
        for tc in msg.tool_calls or ():
            total += _estimate_tokens(llm, tc.name or "")
            if tc.arguments:
                total += _estimate_tokens(llm, json.dumps(tc.arguments))
        # Per-message framing overhead (role tags, separators).
        total += 8
    return total


def _estimate_tools_tokens(llm: Any, tools: list[ToolDefinition]) -> int:
    total = 0
    for tool in tools:
        total += _estimate_tokens(llm, tool.name)
        total += _estimate_tokens(llm, tool.description)
        total += _estimate_tokens(llm, json.dumps(dict(tool.parameters)))
    return total


def _build_canvas_chunks(
    pieces: list[ArticlePiece],
    llm: Any,
    static_overhead_tokens: int,
    reserved_buffer_tokens: int = 4000,
) -> list[str]:
    """Split pieces into numbered_text chunks that fit the LLM budget.

    Line numbers are global (1-based over the whole article), so each chunk
    carries references that stay consistent with `_line_range_to_offsets`.
    """
    if not pieces:
        return [""]

    context_size = int(getattr(llm, "max_context_tokens", 64000) or 64000)
    budget = int(context_size * 0.75) - static_overhead_tokens - reserved_buffer_tokens
    # Always leave room for at least a few lines so we make forward progress.
    budget = max(budget, 1024)

    chunks: list[str] = []
    current_lines: list[str] = []
    current_tokens = 0

    for idx, piece in enumerate(pieces, start=1):
        line = f"{idx}: {piece.text}"
        line_tokens = _estimate_tokens(llm, line) + 1  # newline
        if current_lines and current_tokens + line_tokens > budget:
            chunks.append("\n".join(current_lines))
            current_lines = []
            current_tokens = 0
        current_lines.append(line)
        current_tokens += line_tokens

    if current_lines:
        chunks.append("\n".join(current_lines))

    return chunks or [""]


_NO_INFO_PATTERNS = (
    "no relevant",
    "not mentioned",
    "does not mention",
    "doesn't mention",
    "no information",
    "cannot find",
    "can't find",
    "nothing relevant",
)


def _looks_like_no_info_reply(text: str) -> bool:
    stripped = (text or "").strip().lower()
    if not stripped:
        return True
    if len(stripped) < 40:
        for pattern in _NO_INFO_PATTERNS:
            if pattern in stripped:
                return True
    return False


def _merge_chunk_replies(replies: list[str]) -> str:
    non_empty = [r.strip() for r in replies if r and r.strip()]
    if not non_empty:
        return ""

    informative = [r for r in non_empty if not _looks_like_no_info_reply(r)]
    candidates = informative or non_empty

    seen: set[str] = set()
    deduped: list[str] = []
    for reply in candidates:
        if reply in seen:
            continue
        seen.add(reply)
        deduped.append(reply)

    if len(deduped) == 1:
        return deduped[0]
    return "\n\n".join(deduped)


def _line_range_to_offsets(
    pieces: list[ArticlePiece], start_line: int, end_line: int
) -> tuple[int, int]:
    """Convert 1-based inclusive LLM line numbers to display text char offsets."""
    n = len(pieces)
    start_idx = start_line - 1
    end_idx = end_line - 1
    if not (0 <= start_idx < n) or not (0 <= end_idx < n):
        raise ValueError(
            f"line numbers out of range: start_line={start_line}, end_line={end_line}, "
            f"article has {n} lines"
        )
    if start_idx > end_idx:
        raise ValueError(f"start_line ({start_line}) must be <= end_line ({end_line})")

    return pieces[start_idx].start, pieces[end_idx].end


def _run_canvas_chunk_tool_loop(
    article_id: str,
    article_text: CanvasArticleText,
    chunk_numbered_text: str,
    chunk_index: int,
    chunk_total: int,
    base_messages: list[LLMMessage],
    user_message: str,
    client: Any,
    canvas_storage: CanvasEventsStorage,
    max_tool_rounds: int = 10,
) -> str:
    """Run a single tool-loop session for one article chunk."""
    messages: list[LLMMessage] = list(base_messages)
    chunk_header = (
        f"<question>{user_message}</question>\n\n"
        f'<article chunk="{chunk_index + 1}/{chunk_total}">\n'
        f"{chunk_numbered_text}\n</article>"
    )
    messages.append(LLMMessage(role="user", content=chunk_header))

    for round_num in range(max_tool_rounds):
        call_number: int = round_num + 1
        log.info(
            "Canvas LLM call start | article=%s chunk=%d/%d call=%d",
            article_id,
            chunk_index + 1,
            chunk_total,
            call_number,
        )
        log_messages = [
            {"role": m.role, "content": m.content}
            for m in (
                [LLMMessage(role="system", content=CANVAS_SYSTEM_PROMPT)] + messages
            )
        ]
        log.debug(
            "Canvas LLM call | article=%s chunk=%d/%d round=%d messages=%s",
            article_id,
            chunk_index + 1,
            chunk_total,
            call_number,
            log_messages,
        )

        response = client.complete(
            user_prompt="",
            system_prompt=CANVAS_SYSTEM_PROMPT,
            tools=[HIGHLIGHT_TOOL],
            messages=messages,
        )

        log.debug(
            "Canvas LLM response | article=%s chunk=%d/%d round=%d content=%s tool_calls=%s",
            article_id,
            chunk_index + 1,
            chunk_total,
            call_number,
            response.content,
            [
                {"id": tc.id, "name": tc.name, "arguments": tc.arguments}
                for tc in (response.tool_calls or [])
            ],
        )

        if not response.tool_calls:
            log.info(
                "Canvas LLM chunk complete | article=%s chunk=%d/%d call=%d "
                "reason=no_tool_calls",
                article_id,
                chunk_index + 1,
                chunk_total,
                call_number,
            )
            return response.content or ""

        # Add assistant message with tool calls to conversation
        assistant_msg = LLMMessage(
            role="assistant",
            content=response.content,
            tool_calls=tuple(response.tool_calls),
        )
        messages.append(assistant_msg)

        tool_results: list[LLMMessage] = []
        for tool_call in response.tool_calls:
            if tool_call.name == "highlight_span":
                args = tool_call.arguments or {}
                label = str(args.get("label") or "")
                start_line_raw = args.get("start_line")
                end_line_raw = args.get("end_line")

                try:
                    start_line = int(start_line_raw)
                    end_line = int(end_line_raw)
                except (TypeError, ValueError):
                    result_content = (
                        "Error: start_line and end_line must be integers. "
                        f"Got start_line={start_line_raw!r}, end_line={end_line_raw!r}."
                    )
                    log.warning(
                        "Canvas bad highlight args | article=%s args=%s",
                        article_id,
                        args,
                    )
                else:
                    try:
                        start_off, end_off = _line_range_to_offsets(
                            article_text.pieces, start_line, end_line
                        )
                    except ValueError as ve:
                        result_content = f"Error: {ve}"
                        log.warning(
                            "Canvas invalid highlight range | article=%s %s",
                            article_id,
                            ve,
                        )
                    else:
                        log.info(
                            "Canvas tool call | article=%s tool=highlight_span "
                            "lines=%d-%d offsets=%d-%d label=%r",
                            article_id,
                            start_line,
                            end_line,
                            start_off,
                            end_off,
                            label,
                        )
                        canvas_storage.add_event(
                            article_id=article_id,
                            event_type="highlight_span",
                            data={
                                "start": start_off,
                                "end": end_off,
                                "start_line": start_line,
                                "end_line": end_line,
                                "label": label,
                            },
                        )
                        result_content = f"Highlighted lines {start_line}-{end_line}."
            else:
                log.warning(
                    "Canvas unknown tool call | article=%s tool=%s arguments=%s",
                    article_id,
                    tool_call.name,
                    tool_call.arguments,
                )
                result_content = f"Unknown tool: {tool_call.name}"

            tool_results.append(
                LLMMessage(
                    role="tool",
                    content=result_content,
                    tool_call_id=tool_call.id,
                )
            )

        messages.extend(tool_results)

    return "I've finished highlighting the relevant passages."


def _run_canvas_chat(
    article_id: str,
    submission: dict[str, Any],
    user_message: str,
    history: list[dict[str, str]],
    canvas_storage: CanvasEventsStorage,
    db: Any,
    selected_pages: list[int] | None = None,
) -> str:
    """Run the canvas chat, splitting long articles into chunks if needed."""
    article_text: CanvasArticleText = _build_article_text_with_lines(submission)

    # If selected pages are specified, filter pieces to only those within the pages.
    if selected_pages:
        total_pages = len(article_text.pages)
        valid_page_numbers = {p.page_number for p in article_text.pages}
        unknown_pages = sorted(set(selected_pages) - valid_page_numbers)
        if unknown_pages:
            return (
                f"Pages {unknown_pages} not found (article has {total_pages} page(s))."
            )

        page_set = set(selected_pages)
        page_ranges = [
            (p.start, p.end) for p in article_text.pages if p.page_number in page_set
        ]

        def _piece_in_pages(piece: ArticlePiece) -> bool:
            for ps, pe in page_ranges:
                if piece.start < pe and piece.end > ps:
                    return True
            return False

        effective_pieces = [p for p in article_text.pieces if _piece_in_pages(p)]
        if not effective_pieces:
            return "No content found on the selected pages."

        adjusted_article_text = CanvasArticleText(
            display_text=article_text.display_text,
            numbered_text=article_text.numbered_text,
            pieces=effective_pieces,
            pages=article_text.pages,
        )
    else:
        effective_pieces = list(article_text.pieces)
        adjusted_article_text = article_text

    client = create_llm_client(db=db)

    base_messages: list[LLMMessage] = []
    for msg in history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant"):
            base_messages.append(LLMMessage(role=role, content=content))

    # Static overhead: system prompt + history + user question envelope + tool defs.
    question_envelope = (
        f'<question>{user_message}</question>\n\n<article chunk="99/99">\n\n</article>'
    )
    system_overhead = _estimate_tokens(client, CANVAS_SYSTEM_PROMPT)
    history_overhead = _estimate_messages_tokens(client, base_messages)
    question_overhead = _estimate_tokens(client, question_envelope)
    tools_overhead = _estimate_tools_tokens(client, [HIGHLIGHT_TOOL])
    static_overhead = (
        system_overhead + history_overhead + question_overhead + tools_overhead
    )

    chunks = _build_canvas_chunks(
        pieces=list(effective_pieces),
        llm=client,
        static_overhead_tokens=static_overhead,
    )

    log.info(
        "Canvas chat start | article=%s user_message=%r history_len=%d "
        "pieces=%d pages=%r chunks=%d",
        article_id,
        user_message,
        len(base_messages),
        len(effective_pieces),
        selected_pages or "all",
        len(chunks),
    )

    replies: list[str] = []
    for chunk_index, chunk_text in enumerate(chunks):
        reply = _run_canvas_chunk_tool_loop(
            article_id=article_id,
            article_text=adjusted_article_text,
            chunk_numbered_text=chunk_text,
            chunk_index=chunk_index,
            chunk_total=len(chunks),
            base_messages=base_messages,
            user_message=user_message,
            client=client,
            canvas_storage=canvas_storage,
        )
        replies.append(reply)

    log.info(
        "Canvas chat complete | article=%s chunks_processed=%d",
        article_id,
        len(replies),
    )

    if len(chunks) == 1:
        return replies[0]

    return _merge_chunk_replies(replies)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = None
    pages: Optional[List[int]] = (
        None  # If provided, only these pages are used as context
    )
    chat_id: Optional[str] = (
        None  # Existing chat session id; if omitted a new one is created
    )


class UpdateChatRequest(BaseModel):
    title: Optional[str] = None


@router.get("/canvas/{article_id}/events")
def get_canvas_events(
    article_id: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    canvas_storage: CanvasEventsStorage = Depends(_get_canvas_events_storage),
    submissions_storage: SubmissionsStorage = Depends(_get_submissions_storage),
) -> dict[str, Any]:
    submission = submissions_storage.get_by_id(article_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Article not found")

    events = canvas_storage.get_events(article_id, offset=offset, limit=limit)
    serialized: list[dict[str, Any]] = []
    for ev in events:
        serialized.append(
            {
                "seq": ev["seq"],
                "event_type": ev["event_type"],
                "data": ev["data"],
                "created_at": ev["created_at"].isoformat()
                if hasattr(ev.get("created_at"), "isoformat")
                else str(ev.get("created_at", "")),
            }
        )
    return {"events": serialized, "offset": offset, "limit": limit}


@router.get("/canvas/{article_id}/article")
def get_canvas_article(
    article_id: str,
    submissions_storage: SubmissionsStorage = Depends(_get_submissions_storage),
) -> dict:
    submission = submissions_storage.get_by_id(article_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Article not found")

    article_text: CanvasArticleText = _build_article_text_with_lines(submission)
    raw_sentences: list[str] = submission.get("results", {}).get("sentences") or []
    clean_sentences: list[str] = [
        s for s in (_strip_html(sentence).strip() for sentence in raw_sentences) if s
    ]
    topics: list[dict] = submission.get("results", {}).get("topics") or []
    read_topics: list[str] = submission.get("read_topics", [])
    topic_summaries: dict = submission.get("results", {}).get("topic_summaries") or {}
    topic_summary_index: dict = (
        submission.get("results", {}).get("topic_summary_index") or {}
    )
    topic_temperatures: dict = (
        submission.get("results", {}).get("topic_temperatures") or {}
    )
    insights: list[dict] = submission.get("results", {}).get("insights") or []
    display_text = article_text.display_text
    cp_starts = [p.start for p in article_text.pages]
    cp_ends = [p.end for p in article_text.pages]
    js_starts = _cp_offsets_to_js(display_text, cp_starts)
    js_ends = _cp_offsets_to_js(display_text, cp_ends)
    pages = [
        {
            "page_number": p.page_number,
            "start": js_starts[i],
            "end": js_ends[i],
        }
        for i, p in enumerate(article_text.pages)
    ]
    return {
        "article_id": article_id,
        "text": article_text.display_text,
        "source_url": submission.get("source_url", ""),
        "sentences": clean_sentences,
        "topics": topics,
        "read_topics": read_topics,
        "topic_summaries": topic_summaries,
        "topic_summary_index": topic_summary_index,
        "topic_temperatures": topic_temperatures,
        "insights": insights,
        "pages": pages,
    }


@router.post("/canvas/{article_id}/chat")
def post_canvas_chat(
    article_id: str,
    body: ChatRequest,
    background_tasks: BackgroundTasks,
    canvas_storage: CanvasEventsStorage = Depends(_get_canvas_events_storage),
    chats_storage: CanvasChatsStorage = Depends(_get_canvas_chats_storage),
    submissions_storage: SubmissionsStorage = Depends(_get_submissions_storage),
    db: Any = Depends(get_db),
) -> dict[str, str | None]:
    submission = submissions_storage.get_by_id(article_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Article not found")

    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    chat_id: str | None = body.chat_id
    chat: dict[str, Any] | None = None
    if chat_id:
        chat = chats_storage.get_chat(article_id, chat_id)
        if not chat:
            raise HTTPException(status_code=404, detail="Chat not found")
        try:
            if not chats_storage.add_message(
                article_id=article_id,
                chat_id=chat_id,
                role="user",
                content=message,
            ):
                raise ValueError("chat message was not persisted")
        except (OSError, ValueError) as exc:
            log.exception(
                "Canvas chat user message persist failed | article=%s chat=%s: %s",
                article_id,
                chat_id,
                exc,
            )
            raise HTTPException(
                status_code=500, detail="Failed to persist chat"
            ) from exc
    else:
        try:
            chat = chats_storage.create_chat_with_message(
                article_id=article_id,
                role="user",
                content=message,
            )
        except (OSError, ValueError) as exc:
            log.exception(
                "Canvas chat create failed | article=%s: %s",
                article_id,
                exc,
            )
            raise HTTPException(
                status_code=500, detail="Failed to persist chat"
            ) from exc
        chat_id = chat["chat_id"]

    history = [{"role": m.role, "content": m.content} for m in (body.history or [])]

    event_sink: Any = (
        _ChatEventSink(chats_storage, chat_id) if chat_id else canvas_storage
    )

    request_id = _create_canvas_chat_job(article_id, chat_id=chat_id)
    background_tasks.add_task(
        _run_canvas_chat_job,
        request_id=request_id,
        article_id=article_id,
        submission=submission,
        user_message=message,
        history=history,
        canvas_storage=event_sink,
        db=db,
        selected_pages=body.pages,
        chats_storage=chats_storage,
        chat_id=chat_id,
    )

    return {
        "request_id": request_id,
        "status": "pending",
        "reply": None,
        "chat_id": chat_id,
    }


# ── Chat sessions API ──────────────────────────────────────────────────────


def _serialize_chat_summary(doc: dict[str, Any]) -> dict[str, Any]:
    def _iso(value: Any) -> str:
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return str(value or "")

    return {
        "chat_id": doc.get("chat_id"),
        "article_id": doc.get("article_id"),
        "title": doc.get("title") or "New chat",
        "created_at": _iso(doc.get("created_at")),
        "updated_at": _iso(doc.get("updated_at")),
        "message_count": int(doc.get("message_count") or 0),
        "event_count": int(doc.get("event_count") or 0),
    }


def _serialize_event(ev: dict[str, Any]) -> dict[str, Any]:
    created_at = ev.get("created_at")
    return {
        "seq": ev["seq"],
        "event_type": ev["event_type"],
        "data": ev.get("data") or {},
        "created_at": created_at.isoformat()
        if hasattr(created_at, "isoformat")
        else str(created_at or ""),
    }


@router.get("/canvas/{article_id}/chats")
def list_canvas_chats(
    article_id: str,
    chats_storage: CanvasChatsStorage = Depends(_get_canvas_chats_storage),
    submissions_storage: SubmissionsStorage = Depends(_get_submissions_storage),
) -> dict[str, Any]:
    submission = submissions_storage.get_by_id(article_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Article not found")

    chats = [_serialize_chat_summary(c) for c in chats_storage.list_chats(article_id)]
    return {"chats": chats}


@router.get("/canvas/{article_id}/chats/{chat_id}")
def get_canvas_chat(
    article_id: str,
    chat_id: str,
    chats_storage: CanvasChatsStorage = Depends(_get_canvas_chats_storage),
    submissions_storage: SubmissionsStorage = Depends(_get_submissions_storage),
) -> dict[str, Any]:
    submission = submissions_storage.get_by_id(article_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Article not found")

    chat = chats_storage.get_chat(article_id, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    messages_out: list[dict[str, Any]] = []
    for msg in chat.get("messages") or []:
        ts = msg.get("ts")
        messages_out.append(
            {
                "role": msg.get("role", ""),
                "content": msg.get("content", ""),
                "ts": ts.isoformat() if hasattr(ts, "isoformat") else str(ts or ""),
            }
        )

    summary = _serialize_chat_summary(
        {
            **chat,
            "message_count": len(chat.get("messages") or []),
            "event_count": len(chat.get("events") or []),
        }
    )
    return {**summary, "messages": messages_out}


@router.delete("/canvas/{article_id}/chats/{chat_id}")
def delete_canvas_chat(
    article_id: str,
    chat_id: str,
    chats_storage: CanvasChatsStorage = Depends(_get_canvas_chats_storage),
    submissions_storage: SubmissionsStorage = Depends(_get_submissions_storage),
) -> dict[str, Any]:
    submission = submissions_storage.get_by_id(article_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Article not found")

    deleted = chats_storage.delete_chat(article_id, chat_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"deleted": True}


@router.get("/canvas/{article_id}/chats/{chat_id}/events")
def get_canvas_chat_events(
    article_id: str,
    chat_id: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    chats_storage: CanvasChatsStorage = Depends(_get_canvas_chats_storage),
    submissions_storage: SubmissionsStorage = Depends(_get_submissions_storage),
) -> dict[str, Any]:
    submission = submissions_storage.get_by_id(article_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Article not found")

    if not chats_storage.get_chat(article_id, chat_id):
        raise HTTPException(status_code=404, detail="Chat not found")

    events = chats_storage.get_events(article_id, chat_id, offset=offset, limit=limit)
    serialized = [_serialize_event(ev) for ev in events]
    return {
        "events": serialized,
        "offset": offset,
        "limit": limit,
        "chat_id": chat_id,
    }


@router.delete("/canvas/{article_id}/chats/{chat_id}/events/{seq}")
def delete_canvas_chat_event(
    article_id: str,
    chat_id: str,
    seq: int,
    chats_storage: CanvasChatsStorage = Depends(_get_canvas_chats_storage),
    submissions_storage: SubmissionsStorage = Depends(_get_submissions_storage),
) -> dict[str, Any]:
    submission = submissions_storage.get_by_id(article_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Article not found")

    if not chats_storage.get_chat(article_id, chat_id):
        raise HTTPException(status_code=404, detail="Chat not found")

    deleted = chats_storage.delete_event(article_id, chat_id, seq)
    if not deleted:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"deleted": True}


@router.delete("/canvas/{article_id}/events/{seq}")
def delete_canvas_event(
    article_id: str,
    seq: int,
    canvas_storage: CanvasEventsStorage = Depends(_get_canvas_events_storage),
    submissions_storage: SubmissionsStorage = Depends(_get_submissions_storage),
) -> dict[str, Any]:
    submission = submissions_storage.get_by_id(article_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Article not found")

    deleted = canvas_storage.delete_event(article_id, seq)
    if not deleted:
        raise HTTPException(status_code=404, detail="Event not found")

    return {"deleted": True}


@router.get("/canvas/{article_id}/chat/{request_id}")
def get_canvas_chat_status(
    article_id: str,
    request_id: str,
    submissions_storage: SubmissionsStorage = Depends(_get_submissions_storage),
) -> dict[str, str | None]:
    submission = submissions_storage.get_by_id(article_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Article not found")

    job = _get_canvas_chat_job(request_id)
    if job is None or job.article_id != article_id:
        raise HTTPException(status_code=404, detail="Chat request not found")

    return {
        "request_id": request_id,
        "status": job.status,
        "reply": job.reply,
        "error": job.error,
    }
