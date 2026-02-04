"""
Text splitting task - extracts sentences and words from submitted HTML
"""
from lib.article_splitter import split_article_with_markers
from lib.storage.submissions import SubmissionsStorage


def build_basic_sentences(words, marker_word_indices):
    """
    Build basic sentences from marker positions.
    Each marker represents a sentence boundary.
    """
    if not words:
        return []

    sentences = []
    start_idx = 0

    for marker_idx in marker_word_indices:
        end_idx = marker_idx
        if start_idx <= end_idx < len(words):
            sentence = " ".join(words[start_idx:end_idx + 1]).strip()
            if sentence:
                sentences.append(sentence)
        start_idx = end_idx + 1

    # Add remaining words as final sentence
    if start_idx < len(words):
        sentence = " ".join(words[start_idx:]).strip()
        if sentence:
            sentences.append(sentence)

    return sentences


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

    # Split article with markers (HTMLWordExtractor handles both HTML and plain text)
    result = split_article_with_markers(source, llm)

    # Build basic sentences from marker positions (plain text for LLM tasks)
    sentences = build_basic_sentences(result.words, result.marker_word_indices)

    # Build HTML-formatted sentences (for frontend rendering)
    html_sentences = build_basic_sentences(result.html_words, result.marker_word_indices)

    # Update submission with results
    submissions_storage = SubmissionsStorage(db)
    submissions_storage.update_results(
        submission_id,
        {
            "sentences": sentences,
            "html_sentences": html_sentences,
            "words": result.words,
            "html_words": result.html_words,
            "marked_text": result.marked_text,
            "marker_count": result.marker_count,
            "marker_word_indices": result.marker_word_indices,
            "word_to_paragraph": result.word_to_paragraph,
            "paragraph_texts": result.paragraph_texts
        }
    )

    print(f"Text splitting completed for submission {submission_id}: {len(sentences)} sentences, {len(result.words)} words, {result.marker_count} markers")
