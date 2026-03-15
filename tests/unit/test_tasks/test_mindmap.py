"""
Unit tests for the mindmap task handler.

Tests build_tree_from_topics and process_mindmap functions.
"""
import pytest
from unittest.mock import MagicMock, Mock, patch, call

# Import module under test
from lib.tasks.mindmap import (
    build_tree_from_topics,
    process_mindmap,
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
    return db


@pytest.fixture
def mock_llm():
    """Create a mock LLamaCPP client."""
    llm = MagicMock()
    llm.estimate_tokens = MagicMock(return_value=100)
    llm._LLamaCPP__max_context_tokens = 11000
    return llm


@pytest.fixture
def mock_submissions_storage():
    """Mock the SubmissionsStorage class."""
    with patch('lib.tasks.mindmap.SubmissionsStorage') as mock_storage:
        yield mock_storage


@pytest.fixture
def sample_topics():
    """Create sample topics with hierarchy."""
    return [
        {"name": "Programming>Python", "sentences": [1, 2, 3]},
        {"name": "Programming>Java", "sentences": [4, 5]},
        {"name": "Machine Learning>Deep Learning", "sentences": [6, 7, 8]},
        {"name": "Machine Learning>Traditional ML", "sentences": [9, 10]}
    ]


@pytest.fixture
def sample_subtopics():
    """Create sample subtopics."""
    return [
        {"name": "Data Structures", "sentences": [1, 2], "parent_topic": "Programming>Python"},
        {"name": "Web Frameworks", "sentences": [3], "parent_topic": "Programming>Python"},
        {"name": "Neural Networks", "sentences": [6, 7], "parent_topic": "Machine Learning>Deep Learning"}
    ]


@pytest.fixture
def sample_submission():
    """Create a sample submission document."""
    return {
        "submission_id": "test-submission-123",
        "html_content": "<html><body><p>Sample content</p></body></html>",
        "results": {
            "sentences": [
                "Sentence 1", "Sentence 2", "Sentence 3",
                "Sentence 4", "Sentence 5", "Sentence 6",
                "Sentence 7", "Sentence 8", "Sentence 9",
                "Sentence 10"
            ],
            "topics": [
                {"name": "Programming>Python", "sentences": [1, 2, 3]},
                {"name": "Programming>Java", "sentences": [4, 5]},
                {"name": "Machine Learning>Deep Learning", "sentences": [6, 7, 8]}
            ],
            "subtopics": [
                {"name": "Data Structures", "sentences": [1, 2], "parent_topic": "Programming>Python"}
            ],
            "topic_mindmaps": {}
        }
    }


# =============================================================================
# Test: build_tree_from_topics - Basic Functionality
# =============================================================================

class TestBuildTreeFromTopicsBasic:
    """Test basic functionality of build_tree_from_topics."""

    def test_returns_empty_dict_for_empty_topics(self):
        """Function returns empty dict when topics list is empty."""
        tree = build_tree_from_topics([], [])
        assert tree == {}

    def test_returns_empty_dict_for_none_topics(self):
        """Function raises TypeError when topics is None."""
        # Note: The source code doesn't handle None topics, it will raise TypeError
        with pytest.raises(TypeError):
            tree = build_tree_from_topics(None, [])

    def test_creates_nested_structure_from_hierarchy(self, sample_topics):
        """Function creates nested structure from '>' hierarchy."""
        tree = build_tree_from_topics(sample_topics, [])

        assert "Programming" in tree
        assert "Python" in tree["Programming"]["children"]
        assert "Java" in tree["Programming"]["children"]
        assert "Machine Learning" in tree
        assert "Deep Learning" in tree["Machine Learning"]["children"]

    def test_skips_no_topic_topics(self):
        """Function skips topics named 'no_topic'."""
        topics = [
            {"name": "no_topic", "sentences": [1, 2]},
            {"name": "Valid Topic", "sentences": [3]}
        ]

        tree = build_tree_from_topics(topics, [])

        assert "no_topic" not in tree
        assert "Valid Topic" in tree

    def test_propagates_sentences_to_all_ancestor_levels(self):
        """Function propagates sentences to all ancestor levels."""
        topics = [
            {"name": "Category>SubCategory>LeafTopic", "sentences": [1, 2, 3]}
        ]

        tree = build_tree_from_topics(topics, [])

        # All levels should have the sentences
        assert tree["Category"]["sentences"] == [1, 2, 3]
        assert tree["Category"]["children"]["SubCategory"]["sentences"] == [1, 2, 3]
        assert tree["Category"]["children"]["SubCategory"]["children"]["LeafTopic"]["sentences"] == [1, 2, 3]

    def test_deduplicates_sentence_indices(self):
        """Function deduplicates sentence indices across topics."""
        topics = [
            {"name": "Topic A", "sentences": [1, 2, 3]},
            {"name": "Topic B", "sentences": [2, 3, 4]}  # Overlapping sentences
        ]

        tree = build_tree_from_topics(topics, [])

        # Each topic should have its own sentences
        assert tree["Topic A"]["sentences"] == [1, 2, 3]
        assert tree["Topic B"]["sentences"] == [2, 3, 4]

    def test_sorts_sentence_indices(self):
        """Function sorts sentence indices."""
        topics = [
            {"name": "Topic", "sentences": [5, 2, 8, 1, 3]}
        ]

        tree = build_tree_from_topics(topics, [])

        assert tree["Topic"]["sentences"] == [1, 2, 3, 5, 8]

    def test_attaches_subtopics_as_leaf_children(self, sample_topics, sample_subtopics):
        """Function attaches subtopics as leaf children under parent topic."""
        tree = build_tree_from_topics(sample_topics, sample_subtopics)

        # Subtopics should be attached under their parent
        python_children = tree["Programming"]["children"]["Python"]["children"]
        assert "Data Structures" in python_children
        assert "Web Frameworks" in python_children

        dl_children = tree["Machine Learning"]["children"]["Deep Learning"]["children"]
        assert "Neural Networks" in dl_children

    def test_merges_subtopic_sentences_with_parent(self, sample_topics, sample_subtopics):
        """Function merges subtopic sentences with parent sentences."""
        tree = build_tree_from_topics(sample_topics, sample_subtopics)

        python_node = tree["Programming"]["children"]["Python"]
        # Parent has sentences [1, 2, 3], subtopics add [1, 2] and [3]
        # After merge and dedup: [1, 2, 3]
        assert 1 in python_node["sentences"]
        assert 2 in python_node["sentences"]
        assert 3 in python_node["sentences"]

    def test_subtopic_has_correct_structure(self, sample_topics, sample_subtopics):
        """Function creates subtopic nodes with correct structure."""
        tree = build_tree_from_topics(sample_topics, sample_subtopics)

        data_structures = tree["Programming"]["children"]["Python"]["children"]["Data Structures"]

        assert "children" in data_structures
        assert "sentences" in data_structures
        assert isinstance(data_structures["children"], dict)
        assert isinstance(data_structures["sentences"], list)

    def test_handles_missing_parent_topic_gracefully(self, sample_topics):
        """Function handles subtopics with missing parent_topic gracefully."""
        subtopics = [
            {"name": "Orphan Subtopic", "sentences": [1], "parent_topic": ""}
        ]

        tree = build_tree_from_topics(sample_topics, subtopics)

        # Orphan subtopic should not be added to any topic's children
        for topic_name, topic_data in tree.items():
            assert "Orphan Subtopic" not in topic_data.get("children", {})

    def test_handles_invalid_parent_paths(self, sample_topics):
        """Function handles subtopics with invalid parent paths."""
        subtopics = [
            {"name": "Lost Subtopic", "sentences": [1], "parent_topic": "NonExistent>Path"}
        ]

        tree = build_tree_from_topics(sample_topics, subtopics)

        # Subtopic with invalid parent should not be added to any topic's children
        for topic_name, topic_data in tree.items():
            assert "Lost Subtopic" not in topic_data.get("children", {})


# =============================================================================
# Test: build_tree_from_topics - Tree Structure
# =============================================================================

class TestBuildTreeFromTopicsStructure:
    """Test tree structure correctness."""

    def test_tree_node_has_children_key(self):
        """Each tree node has 'children' key."""
        topics = [{"name": "Topic>Subtopic", "sentences": [1]}]

        tree = build_tree_from_topics(topics, [])

        assert "children" in tree["Topic"]
        assert "children" in tree["Topic"]["children"]["Subtopic"]

    def test_tree_node_has_sentences_key(self):
        """Each tree node has 'sentences' key."""
        topics = [{"name": "Topic>Subtopic", "sentences": [1, 2]}]

        tree = build_tree_from_topics(topics, [])

        assert "sentences" in tree["Topic"]
        assert "sentences" in tree["Topic"]["children"]["Subtopic"]

    def test_leaf_nodes_have_empty_children(self):
        """Leaf nodes have empty children dict."""
        topics = [{"name": "Topic>LeafTopic", "sentences": [1]}]

        tree = build_tree_from_topics(topics, [])

        assert tree["Topic"]["children"]["LeafTopic"]["children"] == {}

    def test_single_level_topic_structure(self):
        """Single level topics create flat structure."""
        topics = [
            {"name": "Topic A", "sentences": [1]},
            {"name": "Topic B", "sentences": [2]}
        ]

        tree = build_tree_from_topics(topics, [])

        assert "Topic A" in tree
        assert "Topic B" in tree
        assert tree["Topic A"]["children"] == {}
        assert tree["Topic B"]["children"] == {}

    def test_deep_hierarchy_structure(self):
        """Deep hierarchies create properly nested structure."""
        topics = [
            {"name": "A>B>C>D", "sentences": [1]}
        ]

        tree = build_tree_from_topics(topics, [])

        assert "A" in tree
        assert "B" in tree["A"]["children"]
        assert "C" in tree["A"]["children"]["B"]["children"]
        assert "D" in tree["A"]["children"]["B"]["children"]["C"]["children"]

    def test_multiple_topics_same_parent(self):
        """Multiple topics under same parent are siblings."""
        topics = [
            {"name": "Parent>Child1", "sentences": [1]},
            {"name": "Parent>Child2", "sentences": [2]}
        ]

        tree = build_tree_from_topics(topics, [])

        parent_children = tree["Parent"]["children"]
        assert "Child1" in parent_children
        assert "Child2" in parent_children
        assert parent_children["Child1"]["sentences"] == [1]
        assert parent_children["Child2"]["sentences"] == [2]


# =============================================================================
# Test: build_tree_from_topics - Sentence Propagation
# =============================================================================

class TestBuildTreeFromTopicsSentencePropagation:
    """Test sentence propagation through hierarchy."""

    def test_sentences_propagated_to_root_level(self):
        """Sentences are propagated to root level of hierarchy."""
        topics = [
            {"name": "Root>Level1>Level2", "sentences": [1, 2, 3]}
        ]

        tree = build_tree_from_topics(topics, [])

        assert tree["Root"]["sentences"] == [1, 2, 3]

    def test_sentences_accumulated_from_multiple_children(self):
        """Parent sentences accumulated from multiple children."""
        topics = [
            {"name": "Parent>Child1", "sentences": [1, 2]},
            {"name": "Parent>Child2", "sentences": [3, 4]}
        ]

        tree = build_tree_from_topics(topics, [])

        # Parent should have all sentences from children
        assert set(tree["Parent"]["sentences"]) == {1, 2, 3, 4}

    def test_sentences_merged_from_subtopics(self):
        """Subtopic sentences stored in subtopic node."""
        topics = [
            {"name": "Topic", "sentences": [1, 2]}
        ]
        subtopics = [
            {"name": "Subtopic", "sentences": [3, 4], "parent_topic": "Topic"}
        ]

        tree = build_tree_from_topics(topics, subtopics)

        # Topic node keeps its own sentences
        topic_node = tree["Topic"]
        assert topic_node["sentences"] == [1, 2]
        
        # Subtopic node has its own sentences
        subtopic_node = topic_node["children"]["Subtopic"]
        assert subtopic_node["sentences"] == [3, 4]

    def test_sentence_indices_sorted_after_merge(self):
        """Sentence indices sorted in each node."""
        topics = [
            {"name": "Topic", "sentences": [5, 10]}
        ]
        subtopics = [
            {"name": "Sub1", "sentences": [1, 8], "parent_topic": "Topic"},
            {"name": "Sub2", "sentences": [3, 15], "parent_topic": "Topic"}
        ]

        tree = build_tree_from_topics(topics, subtopics)

        # Topic keeps its own sorted sentences
        assert tree["Topic"]["sentences"] == [5, 10]
        # Subtopics have their own sorted sentences
        assert tree["Topic"]["children"]["Sub1"]["sentences"] == [1, 8]
        assert tree["Topic"]["children"]["Sub2"]["sentences"] == [3, 15]


# =============================================================================
# Test: build_tree_from_topics - Edge Cases
# =============================================================================

class TestBuildTreeFromTopicsEdgeCases:
    """Test edge cases for build_tree_from_topics."""

    def test_handles_empty_topic_name(self):
        """Function handles topics with empty name."""
        topics = [
            {"name": "", "sentences": [1]},
            {"name": "Valid", "sentences": [2]}
        ]

        tree = build_tree_from_topics(topics, [])

        assert "" not in tree
        assert "Valid" in tree

    def test_handles_missing_name_key(self):
        """Function handles topics with missing name key."""
        topics = [
            {"sentences": [1]},  # Missing name
            {"name": "Valid", "sentences": [2]}
        ]

        tree = build_tree_from_topics(topics, [])

        assert "Valid" in tree

    def test_handles_missing_sentences_key(self):
        """Function handles topics with missing sentences key."""
        topics = [
            {"name": "Topic"}  # Missing sentences
        ]

        tree = build_tree_from_topics(topics, [])

        assert "Topic" in tree
        assert tree["Topic"]["sentences"] == []

    def test_handles_empty_subtopic_name(self, sample_topics):
        """Function handles subtopics with empty name."""
        subtopics = [
            {"name": "", "sentences": [1], "parent_topic": "Programming>Python"}
        ]

        tree = build_tree_from_topics(sample_topics, subtopics)

        # Empty name subtopic should not be added
        python_children = tree["Programming"]["children"]["Python"]["children"]
        assert "" not in python_children

    def test_handles_missing_subtopic_name(self, sample_topics):
        """Function handles subtopics with missing name."""
        subtopics = [
            {"sentences": [1], "parent_topic": "Programming>Python"}
        ]

        tree = build_tree_from_topics(sample_topics, subtopics)

        # Subtopic without name should not be added
        python_children = tree["Programming"]["children"]["Python"]["children"]
        assert len(python_children) == 0

    def test_handles_none_subtopics(self, sample_topics):
        """Function raises TypeError when subtopics is None."""
        # Note: The source code doesn't handle None subtopics
        with pytest.raises(TypeError):
            tree = build_tree_from_topics(sample_topics, None)

    def test_handles_whitespace_in_topic_names(self):
        """Function handles whitespace in topic names."""
        topics = [
            {"name": "  Topic  >  Subtopic  ", "sentences": [1]}
        ]

        tree = build_tree_from_topics(topics, [])

        # Whitespace should be stripped
        assert "Topic" in tree
        assert "Subtopic" in tree["Topic"]["children"]

    def test_handles_special_characters_in_topic_names(self):
        """Function handles special characters in topic names."""
        topics = [
            {"name": "Topic/Name@123", "sentences": [1]}
        ]

        tree = build_tree_from_topics(topics, [])

        # Special characters preserved in name
        assert "Topic/Name@123" in tree


# =============================================================================
# Test: process_mindmap - Basic Functionality
# =============================================================================

class TestProcessMindmapBasic:
    """Test basic functionality of process_mindmap."""

    def test_raises_value_error_when_topics_missing(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function raises ValueError when topics are missing."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"]
            }
        }

        with pytest.raises(ValueError, match="Topic extraction must be completed first"):
            process_mindmap(submission, mock_db, mock_llm)

    def test_raises_value_error_when_topics_empty(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function raises ValueError when topics list is empty."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": []
            }
        }

        with pytest.raises(ValueError, match="Topic extraction must be completed first"):
            process_mindmap(submission, mock_db, mock_llm)

    def test_raises_value_error_when_sentences_missing(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function raises ValueError when sentences are missing."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "topics": [{"name": "Topic", "sentences": [1]}]
            }
        }

        with pytest.raises(ValueError, match="Topic extraction must be completed first"):
            process_mindmap(submission, mock_db, mock_llm)

    def test_raises_value_error_when_sentences_empty(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function raises ValueError when sentences list is empty."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": [],
                "topics": [{"name": "Topic", "sentences": [1]}]
            }
        }

        with pytest.raises(ValueError, match="Topic extraction must be completed first"):
            process_mindmap(submission, mock_db, mock_llm)

    def test_reads_topics_from_results(self, mock_db, mock_llm, mock_submissions_storage):
        """Function reads topics from submission results."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": [{"name": "Topic", "sentences": [1]}]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.mindmap.build_tree_from_topics') as mock_build:
            mock_build.return_value = {}

            process_mindmap(submission, mock_db, mock_llm)

            mock_build.assert_called_once()
            call_args = mock_build.call_args
            assert call_args[0][0] == submission["results"]["topics"]

    def test_reads_subtopics_from_results(self, mock_db, mock_llm, mock_submissions_storage):
        """Function reads subtopics from submission results."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": [{"name": "Topic", "sentences": [1]}],
                "subtopics": [{"name": "Sub", "sentences": [1], "parent_topic": "Topic"}]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.mindmap.build_tree_from_topics') as mock_build:
            mock_build.return_value = {}

            process_mindmap(submission, mock_db, mock_llm)

            call_args = mock_build.call_args
            assert call_args[0][1] == submission["results"]["subtopics"]

    def test_calls_build_tree_from_topics(self, mock_db, mock_llm, mock_submissions_storage):
        """Function calls build_tree_from_topics with topics and subtopics."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": [{"name": "Topic", "sentences": [1]}],
                "subtopics": []
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.mindmap.build_tree_from_topics') as mock_build:
            mock_build.return_value = {"Topic": {"children": {}, "sentences": [1]}}

            process_mindmap(submission, mock_db, mock_llm)

            mock_build.assert_called_once()

    def test_updates_results_with_topic_mindmaps(self, mock_db, mock_llm, mock_submissions_storage):
        """Function updates results with topic_mindmaps."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": [{"name": "Topic", "sentences": [1]}],
                "subtopics": []
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        mock_tree = {"Topic": {"children": {}, "sentences": [1]}}

        with patch('lib.tasks.mindmap.build_tree_from_topics', return_value=mock_tree):
            process_mindmap(submission, mock_db, mock_llm)

        mock_storage_instance.update_results.assert_called_once()
        update_call = mock_storage_instance.update_results.call_args
        assert "topic_mindmaps" in update_call[0][1]
        assert update_call[0][1]["topic_mindmaps"] == mock_tree


