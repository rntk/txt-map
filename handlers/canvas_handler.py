import logging
import re
from dataclasses import dataclass
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from handlers.dependencies import get_db
from lib.llm import create_llm_client
from lib.llm.base import LLMMessage, ToolDefinition
from lib.storage.canvas_events import CanvasEventsStorage
from lib.storage.submissions import SubmissionsStorage

router = APIRouter()
log = logging.getLogger("canvas_handler")
log.setLevel(logging.DEBUG)

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


def _get_submissions_storage(request: Request) -> SubmissionsStorage:
    return request.app.state.submissions_storage


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text)


ARTICLE_PIECE_SPLIT_RE = re.compile(r"(?<=[.!?;:,。！？；：])\s+|(?<=\S)\s+(?=[—–-]\s)")


@dataclass(frozen=True)
class ArticlePiece:
    text: str
    start: int
    end: int


@dataclass(frozen=True)
class CanvasArticleText:
    display_text: str
    numbered_text: str
    pieces: list[ArticlePiece]


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

    return CanvasArticleText(
        display_text=display_text,
        numbered_text=numbered_text,
        pieces=mapped_pieces,
    )


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


def _run_canvas_chat(
    article_id: str,
    submission: dict[str, Any],
    user_message: str,
    history: list[dict[str, str]],
    canvas_storage: CanvasEventsStorage,
    db: Any,
) -> str:
    """Synchronous LLM tool-loop for the canvas chat endpoint."""
    article_text: CanvasArticleText = _build_article_text_with_lines(submission)

    client = create_llm_client(db=db)

    messages: list[LLMMessage] = []
    for msg in history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant"):
            messages.append(LLMMessage(role=role, content=content))

    # Append article after user question so LLM sees the text at inference time
    user_content = (
        f"<question>{user_message}</question>\n\n"
        f"<article>\n{article_text.numbered_text}\n</article>"
    )
    messages.append(LLMMessage(role="user", content=user_content))

    max_tool_rounds = 10

    log.info(
        "Canvas chat start | article=%s user_message=%r history_len=%d",
        article_id,
        user_message,
        len(messages) - 1,
    )

    for round_num in range(max_tool_rounds):
        log_messages = [
            {"role": m.role, "content": m.content}
            for m in (
                [LLMMessage(role="system", content=CANVAS_SYSTEM_PROMPT)] + messages
            )
        ]
        log.debug(
            "Canvas LLM call | article=%s round=%d messages=%s",
            article_id,
            round_num,
            log_messages,
        )

        response = client.complete(
            user_prompt="",
            system_prompt=CANVAS_SYSTEM_PROMPT,
            tools=[HIGHLIGHT_TOOL],
            messages=messages,
        )

        log.debug(
            "Canvas LLM response | article=%s round=%d content=%s tool_calls=%s",
            article_id,
            round_num,
            response.content,
            [
                {"id": tc.id, "name": tc.name, "arguments": tc.arguments}
                for tc in (response.tool_calls or [])
            ],
        )

        if not response.tool_calls:
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


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = None


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
) -> dict[str, str]:
    submission = submissions_storage.get_by_id(article_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Article not found")

    article_text: CanvasArticleText = _build_article_text_with_lines(submission)
    return {
        "article_id": article_id,
        "text": article_text.display_text,
        "source_url": submission.get("source_url", ""),
    }


@router.post("/canvas/{article_id}/chat")
def post_canvas_chat(
    article_id: str,
    body: ChatRequest,
    canvas_storage: CanvasEventsStorage = Depends(_get_canvas_events_storage),
    submissions_storage: SubmissionsStorage = Depends(_get_submissions_storage),
    db: Any = Depends(get_db),
) -> dict[str, str]:
    submission = submissions_storage.get_by_id(article_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Article not found")

    history = [{"role": m.role, "content": m.content} for m in (body.history or [])]

    try:
        reply = _run_canvas_chat(
            article_id=article_id,
            submission=submission,
            user_message=body.message,
            history=history,
            canvas_storage=canvas_storage,
            db=db,
        )
    except Exception as exc:
        log.exception("Canvas chat error for article %s", article_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"reply": reply}
