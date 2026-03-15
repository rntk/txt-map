"""
Unit tests for the subtopics_generation task handler.

Tests generate_subtopics_for_topic and process_subtopics_generation functions.
"""
import pytest
from unittest.mock import MagicMock, Mock, patch, call
import hashlib
from datetime import datetime, UTC

# Import module under test
from lib.tasks.subtopics_generation import (
    generate_subtopics_for_topic,
    process_subtopics_generation,
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
    llm.call = MagicMock(return_value="Subtopic 1: 1, 2\nSubtopic 2: 3")
    return llm


@pytest.fixture
def mock_submissions_storage():
    """Mock the SubmissionsStorage class."""
    with patch('lib.tasks.subtopics_generation.SubmissionsStorage') as mock_storage:
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
                "Sentence three about algorithms.",
                "Sentence four about machine learning.",
                "Sentence five about neural networks."
            ],
            "topics": [
                {"name": "Programming", "sentences": [1, 2, 3]},
                {"name": "Machine Learning", "sentences": [4, 5]}
            ],
            "subtopics": []
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
# Test: generate_subtopics_for_topic - Basic Functionality
# =============================================================================

class TestGenerateSubtopicsForTopicBasic:
    """Test basic functionality of generate_subtopics_for_topic."""

    def test_returns_empty_list_for_empty_sentences(self, mock_llm, mock_cache_collection):
        """Function returns [] when sentences list is empty."""
        result = generate_subtopics_for_topic(
            "Test Topic", [], [], mock_llm, mock_cache_collection
        )
        assert result == []

    def test_returns_empty_list_for_no_topic(self, mock_llm, mock_cache_collection):
        """Function returns [] when topic_name is 'no_topic'."""
        sentences = ["Sentence one.", "Sentence two."]
        indices = [1, 2]
        result = generate_subtopics_for_topic(
            "no_topic", sentences, indices, mock_llm, mock_cache_collection
        )
        assert result == []

    def test_constructs_prompt_with_numbered_sentences(self, mock_llm, mock_cache_collection):
        """Function constructs prompt with numbered sentences."""
        sentences = ["First sentence.", "Second sentence."]
        indices = [1, 2]

        generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        # Verify LLM was called
        mock_llm.call.assert_called_once()
        prompt = mock_llm.call.call_args[0][0][0]

        # Check prompt contains numbered sentences
        assert "1. First sentence." in prompt
        assert "2. Second sentence." in prompt
        assert 'Topic: Test Topic' in prompt

    def test_generates_md5_hash_of_prompt(self, mock_llm, mock_cache_collection):
        """Function generates MD5 hash of prompt for caching."""
        sentences = ["Test sentence."]
        indices = [1]

        generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        # Verify cache lookup with hash
        mock_cache_collection.find_one.assert_called_once()
        call_args = mock_cache_collection.find_one.call_args
        assert "prompt_hash" in call_args[0][0]

    def test_checks_cache_before_llm_call(self, mock_llm, mock_cache_collection):
        """Function checks cache before making LLM call."""
        sentences = ["Test sentence."]
        indices = [1]

        # Setup cache hit
        cached_response = {"response": "Cached: 1"}
        mock_cache_collection.find_one.return_value = cached_response

        result = generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        # Verify cache was checked
        mock_cache_collection.find_one.assert_called_once()
        # Verify LLM was NOT called
        mock_llm.call.assert_not_called()

    def test_calls_llm_when_not_cached(self, mock_llm, mock_cache_collection):
        """Function calls LLM when response not in cache."""
        sentences = ["Test sentence."]
        indices = [1]

        # Setup cache miss
        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Subtopic: 1"

        generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        # Verify LLM was called
        mock_llm.call.assert_called_once()

    def test_caches_response_after_llm_call(self, mock_llm, mock_cache_collection):
        """Function caches response after LLM call."""
        sentences = ["Test sentence."]
        indices = [1]

        # Setup cache miss
        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Subtopic: 1"

        generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        # Verify cache was updated
        mock_cache_collection.update_one.assert_called_once()
        update_call = mock_cache_collection.update_one.call_args
        assert update_call[0][0] == {"prompt_hash": update_call[0][1]["$set"]["prompt_hash"]}

    def test_parses_response_line_by_line(self, mock_llm, mock_cache_collection):
        """Function parses LLM response line by line."""
        sentences = ["Sentence one.", "Sentence two.", "Sentence three."]
        indices = [1, 2, 3]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Subtopic A: 1\nSubtopic B: 2, 3"

        result = generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        assert len(result) == 2
        assert result[0]["name"] == "Subtopic A"
        assert result[1]["name"] == "Subtopic B"

    def test_skips_lines_without_colon(self, mock_llm, mock_cache_collection):
        """Function skips lines without ':' separator."""
        sentences = ["Sentence one.", "Sentence two.", "Sentence three."]
        indices = [1, 2, 3]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Invalid line without colon\nValid Subtopic: 1"

        result = generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        assert len(result) == 1
        assert result[0]["name"] == "Valid Subtopic"

    def test_cleans_subtopic_name_removing_non_alphanumeric(self, mock_llm, mock_cache_collection):
        """Function cleans subtopic name by removing non-alphanumeric characters."""
        sentences = ["Sentence one."]
        indices = [1]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Subtopic@#$ with special chars!: 1"

        result = generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        assert len(result) == 1
        # Non-alphanumeric chars should be replaced with spaces and stripped
        assert "Subtopic" in result[0]["name"]
        assert "@" not in result[0]["name"]
        assert "#" not in result[0]["name"]

    def test_parses_sentence_indices_as_integers(self, mock_llm, mock_cache_collection):
        """Function parses sentence indices as integers."""
        sentences = ["Sentence one.", "Sentence two.", "Sentence three."]
        indices = [1, 2, 3]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Subtopic: 1, 2, 3"

        result = generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        assert result[0]["sentences"] == [1, 2, 3]
        assert all(isinstance(i, int) for i in result[0]["sentences"])

    def test_returns_subtopic_dicts_with_correct_structure(self, mock_llm, mock_cache_collection):
        """Function returns list of subtopic dicts with correct structure."""
        sentences = ["Sentence one.", "Sentence two."]
        indices = [1, 2]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "First Subtopic: 1\nSecond Subtopic: 2"

        result = generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        assert len(result) == 2

        # Check structure of each subtopic
        for subtopic in result:
            assert "name" in subtopic
            assert "sentences" in subtopic
            assert "parent_topic" in subtopic
            assert subtopic["parent_topic"] == "Test Topic"


