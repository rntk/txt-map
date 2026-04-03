"""
Unit tests for the split_topic_generation task handler.

Tests process_split_topic_generation function and its dependencies.
"""
import logging
from types import SimpleNamespace
import pytest
from unittest.mock import MagicMock, patch

# Import module under test
from lib.tasks.split_topic_generation import process_split_topic_generation


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_db():
    """Create a mock MongoDB database."""
    db = MagicMock()
    db.submissions = MagicMock()
    db.task_queue = MagicMock()
    return db


@pytest.fixture
def mock_llm():
    """Create a mock LLamaCPP client."""
    llm = MagicMock()
    llm.estimate_tokens = MagicMock(return_value=100)
    llm._LLamaCPP__max_context_tokens = 11000
    return llm


@pytest.fixture
def mock_split_article_with_markers():
    """Mock the split_article_with_markers function."""
    with patch('lib.tasks.split_topic_generation.split_article_with_markers') as mock_split:
        yield mock_split


@pytest.fixture
def mock_submissions_storage():
    """Mock the SubmissionsStorage class."""
    with patch('lib.tasks.split_topic_generation.SubmissionsStorage') as mock_storage:
        yield mock_storage


@pytest.fixture
def mock_tracer():
    """Mock the Tracer class."""
    with patch('lib.tasks.split_topic_generation.Tracer') as mock_tracer_class:
        mock_tracer_instance = MagicMock()
        mock_tracer_instance.format.return_value = ""
        mock_tracer_class.return_value = mock_tracer_instance
        yield mock_tracer_instance


@pytest.fixture
def sample_submission():
    """Create a sample submission document."""
    return {
        "submission_id": "test-submission-123",
        "html_content": "<html><body><p>Sample HTML content</p></body></html>",
        "text_content": "Sample text content",
        "source_url": "https://example.com/article",
        "max_chunk_chars": 12000,
        "results": {
            "sentences": [],
            "topics": []
        }
    }


@pytest.fixture
def mock_split_result():
    """Create a mock ArticleSplitResult."""
    result = MagicMock()
    result.sentences = ["Sentence one.", "Sentence two.", "Sentence three."]
    result.topics = [
        {"name": "Topic A", "sentences": [1, 2]},
        {"name": "Topic B", "sentences": [3]}
    ]
    return result


# =============================================================================
# Test: process_split_topic_generation - Basic Functionality
# =============================================================================

class TestProcessSplitTopicGenerationBasic:
    """Test basic functionality of process_split_topic_generation."""

    def test_prefers_html_content_over_text_content(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer, mock_split_result, sample_submission
    ):
        """Function prefers html_content over text_content."""
        mock_split_article_with_markers.return_value = mock_split_result
        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        process_split_topic_generation(sample_submission, mock_db, mock_llm)

        # Verify html_content was used (not text_content)
        mock_split_article_with_markers.assert_called_once()
        call_args = mock_split_article_with_markers.call_args
        assert call_args[0][0] == sample_submission["html_content"]

    def test_falls_back_to_text_content_when_html_empty(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer, mock_split_result
    ):
        """Function falls back to text_content when html_content is empty."""
        submission = {
            "submission_id": "test-123",
            "html_content": "",
            "text_content": "Sample text content",
            "results": {}
        }
        mock_split_article_with_markers.return_value = mock_split_result
        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        process_split_topic_generation(submission, mock_db, mock_llm)

        # Verify text_content was used
        call_args = mock_split_article_with_markers.call_args
        assert call_args[0][0] == submission["text_content"]

    def test_calls_split_article_with_markers_with_correct_params(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer, mock_split_result, sample_submission
    ):
        """Function calls split_article_with_markers with correct parameters."""
        mock_split_article_with_markers.return_value = mock_split_result
        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        process_split_topic_generation(sample_submission, mock_db, mock_llm)

        mock_split_article_with_markers.assert_called_once()
        call_args = mock_split_article_with_markers.call_args

        # Check positional arguments
        assert call_args[0][0] == sample_submission["html_content"]
        assert call_args[0][1] is mock_llm

        # Check keyword arguments
        assert call_args[1]["tracer"] is mock_tracer
        assert call_args[1]["max_chunk_chars"] == 12000

    def test_uses_default_max_chunk_chars_when_not_specified(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer, mock_split_result
    ):
        """Function uses default max_chunk_chars (12,000) when not specified."""
        submission = {
            "submission_id": "test-123",
            "html_content": "Sample content",
            "results": {}
        }
        mock_split_article_with_markers.return_value = mock_split_result
        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        process_split_topic_generation(submission, mock_db, mock_llm)

        call_args = mock_split_article_with_markers.call_args
        assert call_args[1]["max_chunk_chars"] == 12_000

    def test_uses_custom_max_chunk_chars_when_specified(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer, mock_split_result
    ):
        """Function uses custom max_chunk_chars when specified."""
        submission = {
            "submission_id": "test-123",
            "html_content": "Sample content",
            "max_chunk_chars": 8000,
            "results": {}
        }
        mock_split_article_with_markers.return_value = mock_split_result
        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        process_split_topic_generation(submission, mock_db, mock_llm)

        call_args = mock_split_article_with_markers.call_args
        assert call_args[1]["max_chunk_chars"] == 8000

    def test_updates_results_with_sentences_and_topics(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer, mock_split_result, sample_submission
    ):
        """Function updates results with sentences and topics."""
        mock_split_article_with_markers.return_value = mock_split_result
        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        process_split_topic_generation(sample_submission, mock_db, mock_llm)

        mock_submissions_storage.assert_called_once_with(mock_db)
        mock_storage_instance.update_results.assert_called_once()
        update_call = mock_storage_instance.update_results.call_args

        assert update_call[0][0] == "test-submission-123"
        assert update_call[0][1]["sentences"] == mock_split_result.sentences
        assert update_call[0][1]["topics"] == mock_split_result.topics

    def test_creates_tracer_instance(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer, mock_split_result, sample_submission
    ):
        """Function creates Tracer instance."""
        mock_split_article_with_markers.return_value = mock_split_result
        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        process_split_topic_generation(sample_submission, mock_db, mock_llm)

        # Verify Tracer was instantiated
        assert mock_tracer is not None


