"""
Unit tests for the summarization task handler.

Tests summarize_by_sentence_groups and process_summarization functions.
"""
import pytest
from unittest.mock import MagicMock, patch

# Import module under test
from lib.tasks.summarization import (
    ArticleSummaryGenerationError,
    ARTICLE_SUMMARY_MAX_ATTEMPTS,
    _parallel_generate_article_summary,
    _ValidatedCachingLLMCallable,
    build_article_summary_chunks,
    generate_article_summary,
    _is_valid_article_summary_response,
    parse_article_summary_response,
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
    llm.call = MagicMock(return_value='{"text":"Brief summary","bullets":["Detail A","Detail B"]}')
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
            "topic_summaries": {},
            "article_summary": {"text": "", "bullets": []}
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


class TestArticleSummaryHelpers:
    """Test article-level summary helpers."""

    def test_parse_article_summary_response_handles_json(self):
        parsed = parse_article_summary_response(
            '{"text":"Short summary","bullets":["Detail A","Detail B"]}'
        )

        assert parsed == {
            "text": "Short summary",
            "bullets": ["Detail A", "Detail B"]
        }

    def test_parse_article_summary_response_strips_code_fences(self):
        parsed = parse_article_summary_response(
            '```json\n{"text":"Short summary","bullets":["Detail A"]}\n```'
        )

        assert parsed == {
            "text": "Short summary",
            "bullets": ["Detail A"]
        }

    def test_is_valid_article_summary_response_rejects_invalid_json(self):
        assert _is_valid_article_summary_response('not valid json') is False

    def test_validated_cache_skips_invalid_article_summary_response(self):
        inner = MagicMock()
        inner.call.return_value = 'not valid json'
        store = MagicMock()
        store.get.return_value = None

        cached_llm = _ValidatedCachingLLMCallable(
            inner,
            store,
            namespace="summarization:test",
            validator=_is_valid_article_summary_response,
        )

        response = cached_llm.call("prompt", 0.0)

        assert response == 'not valid json'
        store.set.assert_not_called()

    def test_validated_cache_ignores_invalid_cached_article_summary_response(self):
        inner = MagicMock()
        inner.call.return_value = '{"text":"Recovered","bullets":["Detail A"]}'
        store = MagicMock()
        store.get.return_value = MagicMock(response='not valid json')

        cached_llm = _ValidatedCachingLLMCallable(
            inner,
            store,
            namespace="summarization:test",
            validator=_is_valid_article_summary_response,
        )

        response = cached_llm.call("prompt", 0.0)

        assert response == '{"text":"Recovered","bullets":["Detail A"]}'
        inner.call.assert_called_once_with("prompt", 0.0)
        store.set.assert_called_once()

    def test_build_article_summary_chunks_supports_overlap(self):
        llm = MagicMock()
        llm.max_context_tokens = 40
        llm.estimate_tokens = MagicMock(side_effect=lambda text: 10 if "Summarize the article text within" in text else 8)

        chunks = build_article_summary_chunks(
            ["S1", "S2", "S3", "S4"],
            llm,
            overlap_sentences=1,
            max_output_tokens_buffer=12,
        )

        assert [chunk["sentences"] for chunk in chunks] == [
            ["S1", "S2"],
            ["S2", "S3"],
            ["S3", "S4"],
        ]

    def test_generate_article_summary_merges_chunk_summaries(self, mock_llm):
        cached_llm = MagicMock()
        cached_llm.call.side_effect = [
            '{"text":"Chunk 1","bullets":["A","B"]}',
            '{"text":"Chunk 2","bullets":["B","C"]}',
            '{"text":"Merged","bullets":["A","C"]}',
        ]

        with patch('lib.tasks.summarization.build_article_summary_chunks') as mock_chunks:
            mock_chunks.return_value = [
                {"sentences": ["S1", "S2"], "start_sentence": 1, "end_sentence": 2},
                {"sentences": ["S2", "S3"], "start_sentence": 2, "end_sentence": 3},
            ]

            summary = generate_article_summary(["S1", "S2", "S3"], cached_llm, mock_llm)

        assert summary == {"text": "Merged", "bullets": ["A", "C"]}
        assert cached_llm.call.call_count == 3

    def test_generate_article_summary_retries_after_invalid_response(self, mock_llm):
        cached_llm = MagicMock()
        cached_llm.call.return_value = 'not valid json'
        mock_llm.call = MagicMock(return_value='{"text":"Recovered","bullets":["Detail A"]}')

        with patch('lib.tasks.summarization.build_article_summary_chunks') as mock_chunks:
            mock_chunks.return_value = [
                {"sentences": ["S1"], "start_sentence": 1, "end_sentence": 1},
            ]

            summary = generate_article_summary(["S1"], cached_llm, mock_llm, max_attempts=3)

        assert summary == {"text": "Recovered", "bullets": ["Detail A"]}
        cached_llm.call.assert_called_once()
        mock_llm.call.assert_called_once()

    def test_generate_article_summary_falls_back_after_retries_exhausted(self, mock_llm):
        cached_llm = MagicMock()
        cached_llm.call.return_value = 'not valid json'
        mock_llm.call = MagicMock(return_value='still not valid json')

        with patch('lib.tasks.summarization.build_article_summary_chunks') as mock_chunks:
            mock_chunks.return_value = [
                {"sentences": ["S1"], "start_sentence": 1, "end_sentence": 1},
            ]

            summary = generate_article_summary(["S1"], cached_llm, mock_llm, max_attempts=3)

        assert summary == {"text": "S1", "bullets": ["S1"]}

    def test_generate_article_summary_defaults_to_ten_attempts_before_fallback(self, mock_llm):
        cached_llm = MagicMock()
        cached_llm.call.return_value = 'not valid json'
        mock_llm.call = MagicMock(return_value='still not valid json')

        with patch('lib.tasks.summarization.build_article_summary_chunks') as mock_chunks:
            mock_chunks.return_value = [
                {"sentences": ["S1"], "start_sentence": 1, "end_sentence": 1},
            ]

            summary = generate_article_summary(["S1"], cached_llm, mock_llm)

        assert summary == {"text": "S1", "bullets": ["S1"]}
        assert ARTICLE_SUMMARY_MAX_ATTEMPTS == 10
        cached_llm.call.assert_called_once()
        assert mock_llm.call.call_count == ARTICLE_SUMMARY_MAX_ATTEMPTS - 1

    def test_parallel_generate_article_summary_falls_back_after_invalid_chunk_response(self):
        class DummyFuture:
            def __init__(self, response: str) -> None:
                self._response = response

            def result(self, timeout: float = 300.0) -> str:
                return self._response

        llm = MagicMock()
        llm.max_context_tokens = 1000
        llm.estimate_tokens = MagicMock(return_value=1)
        llm.submit = MagicMock(return_value=DummyFuture('{"types": []}'))
        llm.call = MagicMock(return_value='{"types": []}')

        summary = _parallel_generate_article_summary(
            [
                "Sentence one about Python programming.",
                "Sentence two about data structures.",
                "Sentence three about algorithms.",
            ],
            llm,
            max_attempts=3,
        )

        assert summary == {
            "text": (
                "Sentence one about Python programming. "
                "Sentence two about data structures. "
                "Sentence three about algorithms."
            ),
            "bullets": [
                "Sentence one about Python programming.",
                "Sentence two about data structures.",
                "Sentence three about algorithms.",
            ],
        }
        assert llm.call.call_count == 9


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

            with patch('lib.tasks.summarization.generate_article_summary') as mock_article_summary:
                mock_article_summary.return_value = {"text": "Brief", "bullets": ["Point"]}

                process_summarization(submission, mock_db, mock_llm)

            update_call = mock_storage_instance.update_results.call_args
            assert "summary" in update_call[0][1]
            assert "summary_mappings" in update_call[0][1]
            assert update_call[0][1]["article_summary"] == {"text": "Brief", "bullets": ["Point"]}

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
        """Function raises when article summary response is empty after retries."""
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
            mock_sum.return_value = ([], [])
            with patch('lib.tasks.summarization.generate_article_summary') as mock_article_summary:
                mock_article_summary.return_value = {"text": "", "bullets": []}

                with pytest.raises(ArticleSummaryGenerationError, match="empty content"):
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
