"""
Text splitting task - extracts sentences and words from submitted HTML
"""
from lib.article_splitter import split_article_with_markers
from lib.storage.submissions import SubmissionsStorage





def process_text_splitting(submission: dict, db, llm):
    """
    Process text splitting task for a submission.

    Args:
        submission: Submission document from DB
        db: MongoDB database instance
        llm: LLamaCPP client instance
    """
    submission_id = submission["submission_id"]

    # Prefer html_content for preserving formatting; fall back to text_content
    html_content = submission.get("html_content", "")
    text_content = submission.get("text_content", "")
    source = html_content or text_content

    if not source:
        raise ValueError("No text content to process")

    # Split article using txt_splitt (via article_splitter wrapper)
    result = split_article_with_markers(source, llm)

    # sentences are already list of strings
    sentences = result.sentences

    # Update submission with results
    submissions_storage = SubmissionsStorage(db)
    submissions_storage.update_results(
        submission_id,
        {
            "sentences": sentences,
        }
    )

    print(f"Text splitting completed for submission {submission_id}: {len(sentences)} sentences")