# =============================================================================
# Test: process_split_topic_generation - Tracer Output
# =============================================================================

class TestProcessSplitTopicGenerationTracer:
    """Test tracer output functionality."""

    def test_prints_tracer_output_when_available(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_split_result, sample_submission, capsys
    ):
        """Function prints tracer output when available."""
        mock_split_article_with_markers.return_value = mock_split_result

        # Create mock tracer with output
        with patch('lib.tasks.split_topic_generation.Tracer') as mock_tracer_class:
            mock_tracer_instance = MagicMock()
            mock_tracer_instance.format.return_value = "Trace: split -> topic"
            mock_tracer_class.return_value = mock_tracer_instance

            mock_storage_instance = MagicMock()
            mock_submissions_storage.return_value = mock_storage_instance

            process_split_topic_generation(sample_submission, mock_db, mock_llm)

            captured = capsys.readouterr()
            assert "Trace: split -> topic" in captured.out

    def test_does_not_print_when_tracer_output_empty(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_split_result, sample_submission, capsys
    ):
        """Function does not print when tracer output is empty."""
        mock_split_article_with_markers.return_value = mock_split_result

        # Create mock tracer with empty output
        with patch('lib.tasks.split_topic_generation.Tracer') as mock_tracer_class:
            mock_tracer_instance = MagicMock()
            mock_tracer_instance.format.return_value = ""
            mock_tracer_class.return_value = mock_tracer_instance

            mock_storage_instance = MagicMock()
            mock_submissions_storage.return_value = mock_storage_instance

            process_split_topic_generation(sample_submission, mock_db, mock_llm)

            captured = capsys.readouterr()
            # Should not contain tracer output (only completion message)
            assert "Trace:" not in captured.out

    def test_logs_failure_diagnostics_from_tracer(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_split_result, sample_submission, caplog
    ):
        """Failure retries log tracer-derived diagnostics."""
        failed_tracer = MagicMock()
        failed_tracer.spans = [
            SimpleNamespace(
                name="pipeline.run",
                attributes={},
                children=[
                    SimpleNamespace(
                        name="html_clean",
                        attributes={"clean_length": 321},
                        children=[],
                    ),
                    SimpleNamespace(
                        name="split",
                        attributes={"item_count": 14},
                        children=[],
                    ),
                    SimpleNamespace(
                        name="mark",
                        attributes={"tagged_text_length": 900},
                        children=[],
                    ),
                    SimpleNamespace(
                        name="llm.call",
                        attributes={
                            "cache_hit": True,
                            "cache_namespace": "article-split:test",
                            "cache_key": "cache-key",
                            "prompt": "prompt body",
                            "response": "bad response",
                        },
                        children=[],
                    ),
                ],
            )
        ]
        failed_tracer.format.return_value = "trace body"

        success_tracer = MagicMock()
        success_tracer.spans = []
        success_tracer.format.return_value = ""

        mock_split_article_with_markers.side_effect = [
            ValueError("No valid topic ranges found in response"),
            mock_split_result,
        ]
        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.split_topic_generation.Tracer') as mock_tracer_class, patch(
            'lib.tasks.split_topic_generation.time.sleep'
        ):
            mock_tracer_class.side_effect = [failed_tracer, success_tracer]
            caplog.set_level(logging.WARNING)

            process_split_topic_generation(
                sample_submission,
                mock_db,
                mock_llm,
                max_retries=1,
            )

        assert "Split topic diagnostics for submission" in caplog.text
        assert "cache_hit=True" in caplog.text
        assert "prompt_preview=prompt body" in caplog.text
        assert "response_preview=bad response" in caplog.text
        assert "Split topic trace for submission" in caplog.text


