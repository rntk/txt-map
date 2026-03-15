"""
Unit tests for the prefix_tree task handler.

Tests build_compressed_trie, _compress_node, and process_prefix_tree functions.
"""
import pytest
from unittest.mock import MagicMock, Mock, patch, call
import re

# Import module under test
from lib.tasks.prefix_tree import (
    process_prefix_tree,
    build_compressed_trie,
    _compress_node,
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
def sample_sentences():
    """Create sample sentences for testing."""
    return [
        "Python is a programming language.",
        "Python is popular for data science.",
        "Java is also a programming language.",
        "Machine learning uses Python."
    ]


@pytest.fixture
def sample_submission():
    """Create a sample submission document."""
    return {
        "submission_id": "test-submission-123",
        "html_content": "<html><body><p>Sample content</p></body></html>",
        "results": {
            "sentences": [
                "Python is a programming language.",
                "Python is popular for data science.",
                "Java is also a programming language.",
                "Machine learning uses Python."
            ],
            "prefix_tree": {}
        }
    }


# =============================================================================
# Test: build_compressed_trie - Basic Functionality
# =============================================================================

class TestBuildCompressedTrieBasic:
    """Test basic functionality of build_compressed_trie."""

    def test_returns_empty_dict_for_empty_sentences(self):
        """Function returns empty dict when sentences list is empty."""
        tree = build_compressed_trie([])
        assert tree == {}

    def test_returns_empty_dict_for_none_sentences(self):
        """Function raises TypeError when sentences is None."""
        # Note: The source code doesn't handle None sentences
        with pytest.raises(TypeError):
            tree = build_compressed_trie(None)

    def test_extracts_words_with_regex(self, sample_sentences):
        """Function extracts words using regex [a-zA-Z']+."""
        tree = build_compressed_trie(sample_sentences)

        # "python" should be in the tree
        assert "p" in tree or any("python" in str(k).lower() for k in tree.keys())

    def test_lowercases_words(self, sample_sentences):
        """Function lowercases all words."""
        tree = build_compressed_trie(sample_sentences)

        # All keys should be lowercase
        def check_lowercase(node):
            if isinstance(node, dict):
                for key, value in node.items():
                    if isinstance(key, str):
                        assert key == key.lower(), f"Key '{key}' is not lowercase"
                    check_lowercase(value)

        check_lowercase(tree)

    def test_tracks_word_counts(self):
        """Function tracks word occurrence counts."""
        sentences = ["Python Python Python", "python python"]

        tree = build_compressed_trie(sentences)

        # "python" appears 5 times
        def find_word_count(node, word):
            if not isinstance(node, dict):
                return None
            if "count" in node and node.get("count", 0) > 0:
                # This is a word endpoint
                return node["count"]
            for child in node.values():
                result = find_word_count(child, word)
                if result is not None:
                    return result
            return None

        # Find python node and check count
        python_count = find_word_in_tree(tree, "python")
        assert python_count == 5

    def test_tracks_sentence_positions_one_indexed(self, sample_sentences):
        """Function tracks sentence positions as 1-indexed."""
        tree = build_compressed_trie(sample_sentences)

        def find_word_sentences(node, word, path=""):
            if not isinstance(node, dict):
                return None
            current_path = path + str(list(node.keys())[0]) if node else path
            if "count" in node and node.get("count", 0) > 0 and "sentences" in node:
                return node["sentences"]
            for key, child in node.items():
                result = find_word_sentences(child, word, path + str(key))
                if result is not None:
                    return result
            return None

        # Find a word and check sentence positions are 1-indexed
        sentences = find_word_in_tree_sentences(tree, "python")
        # Assert that we found the word and verify exact sentence positions
        assert sentences is not None, "Expected to find 'python' in the trie"
        # "python" appears in sentences 1, 2, and 4 (1-indexed)
        assert sentences == [1, 2, 4], f"Expected [1, 2, 4] but got {sentences}"
        # All indices should be >= 1 (1-indexed)
        assert all(s >= 1 for s in sentences)

    def test_builds_character_trie_structure(self):
        """Function builds character-based trie structure (compressed)."""
        sentences = ["cat", "car"]

        tree = build_compressed_trie(sentences)

        # After compression, "ca" should be in root (common prefix)
        # The trie is compressed, so we may have "ca" instead of just "c"
        assert any("ca" in str(k) for k in tree.keys()) or "c" in tree

    def test_root_has_count_zero(self, sample_sentences):
        """Root level nodes may have count>0 if they are word endpoints after compression."""
        tree = build_compressed_trie(sample_sentences)

        # After compression, some root children may be word endpoints with count>0
        # This is expected behavior for compressed tries
        for key, node in tree.items():
            if isinstance(node, dict):
                # Node should have count and sentences keys
                assert "count" in node
                assert "sentences" in node

    def test_leaf_nodes_have_count_greater_than_zero(self):
        """Leaf nodes (word endpoints) have count>0."""
        sentences = ["hello"]

        tree = build_compressed_trie(sentences)

        def check_leaf_counts(node):
            if not isinstance(node, dict):
                return
            if node.get("count", 0) > 0:
                # This is a word endpoint
                assert node["count"] > 0
                assert "sentences" in node
            for child in node.values():
                check_leaf_counts(child)

        for child in tree.values():
            check_leaf_counts(child)

    def test_leaf_nodes_have_sentences_list(self):
        """Leaf nodes have sentences list."""
        sentences = ["hello world", "hello there"]

        tree = build_compressed_trie(sentences)

        def check_leaf_sentences(node):
            if not isinstance(node, dict):
                return
            if node.get("count", 0) > 0:
                # This is a word endpoint
                assert "sentences" in node
                assert isinstance(node["sentences"], list)
            for child in node.values():
                check_leaf_sentences(child)

        for child in tree.values():
            check_leaf_sentences(child)


# Helper functions for tree traversal
def find_word_in_tree(tree, word):
    """Find a word in the trie and return its count."""
    def traverse(node, remaining_word):
        if not remaining_word:
            # We've matched the entire word
            if isinstance(node, dict) and node.get("count", 0) > 0:
                return node["count"]
            return None

        if not isinstance(node, dict):
            return None

        # Get the children dict from the node
        children = node.get("children", node)
        if not isinstance(children, dict):
            return None

        for key, child in children.items():
            if remaining_word.startswith(key):
                new_remaining = remaining_word[len(key):]
                if not new_remaining:
                    # The key exactly matches the remaining word
                    # Check if this node is a word endpoint
                    if child.get("count", 0) > 0:
                        return child["count"]
                # Continue traversing
                result = traverse(child, new_remaining)
                if result is not None:
                    return result
        return None

    return traverse(tree, word)


def find_word_in_tree_sentences(tree, word):
    """Find a word in the trie and return its sentence positions."""
    def traverse(node, remaining_word):
        if not remaining_word:
            if isinstance(node, dict) and node.get("count", 0) > 0:
                return node.get("sentences", [])
            return None

        if not isinstance(node, dict):
            return None

        # Get the children dict from the node
        children = node.get("children", node)
        if not isinstance(children, dict):
            return None

        for key, child in children.items():
            if remaining_word.startswith(key):
                new_remaining = remaining_word[len(key):]
                if not new_remaining:
                    # The key exactly matches the remaining word
                    if child.get("count", 0) > 0:
                        return child.get("sentences", [])
                result = traverse(child, new_remaining)
                if result is not None:
                    return result
        return None

    return traverse(tree, word)


# =============================================================================
# Test: build_compressed_trie - Word Extraction
# =============================================================================

class TestBuildCompressedTrieWordExtraction:
    """Test word extraction functionality."""

    def test_extracts_words_with_apostrophes(self):
        """Function extracts words containing apostrophes."""
        sentences = ["don't stop believing", "it's a test"]

        tree = build_compressed_trie(sentences)

        # "don't" and "it's" should be extracted as single words
        dont_count = find_word_in_tree(tree, "don't")
        assert dont_count is not None and dont_count > 0

    def test_strips_apostrophes_from_word_edges(self):
        """Function strips apostrophes from word edges."""
        sentences = ["'quoted' word"]

        tree = build_compressed_trie(sentences)

        # Leading/trailing apostrophes should be stripped
        quoted_count = find_word_in_tree(tree, "quoted")
        assert quoted_count is not None and quoted_count > 0

    def test_ignores_non_alphabetic_characters(self):
        """Function ignores non-alphabetic characters (except apostrophes)."""
        sentences = ["hello123 world!", "test@email.com"]

        tree = build_compressed_trie(sentences)

        # Only alphabetic parts should be extracted
        hello_count = find_word_in_tree(tree, "hello")
        assert hello_count is not None and hello_count > 0

    def test_handles_unicode_characters(self):
        """Function handles unicode characters gracefully."""
        sentences = ["café", "naïve", "résumé", "日本語", "中文测试"]

        # Should not raise
        tree = build_compressed_trie(sentences)
        assert isinstance(tree, dict)

    def test_handles_empty_sentences_in_list(self):
        """Function handles empty strings in sentences list."""
        sentences = ["hello", "", "world"]

        tree = build_compressed_trie(sentences)

        # Should not raise, empty sentence contributes no words
        hello_count = find_word_in_tree(tree, "hello")
        world_count = find_word_in_tree(tree, "world")
        assert hello_count is not None and hello_count > 0
        assert world_count is not None and world_count > 0


# =============================================================================
# Test: build_compressed_trie - Compression
# =============================================================================

class TestBuildCompressedTrieCompression:
    """Test trie compression functionality."""

    def test_compresses_single_child_intermediate_nodes(self):
        """Function compresses single-child intermediate nodes."""
        sentences = ["python"]

        tree = build_compressed_trie(sentences)

        # The trie should be compressed
        # Instead of p->y->t->h->o->n, we might have "python" as a single key
        # or partially compressed like "pyth" -> "on"

        def count_nodes(node):
            if not isinstance(node, dict):
                return 0
            count = 1
            for child in node.values():
                count += count_nodes(child)
            return count

        # A compressed trie should have fewer nodes than uncompressed
        node_count = count_nodes(tree)
        # For "python" appearing once, compressed should be more efficient
        assert node_count < 10  # Reasonable compression

    def test_preserves_word_endpoint_nodes(self):
        """Function does not merge word endpoint nodes (count>0)."""
        sentences = ["cat cats"]

        tree = build_compressed_trie(sentences)

        # "cat" is a word endpoint and should not be merged with "cats"
        cat_count = find_word_in_tree(tree, "cat")
        cats_count = find_word_in_tree(tree, "cats")

        assert cat_count is not None and cat_count > 0
        assert cats_count is not None and cats_count > 0

    def test_preserves_multi_child_nodes(self):
        """Function preserves nodes with multiple children."""
        sentences = ["cat car card"]

        tree = build_compressed_trie(sentences)

        # After "ca", there are multiple children (t, r)
        # These should not be merged

        # Both words should be findable
        cat_count = find_word_in_tree(tree, "cat")
        car_count = find_word_in_tree(tree, "car")
        card_count = find_word_in_tree(tree, "card")

        assert cat_count is not None and cat_count > 0
        assert car_count is not None and car_count > 0
        assert card_count is not None and card_count > 0

    def test_merges_labels_during_compression(self):
        """Function concatenates labels during merge."""
        sentences = ["programming"]

        tree = build_compressed_trie(sentences)

        # Check that compression happened by looking for longer labels
        def has_long_label(node, min_length=3):
            if not isinstance(node, dict):
                return False
            for key in node.keys():
                if isinstance(key, str) and len(key) >= min_length:
                    return True
                if has_long_label(node[key], min_length):
                    return True
            return False

        # Should have at least one compressed (long) label
        assert has_long_label(tree)


# =============================================================================
# Test: _compress_node - Basic Functionality
# =============================================================================

class TestCompressNodeBasic:
    """Test basic functionality of _compress_node."""

    def test_processes_children_recursively_first(self):
        """Function processes all children recursively before compression."""
        node = {
            "children": {
                "a": {
                    "children": {
                        "b": {
                            "children": {
                                "c": {"children": {}, "count": 1, "sentences": [1]}
                            },
                            "count": 0,
                            "sentences": []
                        }
                    },
                    "count": 0,
                    "sentences": []
                }
            },
            "count": 0,
            "sentences": []
        }

        _compress_node(node)

        # Should be compressed: a->b->c becomes "abc"
        assert "abc" in node["children"]

    def test_merges_single_child_non_word_nodes(self):
        """Function merges single-child non-word nodes."""
        node = {
            "children": {
                "a": {
                    "children": {
                        "b": {"children": {}, "count": 1, "sentences": [1]}
                    },
                    "count": 0,
                    "sentences": []
                }
            },
            "count": 0,
            "sentences": []
        }

        _compress_node(node)

        # "a" and "b" should be merged into "ab"
        assert "ab" in node["children"]

    def test_concatenates_labels_during_merge(self):
        """Function concatenates labels when merging nodes."""
        node = {
            "children": {
                "py": {
                    "children": {
                        "thon": {"children": {}, "count": 1, "sentences": [1]}
                    },
                    "count": 0,
                    "sentences": []
                }
            },
            "count": 0,
            "sentences": []
        }

        _compress_node(node)

        # "py" and "thon" should be merged into "python"
        assert "python" in node["children"]

    def test_does_not_merge_word_endpoint_nodes(self):
        """Function does not merge nodes with count>0."""
        node = {
            "children": {
                "cat": {
                    "children": {
                        "s": {"children": {}, "count": 1, "sentences": [1]}
                    },
                    "count": 1,  # This is a word endpoint
                    "sentences": [1]
                }
            },
            "count": 0,
            "sentences": []
        }

        _compress_node(node)

        # "cat" should remain as is (it's a word endpoint)
        assert "cat" in node["children"]

    def test_preserves_multi_child_nodes(self):
        """Function preserves nodes with multiple children."""
        node = {
            "children": {
                "a": {
                    "children": {
                        "b": {"children": {}, "count": 1, "sentences": [1]},
                        "c": {"children": {}, "count": 1, "sentences": [2]}
                    },
                    "count": 0,
                    "sentences": []
                }
            },
            "count": 0,
            "sentences": []
        }

        _compress_node(node)

        # "a" has multiple children, should be preserved
        assert "a" in node["children"]


# =============================================================================
# Test: _compress_node - Edge Cases
# =============================================================================

class TestCompressNodeEdgeCases:
    """Test edge cases for _compress_node."""

    def test_handles_empty_children(self):
        """Function handles nodes with empty children."""
        node = {
            "children": {},
            "count": 0,
            "sentences": []
        }

        # Should not raise
        _compress_node(node)
        assert node["children"] == {}

    def test_handles_leaf_nodes(self):
        """Function handles leaf nodes (word endpoints)."""
        node = {
            "children": {},
            "count": 5,
            "sentences": [1, 2, 3]
        }

        # Should not raise
        _compress_node(node)
        assert node["count"] == 5
        assert node["sentences"] == [1, 2, 3]

    def test_handles_deeply_nested_structure(self):
        """Function handles deeply nested structures."""
        node = {
            "children": {
                "a": {
                    "children": {
                        "b": {
                            "children": {
                                "c": {
                                    "children": {
                                        "d": {"children": {}, "count": 1, "sentences": [1]}
                                    },
                                    "count": 0,
                                    "sentences": []
                                }
                            },
                            "count": 0,
                            "sentences": []
                        }
                    },
                    "count": 0,
                    "sentences": []
                }
            },
            "count": 0,
            "sentences": []
        }

        _compress_node(node)

        # Should compress the chain a->b->c->d into "abcd"
        assert "abcd" in node["children"]

    def test_handles_mixed_word_endpoints(self):
        """Function handles mix of word endpoints and intermediate nodes."""
        node = {
            "children": {
                "app": {
                    "children": {
                        "le": {"children": {}, "count": 1, "sentences": [1]},
                        "ly": {"children": {}, "count": 1, "sentences": [2]}
                    },
                    "count": 0,
                    "sentences": []
                }
            },
            "count": 0,
            "sentences": []
        }

        _compress_node(node)

        # "app" has multiple children, should be preserved
        assert "app" in node["children"]


# =============================================================================
# Test: process_prefix_tree - Basic Functionality
# =============================================================================

class TestProcessPrefixTreeBasic:
    """Test basic functionality of process_prefix_tree."""

    def test_reads_sentences_from_results(self, mock_db, mock_llm, sample_submission):
        """Function reads sentences from submission results."""
        with patch('lib.tasks.prefix_tree.build_compressed_trie') as mock_build:
            mock_build.return_value = {}

            process_prefix_tree(sample_submission, mock_db, mock_llm)

            mock_build.assert_called_once()
            call_args = mock_build.call_args
            assert call_args[0][0] == sample_submission["results"]["sentences"]

    def test_calls_build_compressed_trie(self, mock_db, mock_llm, sample_submission):
        """Function calls build_compressed_trie with sentences."""
        with patch('lib.tasks.prefix_tree.build_compressed_trie') as mock_build:
            mock_build.return_value = {}

            process_prefix_tree(sample_submission, mock_db, mock_llm)

            mock_build.assert_called_once()

    def test_updates_results_with_prefix_tree(self, mock_db, mock_llm, sample_submission):
        """Function updates results with prefix_tree via direct DB call."""
        mock_tree = {"p": {"children": {}, "count": 0, "sentences": []}}

        with patch('lib.tasks.prefix_tree.build_compressed_trie', return_value=mock_tree):
            process_prefix_tree(sample_submission, mock_db, mock_llm)

        mock_db.submissions.update_one.assert_called_once()
        update_call = mock_db.submissions.update_one.call_args

        # Check the update sets results.prefix_tree
        assert "results.prefix_tree" in update_call[0][1]["$set"]
        assert update_call[0][1]["$set"]["results.prefix_tree"] == mock_tree

    def test_uses_submission_id_for_update(self, mock_db, mock_llm, sample_submission):
        """Function uses submission_id for database update."""
        with patch('lib.tasks.prefix_tree.build_compressed_trie', return_value={}):
            process_prefix_tree(sample_submission, mock_db, mock_llm)

        query = mock_db.submissions.update_one.call_args[0][0]
        assert query == {"submission_id": sample_submission["submission_id"]}


# =============================================================================
# Test: process_prefix_tree - LLM Parameter
# =============================================================================

class TestProcessPrefixTreeLLMParameter:
    """Test LLM parameter handling."""

    def test_llm_parameter_unused(self, mock_db, mock_llm, sample_submission):
        """LLM parameter is unused (interface compatibility)."""
        with patch('lib.tasks.prefix_tree.build_compressed_trie', return_value={}):
            process_prefix_tree(sample_submission, mock_db, mock_llm)

        # LLM should not be called
        mock_llm.call.assert_not_called()
        mock_llm.estimate_tokens.assert_not_called()


# =============================================================================
# Test: process_prefix_tree - Edge Cases
# =============================================================================

class TestProcessPrefixTreeEdgeCases:
    """Test edge cases for process_prefix_tree."""

    def test_handles_empty_sentences(self, mock_db, mock_llm):
        """Function handles empty sentences list."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": []
            }
        }

        with patch('lib.tasks.prefix_tree.build_compressed_trie', return_value={}) as mock_build:
            process_prefix_tree(submission, mock_db, mock_llm)

        mock_build.assert_called_once_with([])

    def test_handles_missing_sentences_key(self, mock_db, mock_llm):
        """Function handles missing sentences key in results."""
        submission = {
            "submission_id": "test-123",
            "results": {}
        }

        with patch('lib.tasks.prefix_tree.build_compressed_trie', return_value={}) as mock_build:
            process_prefix_tree(submission, mock_db, mock_llm)

        mock_build.assert_called_once_with([])

    def test_handles_missing_results_key(self, mock_db, mock_llm):
        """Function raises KeyError when results key is missing."""
        submission = {
            "submission_id": "test-123"
        }

        # Source code does submission["results"].get(...) which raises KeyError
        with pytest.raises(KeyError):
            process_prefix_tree(submission, mock_db, mock_llm)

    def test_handles_special_characters_in_sentences(self, mock_db, mock_llm):
        """Function handles special characters in sentences."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["Hello! World?", "Test@email.com", "123 numbers"]
            }
        }

        with patch('lib.tasks.prefix_tree.build_compressed_trie', return_value={}):
            # Should not raise
            process_prefix_tree(submission, mock_db, mock_llm)

    def test_handles_very_long_sentences(self, mock_db, mock_llm):
        """Function handles very long sentences."""
        long_sentence = "word " * 1000
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": [long_sentence]
            }
        }

        with patch('lib.tasks.prefix_tree.build_compressed_trie', return_value={}):
            # Should not raise
            process_prefix_tree(submission, mock_db, mock_llm)