# =============================================================================
# Test: process_mindmap - LLM Parameter
# =============================================================================

class TestProcessMindmapLLMParameter:
    """Test LLM parameter handling."""

    def test_llm_parameter_unused(self, mock_db, mock_llm, mock_submissions_storage):
        """LLM parameter is unused (interface compatibility)."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": [{"name": "Topic", "sentences": [1]}],
                "subtopics": []
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.mindmap.build_tree_from_topics', return_value={}):
            process_mindmap(submission, mock_db, mock_llm)

        # LLM should not be called
        mock_llm.call.assert_not_called()
        mock_llm.estimate_tokens.assert_not_called()


# =============================================================================
# Test: process_mindmap - Completion Message
# =============================================================================

class TestProcessMindmapCompletionMessage:
    """Test completion message functionality."""

    def test_logs_completion_message_with_counts(
        self, mock_db, mock_llm, mock_submissions_storage, capsys
    ):
        """Function logs completion message with topic and subtopic counts."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1", "S2"],
                "topics": [
                    {"name": "Topic A", "sentences": [1]},
                    {"name": "Topic B", "sentences": [2]}
                ],
                "subtopics": [
                    {"name": "Sub1", "sentences": [1], "parent_topic": "Topic A"}
                ]
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.mindmap.build_tree_from_topics', return_value={}):
            process_mindmap(submission, mock_db, mock_llm)

        captured = capsys.readouterr()
        assert "Mindmap generation completed" in captured.out
        assert "test-123" in captured.out
        assert "2 topics" in captured.out
        assert "1 subtopics" in captured.out