# =============================================================================
# Test: generate_subtopics_for_topic - LLM Caching
# =============================================================================

class TestGenerateSubtopicsForTopicCaching:
    """Test LLM caching functionality."""

    def test_uses_cached_response_when_available(self, mock_llm, mock_cache_collection):
        """Function uses cached response when available."""
        sentences = ["Test sentence."]
        indices = [1]

        cached_response = {"response": "Cached Subtopic: 1"}
        mock_cache_collection.find_one.return_value = cached_response

        result = generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        assert len(result) == 1
        assert result[0]["name"] == "Cached Subtopic"
        mock_llm.call.assert_not_called()

    def test_stores_prompt_hash_in_cache(self, mock_llm, mock_cache_collection):
        """Function stores prompt hash in cache."""
        sentences = ["Test sentence."]
        indices = [1]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Subtopic: 1"

        generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        update_call = mock_cache_collection.update_one.call_args
        set_doc = update_call[0][1]["$set"]
        assert "prompt_hash" in set_doc

    def test_stores_prompt_in_cache(self, mock_llm, mock_cache_collection):
        """Function stores original prompt in cache."""
        sentences = ["Test sentence."]
        indices = [1]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Subtopic: 1"

        generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        update_call = mock_cache_collection.update_one.call_args
        set_doc = update_call[0][1]["$set"]
        assert "prompt" in set_doc

    def test_stores_response_in_cache(self, mock_llm, mock_cache_collection):
        """Function stores LLM response in cache."""
        sentences = ["Test sentence."]
        indices = [1]

        mock_cache_collection.find_one.return_value = None
        llm_response = "Subtopic: 1"
        mock_llm.call.return_value = llm_response

        generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        update_call = mock_cache_collection.update_one.call_args
        set_doc = update_call[0][1]["$set"]
        assert set_doc["response"] == llm_response

    def test_stores_created_at_timestamp_in_cache(self, mock_llm, mock_cache_collection):
        """Function stores created_at timestamp in cache."""
        sentences = ["Test sentence."]
        indices = [1]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Subtopic: 1"

        generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        update_call = mock_cache_collection.update_one.call_args
        set_doc = update_call[0][1]["$set"]
        assert "created_at" in set_doc

    def test_uses_upsert_for_cache_update(self, mock_llm, mock_cache_collection):
        """Function uses upsert=True for cache update."""
        sentences = ["Test sentence."]
        indices = [1]

        mock_cache_collection.find_one.return_value = None
        mock_llm.call.return_value = "Subtopic: 1"

        generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm, mock_cache_collection
        )

        update_call = mock_cache_collection.update_one.call_args
        assert update_call[1]["upsert"] is True


