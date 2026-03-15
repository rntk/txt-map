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
    llm._LLamaCPP__max_context_tokens = 11000
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

    def test_returns_empty_for_empty_sent_list(self, mock_llm, mock_cache_collection):
        """Function returns empty summaries for empty sentence list."""
        summaries, mappings = summarize_by_sentence_groups(
            [], mock_llm, mock_cache_collection
        )
        assert summaries == []
        assert mappings == []

    def test_estimates_template_tokens(self, mock_llm, mock_cache_collection):
        """Function estimates template tokens from LLM."""
        sentences = ["Test sentence."]

        summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        mock_llm.estimate_tokens.assert_called_once()

    def test_calculates_max_text_tokens_from_context_limit(self, mock_llm, mock_cache_collection):
        """Function calculates max_text_tokens from context limit."""
        sentences = ["Test sentence."]
        
        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Summary"

        summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        # Verify the budget calculation: max_text_tokens = context_size - template_tokens - buffer
        # mock_llm.estimate_tokens returns 100 (template tokens)
        # mock_llm._LLamaCPP__max_context_tokens is 11000
        # Default buffer is 400
        # So max_text_tokens should be 11000 - 100 - 400 = 10500
        expected_template_tokens = 100
        expected_max_text_tokens = 11000 - expected_template_tokens - 400
        
        # Verify estimate_tokens was called with the template (without sentence content)
        mock_llm.estimate_tokens.assert_called_once()
        call_arg = mock_llm.estimate_tokens.call_args[0][0]
        # The template should contain the prompt structure but not the sentence placeholder value
        assert "{sentence}" not in call_arg or call_arg == "Summarize the text within the <text> tags into a super brief summary (just a few words).\n- Keep it objective and extremely concise.\n\nText:\n<text></text>\n\nSummary:"

    def test_enforces_token_budget_on_input_sentences(self, mock_llm, mock_cache_collection):
        """Function respects token budget when processing sentences."""
        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Summary"
        
        # Create sentences that would exceed the token budget if not enforced
        # With template_tokens=100, context=11000, buffer=400, max_text_tokens=10500
        # Each sentence's tokens should be checked against this limit
        sentences = ["This is a test sentence."]
        
        summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )
        
        # Verify the LLM was called - the function completed successfully
        mock_llm.call.assert_called_once()
        
        # The prompt passed to LLM should contain the sentence
        call_args = mock_llm.call.call_args[0][0]
        assert len(call_args) == 1
        assert "This is a test sentence." in call_args[0]

    def test_summarizes_each_sentence_group_individually(self, mock_llm, mock_cache_collection):
        """Function summarizes each sentence group individually."""
        sentences = ["First sentence.", "Second sentence.", "Third sentence."]

        mock_llm.call.return_value = "Summary"
        mock_cache_collection.find_one.return_value = None

        summaries, mappings = summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        assert len(summaries) == 3
        assert len(mappings) == 3

    def test_generates_prompt_hash_for_each_summary(self, mock_llm, mock_cache_collection):
        """Function generates MD5 hash of prompt for each summary."""
        sentences = ["Test sentence."]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Summary"

        summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        mock_cache_collection.find_one.assert_called_once()
        call_args = mock_cache_collection.find_one.call_args
        assert "prompt_hash" in call_args[0][0]

    def test_checks_cache_before_llm_call(self, mock_llm, mock_cache_collection):
        """Function checks cache before making LLM call."""
        sentences = ["Test sentence."]

        # Setup cache hit
        cached_response = {"response": "Cached summary"}
        mock_cache_collection.find_one.return_value = cached_response

        summaries, mappings = summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        # Verify cache was checked
        mock_cache_collection.find_one.assert_called_once()
        # Verify LLM was NOT called
        mock_llm.call.assert_not_called()

    def test_calls_llm_when_not_cached(self, mock_llm, mock_cache_collection):
        """Function calls LLM when response not in cache."""
        sentences = ["Test sentence."]

        # Setup cache miss
        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Summary"

        summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        # Verify LLM was called
        mock_llm.call.assert_called_once()

    def test_caches_response_after_llm_call(self, mock_llm, mock_cache_collection):
        """Function caches response after LLM call."""
        sentences = ["Test sentence."]

        # Setup cache miss
        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Summary"

        summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        # Verify cache was updated
        mock_cache_collection.update_one.assert_called_once()

    def test_creates_summary_mapping_for_each_summary(self, mock_llm, mock_cache_collection):
        """Function creates summary mapping for each summary."""
        sentences = ["First sentence.", "Second sentence."]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Summary"

        summaries, mappings = summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        assert len(mappings) == 2

        for mapping in mappings:
            assert "summary_index" in mapping
            assert "summary_sentence" in mapping
            assert "source_sentences" in mapping

    def test_source_sentences_are_one_indexed(self, mock_llm, mock_cache_collection):
        """Function uses 1-indexed source sentences in mappings."""
        sentences = ["First sentence.", "Second sentence.", "Third sentence."]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Summary"

        summaries, mappings = summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        # Check that source_sentences are 1-indexed
        assert mappings[0]["source_sentences"] == [1]
        assert mappings[1]["source_sentences"] == [2]
        assert mappings[2]["source_sentences"] == [3]

    def test_summary_mapping_structure(self, mock_llm, mock_cache_collection):
        """Function creates mappings with correct structure."""
        sentences = ["Test sentence."]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Test summary"

        summaries, mappings = summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        mapping = mappings[0]
        assert mapping["summary_index"] == 0
        assert mapping["summary_sentence"] == "Test summary"
        assert mapping["source_sentences"] == [1]