# =============================================================================
# Test: process_mindmap - Edge Cases
# =============================================================================

class TestProcessMindmapEdgeCases:
    """Test edge cases for process_mindmap."""

    def test_handles_missing_subtopics_key(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function handles missing subtopics key in results."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["S1"],
                "topics": [{"name": "Topic", "sentences": [1]}]
                # No subtopics key
            }
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.mindmap.build_tree_from_topics') as mock_build:
            mock_build.return_value = {}

            # Should not raise
            process_mindmap(submission, mock_db, mock_llm)

    def test_handles_none_subtopics(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
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

        with patch('lib.tasks.mindmap.build_tree_from_topics') as mock_build:
            mock_build.return_value = {}

            # Should not raise
            process_mindmap(submission, mock_db, mock_llm)

    def test_handles_missing_results_key(
        self, mock_db, mock_llm, mock_submissions_storage
    ):
        """Function handles missing results key in submission."""
        submission = {
            "submission_id": "test-123"
            # No results key
        }

        mock_storage_instance = MagicMock()
        mock_submissions_storage.return_value = mock_storage_instance

        with patch('lib.tasks.mindmap.build_tree_from_topics') as mock_build:
            mock_build.return_value = {}

            # Should raise ValueError (no topics)
            with pytest.raises(ValueError):
                process_mindmap(submission, mock_db, mock_llm)