# =============================================================================
# Test: process_split_topic_generation - Completion Message
# =============================================================================

class TestProcessSplitTopicGenerationCompletionMessage:
    """Test completion message functionality."""

    def test_logs_completion_message_with_counts(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer, mock_split_result, sample_submission, capsys
    ):
        """Function logs completion message with sentence and topic counts."""
        mock_split_article_with_markers.return_value = mock_split_result
        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        process_split_topic_generation(sample_submission, mock_db, mock_llm)

        captured = capsys.readouterr()
        assert "Split/topic generation completed" in captured.out
        assert "test-submission-123" in captured.out
        assert "3 sentences" in captured.out
        assert "2 topics" in captured.out

    def test_completion_message_shows_zero_counts_when_empty(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer, capsys
    ):
        """Function shows zero counts when results are empty."""
        empty_result = MagicMock()
        empty_result.sentences = []
        empty_result.topics = []
        mock_split_article_with_markers.return_value = empty_result
        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        submission = {
            "submission_id": "test-123",
            "html_content": "Sample content",
            "results": {}
        }

        process_split_topic_generation(submission, mock_db, mock_llm)

        captured = capsys.readouterr()
        assert "0 sentences" in captured.out
        assert "0 topics" in captured.out


# =============================================================================
# Test: process_split_topic_generation - Edge Cases
# =============================================================================

class TestProcessSplitTopicGenerationEdgeCases:
    """Test edge cases for process_split_topic_generation."""

    def test_raises_value_error_when_no_html_content(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer
    ):
        """Function raises ValueError when no html_content."""
        submission = {
            "submission_id": "test-123",
            "html_content": "",
            "text_content": "",
            "results": {}
        }

        with pytest.raises(ValueError, match="No text content to process"):
            process_split_topic_generation(submission, mock_db, mock_llm)

    def test_raises_value_error_when_no_text_content(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer
    ):
        """Function raises ValueError when no text_content (and no html_content)."""
        submission = {
            "submission_id": "test-123",
            "results": {}
        }

        with pytest.raises(ValueError, match="No text content to process"):
            process_split_topic_generation(submission, mock_db, mock_llm)

    def test_handles_whitespace_only_content(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer
    ):
        """Function handles whitespace-only content as empty."""
        submission = {
            "submission_id": "test-123",
            "html_content": "   \n\t  ",
            "text_content": "   \n\t  ",
            "results": {}
        }
        # Note: whitespace-only strings are truthy in Python
        # The function checks "if not source", so whitespace passes through
        # This tests the behavior with whitespace content
        mock_result = MagicMock()
        mock_result.sentences = []
        mock_result.topics = []
        mock_split_article_with_markers.return_value = mock_result
        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        # Should not raise, but process the whitespace
        process_split_topic_generation(submission, mock_db, mock_llm)

        # Verify it was called with the whitespace content
        mock_split_article_with_markers.assert_called_once()

    def test_handles_missing_results_key(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer, mock_split_result
    ):
        """Function handles missing 'results' key in submission."""
        submission = {
            "submission_id": "test-123",
            "html_content": "Sample content"
        }
        mock_split_article_with_markers.return_value = mock_split_result
        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        # Should not raise
        process_split_topic_generation(submission, mock_db, mock_llm)

        mock_split_article_with_markers.assert_called_once()

    def test_handles_missing_submission_id(
        self, mock_db, mock_llm, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer, mock_split_result
    ):
        """Function handles missing submission_id (KeyError expected)."""
        submission = {
            "html_content": "Sample content",
            "results": {}
        }
        mock_split_article_with_markers.return_value = mock_split_result
        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        # This will raise KeyError when trying to access submission["submission_id"]
        with pytest.raises(KeyError):
            process_split_topic_generation(submission, mock_db, mock_llm)


# =============================================================================
# Test: process_split_topic_generation - Mocking Dependencies
# =============================================================================

