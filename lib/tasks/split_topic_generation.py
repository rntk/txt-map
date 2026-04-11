"""
Combined text splitting and topic generation task.
"""

import logging
import re
import time
from typing import Any

from lib.article_splitter import split_article_with_markers
from lib.storage.submissions import SubmissionsStorage
from txt_splitt import Tracer

logger = logging.getLogger(__name__)

_TABLE_RE = re.compile(
    r"<table\b[^>]*>.*?</table>",
    re.IGNORECASE | re.DOTALL
)


def _truncate_for_log(value: Any, limit: int = 500) -> str:
    text = "" if value is None else str(value)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}..."


def _iter_tracer_spans(spans: list[Any]) -> list[Any]:
    flattened: list[Any] = []
    for span in spans:
        flattened.append(span)
        children = getattr(span, "children", [])
        if isinstance(children, list) and children:
            flattened.extend(_iter_tracer_spans(children))
    return flattened


def _span_attributes_by_name(spans: list[Any], name: str) -> dict[str, Any]:
    last_match: dict[str, Any] = {}
    for span in _iter_tracer_spans(spans):
        if getattr(span, "name", None) == name:
            attributes = getattr(span, "attributes", {})
            if isinstance(attributes, dict):
                last_match = attributes
    return last_match


def _extract_table_blocks(html: str) -> tuple[str, dict[str, str]]:
    """Extract <table> blocks from HTML and replace with placeholders.

    Returns (modified_html, {placeholder: original_table_html}).
    Tables are replaced with \n[TABLE_N]\n to be processed as single sentences.
    """
    table_blocks: dict[str, str] = {}
    counter = 1

    def replace_table(match):
        nonlocal counter
        table_html = match.group(0)
        placeholder = f"[TABLE_{counter}]"
        table_blocks[placeholder] = table_html
        counter += 1
        return f"\n{placeholder}\n"

    modified_html = _TABLE_RE.sub(replace_table, html)
    return modified_html, table_blocks


def _log_failure_diagnostics(
    *,
    tracer: Tracer,
    submission_id: str,
    attempt: int,
    max_attempts: int,
    error: Exception,
    source: str,
    html_content: str,
    text_content: str,
) -> None:
    root_spans = tracer.spans
    llm_call = _span_attributes_by_name(root_spans, "llm.call")
    split_span = _span_attributes_by_name(root_spans, "split")
    mark_span = _span_attributes_by_name(root_spans, "mark")
    html_clean_span = _span_attributes_by_name(root_spans, "html_clean")

    logger.warning(
        "Split topic diagnostics for submission %s attempt %s/%s: error_type=%s, "
        "source_length=%s, html_content=%s, text_content=%s, clean_length=%s, "
        "item_count=%s, tagged_text_length=%s, cache_hit=%s, cache_namespace=%s, "
        "cache_key=%s, cache_bypass_reason=%s, prompt_preview=%s, response_preview=%s",
        submission_id,
        attempt,
        max_attempts,
        type(error).__name__,
        len(source),
        bool(html_content),
        bool(text_content),
        html_clean_span.get("clean_length"),
        split_span.get("item_count"),
        mark_span.get("tagged_text_length"),
        llm_call.get("cache_hit"),
        llm_call.get("cache_namespace"),
        llm_call.get("cache_key"),
        llm_call.get("cache_bypass_reason"),
        _truncate_for_log(llm_call.get("prompt")),
        _truncate_for_log(llm_call.get("response")),
    )

    trace_output = tracer.format()
    if trace_output:
        logger.warning(
            "Split topic trace for submission %s attempt %s/%s:\n%s",
            submission_id,
            attempt,
            max_attempts,
            _truncate_for_log(trace_output, limit=2000),
        )


def process_split_topic_generation(
    submission: dict[str, Any],
    db: Any,
    llm: Any,
    max_retries: int = 3,
    cache_store: Any | None = None,
) -> None:
    """
    Process combined split + topic generation for a submission.

    Args:
        submission: Submission document from DB.
        db: MongoDB database instance.
        llm: LLamaCPP client instance.
        max_retries: Number of retries for LLM failures.
    """
    submission_id: str = submission["submission_id"]

    # Prefer html_content for preserving formatting; fall back to text_content.
    html_content = submission.get("html_content", "")
    text_content = submission.get("text_content", "")
    source = html_content or text_content

    if not source:
        raise ValueError("No text content to process")

    # Extract table blocks before processing to preserve them through sentence splitting.
    source, table_blocks = _extract_table_blocks(source)

    logger.info(f"Processing split_topic_generation for submission {submission_id}")
    logger.info(
        f"Source length: {len(source)} chars (html_content: {bool(html_content)}, text_content: {bool(text_content)})"
    )
    source_preview = source[:500] + "..." if len(source) > 500 else source
    logger.info(f"Source preview: {source_preview}")

    max_chunk_chars = submission.get("max_chunk_chars", 12_000)
    temperature = submission.get("temperature", 0.0)
    logger.info(f"Max chunk chars: {max_chunk_chars}, temperature: {temperature}")

    # Retry loop for LLM failures
    last_error: Exception | None = None
    final_tracer: Tracer | None = None
    for attempt in range(max_retries + 1):
        tracer = Tracer()
        try:
            result = split_article_with_markers(
                source,
                llm,
                tracer=tracer,
                max_chunk_chars=max_chunk_chars,
                cache_store=cache_store,
                temperature=temperature,
            )
            final_tracer = tracer
            last_error = None
            break
        except Exception as e:
            last_error = e
            _log_failure_diagnostics(
                tracer=tracer,
                submission_id=submission_id,
                attempt=attempt + 1,
                max_attempts=max_retries + 1,
                error=e,
                source=source,
                html_content=html_content,
                text_content=text_content,
            )
            if attempt < max_retries:
                delay = 2.0 * (2**attempt)
                logger.warning(
                    f"Split topic generation failed (attempt {attempt + 1}/{max_retries + 1}) "
                    f"for submission {submission_id}: {e}. Retrying in {delay:.2f}s..."
                )
                time.sleep(delay)
            else:
                logger.error(
                    f"Split topic generation failed after {max_retries + 1} attempts "
                    f"for submission {submission_id}: {e}"
                )

    if last_error:
        raise last_error

    submissions_storage = SubmissionsStorage(db)
    submissions_storage.update_results(
        submission_id,
        {
            "sentences": result.sentences,
            "topics": result.topics,
            "table_blocks": table_blocks,
        },
    )

    print(
        f"Split/topic generation completed for submission {submission_id}: "
        f"{len(result.sentences)} sentences, {len(result.topics)} topics"
    )
    trace_output = final_tracer.format() if final_tracer is not None else ""
    if trace_output:
        print(trace_output)