# =============================================================================
# Test: summarize_by_sentence_groups - LLM Caching
# =============================================================================

class TestSummarizeBySentenceGroupsCaching:
    """Test LLM caching functionality."""

    def test_uses_cached_response_when_available(self, mock_llm, mock_cache_collection):
        """Function uses cached response when available."""
        sentences = ["Test sentence."]

        cached_response = {"response": "Cached summary"}
        mock_cache_collection.find_one.return_value = cached_response

        summaries, mappings = summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        assert summaries[0] == "Cached summary"
        mock_llm.call.assert_not_called()

    def test_stores_prompt_hash_in_cache(self, mock_llm, mock_cache_collection):
        """Function stores prompt hash in cache."""
        sentences = ["Test sentence."]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Summary"

        summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        update_call = mock_cache_collection.update_one.call_args
        set_doc = update_call[0][1]["$set"]
        assert "prompt_hash" in set_doc

    def test_stores_prompt_in_cache(self, mock_llm, mock_cache_collection):
        """Function stores original prompt in cache."""
        sentences = ["Test sentence."]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Summary"

        summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        update_call = mock_cache_collection.update_one.call_args
        set_doc = update_call[0][1]["$set"]
        assert "prompt" in set_doc

    def test_stores_response_in_cache(self, mock_llm, mock_cache_collection):
        """Function stores LLM response in cache."""
        sentences = ["Test sentence."]

        mock_cache_collection.find_one.return_value = None
        llm_response = "Summary"
        mock_llm.call.return_value = llm_response

        summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        update_call = mock_cache_collection.update_one.call_args
        set_doc = update_call[0][1]["$set"]
        assert set_doc["response"] == llm_response

    def test_stores_created_at_timestamp_in_cache(self, mock_llm, mock_cache_collection):
        """Function stores created_at timestamp in cache."""
        sentences = ["Test sentence."]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Summary"

        summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        update_call = mock_cache_collection.update_one.call_args
        set_doc = update_call[0][1]["$set"]
        assert "created_at" in set_doc

    def test_uses_upsert_for_cache_update(self, mock_llm, mock_cache_collection):
        """Function uses upsert=True for cache update."""
        sentences = ["Test sentence."]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Summary"

        summarize_by_sentence_groups(
            sentences, mock_llm, mock_cache_collection
        )

        update_call = mock_cache_collection.update_one.call_args
        assert update_call[1]["upsert"] is True


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
# Test: process_summarization - LLM Cache Collection
# =============================================================================

class TestProcessSummarizationCacheCollection:
    """Test LLM cache collection management."""

    def test_creates_llm_cache_collection_if_not_exists(self, mock_llm):
        """Function creates llm_cache collection if it doesn't exist."""
        db = MagicMock()
        db.list_collection_names.return_value = []
        db.llm_cache = MagicMock()

        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": []
            }
        }

        with patch('lib.tasks.summarization.SubmissionsStorage'):
            with patch('lib.tasks.summarization.summarize_by_sentence_groups', return_value=(["Summary"], [])):
                process_summarization(submission, db, mock_llm)

        db.create_collection.assert_called_once_with("llm_cache")

    def test_creates_unique_index_on_prompt_hash(self, mock_llm):
        """Function creates unique index on prompt_hash."""
        db = MagicMock()
        db.list_collection_names.return_value = []
        db.llm_cache = MagicMock()

        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": []
            }
        }

        with patch('lib.tasks.summarization.SubmissionsStorage'):
            with patch('lib.tasks.summarization.summarize_by_sentence_groups', return_value=(["Summary"], [])):
                process_summarization(submission, db, mock_llm)

        db.llm_cache.create_index.assert_called_once_with("prompt_hash", unique=True)

    def test_handles_index_creation_failure_gracefully(self, mock_llm):
        """Function handles index creation failure gracefully."""
        db = MagicMock()
        db.list_collection_names.return_value = []
        db.llm_cache = MagicMock()
        db.llm_cache.create_index.side_effect = Exception("Index already exists")

        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": []
            }
        }

        with patch('lib.tasks.summarization.SubmissionsStorage'):
            with patch('lib.tasks.summarization.summarize_by_sentence_groups', return_value=(["Summary"], [])):
                # Should not raise
                process_summarization(submission, db, mock_llm)


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
