"""
Unit tests for the semantic diff core module.

Tests all functions in lib/diff/semantic_diff.py:
- canonical_pair
- _parse_sentence_indices_from_topic
- build_topic_units
- check_submission_topic_readiness
- _compute_directional
- compute_topic_aware_semantic_diff
- orient_payload
- stale_reasons

Also tests:
- ALGORITHM_VERSION constant
- Default parameters
- Edge cases: no topic overlap, identical content, unicode handling
"""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, UTC, timedelta
import numpy as np

from lib.diff.semantic_diff import (
    ALGORITHM_VERSION,
    canonical_pair,
    _parse_sentence_indices_from_topic,
    build_topic_units,
    check_submission_topic_readiness,
    _compute_directional,
    compute_topic_aware_semantic_diff,
    orient_payload,
    stale_reasons,
)


# =============================================================================
# Constants and Default Parameters Tests
# =============================================================================


class TestAlgorithmVersion:
    """Tests for ALGORITHM_VERSION constant."""

    def test_algorithm_version_is_defined(self):
        """ALGORITHM_VERSION constant is defined."""
        assert ALGORITHM_VERSION is not None

    def test_algorithm_version_format(self):
        """ALGORITHM_VERSION has expected format."""
        assert isinstance(ALGORITHM_VERSION, str)
        assert "semantic" in ALGORITHM_VERSION.lower()

    def test_algorithm_version_value(self):
        """ALGORITHM_VERSION has expected value."""
        expected = "semantic-v3-topic-aware-charwb-3-6-th0.25-cr0.5-topk-shared"
        assert ALGORITHM_VERSION == expected


class TestDefaultParameters:
    """Tests for default parameter values."""

    def test_threshold_default_is_0_25(self):
        """Default threshold is 0.25."""
        import inspect

        sig = inspect.signature(compute_topic_aware_semantic_diff)
        assert sig.parameters["threshold"].default == 0.25

    def test_nearest_min_similarity_default_is_0_5(self):
        """Default nearest_min_similarity is 0.5."""
        import inspect

        sig = inspect.signature(compute_topic_aware_semantic_diff)
        assert sig.parameters["nearest_min_similarity"].default == 0.5

    def test_top_k_nearest_default_is_3(self):
        """Default top_k_nearest is 3."""
        import inspect

        sig = inspect.signature(compute_topic_aware_semantic_diff)
        assert sig.parameters["top_k_nearest"].default == 3


# =============================================================================
# Test: canonical_pair
# =============================================================================


class TestCanonicalPair:
    """Tests for the canonical_pair function."""

    def test_ids_are_sorted_alphabetically(self):
        """IDs are sorted alphabetically in pair_key."""
        pair_key, sub_a_id, sub_b_id = canonical_pair("sub-b-002", "sub-a-001")
        assert pair_key == "sub-a-001::sub-b-002"
        assert sub_a_id == "sub-a-001"
        assert sub_b_id == "sub-b-002"

    def test_pair_key_format(self):
        """pair_key format is '{smaller_id}::{larger_id}'."""
        pair_key, _, _ = canonical_pair("xyz", "abc")
        assert pair_key == "abc::xyz"

    def test_submission_a_id_is_always_smaller(self):
        """submission_a_id is always the smaller ID."""
        _, sub_a_id, sub_b_id = canonical_pair("zebra", "apple")
        assert sub_a_id == "apple"
        assert sub_b_id == "zebra"

    def test_submission_b_id_is_always_larger(self):
        """submission_b_id is always the larger ID."""
        _, sub_a_id, sub_b_id = canonical_pair("first", "last")
        assert sub_a_id == "first"
        assert sub_b_id == "last"

    def test_same_input_order_always_produces_same_output(self):
        """Same input order always produces same output."""
        result1 = canonical_pair("sub-a", "sub-b")
        result2 = canonical_pair("sub-a", "sub-b")
        assert result1 == result2

    def test_reverse_input_order_produces_same_output(self):
        """Reverse input order produces same output (canonical)."""
        result1 = canonical_pair("sub-a", "sub-b")
        result2 = canonical_pair("sub-b", "sub-a")
        assert result1 == result2

    def test_identical_ids(self):
        """Handles identical IDs correctly."""
        pair_key, sub_a_id, sub_b_id = canonical_pair("sub-001", "sub-001")
        assert pair_key == "sub-001::sub-001"
        assert sub_a_id == "sub-001"
        assert sub_b_id == "sub-001"

    def test_numeric_ids_sorted_as_strings(self):
        """Numeric IDs are sorted as strings."""
        pair_key, sub_a_id, sub_b_id = canonical_pair("sub-10", "sub-2")
        # String comparison: "sub-10" < "sub-2" because '1' < '2'
        assert pair_key == "sub-10::sub-2"
        assert sub_a_id == "sub-10"
        assert sub_b_id == "sub-2"

    def test_uuid_style_ids(self):
        """Handles UUID-style IDs correctly."""
        id1 = "550e8400-e29b-41d4-a716-446655440000"
        id2 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
        pair_key, sub_a_id, sub_b_id = canonical_pair(id2, id1)
        assert sub_a_id == id1
        assert sub_b_id == id2
        assert pair_key == f"{id1}::{id2}"


# =============================================================================
# Test: _parse_sentence_indices_from_topic
# =============================================================================


