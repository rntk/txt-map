"""
Unit tests for the subtopics_generation task handler.

Tests generate_subtopics_for_topic and process_subtopics_generation functions.
"""

import pytest
from unittest.mock import MagicMock, patch

# Import module under test
from lib.tasks.subtopics_generation import (
    _build_subtopic_prompt,
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
    with patch("lib.tasks.subtopics_generation.SubmissionsStorage") as mock_storage:
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
                "Sentence five about neural networks.",
            ],
            "topics": [
                {"name": "Programming", "sentences": [1, 2, 3]},
                {"name": "Machine Learning", "sentences": [4, 5]},
            ],
            "subtopics": [],
        },
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

    def test_returns_empty_list_for_empty_sentences(self, mock_llm):
        """Function returns [] when sentences list is empty."""
        result = generate_subtopics_for_topic("Test Topic", [], [], mock_llm)
        assert result == []

    def test_returns_empty_list_for_no_topic(self, mock_llm):
        """Function returns [] when topic_name is 'no_topic'."""
        sentences = ["Sentence one.", "Sentence two."]
        indices = [1, 2]
        result = generate_subtopics_for_topic("no_topic", sentences, indices, mock_llm)
        assert result == []

    def test_constructs_prompt_with_numbered_sentences(self, mock_llm):
        """Function constructs prompt with numbered sentences."""
        sentences = ["First sentence.", "Second sentence."]
        indices = [1, 2]

        generate_subtopics_for_topic("Test Topic", sentences, indices, mock_llm)

        # Verify LLM was called
        mock_llm.call.assert_called_once()
        prompt = mock_llm.call.call_args[0][0]

        # Check prompt contains numbered sentences
        assert "1. First sentence." in prompt
        assert "2. Second sentence." in prompt
        assert "Topic: Test Topic" in prompt

    def test_calls_llm_when_not_cached(self, mock_llm):
        """Function calls LLM when response not in cache."""
        sentences = ["Test sentence."]
        indices = [1]

        mock_llm.call.return_value = "Subtopic: 1"

        generate_subtopics_for_topic("Test Topic", sentences, indices, mock_llm)

        # Verify LLM was called
        mock_llm.call.assert_called_once()

    def test_parses_response_line_by_line(self, mock_llm):
        """Function parses LLM response line by line."""
        sentences = ["Sentence one.", "Sentence two.", "Sentence three."]
        indices = [1, 2, 3]

        mock_llm.call.return_value = "Subtopic A: 1\nSubtopic B: 2, 3"

        result = generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm
        )

        assert len(result) == 2
        assert result[0]["name"] == "Subtopic A"
        assert result[1]["name"] == "Subtopic B"

    def test_skips_lines_without_colon(self, mock_llm):
        """Function skips lines without ':' separator."""
        sentences = ["Sentence one.", "Sentence two.", "Sentence three."]
        indices = [1, 2, 3]

        mock_llm.call.return_value = "Invalid line without colon\nValid Subtopic: 1"

        result = generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm
        )

        assert len(result) == 1
        assert result[0]["name"] == "Valid Subtopic"

    def test_cleans_subtopic_name_removing_non_alphanumeric(self, mock_llm):
        """Function cleans subtopic name by removing non-alphanumeric characters."""
        sentences = ["Sentence one."]
        indices = [1]

        mock_llm.call.return_value = "Subtopic@#$ with special chars!: 1"

        result = generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm
        )

        assert len(result) == 1
        # Non-alphanumeric chars should be replaced with spaces and stripped
        assert "Subtopic" in result[0]["name"]
        assert "@" not in result[0]["name"]
        assert "#" not in result[0]["name"]

    def test_parses_sentence_indices_as_integers(self, mock_llm):
        """Function parses sentence indices as integers."""
        sentences = ["Sentence one.", "Sentence two.", "Sentence three."]
        indices = [1, 2, 3]

        mock_llm.call.return_value = "Subtopic: 1, 2, 3"

        result = generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm
        )

        assert result[0]["sentences"] == [1, 2, 3]
        assert all(isinstance(i, int) for i in result[0]["sentences"])

    def test_returns_subtopic_dicts_with_correct_structure(self, mock_llm):
        """Function returns list of subtopic dicts with correct structure."""
        sentences = ["Sentence one.", "Sentence two."]
        indices = [1, 2]

        mock_llm.call.return_value = "First Subtopic: 1\nSecond Subtopic: 2"

        result = generate_subtopics_for_topic(
            "Test Topic", sentences, indices, mock_llm
        )

        assert len(result) == 2

        # Check structure of each subtopic
        for subtopic in result:
            assert "name" in subtopic
            assert "sentences" in subtopic
            assert "parent_topic" in subtopic
            assert subtopic["parent_topic"] == "Test Topic"

    def test_build_subtopic_prompt_uses_explicit_template_formatting(self):
        """Prompt builder should preserve template structure and insert values explicitly."""
        prompt = _build_subtopic_prompt(
            'Topic with "quotes"',
            ["First sentence.", "Second sentence."],
            [4, 9],
        )
        assert 'topic "Topic with "quotes""' in prompt
        assert "4. First sentence." in prompt
        assert "9. Second sentence." in prompt


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
            "results": {"topics": [{"name": "Topic", "sentences": [1, 2]}]},
        }

        with pytest.raises(
            ValueError, match="Split/topic generation must be completed first"
        ):
            process_subtopics_generation(submission, mock_db, mock_llm)

    def test_raises_value_error_when_sentences_empty(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function raises ValueError when sentences list is empty."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": [],
                "topics": [{"name": "Topic", "sentences": [1, 2]}],
            },
        }

        with pytest.raises(
            ValueError, match="Split/topic generation must be completed first"
        ):
            process_subtopics_generation(submission, mock_db, mock_llm)

    def test_creates_empty_subtopics_when_no_topics(
        self, mock_db, mock_llm, mock_submissions_storage, capsys
    ):
        """Function creates empty subtopics result when no topics."""
        submission = {
            "submission_id": "test-123",
            "results": {"sentences": ["Sentence one."]},
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        process_subtopics_generation(submission, mock_db, mock_llm)

        mock_storage_instance.update_results.assert_called_once_with(
            "test-123", {"subtopics": []}
        )

    def test_iterates_over_all_topics(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function iterates over all topics in submission."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2", "S3"],
                "topics": [
                    {"name": "Topic A", "sentences": [1]},
                    {"name": "Topic B", "sentences": [2, 3]},
                ],
            },
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch(
            "lib.tasks.subtopics_generation.generate_subtopics_for_topic"
        ) as mock_gen:
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
                    {"name": "Valid Topic", "sentences": [2]},
                ],
            },
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch(
            "lib.tasks.subtopics_generation.generate_subtopics_for_topic"
        ) as mock_gen:
            mock_gen.return_value = []

            process_subtopics_generation(submission, mock_db, mock_llm)

            # Should only be called for valid topic
            assert mock_gen.call_count == 1

    def test_fetches_topic_sentences_correctly(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function fetches correct sentences for each topic."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["First sentence.", "Second sentence.", "Third sentence."],
                "topics": [{"name": "Topic A", "sentences": [1, 3]}],
            },
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch(
            "lib.tasks.subtopics_generation.generate_subtopics_for_topic"
        ) as mock_gen:
            mock_gen.return_value = []

            process_subtopics_generation(submission, mock_db, mock_llm)

            # Check the sentences passed to generate_subtopics_for_topic
            call_args = mock_gen.call_args
            topic_sentences = call_args[0][1]
            # Assert exact expected sentences list (sentences at indices 1 and 3 are 0-indexed as 0 and 2)
            assert topic_sentences == ["First sentence.", "Third sentence."], (
                f"Expected ['First sentence.', 'Third sentence.'] but got {topic_sentences}"
            )

    def test_collects_all_subtopics(self, mock_db, mock_llm, mock_submissions_storage):
        """Function collects all subtopics from all topics."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2", "S3", "S4"],
                "topics": [
                    {"name": "Topic A", "sentences": [1, 2]},
                    {"name": "Topic B", "sentences": [3, 4]},
                ],
            },
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch(
            "lib.tasks.subtopics_generation.generate_subtopics_for_topic"
        ) as mock_gen:
            mock_gen.side_effect = [
                [{"name": "Sub A1", "sentences": [1]}],
                [
                    {"name": "Sub B1", "sentences": [3]},
                    {"name": "Sub B2", "sentences": [4]},
                ],
            ]

            process_subtopics_generation(submission, mock_db, mock_llm)

            update_call = mock_storage_instance.update_results.call_args
            subtopics = update_call[0][1]["subtopics"]
            assert len(subtopics) == 3

    def test_updates_results_with_subtopics(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function updates results with generated subtopics."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": [{"name": "Topic", "sentences": [1]}],
            },
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch(
            "lib.tasks.subtopics_generation.generate_subtopics_for_topic"
        ) as mock_gen:
            mock_gen.return_value = [
                {"name": "Subtopic", "sentences": [1], "parent_topic": "Topic"}
            ]

            process_subtopics_generation(submission, mock_db, mock_llm)

            mock_storage_instance.update_results.assert_called_once()
            update_call = mock_storage_instance.update_results.call_args
            assert "subtopics" in update_call[0][1]


# =============================================================================
# Test: process_subtopics_generation - Completion Message
# =============================================================================


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
                "topics": [{"name": "Topic", "sentences": [1, 2]}],
            },
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch(
            "lib.tasks.subtopics_generation.generate_subtopics_for_topic"
        ) as mock_gen:
            mock_gen.return_value = [
                {"name": "Sub1", "sentences": [1]},
                {"name": "Sub2", "sentences": [2]},
            ]

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

    def test_handles_missing_topic_name(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function handles topics with missing name."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": [
                    {"sentences": [1]},  # Missing name
                    {"name": "Valid", "sentences": [2]},
                ],
            },
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch(
            "lib.tasks.subtopics_generation.generate_subtopics_for_topic"
        ) as mock_gen:
            mock_gen.return_value = []

            # Should not raise
            process_subtopics_generation(submission, mock_db, mock_llm)

    def test_handles_missing_topic_sentences(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function handles topics with missing sentences."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": [
                    {"name": "Topic"},  # Missing sentences
                ],
            },
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch(
            "lib.tasks.subtopics_generation.generate_subtopics_for_topic"
        ) as mock_gen:
            mock_gen.return_value = []

            # Should not raise
            process_subtopics_generation(submission, mock_db, mock_llm)

    def test_handles_empty_topic_sentences(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function handles topics with empty sentences list."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": [
                    {"name": "Topic", "sentences": []},
                ],
            },
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch(
            "lib.tasks.subtopics_generation.generate_subtopics_for_topic"
        ) as mock_gen:
            mock_gen.return_value = []

            process_subtopics_generation(submission, mock_db, mock_llm)

            # Should skip empty topics
            mock_gen.assert_not_called()

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
                ],
            },
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch(
            "lib.tasks.subtopics_generation.generate_subtopics_for_topic"
        ) as mock_gen:
            mock_gen.return_value = []

            # Should not raise
            process_subtopics_generation(submission, mock_db, mock_llm)

    def test_handles_subtopics_none_in_results(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function handles subtopics=None in results."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": [{"name": "Topic", "sentences": [1]}],
                "subtopics": None,
            },
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch(
            "lib.tasks.subtopics_generation.generate_subtopics_for_topic"
        ) as mock_gen:
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
                "topics": [{"name": "Topic", "sentences": [1]}],
            },
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch(
            "lib.tasks.subtopics_generation.generate_subtopics_for_topic"
        ) as mock_gen:
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
                "topics": [{"name": "Topic", "sentences": [1]}],
            },
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch(
            "lib.tasks.subtopics_generation.generate_subtopics_for_topic"
        ) as mock_gen:
            mock_gen.side_effect = TimeoutError("LLM timeout")

            with pytest.raises(TimeoutError):
                process_subtopics_generation(submission, mock_db, mock_llm)
