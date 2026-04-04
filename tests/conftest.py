"""
Pytest fixtures and configuration for RSS submission analysis tests.
"""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, UTC
import uuid

# Note: main.py mocks are set up in test_main_app.py module-level code


# =============================================================================
# NLTK Mocking - applied via pytest_configure hook before any imports
# =============================================================================

# Create mock NLTK corpus objects
_mock_stopwords = MagicMock()
_mock_stopwords.words.return_value = [
    "the",
    "a",
    "an",
    "and",
    "is",
    "are",
    "was",
    "were",
    "be",
    "has",
    "he",
    "in",
    "it",
    "its",
    "of",
    "on",
    "that",
    "to",
    "will",
    "with",
]
_mock_wordnet = MagicMock()

# Global patchers that will be started in pytest_configure
_nltk_stopwords_patcher = None
_nltk_wordnet_patcher = None


def pytest_configure(config):
    """Start NLTK mocks before any test modules are imported."""
    global _nltk_stopwords_patcher, _nltk_wordnet_patcher
    _nltk_stopwords_patcher = patch("nltk.corpus.stopwords", _mock_stopwords)
    _nltk_wordnet_patcher = patch("nltk.corpus.wordnet", _mock_wordnet)
    _nltk_stopwords_patcher.start()
    _nltk_wordnet_patcher.start()


def pytest_unconfigure(config):
    """Stop NLTK mocks when pytest session ends."""
    global _nltk_stopwords_patcher, _nltk_wordnet_patcher
    if _nltk_stopwords_patcher:
        _nltk_stopwords_patcher.stop()
    if _nltk_wordnet_patcher:
        _nltk_wordnet_patcher.stop()


@pytest.fixture
def mock_db():
    """Create a mock MongoDB database."""
    db = MagicMock()
    db.submissions = MagicMock()
    db.task_queue = MagicMock()
    return db


@pytest.fixture
def mock_submissions_storage(mock_db):
    """Create a mock SubmissionsStorage instance."""
    storage = MagicMock()
    storage._db = mock_db
    storage.task_names = [
        "split_topic_generation",
        "subtopics_generation",
        "summarization",
        "mindmap",
        "prefix_tree",
        "insights_generation",
        "markup_generation",
        "clustering_generation",
        "topic_modeling_generation",
    ]
    storage.task_dependencies = {
        "split_topic_generation": [],
        "subtopics_generation": ["split_topic_generation"],
        "summarization": ["split_topic_generation"],
        "mindmap": ["subtopics_generation"],
        "prefix_tree": ["split_topic_generation"],
        "insights_generation": ["split_topic_generation"],
        "markup_generation": ["split_topic_generation"],
        "clustering_generation": ["split_topic_generation"],
        "topic_modeling_generation": ["split_topic_generation"],
    }
    return storage


@pytest.fixture
def sample_submission():
    """Create a sample submission document."""
    return {
        "submission_id": str(uuid.uuid4()),
        "html_content": "<html><body><p>Sample content</p></body></html>",
        "text_content": "Sample content",
        "source_url": "https://example.com/article",
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
        "tasks": {
            "split_topic_generation": {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "error": None,
            },
            "subtopics_generation": {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "error": None,
            },
            "summarization": {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "error": None,
            },
            "mindmap": {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "error": None,
            },
            "prefix_tree": {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "error": None,
            },
            "insights_generation": {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "error": None,
            },
            "markup_generation": {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "error": None,
            },
            "clustering_generation": {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "error": None,
            },
            "topic_modeling_generation": {
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "error": None,
            },
        },
        "results": {
            "sentences": ["Sentence one.", "Sentence two.", "Sentence three."],
            "topics": [
                {"name": "Topic A", "sentences": [1, 2]},
                {"name": "Topic B", "sentences": [3]},
            ],
            "topic_summaries": {},
            "article_summary": {"text": "", "bullets": []},
            "topic_mindmaps": {},
            "mindmap_results": [],
            "subtopics": [],
            "summary": [],
            "summary_mappings": [],
            "prefix_tree": {},
            "insights": [],
            "annotations": {},
            "markup": {},
        },
    }


@pytest.fixture
def sample_html_content():
    """Sample HTML content for testing."""
    return """<!DOCTYPE html>
<html>
<head><title>Test Article</title></head>
<body>
    <h1>Main Heading</h1>
    <p>This is a sample paragraph with some content.</p>
    <p>Another paragraph with more text for testing purposes.</p>
</body>
</html>"""


@pytest.fixture
def sample_markdown_content():
    """Sample Markdown content for testing."""
    return """# Main Heading

This is a sample paragraph with some content.

## Subheading

Another paragraph with **bold** and *italic* text.

- List item 1
- List item 2
"""


@pytest.fixture
def mock_upload_file():
    """Create a mock UploadFile."""
    mock_file = MagicMock()
    mock_file.filename = "test.html"
    mock_file.read = MagicMock()
    return mock_file


@pytest.fixture
def mock_async_upload_file():
    """Create a mock UploadFile with async read method."""

    class AsyncMockRead:
        def __init__(self, data):
            self.data = data

        def __await__(self):
            yield
            return self.data

    mock_file = MagicMock()
    mock_file.filename = "test.html"

    def async_read():
        async def read():
            return mock_file._read_data

        return read()

    mock_file.read = async_read
    mock_file._read_data = b""
    return mock_file


@pytest.fixture
def mock_nltk_dependencies():
    """Mock NLTK dependencies for word cloud tests."""
    with (
        patch("lib.nlp.word_tokenize") as mock_tokenize,
        patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
        patch("lib.nlp.stopwords.words") as mock_stopwords,
        patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
    ):
        # Setup mock tokenization
        mock_tokenize.return_value = ["sample", "word", "test"]

        # Setup mock POS tagging
        mock_pos_tag.return_value = [("sample", "NN"), ("word", "NN"), ("test", "NN")]

        # Setup mock stop words
        mock_stopwords.return_value = ["the", "a", "an", "is", "are"]

        # Setup mock lemmatizer
        mock_lemma_instance = MagicMock()
        mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
        mock_lemmatizer.return_value = mock_lemma_instance

        yield {
            "tokenize": mock_tokenize,
            "pos_tag": mock_pos_tag,
            "stopwords": mock_stopwords,
            "lemmatizer": mock_lemmatizer,
        }


@pytest.fixture
def mock_markdown():
    """Mock the markdown library."""
    with patch("markdown.markdown") as mock_md:
        mock_md.return_value = "<p>Converted HTML</p>"
        yield mock_md


@pytest.fixture
def mock_pdf_to_html():
    """Mock the pdf_to_html module."""
    with (
        patch("lib.pdf_to_html.convert_pdf_to_html") as mock_convert,
        patch("lib.pdf_to_html.extract_text_from_pdf") as mock_extract,
    ):
        mock_convert.return_value = "<html><body><p>PDF HTML content</p></body></html>"
        mock_extract.return_value = "PDF text content"

        yield {"convert": mock_convert, "extract": mock_extract}