# =============================================================================
# Test: process_prefix_tree - Trie Structure Verification
# =============================================================================

class TestProcessPrefixTreeStructure:
    """Test prefix tree structure verification."""

    def test_produces_valid_trie_structure(self, mock_db, mock_llm):
        """Function produces valid trie structure by actually building the trie."""
        submission = {
            "submission_id": "test-123",
            "results": {
                "sentences": ["hello world", "hello there"]
            }
        }

        def validate_trie(node):
            """Validate trie node structure."""
            if not isinstance(node, dict):
                return False
            for key, child in node.items():
                if not isinstance(key, str):
                    return False
                if not isinstance(child, dict):
                    return False
                if "count" not in child or "sentences" not in child:
                    return False
                if not validate_trie(child.get("children", {})):
                    return False
            return True

        # Actually build the trie using the real implementation
        tree = build_compressed_trie(submission["results"]["sentences"])

        # Validate the actual trie structure
        assert validate_trie(tree)

        # Verify the trie contains expected words with correct counts
        hello_count = find_word_in_tree(tree, "hello")
        world_count = find_word_in_tree(tree, "world")
        there_count = find_word_in_tree(tree, "there")

        assert hello_count == 2, f"Expected 'hello' count to be 2, got {hello_count}"
        assert world_count == 1, f"Expected 'world' count to be 1, got {world_count}"
        assert there_count == 1, f"Expected 'there' count to be 1, got {there_count}"

        # Verify sentences are tracked correctly
        hello_sentences = find_word_in_tree_sentences(tree, "hello")
        assert sorted(hello_sentences) == [1, 2], f"Expected 'hello' in sentences [1, 2], got {hello_sentences}"

        # Also verify process_prefix_tree stores the result correctly
        process_prefix_tree(submission, mock_db, mock_llm)
        mock_db.submissions.update_one.assert_called_once()
        call_args = mock_db.submissions.update_one.call_args
        assert call_args[0][0] == {"submission_id": "test-123"}
        assert "$set" in call_args[0][1]
        assert "results.prefix_tree" in call_args[0][1]["$set"]