# =============================================================================
# Test: process_subtopics_generation - Basic Functionality
# =============================================================================

class TestProcessSubtopicsGenerationBasic:
    """Test basic functionality of process_subtopics_generation."""

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

        with pytest.raises(ValueError, match="Split/topic generation must be completed first"):
            process_subtopics_generation(submission, mock_db, mock_llm)

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

        with pytest.raises(ValueError, match="Split/topic generation must be completed first"):
            process_subtopics_generation(submission, mock_db, mock_llm)

    def test_creates_empty_subtopics_when_no_topics(
        self, mock_db, mock_llm, mock_submissions_storage, capsys
    ):
        """Function creates empty subtopics result when no topics."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["Sentence one."]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        process_subtopics_generation(submission, mock_db, mock_llm)

        mock_storage_instance.update_results.assert_called_once_with(
            "test-123", {"subtopics": []}
        )

    def test_iterates_over_all_topics(self, mock_db, mock_llm, mock_submissions_storage):
        """Function iterates over all topics in submission."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2", "S3"],
                "topics": [
                    {"name": "Topic A", "sentences": [1]},
                    {"name": "Topic B", "sentences": [2, 3]}
                ]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic') as mock_gen:
            mock_gen.return_value = []

            process_subtopics_generation(submission, mock_db, mock_llm)

            # Should be called for each topic
            assert mock_gen.call_count == 2

    def test_skips_no_topic_topics(self, mock_db, mock_llm, mock_submissions_storage):
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

        with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic') as mock_gen:
            mock_gen.return_value = []

            process_subtopics_generation(submission, mock_db, mock_llm)

            # Should only be called for valid topic
            assert mock_gen.call_count == 1

    def test_fetches_topic_sentences_correctly(self, mock_db, mock_llm, mock_submissions_storage):
        """Function fetches correct sentences for each topic."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["First sentence.", "Second sentence.", "Third sentence."],
                "topics": [
                    {"name": "Topic A", "sentences": [1, 3]}
                ]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic') as mock_gen:
            mock_gen.return_value = []

            process_subtopics_generation(submission, mock_db, mock_llm)

            # Check the sentences passed to generate_subtopics_for_topic
            call_args = mock_gen.call_args
            topic_sentences = call_args[0][1]
            # Assert exact expected sentences list (sentences at indices 1 and 3 are 0-indexed as 0 and 2)
            assert topic_sentences == ["First sentence.", "Third sentence."], \
                f"Expected ['First sentence.', 'Third sentence.'] but got {topic_sentences}"

    def test_collects_all_subtopics(self, mock_db, mock_llm, mock_submissions_storage):
        """Function collects all subtopics from all topics."""
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

        with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic') as mock_gen:
            mock_gen.side_effect = [
                [{"name": "Sub A1", "sentences": [1]}],
                [{"name": "Sub B1", "sentences": [3]}, {"name": "Sub B2", "sentences": [4]}]
            ]

            process_subtopics_generation(submission, mock_db, mock_llm)

            update_call = mock_storage_instance.update_results.call_args
            subtopics = update_call[0][1]["subtopics"]
            assert len(subtopics) == 3

    def test_updates_results_with_subtopics(self, mock_db, mock_llm, mock_submissions_storage):
        """Function updates results with generated subtopics."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": [{"name": "Topic", "sentences": [1]}]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic') as mock_gen:
            mock_gen.return_value = [{"name": "Subtopic", "sentences": [1], "parent_topic": "Topic"}]

            process_subtopics_generation(submission, mock_db, mock_llm)

            mock_storage_instance.update_results.assert_called_once()
            update_call = mock_storage_instance.update_results.call_args
            assert "subtopics" in update_call[0][1]


# =============================================================================
# Test: process_subtopics_generation - LLM Cache Collection
# =============================================================================

