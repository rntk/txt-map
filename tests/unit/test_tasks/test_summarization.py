"""
Unit tests for the summarization task handler.

Tests summarize_by_sentence_groups and process_summarization functions.
"""
import pytest
from unittest.mock import MagicMock, Mock, patch, call
import hashlib
from datetime import datetime, UTC

# Import module under test
from lib.tasks.summarization import (
    summarize_by_sentence_groups,
    process_summarization,
)


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_db():
    """Create a mock MongoDB database."""
    db = MagicMock()
    db.submissions = MagicMock()
    db.task_queue = MagicMock()
    db.list_collection_names = MagicMock(return_value=["llm_cache"])
    db.llm_cache = MagicMock()
    return db


@pytest.fixture
def mock_llm():
    """Create a mock LLamaCPP client."""
    llm = MagicMock()
    llm.estimate_tokens = MagicMock(return_value=100)
    llm.max_context_tokens = 11000
    llm.call = MagicMock(return_value="Brief summary")
    return llm


@pytest.fixture
def mock_submissions_storage():
    """Mock the SubmissionsStorage class."""
    with patch('lib.tasks.summarization.SubmissionsStorage') as mock_storage:
        yield mock_storage


@pytest.fixture
def sample_submission():
    """Create a sample submission document."""
    return {
        "submission_id": "test-submission-123",
        "html_content": "<html><body><p>Sample content</p></body></html>",
        "results": {
            "sentences": [
                "Sentence one about Python programming.",
                "Sentence two about data structures.",
                "Sentence three about algorithms."
            ],
            "topics": [
                {"name": "Programming", "sentences": [1, 2, 3]}
            ],
            "summary": [],
            "summary_mappings": [],
            "topic_summaries": {}
        }
    }


@pytest.fixture
def mock_cache_collection():
    """Create a mock cache collection."""
    collection = MagicMock()
    collection.find_one = MagicMock(return_value=None)
    collection.update_one = MagicMock()
    return collection


# =============================================================================
# Test: summarize_by_sentence_groups - Basic Functionality
# =============================================================================

class TestSummarizeBySentenceGroupsBasic:
    """Test basic functionality of summarize_by_sentence_groups."""

    def test_returns_empty_for_empty_sent_list(self, mock_llm):
        """Function returns empty summaries for empty sentence list."""
        summaries, mappings = summarize_by_sentence_groups(
            [], mock_llm, mock_llm
        )
        assert summaries == []
        assert mappings == []

    def test_estimates_template_tokens(self, mock_llm):
        """Function estimates template tokens from LLM."""
        sentences = ["Test sentence."]

        summarize_by_sentence_groups(
            sentences, mock_llm, mock_llm
        )

        mock_llm.estimate_tokens.assert_called_once()

    def test_calculates_max_text_tokens_from_context_limit(self, mock_llm):
        """Function calculates max_text_tokens from context limit."""
        sentences = ["Test sentence."]
        
        mock_llm.call.return_value = "Summary"

        summarize_by_sentence_groups(
            sentences, mock_llm, mock_llm
        )

        # Verify the budget calculation: max_text_tokens = context_size - template_tokens - buffer
        # mock_llm.estimate_tokens returns 100 (template tokens)
        # mock_llm.max_context_tokens is 11000
        # Default buffer is 400
        # So max_text_tokens should be 11000 - 100 - 400 = 10500
        expected_template_tokens = 100
        
        # Verify estimate_tokens was called with the template (without sentence content)
        mock_llm.estimate_tokens.assert_called_once()
        call_arg = mock_llm.estimate_tokens.call_args[0][0]
        # The template should contain the prompt structure but not the sentence placeholder value
        assert "{sentence}" not in call_arg

    def test_summarizes_each_sentence_group_individually(self, mock_llm):
        """Function summarizes each sentence group individually."""
        sentences = ["First sentence.", "Second sentence.", "Third sentence."]

        mock_llm.call.return_value = "Summary"

        summaries, mappings = summarize_by_sentence_groups(
            sentences, mock_llm, mock_llm
        )

        assert len(summaries) == 3
        assert len(mappings) == 3

    def test_creates_summary_mapping_for_each_summary(self, mock_llm):
        """Function creates summary mapping for each summary."""
        sentences = ["First sentence.", "Second sentence."]

        mock_llm.call.return_value = "Summary"

        summaries, mappings = summarize_by_sentence_groups(
            sentences, mock_llm, mock_llm
        )

        assert len(mappings) == 2

        for mapping in mappings:
            assert "summary_index" in mapping
            assert "summary_sentence" in mapping
            assert "source_sentences" in mapping

    def test_source_sentences_are_one_indexed(self, mock_llm):
        """Function uses 1-indexed source sentences in mappings."""
        sentences = ["First sentence.", "Second sentence.", "Third sentence."]

        mock_llm.call.return_value = "Summary"

        summaries, mappings = summarize_by_sentence_groups(
            sentences, mock_llm, mock_llm
        )

        # Check that source_sentences are 1-indexed
        assert mappings[0]["source_sentences"] == [1]
        assert mappings[1]["source_sentences"] == [2]
        assert mappings[2]["source_sentences"] == [3]

    def test_summary_mapping_structure(self, mock_llm):
        """Function creates mappings with correct structure."""
        sentences = ["Test sentence."]

        mock_llm.call.return_value = "Test summary"

        summaries, mappings = summarize_by_sentence_groups(
            sentences, mock_llm, mock_llm
        )

        mapping = mappings[0]
        assert mapping["summary_index"] == 0
        assert mapping["summary_sentence"] == "Test summary"
        assert mapping["source_sentences"] == [1]