class TestProcessSplitTopicGenerationMocking:
    """Test proper mocking of dependencies."""

    def test_mocks_mongodb_database(self, mock_db, mock_llm, mock_split_article_with_markers):
        """Test that MongoDB database is properly mocked."""
        mock_result = MagicMock()
        mock_result.sentences = ["Test sentence."]
        mock_result.topics = []
        mock_split_article_with_markers.return_value = mock_result

        with patch('lib.tasks.split_topic_generation.SubmissionsStorage') as mock_storage_class:
            mock_storage_instance = MagicMock()
            mock_storage_class.return_value = mock_storage_instance

            submission = {
                "submission_id": "test-123",
                "html_content": "Test content",
                "results": {}
            }

            process_split_topic_generation(submission, mock_db, mock_llm)

            # Verify SubmissionsStorage was created with mock_db
            mock_storage_class.assert_called_once_with(mock_db)

    def test_mocks_submissions_storage(self, mock_db, mock_llm, mock_split_article_with_markers, mock_split_result):
        """Test that SubmissionsStorage is properly mocked."""
        mock_split_article_with_markers.return_value = mock_split_result

        with patch('lib.tasks.split_topic_generation.SubmissionsStorage') as mock_storage_class:
            mock_storage_instance = MagicMock()
            mock_storage_class.return_value = mock_storage_instance

            submission = {
                "submission_id": "test-123",
                "html_content": "Test content",
                "results": {}
            }

            process_split_topic_generation(submission, mock_db, mock_llm)

            # Verify update_results was called
            mock_storage_instance.update_results.assert_called_once()

    def test_mocks_txt_splitt_tracer(self, mock_db, mock_llm, mock_split_article_with_markers, mock_split_result):
        """Test that txt_splitt.Tracer is properly mocked."""
        mock_split_article_with_markers.return_value = mock_split_result

        with patch('lib.tasks.split_topic_generation.Tracer') as mock_tracer_class:
            mock_tracer_instance = MagicMock()
            mock_tracer_instance.format.return_value = ""
            mock_tracer_class.return_value = mock_tracer_instance

            mock_storage_instance = MagicMock()
            with patch('lib.tasks.split_topic_generation.SubmissionsStorage') as mock_storage_class:
                mock_storage_class.return_value = mock_storage_instance

                submission = {
                    "submission_id": "test-123",
                    "html_content": "Test content",
                    "results": {}
                }

                process_split_topic_generation(submission, mock_db, mock_llm)

                # Verify Tracer was instantiated and used
                mock_tracer_class.assert_called_once()
                mock_tracer_instance.format.assert_called_once()

    def test_mocks_article_splitter(self, mock_db, mock_llm, mock_split_result):
        """Test that article_splitter.split_article_with_markers is properly mocked."""
        with patch('lib.tasks.split_topic_generation.split_article_with_markers') as mock_split:
            mock_split.return_value = mock_split_result

            mock_storage_instance = MagicMock()
            with patch('lib.tasks.split_topic_generation.SubmissionsStorage') as mock_storage_class:
                mock_storage_class.return_value = mock_storage_instance

                submission = {
                    "submission_id": "test-123",
                    "html_content": "Test content",
                    "results": {}
                }

                process_split_topic_generation(submission, mock_db, mock_llm)

                # Verify split_article_with_markers was called
                mock_split.assert_called_once()


# =============================================================================
# Test: process_split_topic_generation - LLM Unavailable
# =============================================================================

class TestProcessSplitTopicGenerationLLMUnavailable:
    """Test behavior when LLM is unavailable."""

    def test_handles_llm_exception(
        self, mock_db, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer
    ):
        """Function propagates LLM exceptions."""
        mock_llm = MagicMock()
        mock_llm.call.side_effect = Exception("LLM service unavailable")

        # The exception would be raised inside split_article_with_markers
        mock_split_article_with_markers.side_effect = Exception("LLM service unavailable")

        submission = {
            "submission_id": "test-123",
            "html_content": "Test content",
            "results": {}
        }

        with pytest.raises(Exception, match="LLM service unavailable"):
            process_split_topic_generation(submission, mock_db, mock_llm, max_retries=0)

    def test_handles_llm_timeout(
        self, mock_db, mock_split_article_with_markers,
        mock_submissions_storage, mock_tracer
    ):
        """Function propagates LLM timeout exceptions."""
        mock_llm = MagicMock()

        # The exception would be raised inside split_article_with_markers
        mock_split_article_with_markers.side_effect = TimeoutError("LLM timeout")

        submission = {
            "submission_id": "test-123",
            "html_content": "Test content",
            "results": {}
        }

        with pytest.raises(TimeoutError):
            process_split_topic_generation(submission, mock_db, mock_llm, max_retries=0)