class TestParseSentenceIndicesFromTopic:
    """Tests for the _parse_sentence_indices_from_topic function."""

    def test_extracts_from_ranges_with_start_and_end(self):
        """Extracts from ranges with both sentence_start and sentence_end."""
        topic = {"name": "Test", "ranges": [{"sentence_start": 1, "sentence_end": 3}]}
        result = _parse_sentence_indices_from_topic(topic)
        # 1-based to 0-based: 1,2,3 -> 0,1,2
        assert result == [0, 1, 2]

    def test_extracts_from_ranges_start_only(self):
        """Handles start-only ranges."""
        topic = {"name": "Test", "ranges": [{"sentence_start": 5}]}
        result = _parse_sentence_indices_from_topic(topic)
        # 5 -> 4 (0-based)
        assert result == [4]

    def test_extracts_from_ranges_end_only(self):
        """Handles end-only ranges."""
        topic = {"name": "Test", "ranges": [{"sentence_end": 5}]}
        result = _parse_sentence_indices_from_topic(topic)
        # 5 -> 4 (0-based)
        assert result == [4]

    def test_extracts_from_sentences_array(self):
        """Extracts from sentences array."""
        topic = {"name": "Test", "sentences": [1, 3, 5]}
        result = _parse_sentence_indices_from_topic(topic)
        # 1,3,5 -> 0,2,4 (0-based)
        assert result == [0, 2, 4]

    def test_converts_1_based_to_0_based(self):
        """Converts 1-based indices to 0-based."""
        topic = {
            "name": "Test",
            "ranges": [{"sentence_start": 1, "sentence_end": 1}],
            "sentences": [1],
        }
        result = _parse_sentence_indices_from_topic(topic)
        assert result == [0]

    def test_handles_missing_ranges(self):
        """Handles missing ranges (None)."""
        topic = {"name": "Test", "ranges": None}
        result = _parse_sentence_indices_from_topic(topic)
        assert result == []

    def test_handles_missing_sentences(self):
        """Handles missing sentences (None)."""
        topic = {"name": "Test", "sentences": None}
        result = _parse_sentence_indices_from_topic(topic)
        assert result == []

    def test_handles_invalid_entry_types(self):
        """Handles invalid entry types (non-dict in ranges)."""
        topic = {
            "name": "Test",
            "ranges": ["invalid", 123, None, {"sentence_start": 1}],
        }
        result = _parse_sentence_indices_from_topic(topic)
        assert result == [0]

    def test_handles_missing_start_end_keys(self):
        """Handles missing start/end keys."""
        topic = {
            "name": "Test",
            "ranges": [{"other_key": "value"}, {"sentence_start": 2}],
        }
        result = _parse_sentence_indices_from_topic(topic)
        assert result == [1]

    def test_deduplicates_indices(self):
        """Deduplicates indices from multiple sources."""
        topic = {
            "name": "Test",
            "ranges": [{"sentence_start": 1, "sentence_end": 2}],
            "sentences": [1, 2, 3],
        }
        result = _parse_sentence_indices_from_topic(topic)
        # ranges: 0,1; sentences: 0,1,2 -> deduplicated: 0,1,2
        assert result == [0, 1, 2]

    def test_returns_sorted_list(self):
        """Returns sorted list."""
        topic = {"name": "Test", "sentences": [5, 2, 8, 1]}
        result = _parse_sentence_indices_from_topic(topic)
        assert result == [0, 1, 4, 7]

    def test_handles_start_greater_than_end(self):
        """Handles start greater than end (swaps them)."""
        topic = {"name": "Test", "ranges": [{"sentence_start": 5, "sentence_end": 2}]}
        result = _parse_sentence_indices_from_topic(topic)
        # Should include 2,3,4,5 -> 1,2,3,4 (0-based)
        assert result == [1, 2, 3, 4]

    def test_handles_negative_indices(self):
        """Filters out negative indices after conversion."""
        topic = {"name": "Test", "ranges": [{"sentence_start": 0, "sentence_end": 2}]}
        result = _parse_sentence_indices_from_topic(topic)
        # 0 -> -1 (filtered), 1, 2 -> 0, 1
        assert result == [0, 1]

    def test_empty_topic(self):
        """Handles empty topic."""
        topic = {}
        result = _parse_sentence_indices_from_topic(topic)
        assert result == []

    def test_empty_ranges_list(self):
        """Handles empty ranges list."""
        topic = {"name": "Test", "ranges": []}
        result = _parse_sentence_indices_from_topic(topic)
        assert result == []

    def test_non_integer_indices_ignored(self):
        """Non-integer indices are ignored."""
        topic = {"name": "Test", "sentences": [1, "two", 3.5, None]}
        result = _parse_sentence_indices_from_topic(topic)
        # Only integer 1 is valid, becomes 0 (0-based)
        # "two", 3.5, None are all ignored
        assert result == [0]


# =============================================================================
# Test: build_topic_units
# =============================================================================