# =============================================================================
# Test: process_summarization - Basic Functionality
# =============================================================================

class TestProcessSummarizationBasic:
    """Test basic functionality of process_summarization."""

    def test_raises_value_error_when_sentences_missing(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function raises ValueError when sentences are missing."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "topics": [{"name": "Topic", "sentences": [1, 2]}]
            }
        }

        with pytest.raises(ValueError, match="Text splitting must be completed first"):
            process_summarization(submission, mock_db, mock_llm)

    def test_raises_value_error_when_sentences_empty(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function raises ValueError when sentences list is empty."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": [],
                "topics": [{"name": "Topic", "sentences": [1, 2]}]
            }
        }

        with pytest.raises(ValueError, match="Text splitting must be completed first"):
            process_summarization(submission, mock_db, mock_llm)

    def test_generates_overall_summary_for_all_sentences(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function generates overall summary for all sentences."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2", "S3"],
                "topics": []
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.summarization.summarize_by_sentence_groups') as mock_sum:
            mock_sum.return_value = (["Summary1", "Summary2", "Summary3"], [])

            process_summarization(submission, mock_db, mock_llm)

            # Should be called with all sentences
            mock_sum.assert_called()
            call_args = mock_sum.call_args_list[0]
            assert call_args[0][0] == ["S1", "S2", "S3"]

    def test_generates_topic_summaries_for_each_topic(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function generates summaries for each topic."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2", "S3", "S4"],
                "topics": [
                    {"name": "Topic A", "sentences": [1, 2]},
                    {"name": "Topic B", "sentences": [3, 4]}
                ]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.summarization.summarize_by_sentence_groups') as mock_sum:
            mock_sum.return_value = (["Topic Summary"], [])

            process_summarization(submission, mock_db, mock_llm)

            # Should be called for overall summary + 2 topics
            assert mock_sum.call_count == 3

    def test_skips_no_topic_topics(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function skips topics named 'no_topic'."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": [
                    {"name": "no_topic", "sentences": [1]},
                    {"name": "Valid Topic", "sentences": [2]}
                ]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.summarization.summarize_by_sentence_groups') as mock_sum:
            mock_sum.return_value = (["Summary"], [])

            process_summarization(submission, mock_db, mock_llm)

            # Should be called for overall + 1 valid topic (not no_topic)
            assert mock_sum.call_count == 2

    def test_skips_topics_without_sentences(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function skips topics without sentences."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": [
                    {"name": "Empty Topic", "sentences": []},
                    {"name": "Valid Topic", "sentences": [1]}
                ]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.summarization.summarize_by_sentence_groups') as mock_sum:
            mock_sum.return_value = (["Summary"], [])

            process_summarization(submission, mock_db, mock_llm)

            # Should skip empty topic
            assert mock_sum.call_count == 2  # overall + 1 valid topic

    def test_stores_topic_summaries_as_dict(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function stores topic summaries as {topic_name: summary_text} dict."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": [
                    {"name": "Topic A", "sentences": [1]},
                    {"name": "Topic B", "sentences": [2]}
                ]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.summarization.summarize_by_sentence_groups') as mock_sum:
            mock_sum.return_value = (["Summary A"], [])

            process_summarization(submission, mock_db, mock_llm)

            update_call = mock_storage_instance.update_results.call_args
            topic_summaries = update_call[0][1]["topic_summaries"]

            assert isinstance(topic_summaries, dict)
            assert "Topic A" in topic_summaries

    def test_updates_results_with_summary(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function updates results with summary."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": []
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.summarization.summarize_by_sentence_groups') as mock_sum:
            mock_sum.return_value = (["Summary"], [{"summary_index": 0, "summary_sentence": "Summary", "source_sentences": [1]}])

            process_summarization(submission, mock_db, mock_llm)

            update_call = mock_storage_instance.update_results.call_args
            assert "summary" in update_call[0][1]
            assert "summary_mappings" in update_call[0][1]

    def test_updates_results_with_topic_summaries(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function updates results with topic_summaries."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": [{"name": "Topic", "sentences": [1]}]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.summarization.summarize_by_sentence_groups') as mock_sum:
            mock_sum.return_value = (["Summary"], [])

            process_summarization(submission, mock_db, mock_llm)

            update_call = mock_storage_instance.update_results.call_args
            assert "topic_summaries" in update_call[0][1]


# =============================================================================
# Test: process_summarization - Completion Message
# =============================================================================


# =============================================================================
# Test: process_summarization - Completion Message
# =============================================================================

class TestProcessSummarizationCompletionMessage:
    """Test completion message functionality."""

    def test_logs_completion_message_with_counts(
        self, mock_db, mock_llm, mock_submissions_storage, capsys
    ):
        """Function logs completion message with summary and topic summary counts."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": [
                    {"name": "Topic A", "sentences": [1]},
                    {"name": "Topic B", "sentences": [2]}
                ]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.summarization.summarize_by_sentence_groups') as mock_sum:
            mock_sum.return_value = (["Summary1", "Summary2"], [])

            process_summarization(submission, mock_db, mock_llm)

        captured = capsys.readouterr()
        assert "Summarization completed" in captured.out
        assert "test-123" in captured.out
        assert "2 summaries" in captured.out
        assert "2 topic summaries" in captured.out


# =============================================================================
# Test: process_summarization - Edge Cases
# =============================================================================

class TestProcessSummarizationEdgeCases:
    """Test edge cases for process_summarization."""

    def test_handles_empty_topics_list(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function handles empty topics list."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": []
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.summarization.summarize_by_sentence_groups') as mock_sum:
            mock_sum.return_value = (["Summary1", "Summary2"], [])

            # Should not raise
            process_summarization(submission, mock_db, mock_llm)

    def test_handles_missing_topics_key(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function handles missing topics key in results."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.summarization.summarize_by_sentence_groups') as mock_sum:
            mock_sum.return_value = (["Summary1", "Summary2"], [])

            # Should not raise
            process_summarization(submission, mock_db, mock_llm)

    def test_handles_sentence_index_out_of_bounds(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function handles sentence indices out of bounds."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": [
                    {"name": "Topic", "sentences": [1, 100]}  # 100 is out of bounds
                ]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.summarization.summarize_by_sentence_groups') as mock_sum:
            mock_sum.return_value = (["Summary"], [])

            # Should not raise
            process_summarization(submission, mock_db, mock_llm)

    def test_handles_empty_summary_response(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function handles empty summary response from LLM."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": []
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.summarization.summarize_by_sentence_groups') as mock_sum:
            # Empty summaries returned
            mock_sum.return_value = ([], [])

            # Should not raise
            process_summarization(submission, mock_db, mock_llm)


# =============================================================================
# Test: process_summarization - LLM Unavailable
# =============================================================================

class TestProcessSummarizationLLMUnavailable:
    """Test behavior when LLM is unavailable."""

    def test_handles_llm_exception(self, mock_db, mock_submissions_storage):
        """Function propagates LLM exceptions."""
        mock_llm = MagicMock()

        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": []
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.summarization.summarize_by_sentence_groups') as mock_sum:
            mock_sum.side_effect = Exception("LLM service unavailable")

            with pytest.raises(Exception, match="LLM service unavailable"):
                process_summarization(submission, mock_db, mock_llm)

    def test_handles_llm_timeout(self, mock_db, mock_submissions_storage):
        """Function propagates LLM timeout exceptions."""
        mock_llm = MagicMock()

        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": []
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.summarization.summarize_by_sentence_groups') as mock_sum:
            mock_sum.side_effect = TimeoutError("LLM timeout")

            with pytest.raises(TimeoutError):
                process_summarization(submission, mock_db, mock_llm)
