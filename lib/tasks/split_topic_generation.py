"""
Combined text splitting and topic generation task.
"""
import time
import logging
from typing import Any

from lib.article_splitter import split_article_with_markers
from lib.storage.submissions import SubmissionsStorage
from txt_splitt import Tracer

logger = logging.getLogger(__name__)


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

    logger.info(f"Processing split_topic_generation for submission {submission_id}")
    logger.info(f"Source length: {len(source)} chars (html_content: {bool(html_content)}, text_content: {bool(text_content)})")
    source_preview = source[:500] + "..." if len(source) > 500 else source
    logger.info(f"Source preview: {source_preview}")

    tracer = Tracer()
    max_chunk_chars = submission.get("max_chunk_chars", 12_000)
    logger.info(f"Max chunk chars: {max_chunk_chars}")
    
    # Retry loop for LLM failures
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            result = split_article_with_markers(
                source, llm, tracer=tracer, max_chunk_chars=max_chunk_chars, cache_store=cache_store
            )
            last_error = None
            break
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                delay = 2.0 * (2 ** attempt)
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
        },
    )

    print(
        f"Split/topic generation completed for submission {submission_id}: "
        f"{len(result.sentences)} sentences, {len(result.topics)} topics"
    )
    trace_output = tracer.format()
    if trace_output:
        print(trace_output)