class TestProcessSubtopicsGenerationCacheCollection:
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
                "topics": [{"name": "Topic", "sentences": [1]}]
            }
        }

        with patch('lib.tasks.subtopics_generation.SubmissionsStorage'):
            with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic'):
                process_subtopics_generation(submission, db, mock_llm)

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
                "topics": [{"name": "Topic", "sentences": [1]}]
            }
        }

        with patch('lib.tasks.subtopics_generation.SubmissionsStorage'):
            with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic'):
                process_subtopics_generation(submission, db, mock_llm)

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
                "topics": [{"name": "Topic", "sentences": [1]}]
            }
        }

        with patch('lib.tasks.subtopics_generation.SubmissionsStorage'):
            with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic'):
                # Should not raise
                process_subtopics_generation(submission, db, mock_llm)


# =============================================================================
# Test: process_subtopics_generation - Completion Message
# =============================================================================

class TestProcessSubtopicsGenerationCompletionMessage:
    """Test completion message functionality."""

    def test_logs_completion_message_with_count(
        self, mock_db, mock_llm, mock_submissions_storage, capsys
    ):
        """Function logs completion message with subtopic count."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": [{"name": "Topic", "sentences": [1, 2]}]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic') as mock_gen:
            mock_gen.return_value = [{"name": "Sub1", "sentences": [1]}, {"name": "Sub2", "sentences": [2]}]

            process_subtopics_generation(submission, mock_db, mock_llm)

        captured = capsys.readouterr()
        assert "Subtopics generation completed" in captured.out
        assert "test-123" in captured.out
        assert "2 subtopics" in captured.out


# =============================================================================
# Test: process_subtopics_generation - Edge Cases
# =============================================================================

class TestProcessSubtopicsGenerationEdgeCases:
    """Test edge cases for process_subtopics_generation."""

    def test_handles_missing_topic_name(self, mock_db, mock_llm, mock_submissions_storage):
        """Function handles topics with missing name."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": [
                    {"sentences": [1]},  # Missing name
                    {"name": "Valid", "sentences": [2]}
                ]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic') as mock_gen:
            mock_gen.return_value = []

            # Should not raise
            process_subtopics_generation(submission, mock_db, mock_llm)

    def test_handles_missing_topic_sentences(self, mock_db, mock_llm, mock_submissions_storage):
        """Function handles topics with missing sentences."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": [
                    {"name": "Topic"},  # Missing sentences
                ]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic') as mock_gen:
            mock_gen.return_value = []

            # Should not raise
            process_subtopics_generation(submission, mock_db, mock_llm)

    def test_handles_empty_topic_sentences(self, mock_db, mock_llm, mock_submissions_storage):
        """Function handles topics with empty sentences list."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": [
                    {"name": "Topic", "sentences": []},
                ]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic') as mock_gen:
            mock_gen.return_value = []

            process_subtopics_generation(submission, mock_db, mock_llm)

            # Should skip empty topics
            mock_gen.assert_not_called()

    def test_handles_sentence_index_out_of_bounds(self, mock_db, mock_llm, mock_submissions_storage):
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

        with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic') as mock_gen:
            mock_gen.return_value = []

            # Should not raise
            process_subtopics_generation(submission, mock_db, mock_llm)

    def test_handles_subtopics_none_in_results(self, mock_db, mock_llm, mock_submissions_storage):
        """Function handles subtopics=None in results."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": [{"name": "Topic", "sentences": [1]}],
                "subtopics": None
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic') as mock_gen:
            mock_gen.return_value = []

            # Should not raise
            process_subtopics_generation(submission, mock_db, mock_llm)


# =============================================================================
# Test: process_subtopics_generation - LLM Unavailable
# =============================================================================

class TestProcessSubtopicsGenerationLLMUnavailable:
    """Test behavior when LLM is unavailable."""

    def test_handles_llm_exception(self, mock_db, mock_submissions_storage):
        """Function propagates LLM exceptions."""
        mock_llm = MagicMock()
        mock_llm.call.side_effect = Exception("LLM service unavailable")

        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": [{"name": "Topic", "sentences": [1]}]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic') as mock_gen:
            mock_gen.side_effect = Exception("LLM service unavailable")

            with pytest.raises(Exception, match="LLM service unavailable"):
                process_subtopics_generation(submission, mock_db, mock_llm)

    def test_handles_llm_timeout(self, mock_db, mock_submissions_storage):
        """Function propagates LLM timeout exceptions."""
        mock_llm = MagicMock()

        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": [{"name": "Topic", "sentences": [1]}]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.subtopics_generation.generate_subtopics_for_topic') as mock_gen:
            mock_gen.side_effect = TimeoutError("LLM timeout")

            with pytest.raises(TimeoutError):
                process_subtopics_generation(submission, mock_db, mock_llm)
