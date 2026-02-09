"""
Combined text splitting and topic generation task.
"""
from lib.article_splitter import split_article_with_markers
from lib.storage.submissions import SubmissionsStorage
from lib.txt_splitt import Tracer


def process_split_topic_generation(submission: dict, db, llm):
    """
    Process combined split + topic generation for a submission.

    Args:
        submission: Submission document from DB.
        db: MongoDB database instance.
        llm: LLamaCPP client instance.
    """
    submission_id = submission["submission_id"]

    # Prefer html_content for preserving formatting; fall back to text_content.
    html_content = submission.get("html_content", "")
    text_content = submission.get("text_content", "")
    source = html_content or text_content

    if not source:
        raise ValueError("No text content to process")

    tracer = Tracer()
    max_chunk_chars = submission.get("max_chunk_chars", 12_000)
    result = split_article_with_markers(
        source, llm, tracer=tracer, max_chunk_chars=max_chunk_chars
    )

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
    tracer.print()