class TestBuildTopicUnits:
    """Tests for the build_topic_units function."""

    def test_valid_submission_returns_units(self):
        """Valid submission with topics and sentences returns units."""
        submission = {
            "results": {
                "sentences": ["Sentence one.", "Sentence two.", "Sentence three."],
                "topics": [
                    {
                        "name": "Topic A",
                        "ranges": [{"sentence_start": 1, "sentence_end": 2}],
                    },
                    {"name": "Topic B", "ranges": [{"sentence_start": 3}]},
                ],
            }
        }
        units, missing = build_topic_units(submission)
        assert len(units) == 3
        assert missing == []
        assert units[0]["topic"] == "Topic A"
        assert units[0]["sentence_index"] == 0
        assert units[0]["text"] == "Sentence one."

    def test_missing_sentences_returns_missing_reasons(self):
        """Missing sentences returns missing_reasons=['sentences_missing', 'topics_missing']."""
        submission = {"results": {"sentences": None, "topics": []}}
        units, missing = build_topic_units(submission)
        assert units == []
        assert "sentences_missing" in missing
        assert "topics_missing" in missing

    def test_missing_topics_returns_missing_reasons(self):
        """Missing topics returns missing_reasons=['topics_missing']."""
        submission = {"results": {"sentences": ["Sentence one."], "topics": None}}
        units, missing = build_topic_units(submission)
        assert units == []
        assert "topics_missing" in missing

    def test_empty_topics_list_returns_missing_reasons(self):
        """Empty topics list returns missing_reasons=['topics_missing']."""
        submission = {"results": {"sentences": ["Sentence one."], "topics": []}}
        units, missing = build_topic_units(submission)
        assert units == []
        assert "topics_missing" in missing

    def test_missing_topic_ranges_returns_missing_reasons(self):
        """Missing topic_ranges returns missing_reasons=['topic_ranges_missing']."""
        submission = {
            "results": {
                "sentences": ["Sentence one.", "Sentence two."],
                "topics": [
                    {"name": "Topic A", "ranges": None},
                    {"name": "Topic B", "sentences": []},
                ],
            }
        }
        units, missing = build_topic_units(submission)
        assert units == []
        assert "topic_ranges_missing" in missing

    def test_empty_topic_units_returns_missing_reasons(self):
        """Empty topic_units returns missing_reasons=['topic_units_empty']."""
        submission = {
            "results": {
                "sentences": ["Sentence one.", "Sentence two."],
                "topics": [
                    {
                        "name": "Topic A",
                        "ranges": [{"sentence_start": 10}],
                    }  # Out of bounds
                ],
            }
        }
        units, missing = build_topic_units(submission)
        assert units == []
        assert "topic_units_empty" in missing

    def test_untitled_topics_labeled_as_untitled(self):
        """Untitled topics labeled as '(untitled)'."""
        submission = {
            "results": {
                "sentences": ["Sentence one."],
                "topics": [
                    {"name": "", "ranges": [{"sentence_start": 1}]},
                    {"name": None, "ranges": [{"sentence_start": 1}]},
                ],
            }
        }
        units, missing = build_topic_units(submission)
        # First topic claims sentence 0, second is ignored (first-come-first-served)
        assert len(units) == 1
        assert units[0]["topic"] == "(untitled)"

    def test_sentence_assigned_to_first_matching_topic_only(self):
        """Sentence assigned to first matching topic only."""
        submission = {
            "results": {
                "sentences": ["Sentence one."],
                "topics": [
                    {"name": "Topic A", "ranges": [{"sentence_start": 1}]},
                    {"name": "Topic B", "ranges": [{"sentence_start": 1}]},
                ],
            }
        }
        units, missing = build_topic_units(submission)
        assert len(units) == 1
        assert units[0]["topic"] == "Topic A"

    def test_empty_whitespace_sentences_filtered_out(self):
        """Empty/whitespace sentences filtered out."""
        submission = {
            "results": {
                "sentences": ["Valid sentence.", "", "   ", "Another valid."],
                "topics": [
                    {
                        "name": "Topic A",
                        "ranges": [{"sentence_start": 1, "sentence_end": 4}],
                    }
                ],
            }
        }
        units, missing = build_topic_units(submission)
        assert len(units) == 2
        assert units[0]["text"] == "Valid sentence."
        assert units[1]["text"] == "Another valid."

    def test_units_contain_required_fields(self):
        """Units contain: topic, sentence_index, text."""
        submission = {
            "results": {
                "sentences": ["Test sentence."],
                "topics": [{"name": "Test Topic", "ranges": [{"sentence_start": 1}]}],
            }
        }
        units, missing = build_topic_units(submission)
        assert len(units) == 1
        assert "topic" in units[0]
        assert "sentence_index" in units[0]
        assert "text" in units[0]

    def test_missing_results_key(self):
        """Handles missing results key."""
        submission = {}
        units, missing = build_topic_units(submission)
        assert units == []
        assert "sentences_missing" in missing

    def test_whitespace_trimmed_from_text(self):
        """Whitespace is trimmed from text."""
        submission = {
            "results": {
                "sentences": ["  Sentence with spaces.  "],
                "topics": [{"name": "Topic A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        units, missing = build_topic_units(submission)
        assert units[0]["text"] == "Sentence with spaces."


# =============================================================================
# Test: check_submission_topic_readiness
# =============================================================================


class TestCheckSubmissionTopicReadiness:
    """Tests for the check_submission_topic_readiness function."""

    def test_ready_when_all_prerequisites_present(self):
        """Ready when all prerequisites present."""
        submission = {
            "results": {
                "sentences": ["Sentence one.", "Sentence two."],
                "topics": [
                    {
                        "name": "Topic A",
                        "ranges": [{"sentence_start": 1, "sentence_end": 2}],
                    }
                ],
            }
        }
        result = check_submission_topic_readiness(submission)
        assert result["ready"] is True
        assert result["missing"] == []
        assert result["unit_count"] == 2

    def test_returns_ready_false_with_missing_list(self):
        """Returns ready=false with missing list when not ready."""
        submission = {"results": {"sentences": [], "topics": []}}
        result = check_submission_topic_readiness(submission)
        assert result["ready"] is False
        assert len(result["missing"]) > 0

    def test_returns_unit_count_for_ready_submissions(self):
        """Returns unit_count for ready submissions."""
        submission = {
            "results": {
                "sentences": ["One", "Two", "Three"],
                "topics": [
                    {
                        "name": "Topic A",
                        "ranges": [{"sentence_start": 1, "sentence_end": 3}],
                    }
                ],
            }
        }
        result = check_submission_topic_readiness(submission)
        assert result["unit_count"] == 3

    def test_missing_sentences(self):
        """Detects missing sentences."""
        submission = {"results": {"sentences": None, "topics": []}}
        result = check_submission_topic_readiness(submission)
        assert "sentences_missing" in result["missing"]

    def test_missing_topics(self):
        """Detects missing topics."""
        submission = {"results": {"sentences": ["Sentence one."], "topics": None}}
        result = check_submission_topic_readiness(submission)
        assert "topics_missing" in result["missing"]

    def test_topic_ranges_missing(self):
        """Detects topic_ranges_missing."""
        submission = {
            "results": {
                "sentences": ["Sentence one."],
                "topics": [{"name": "Topic A", "ranges": None}],
            }
        }
        result = check_submission_topic_readiness(submission)
        assert "topic_ranges_missing" in result["missing"]

    def test_topic_units_empty(self):
        """Detects topic_units_empty."""
        submission = {
            "results": {
                "sentences": ["Sentence one."],
                "topics": [
                    {
                        "name": "Topic A",
                        "ranges": [{"sentence_start": 10}],
                    }  # Out of bounds
                ],
            }
        }
        result = check_submission_topic_readiness(submission)
        assert "topic_units_empty" in result["missing"]


# =============================================================================
# Test: _compute_directional
# =============================================================================


class TestComputeDirectional:
    """Tests for the _compute_directional function."""

    def test_empty_source_units_returns_empty_matches(self):
        """Empty source_units returns matches=[], nearest=[], all target indices unmatched."""
        source_units = []
        target_units = [
            {"topic": "Topic A", "sentence_index": 0, "text": "Target sentence."}
        ]
        result = _compute_directional(
            source_units,
            target_units,
            threshold=0.25,
            nearest_min_similarity=0.5,
            top_k_nearest=3,
            source_label="a",
            target_label="b",
        )
        assert result["matches"] == []
        assert result["nearest"] == []
        assert result["unmatched_target_indices"] == [0]

    def test_empty_target_units_returns_all_source_unmatched(self):
        """Empty target_units returns all source unmatched with None targets."""
        source_units = [
            {"topic": "Topic A", "sentence_index": 0, "text": "Source sentence."}
        ]
        target_units = []
        result = _compute_directional(
            source_units,
            target_units,
            threshold=0.25,
            nearest_min_similarity=0.5,
            top_k_nearest=3,
            source_label="a",
            target_label="b",
        )
        assert len(result["matches"]) == 1
        assert result["matches"][0]["b_topic"] is None
        assert result["matches"][0]["b_sentence_index"] is None
        assert result["matches"][0]["b_text"] is None
        assert result["nearest"] == []
        assert result["unmatched_target_indices"] == []

    def test_similarity_matrix_computed_when_not_provided(self):
        """Similarity matrix computed correctly when not provided."""
        source_units = [
            {"topic": "Topic A", "sentence_index": 0, "text": "Similar text here."}
        ]
        target_units = [
            {"topic": "Topic B", "sentence_index": 0, "text": "Similar text there."}
        ]
        result = _compute_directional(
            source_units,
            target_units,
            threshold=0.25,
            nearest_min_similarity=0.5,
            top_k_nearest=3,
            source_label="a",
            target_label="b",
        )
        # Should have computed similarity
        assert len(result["matches"]) == 1
        assert "similarity" in result["matches"][0]

    def test_threshold_filtering_for_matches(self):
        """Threshold filtering for matches."""
        source_units = [
            {"topic": "Topic A", "sentence_index": 0, "text": "Source text."}
        ]
        target_units = [
            {
                "topic": "Topic B",
                "sentence_index": 0,
                "text": "Completely different xyz123.",
            }
        ]
        # High threshold should result in no match
        result = _compute_directional(
            source_units,
            target_units,
            threshold=0.99,  # Very high threshold
            nearest_min_similarity=0.5,
            top_k_nearest=3,
            source_label="a",
            target_label="b",
        )
        assert result["matches"][0]["b_topic"] is None

    def test_nearest_min_similarity_filtering(self):
        """nearest_min_similarity filtering for nearest neighbors."""
        source_units = [
            {"topic": "Topic A", "sentence_index": 0, "text": "Source text."}
        ]
        target_units = [
            {"topic": "Topic B", "sentence_index": 0, "text": "Target text."},
            {"topic": "Topic C", "sentence_index": 1, "text": "Very different zzz."},
        ]
        result = _compute_directional(
            source_units,
            target_units,
            threshold=0.25,
            nearest_min_similarity=0.99,  # Very high
            top_k_nearest=3,
            source_label="a",
            target_label="b",
        )
        # With high nearest_min_similarity, nearest should be empty or limited
        assert len(result["nearest"]) == 0 or all(
            n["similarity"] >= 0.99 for n in result["nearest"]
        )

    def test_top_k_nearest_limits_results(self):
        """top_k_nearest limits nearest results."""
        source_units = [
            {"topic": "Topic A", "sentence_index": 0, "text": "Source text here."}
        ]
        target_units = [
            {"topic": "B", "sentence_index": 0, "text": "Target one here."},
            {"topic": "C", "sentence_index": 1, "text": "Target two here."},
            {"topic": "D", "sentence_index": 2, "text": "Target three here."},
            {"topic": "E", "sentence_index": 3, "text": "Target four here."},
        ]
        result = _compute_directional(
            source_units,
            target_units,
            threshold=0.25,
            nearest_min_similarity=0.0,  # Low to include all
            top_k_nearest=2,  # Only top 2
            source_label="a",
            target_label="b",
        )
        # nearest should have at most 2 entries (excludes best match)
        assert len(result["nearest"]) <= 2

    def test_single_source_unit(self):
        """Single source unit handling."""
        source_units = [
            {"topic": "Topic A", "sentence_index": 0, "text": "Single source."}
        ]
        target_units = [
            {"topic": "Topic B", "sentence_index": 0, "text": "Single target."}
        ]
        result = _compute_directional(
            source_units,
            target_units,
            threshold=0.25,
            nearest_min_similarity=0.5,
            top_k_nearest=3,
            source_label="a",
            target_label="b",
        )
        assert len(result["matches"]) == 1

    def test_single_target_unit(self):
        """Single target unit handling."""
        source_units = [
            {"topic": "Topic A", "sentence_index": 0, "text": "Single source."}
        ]
        target_units = [
            {"topic": "Topic B", "sentence_index": 0, "text": "Single target."}
        ]
        result = _compute_directional(
            source_units,
            target_units,
            threshold=0.25,
            nearest_min_similarity=0.5,
            top_k_nearest=3,
            source_label="a",
            target_label="b",
        )
        assert len(result["matches"]) == 1

    def test_match_includes_best_similarity_target(self):
        """Match includes best similarity target."""
        source_units = [
            {"topic": "Topic A", "sentence_index": 0, "text": "Identical text."}
        ]
        target_units = [
            {"topic": "Topic B", "sentence_index": 0, "text": "Identical text."}
        ]
        result = _compute_directional(
            source_units,
            target_units,
            threshold=0.25,
            nearest_min_similarity=0.5,
            top_k_nearest=3,
            source_label="a",
            target_label="b",
        )
        assert result["matches"][0]["b_topic"] == "Topic B"
        assert result["matches"][0]["b_sentence_index"] == 0
        assert result["matches"][0]["b_text"] == "Identical text."

    def test_nearest_excludes_best_match(self):
        """Nearest excludes the best match (ranks 2 to k+1)."""
        source_units = [
            {"topic": "Topic A", "sentence_index": 0, "text": "Source text here."}
        ]
        target_units = [
            {"topic": "B", "sentence_index": 0, "text": "Best match here."},
            {"topic": "C", "sentence_index": 1, "text": "Second best here."},
        ]
        result = _compute_directional(
            source_units,
            target_units,
            threshold=0.25,
            nearest_min_similarity=0.0,
            top_k_nearest=3,
            source_label="a",
            target_label="b",
        )
        # Best match should be in matches, not nearest
        best_target_idx = 0  # Assuming first is best
        for nearest_item in result["nearest"]:
            assert (
                nearest_item["b_sentence_index"] != best_target_idx
                or len(result["nearest"]) == 0
            )

    def test_unmatched_target_indices_correctly_identified(self):
        """Unmatched target indices correctly identified."""
        source_units = [{"topic": "Topic A", "sentence_index": 0, "text": "Source."}]
        target_units = [
            {"topic": "B", "sentence_index": 0, "text": "Matched."},
            {"topic": "C", "sentence_index": 1, "text": "Unmatched one."},
            {"topic": "D", "sentence_index": 2, "text": "Unmatched two."},
        ]
        result = _compute_directional(
            source_units,
            target_units,
            threshold=0.25,
            nearest_min_similarity=0.5,
            top_k_nearest=3,
            source_label="a",
            target_label="b",
        )
        # At least indices 1 and 2 should be unmatched (or some subset)
        assert len(result["unmatched_target_indices"]) >= 1

    def test_match_structure_has_all_fields(self):
        """Match structure has all required fields."""
        source_units = [{"topic": "Topic A", "sentence_index": 0, "text": "Source."}]
        target_units = [{"topic": "Topic B", "sentence_index": 1, "text": "Target."}]
        result = _compute_directional(
            source_units,
            target_units,
            threshold=0.25,
            nearest_min_similarity=0.5,
            top_k_nearest=3,
            source_label="a",
            target_label="b",
        )
        match = result["matches"][0]
        assert "a_topic" in match
        assert "a_sentence_index" in match
        assert "a_text" in match
        assert "b_topic" in match
        assert "b_sentence_index" in match
        assert "b_text" in match
        assert "similarity" in match

    def test_provided_similarity_matrix_is_used(self):
        """Provided similarity matrix is used instead of computing."""
        source_units = [{"topic": "A", "sentence_index": 0, "text": "Source."}]
        target_units = [{"topic": "B", "sentence_index": 0, "text": "Target."}]
        # Create a custom similarity matrix
        similarity_matrix = np.array([[0.95]])

        with patch("lib.diff.semantic_diff.TfidfVectorizer") as mock_vectorizer:
            result = _compute_directional(
                source_units,
                target_units,
                similarity_matrix=similarity_matrix,
                threshold=0.25,
                nearest_min_similarity=0.5,
                top_k_nearest=3,
                source_label="a",
                target_label="b",
            )
            # TfidfVectorizer should not be called since matrix provided
            mock_vectorizer.assert_not_called()
            assert result["matches"][0]["similarity"] == 0.95


# =============================================================================
# Test: compute_topic_aware_semantic_diff
# =============================================================================


class TestComputeTopicAwareSemanticDiff:
    """Tests for the compute_topic_aware_semantic_diff function."""

    def test_raises_value_error_when_prerequisites_not_ready(self):
        """Raises ValueError when prerequisites not ready."""
        submission_a = {"results": {"sentences": [], "topics": []}}
        submission_b = {
            "results": {
                "sentences": ["Sentence."],
                "topics": [{"name": "Topic", "ranges": [{"sentence_start": 1}]}],
            }
        }
        with pytest.raises(ValueError) as exc_info:
            compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert "Topic prerequisites are not ready" in str(exc_info.value)

    def test_computes_units_a_and_b_correctly(self):
        """Computes units_a and units_b correctly."""
        submission_a = {
            "results": {
                "sentences": ["A1", "A2"],
                "topics": [
                    {
                        "name": "Topic A",
                        "ranges": [{"sentence_start": 1, "sentence_end": 2}],
                    }
                ],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["B1", "B2", "B3"],
                "topics": [
                    {
                        "name": "Topic B",
                        "ranges": [{"sentence_start": 1, "sentence_end": 3}],
                    }
                ],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert result["meta"]["units_a"] == 2
        assert result["meta"]["units_b"] == 3

    def test_tfidf_vectorization_with_char_wb_analyzer(self):
        """TF-IDF vectorization with char_wb analyzer."""
        submission_a = {
            "results": {
                "sentences": ["Test sentence A."],
                "topics": [{"name": "Topic A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test sentence B."],
                "topics": [{"name": "Topic B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        with patch("lib.diff.semantic_diff.TfidfVectorizer") as mock_vectorizer_class:
            # Create a mock that behaves like a real TF-IDF matrix when sliced
            mock_matrix = MagicMock()
            mock_matrix.__getitem__ = MagicMock(side_effect=lambda key: mock_matrix)
            mock_matrix.__len__ = MagicMock(return_value=2)

            mock_instance = MagicMock()
            mock_instance.fit_transform.return_value = mock_matrix
            mock_vectorizer_class.return_value = mock_instance

            # Also mock cosine_similarity to avoid actual computation
            with patch("lib.diff.semantic_diff.cosine_similarity") as mock_cosine:
                mock_cosine.return_value = np.array([[0.5]])

                result = compute_topic_aware_semantic_diff(submission_a, submission_b)

                # Verify char_wb analyzer was used
                call_kwargs = mock_vectorizer_class.call_args[1]
                assert call_kwargs.get("analyzer") == "char_wb"
                assert result["meta"]["units_a"] == 1

    def test_ngram_range_configuration(self):
        """ngram_range=(3, 6) configuration."""
        submission_a = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        with patch("lib.diff.semantic_diff.TfidfVectorizer") as mock_vectorizer_class:
            mock_matrix = MagicMock()
            mock_matrix.__getitem__ = MagicMock(side_effect=lambda key: mock_matrix)
            mock_matrix.__len__ = MagicMock(return_value=2)

            mock_instance = MagicMock()
            mock_instance.fit_transform.return_value = mock_matrix
            mock_vectorizer_class.return_value = mock_instance

            with patch("lib.diff.semantic_diff.cosine_similarity") as mock_cosine:
                mock_cosine.return_value = np.array([[0.5]])

                compute_topic_aware_semantic_diff(submission_a, submission_b)

                call_kwargs = mock_vectorizer_class.call_args[1]
                assert call_kwargs.get("ngram_range") == (3, 6)

    def test_bidirectional_matching(self):
        """Bidirectional matching (a_to_b and b_to_a)."""
        submission_a = {
            "results": {
                "sentences": ["A sentence."],
                "topics": [{"name": "Topic A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["B sentence."],
                "topics": [{"name": "Topic B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert "matches_a_to_b" in result
        assert "matches_b_to_a" in result

    def test_similarity_matrix_reused_for_both_directions(self):
        """Similarity matrix reused for both directions."""
        submission_a = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        with patch("lib.diff.semantic_diff.cosine_similarity") as mock_cosine:
            mock_cosine.return_value = np.array([[1.0]])

            compute_topic_aware_semantic_diff(submission_a, submission_b)

            # cosine_similarity should be called only once
            assert mock_cosine.call_count == 1

    def test_threshold_default(self):
        """Threshold default is 0.25."""
        submission_a = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert result["meta"]["threshold"] == 0.25

    def test_nearest_min_similarity_default(self):
        """nearest_min_similarity default is 0.5."""
        submission_a = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert result["meta"]["nearest_min_similarity"] == 0.5

    def test_top_k_nearest_default(self):
        """top_k_nearest default is 3."""
        submission_a = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert result["meta"]["top_k_nearest"] == 3

    def test_response_structure_meta(self):
        """Response structure has meta with all required fields."""
        submission_a = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        meta = result["meta"]
        assert "algorithm_version" in meta
        assert "threshold" in meta
        assert "nearest_min_similarity" in meta
        assert "top_k_nearest" in meta
        assert "generated_at" in meta
        assert "units_a" in meta
        assert "units_b" in meta
        assert "topics_a" in meta
        assert "topics_b" in meta

    def test_response_structure_matches(self):
        """Response structure has matches_a_to_b and matches_b_to_a."""
        submission_a = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert "matches_a_to_b" in result
        assert "matches_b_to_a" in result
        assert isinstance(result["matches_a_to_b"], list)
        assert isinstance(result["matches_b_to_a"], list)

    def test_response_structure_nearest(self):
        """Response structure has nearest_a_to_b and nearest_b_to_a."""
        submission_a = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert "nearest_a_to_b" in result
        assert "nearest_b_to_a" in result
        assert isinstance(result["nearest_a_to_b"], list)
        assert isinstance(result["nearest_b_to_a"], list)

    def test_response_structure_unmatched(self):
        """Response structure has unmatched_a and unmatched_b."""
        submission_a = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert "unmatched_a" in result
        assert "unmatched_b" in result
        assert isinstance(result["unmatched_a"], list)
        assert isinstance(result["unmatched_b"], list)

    def test_algorithm_version_in_meta(self):
        """algorithm_version in meta matches ALGORITHM_VERSION."""
        submission_a = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert result["meta"]["algorithm_version"] == ALGORITHM_VERSION

    def test_generated_at_is_iso_format(self):
        """generated_at is in ISO format."""
        submission_a = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        generated_at = result["meta"]["generated_at"]
        assert "T" in generated_at
        assert generated_at.endswith("Z")

    def test_topics_count_in_meta(self):
        """topics_a and topics_b count unique topics correctly."""
        submission_a = {
            "results": {
                "sentences": ["A1", "A2", "A3"],
                "topics": [
                    {"name": "Topic A", "ranges": [{"sentence_start": 1}]},
                    {
                        "name": "Topic B",
                        "ranges": [{"sentence_start": 2, "sentence_end": 3}],
                    },
                ],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["B1"],
                "topics": [{"name": "Topic C", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert result["meta"]["topics_a"] == 2
        assert result["meta"]["topics_b"] == 1


# =============================================================================
# Test: orient_payload
# =============================================================================


class TestOrientPayload:
    """Tests for the orient_payload function."""

    def test_direct_mapping_when_left_is_a_right_is_b(self):
        """left=submission_a, right=submission_b: direct mapping."""
        payload = {
            "meta": {"algorithm_version": "v1"},
            "matches_a_to_b": [
                {
                    "a_topic": "A",
                    "a_sentence_index": 0,
                    "a_text": "Text A",
                    "b_topic": "B",
                    "b_sentence_index": 1,
                    "b_text": "Text B",
                    "similarity": 0.8,
                }
            ],
            "matches_b_to_a": [],
            "nearest_a_to_b": [],
            "nearest_b_to_a": [],
            "unmatched_a": [],
            "unmatched_b": [],
        }
        result = orient_payload(payload, "sub-a", "sub-b", "sub-a", "sub-b")
        assert result["matches_left_to_right"][0]["left_topic"] == "A"
        assert result["matches_left_to_right"][0]["right_topic"] == "B"

    def test_swapped_mapping_when_left_is_b_right_is_a(self):
        """left=submission_b, right=submission_a: swapped mapping."""
        payload = {
            "meta": {"algorithm_version": "v1"},
            "matches_a_to_b": [
                {
                    "a_topic": "A",
                    "a_sentence_index": 0,
                    "a_text": "Text A",
                    "b_topic": "B",
                    "b_sentence_index": 1,
                    "b_text": "Text B",
                    "similarity": 0.8,
                }
            ],
            "matches_b_to_a": [],
            "nearest_a_to_b": [],
            "nearest_b_to_a": [],
            "unmatched_a": [],
            "unmatched_b": [],
        }
        result = orient_payload(payload, "sub-a", "sub-b", "sub-b", "sub-a")
        # When swapped, matches_b_to_a becomes matches_left_to_right
        # But since matches_b_to_a is empty, result should be empty
        assert result["matches_left_to_right"] == []

    def test_matches_left_to_right_correctly_oriented(self):
        """matches_left_to_right correctly oriented."""
        payload = {
            "meta": {},
            "matches_a_to_b": [
                {
                    "a_topic": "Topic A",
                    "a_sentence_index": 0,
                    "a_text": "A text",
                    "b_topic": "Topic B",
                    "b_sentence_index": 0,
                    "b_text": "B text",
                    "similarity": 0.9,
                }
            ],
            "matches_b_to_a": [],
            "nearest_a_to_b": [],
            "nearest_b_to_a": [],
            "unmatched_a": [],
            "unmatched_b": [],
        }
        result = orient_payload(payload, "sub-a", "sub-b", "sub-a", "sub-b")
        match = result["matches_left_to_right"][0]
        assert match["left_topic"] == "Topic A"
        assert match["right_topic"] == "Topic B"

    def test_matches_right_to_left_correctly_oriented(self):
        """matches_right_to_left correctly oriented."""
        payload = {
            "meta": {},
            "matches_a_to_b": [],
            "matches_b_to_a": [
                {
                    "b_topic": "Topic B",
                    "b_sentence_index": 0,
                    "b_text": "B text",
                    "a_topic": "Topic A",
                    "a_sentence_index": 0,
                    "a_text": "A text",
                    "similarity": 0.9,
                }
            ],
            "nearest_a_to_b": [],
            "nearest_b_to_a": [],
            "unmatched_a": [],
            "unmatched_b": [],
        }
        result = orient_payload(payload, "sub-a", "sub-b", "sub-a", "sub-b")
        match = result["matches_right_to_left"][0]
        assert match["left_topic"] == "Topic A"
        assert match["right_topic"] == "Topic B"

    def test_nearest_left_to_right_correctly_oriented(self):
        """nearest_left_to_right correctly oriented."""
        payload = {
            "meta": {},
            "matches_a_to_b": [],
            "matches_b_to_a": [],
            "nearest_a_to_b": [
                {
                    "a_topic": "A",
                    "a_sentence_index": 0,
                    "a_text": "A",
                    "b_topic": "B",
                    "b_sentence_index": 1,
                    "b_text": "B",
                    "similarity": 0.7,
                }
            ],
            "nearest_b_to_a": [],
            "unmatched_a": [],
            "unmatched_b": [],
        }
        result = orient_payload(payload, "sub-a", "sub-b", "sub-a", "sub-b")
        nearest = result["nearest_left_to_right"][0]
        assert nearest["left_topic"] == "A"
        assert nearest["right_topic"] == "B"

    def test_nearest_right_to_left_correctly_oriented(self):
        """nearest_right_to_left correctly oriented."""
        payload = {
            "meta": {},
            "matches_a_to_b": [],
            "matches_b_to_a": [],
            "nearest_a_to_b": [],
            "nearest_b_to_a": [
                {
                    "b_topic": "B",
                    "b_sentence_index": 0,
                    "b_text": "B",
                    "a_topic": "A",
                    "a_sentence_index": 0,
                    "a_text": "A",
                    "similarity": 0.7,
                }
            ],
            "unmatched_a": [],
            "unmatched_b": [],
        }
        result = orient_payload(payload, "sub-a", "sub-b", "sub-a", "sub-b")
        nearest = result["nearest_right_to_left"][0]
        assert nearest["left_topic"] == "A"
        assert nearest["right_topic"] == "B"

    def test_unmatched_left_correctly_oriented(self):
        """unmatched_left correctly oriented."""
        payload = {
            "meta": {},
            "matches_a_to_b": [],
            "matches_b_to_a": [],
            "nearest_a_to_b": [],
            "nearest_b_to_a": [],
            "unmatched_a": [{"topic": "A", "sentence_index": 0, "text": "Unmatched A"}],
            "unmatched_b": [],
        }
        result = orient_payload(payload, "sub-a", "sub-b", "sub-a", "sub-b")
        assert len(result["unmatched_left"]) == 1
        assert result["unmatched_left"][0]["topic"] == "A"

    def test_unmatched_right_correctly_oriented(self):
        """unmatched_right correctly oriented."""
        payload = {
            "meta": {},
            "matches_a_to_b": [],
            "matches_b_to_a": [],
            "nearest_a_to_b": [],
            "nearest_b_to_a": [],
            "unmatched_a": [],
            "unmatched_b": [{"topic": "B", "sentence_index": 0, "text": "Unmatched B"}],
        }
        result = orient_payload(payload, "sub-a", "sub-b", "sub-a", "sub-b")
        assert len(result["unmatched_right"]) == 1
        assert result["unmatched_right"][0]["topic"] == "B"

    def test_meta_preserved_unchanged(self):
        """meta preserved unchanged."""
        payload = {
            "meta": {"algorithm_version": "v1", "threshold": 0.25},
            "matches_a_to_b": [],
            "matches_b_to_a": [],
            "nearest_a_to_b": [],
            "nearest_b_to_a": [],
            "unmatched_a": [],
            "unmatched_b": [],
        }
        result = orient_payload(payload, "sub-a", "sub-b", "sub-a", "sub-b")
        assert result["meta"]["algorithm_version"] == "v1"
        assert result["meta"]["threshold"] == 0.25

    def test_handles_none_empty_rows(self):
        """Handles None/empty rows."""
        payload = {
            "meta": {},
            "matches_a_to_b": None,
            "matches_b_to_a": None,
            "nearest_a_to_b": None,
            "nearest_b_to_a": None,
            "unmatched_a": None,
            "unmatched_b": None,
        }
        result = orient_payload(payload, "sub-a", "sub-b", "sub-a", "sub-b")
        assert result["matches_left_to_right"] == []
        assert result["matches_right_to_left"] == []
        assert result["nearest_left_to_right"] == []
        assert result["nearest_right_to_left"] == []
        assert result["unmatched_left"] == []
        assert result["unmatched_right"] == []

    def test_swapped_orientation_unmatched(self):
        """Swapped orientation correctly maps unmatched."""
        payload = {
            "meta": {},
            "matches_a_to_b": [],
            "matches_b_to_a": [],
            "nearest_a_to_b": [],
            "nearest_b_to_a": [],
            "unmatched_a": [{"topic": "A", "sentence_index": 0, "text": "A"}],
            "unmatched_b": [{"topic": "B", "sentence_index": 0, "text": "B"}],
        }
        result = orient_payload(payload, "sub-a", "sub-b", "sub-b", "sub-a")
        # When swapped, unmatched_b becomes unmatched_left
        assert result["unmatched_left"][0]["topic"] == "B"
        assert result["unmatched_right"][0]["topic"] == "A"


# =============================================================================
# Test: stale_reasons
# =============================================================================


class TestStaleReasons:
    """Tests for the stale_reasons function."""

    def test_empty_list_when_diff_is_current(self):
        """Empty list when diff is current."""
        computed_at = datetime(2024, 1, 1, tzinfo=UTC)
        diff_doc = {"algorithm_version": ALGORITHM_VERSION, "computed_at": computed_at}
        submission_a = {"updated_at": computed_at - timedelta(hours=1)}
        submission_b = {"updated_at": computed_at - timedelta(hours=1)}
        result = stale_reasons(diff_doc, submission_a, submission_b)
        assert result == []

    def test_algorithm_version_mismatch(self):
        """'algorithm_version_mismatch' when versions differ."""
        computed_at = datetime(2024, 1, 1, tzinfo=UTC)
        diff_doc = {"algorithm_version": "old-version", "computed_at": computed_at}
        submission_a = {"updated_at": computed_at - timedelta(hours=1)}
        submission_b = {"updated_at": computed_at - timedelta(hours=1)}
        result = stale_reasons(diff_doc, submission_a, submission_b)
        assert "algorithm_version_mismatch" in result

    def test_left_submission_updated(self):
        """'left_submission_updated' when submission_a updated after computed_at."""
        computed_at = datetime(2024, 1, 1, 10, 0, 0, tzinfo=UTC)
        diff_doc = {"algorithm_version": ALGORITHM_VERSION, "computed_at": computed_at}
        submission_a = {"updated_at": datetime(2024, 1, 1, 11, 0, 0, tzinfo=UTC)}
        submission_b = {"updated_at": computed_at - timedelta(hours=1)}
        result = stale_reasons(diff_doc, submission_a, submission_b)
        assert "left_submission_updated" in result

    def test_right_submission_updated(self):
        """'right_submission_updated' when submission_b updated after computed_at."""
        computed_at = datetime(2024, 1, 1, 10, 0, 0, tzinfo=UTC)
        diff_doc = {"algorithm_version": ALGORITHM_VERSION, "computed_at": computed_at}
        submission_a = {"updated_at": computed_at - timedelta(hours=1)}
        submission_b = {"updated_at": datetime(2024, 1, 1, 11, 0, 0, tzinfo=UTC)}
        result = stale_reasons(diff_doc, submission_a, submission_b)
        assert "right_submission_updated" in result

    def test_multiple_reasons_returned_simultaneously(self):
        """Multiple reasons can be returned simultaneously."""
        computed_at = datetime(2024, 1, 1, 10, 0, 0, tzinfo=UTC)
        diff_doc = {"algorithm_version": "old-version", "computed_at": computed_at}
        submission_a = {"updated_at": datetime(2024, 1, 1, 11, 0, 0, tzinfo=UTC)}
        submission_b = {"updated_at": datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)}
        result = stale_reasons(diff_doc, submission_a, submission_b)
        assert "algorithm_version_mismatch" in result
        assert "left_submission_updated" in result
        assert "right_submission_updated" in result

    def test_handles_none_values_gracefully(self):
        """Handles None values gracefully."""
        diff_doc = {"algorithm_version": ALGORITHM_VERSION, "computed_at": None}
        submission_a = {"updated_at": None}
        submission_b = {"updated_at": None}
        result = stale_reasons(diff_doc, submission_a, submission_b)
        assert result == []

    def test_handles_missing_fields_gracefully(self):
        """Handles missing fields gracefully."""
        diff_doc = {}
        submission_a = {}
        submission_b = {}
        result = stale_reasons(diff_doc, submission_a, submission_b)
        assert isinstance(result, list)

    def test_custom_algorithm_version_parameter(self):
        """Custom algorithm_version parameter."""
        computed_at = datetime(2024, 1, 1, tzinfo=UTC)
        diff_doc = {"algorithm_version": "custom-v1", "computed_at": computed_at}
        submission_a = {"updated_at": computed_at - timedelta(hours=1)}
        submission_b = {"updated_at": computed_at - timedelta(hours=1)}
        result = stale_reasons(
            diff_doc, submission_a, submission_b, algorithm_version="custom-v1"
        )
        assert result == []

    def test_custom_algorithm_version_mismatch(self):
        """Custom algorithm_version detects mismatch."""
        computed_at = datetime(2024, 1, 1, tzinfo=UTC)
        diff_doc = {"algorithm_version": "v1", "computed_at": computed_at}
        submission_a = {"updated_at": computed_at - timedelta(hours=1)}
        submission_b = {"updated_at": computed_at - timedelta(hours=1)}
        result = stale_reasons(
            diff_doc, submission_a, submission_b, algorithm_version="v2"
        )
        assert "algorithm_version_mismatch" in result

    def test_datetime_comparison_with_non_datetime(self):
        """Handles non-datetime values in computed_at/updated_at."""
        diff_doc = {
            "algorithm_version": ALGORITHM_VERSION,
            "computed_at": "not-a-datetime",
        }
        submission_a = {"updated_at": "also-not-datetime"}
        submission_b = {"updated_at": "also-not-datetime"}
        result = stale_reasons(diff_doc, submission_a, submission_b)
        # Should not raise, should return empty since isinstance checks fail
        assert result == []


# =============================================================================
# Edge Cases
# =============================================================================


class TestEdgeCases:
    """Edge case tests for semantic diff functions."""

    def test_no_topic_overlap_between_submissions(self):
        """Submissions with no overlap in topics."""
        submission_a = {
            "results": {
                "sentences": ["A unique sentence."],
                "topics": [{"name": "Topic A Only", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["B unique sentence."],
                "topics": [{"name": "Topic B Only", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        # Should still compute, but matches may have low similarity
        assert result["meta"]["units_a"] == 1
        assert result["meta"]["units_b"] == 1
        assert result["meta"]["topics_a"] == 1
        assert result["meta"]["topics_b"] == 1

    def test_identical_content(self):
        """Submissions with identical content."""
        submission = {
            "results": {
                "sentences": ["Identical sentence."],
                "topics": [{"name": "Same Topic", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission, submission)
        # Identical content should have high similarity
        assert result["meta"]["units_a"] == 1
        assert result["meta"]["units_b"] == 1
        # Match should exist with high similarity
        if result["matches_a_to_b"]:
            assert result["matches_a_to_b"][0]["similarity"] >= 0.99

    def test_unicode_handling(self):
        """Unicode text handling."""
        submission_a = {
            "results": {
                "sentences": [
                    "Unicode: \u00e9\u00e8\u00ea \u4e2d\u6587 \u0420\u0443\u0441\u0441\u043a\u0438\u0439 \ud83d\ude00"
                ],
                "topics": [
                    {"name": "Unicode Topic", "ranges": [{"sentence_start": 1}]}
                ],
            }
        }
        submission_b = {
            "results": {
                "sentences": [
                    "Unicode: \u00e9\u00e8\u00ea \u4e2d\u6587 \u0420\u0443\u0441\u0441\u043a\u0438\u0439 \ud83d\ude00"
                ],
                "topics": [
                    {"name": "Unicode Topic", "ranges": [{"sentence_start": 1}]}
                ],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert result["meta"]["units_a"] == 1
        assert result["meta"]["units_b"] == 1

    def test_special_characters_in_text(self):
        """Special characters in text."""
        submission_a = {
            "results": {
                "sentences": ["Special: <>&\"' \\n\\t @#$%^&*()"],
                "topics": [{"name": "Special", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Special: <>&\"' \\n\\t @#$%^&*()"],
                "topics": [{"name": "Special", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert result["meta"]["units_a"] == 1

    def test_very_long_sentences(self):
        """Very long sentences handling."""
        long_text = "word " * 1000
        submission_a = {
            "results": {
                "sentences": [long_text],
                "topics": [{"name": "Long", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": [long_text],
                "topics": [{"name": "Long", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert result["meta"]["units_a"] == 1

    def test_many_sentences(self):
        """Large number of sentences handling."""
        sentences = [f"Sentence {i}." for i in range(100)]
        submission_a = {
            "results": {
                "sentences": sentences,
                "topics": [
                    {
                        "name": "Many",
                        "ranges": [{"sentence_start": 1, "sentence_end": 100}],
                    }
                ],
            }
        }
        submission_b = {
            "results": {
                "sentences": sentences,
                "topics": [
                    {
                        "name": "Many",
                        "ranges": [{"sentence_start": 1, "sentence_end": 100}],
                    }
                ],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert result["meta"]["units_a"] == 100
        assert result["meta"]["units_b"] == 100

    def test_empty_string_sentences_filtered(self):
        """Empty strings in sentences are filtered."""
        submission_a = {
            "results": {
                "sentences": ["", "", "Valid", ""],
                "topics": [
                    {
                        "name": "Test",
                        "ranges": [{"sentence_start": 1, "sentence_end": 4}],
                    }
                ],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Valid"],
                "topics": [{"name": "Test", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert result["meta"]["units_a"] == 1

    def test_only_whitespace_sentences_filtered(self):
        """Whitespace-only sentences are filtered."""
        submission_a = {
            "results": {
                "sentences": ["   ", "\t", "\n", "Valid"],
                "topics": [
                    {
                        "name": "Test",
                        "ranges": [{"sentence_start": 1, "sentence_end": 4}],
                    }
                ],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Valid"],
                "topics": [{"name": "Test", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert result["meta"]["units_a"] == 1

    def test_mixed_valid_invalid_topics(self):
        """Mixed valid and invalid topic entries."""
        submission_a = {
            "results": {
                "sentences": ["A1", "A2"],
                "topics": [
                    {"name": "Valid", "ranges": [{"sentence_start": 1}]},
                    "invalid_string",
                    None,
                    123,
                    {"name": "Also Valid", "ranges": [{"sentence_start": 2}]},
                ],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["B1"],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        result = compute_topic_aware_semantic_diff(submission_a, submission_b)
        assert result["meta"]["units_a"] == 2
        assert result["meta"]["topics_a"] == 2


# =============================================================================
# Mock Tests for Dependencies
# =============================================================================


class TestDependencyMocks:
    """Tests verifying proper mocking of sklearn, numpy, datetime."""

    def test_tfidf_vectorizer_mock(self):
        """TfidfVectorizer can be mocked."""
        submission_a = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        with patch("lib.diff.semantic_diff.TfidfVectorizer") as mock_vectorizer_class:
            mock_matrix = MagicMock()
            mock_matrix.__getitem__ = MagicMock(side_effect=lambda key: mock_matrix)
            mock_matrix.__len__ = MagicMock(return_value=2)

            mock_instance = MagicMock()
            mock_instance.fit_transform.return_value = mock_matrix
            mock_vectorizer_class.return_value = mock_instance

            with patch("lib.diff.semantic_diff.cosine_similarity") as mock_cosine:
                mock_cosine.return_value = np.array([[1.0]])

                compute_topic_aware_semantic_diff(submission_a, submission_b)

                mock_vectorizer_class.assert_called_once()

    def test_cosine_similarity_mock(self):
        """cosine_similarity can be mocked."""
        submission_a = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        with patch("lib.diff.semantic_diff.cosine_similarity") as mock_cosine:
            mock_cosine.return_value = np.array([[1.0]])

            compute_topic_aware_semantic_diff(submission_a, submission_b)

            mock_cosine.assert_called()

    def test_datetime_now_mock(self):
        """datetime.now(UTC) can be mocked."""
        fixed_time = datetime(2024, 6, 15, 12, 0, 0, tzinfo=UTC)
        submission_a = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "A", "ranges": [{"sentence_start": 1}]}],
            }
        }
        submission_b = {
            "results": {
                "sentences": ["Test."],
                "topics": [{"name": "B", "ranges": [{"sentence_start": 1}]}],
            }
        }
        with patch("lib.diff.semantic_diff.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_time
            mock_dt.UTC = UTC

            result = compute_topic_aware_semantic_diff(submission_a, submission_b)

            # generated_at should contain our fixed time
            assert "2024-06-15" in result["meta"]["generated_at"]

    def test_numpy_argsort_mock(self):
        """numpy argsort can be mocked."""
        source_units = [{"topic": "A", "sentence_index": 0, "text": "Source."}]
        target_units = [
            {"topic": "B", "sentence_index": 0, "text": "Target 1."},
            {"topic": "C", "sentence_index": 1, "text": "Target 2."},
        ]
        with patch("lib.diff.semantic_diff.np") as mock_np:
            mock_np.argsort.return_value = [1, 0]  # Mock ranking
            mock_np.ndarray = np.ndarray

            _compute_directional(
                source_units,
                target_units,
                similarity_matrix=np.array([[0.5, 0.8]]),
                threshold=0.25,
                nearest_min_similarity=0.5,
                top_k_nearest=3,
                source_label="a",
                target_label="b",
            )

            mock_np.argsort.assert_called()
