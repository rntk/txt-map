"""
Unit tests for storytelling_generation topic merging and fan-out logic.
"""
import pytest

from lib.tasks.storytelling_generation import (
    _merge_small_topics,
    _build_merged_summaries,
    _fan_out_annotations,
    MIN_SENTENCES_FOR_STANDALONE,
)


# =============================================================================
# _merge_small_topics
# =============================================================================

class TestMergeSmallTopics:
    def test_empty_topics(self):
        result, merge_map = _merge_small_topics([])
        assert result == []
        assert merge_map == {}

    def test_all_large_no_merge(self):
        topics = [
            {"name": "A>B", "sentences": list(range(1, 8))},
            {"name": "A>C", "sentences": list(range(8, 15))},
        ]
        result, merge_map = _merge_small_topics(topics, min_sentences=5)
        assert merge_map == {}
        assert len(result) == 2

    def test_two_small_siblings_merge(self):
        topics = [
            {"name": "Tech>AI>GPT", "sentences": [1, 2, 3]},
            {"name": "Tech>AI>BERT", "sentences": [4, 5]},
        ]
        result, merge_map = _merge_small_topics(topics, min_sentences=5)
        assert "Tech>AI" in merge_map
        assert sorted(merge_map["Tech>AI"]) == ["Tech>AI>BERT", "Tech>AI>GPT"]
        assert len(result) == 1
        merged = result[0]
        assert merged["name"] == "Tech>AI"
        assert merged["sentences"] == [1, 2, 3, 4, 5]

    def test_small_and_large_in_same_group(self):
        """Large topic stays; small topic stays when it has no sibling to merge with."""
        topics = [
            {"name": "Tech>AI>GPT", "sentences": list(range(1, 10))},  # large
            {"name": "Tech>AI>BERT", "sentences": [10, 11]},  # small, only one small sibling
        ]
        result, merge_map = _merge_small_topics(topics, min_sentences=5)
        # Only 1 small sibling — no merge possible
        assert merge_map == {}
        assert len(result) == 2

    def test_three_small_siblings_merge(self):
        topics = [
            {"name": "A>B>X", "sentences": [1, 2]},
            {"name": "A>B>Y", "sentences": [3, 4]},
            {"name": "A>B>Z", "sentences": [5]},
        ]
        result, merge_map = _merge_small_topics(topics, min_sentences=5)
        assert "A>B" in merge_map
        assert len(merge_map["A>B"]) == 3
        merged = result[0]
        assert merged["sentences"] == [1, 2, 3, 4, 5]

    def test_sentence_deduplication(self):
        topics = [
            {"name": "A>B>X", "sentences": [1, 2, 3]},
            {"name": "A>B>Y", "sentences": [2, 3, 4]},  # overlap
        ]
        result, merge_map = _merge_small_topics(topics, min_sentences=5)
        assert "A>B" in merge_map
        assert result[0]["sentences"] == [1, 2, 3, 4]  # deduped and sorted

    def test_top_level_topics_not_merged(self):
        """Top-level topics (no >) are never merged."""
        topics = [
            {"name": "AI", "sentences": [1]},
            {"name": "Tech", "sentences": [2]},
        ]
        result, merge_map = _merge_small_topics(topics, min_sentences=5)
        assert merge_map == {}
        assert len(result) == 2

    def test_parent_name_collision_skips_merge(self):
        """If the parent path already exists as a topic, skip merging."""
        topics = [
            {"name": "Tech>AI", "sentences": list(range(1, 10))},  # parent exists
            {"name": "Tech>AI>GPT", "sentences": [11, 12]},        # small child
            {"name": "Tech>AI>BERT", "sentences": [13, 14]},       # small child
        ]
        result, merge_map = _merge_small_topics(topics, min_sentences=5)
        # merge target "Tech>AI" already exists → skip merge
        assert merge_map == {}
        assert len(result) == 3

    def test_ranges_combined(self):
        topics = [
            {"name": "A>B>X", "sentences": [1, 2], "ranges": [{"sentence_start": 1, "sentence_end": 2}]},
            {"name": "A>B>Y", "sentences": [3, 4], "ranges": [{"sentence_start": 3, "sentence_end": 4}]},
        ]
        result, merge_map = _merge_small_topics(topics, min_sentences=5)
        assert "A>B" in merge_map
        assert len(result[0]["ranges"]) == 2

    def test_mixed_parents_independent(self):
        """Topics with different parents don't merge into each other."""
        topics = [
            {"name": "A>X>1", "sentences": [1, 2]},
            {"name": "A>X>2", "sentences": [3, 4]},
            {"name": "B>Y>1", "sentences": [5, 6]},
            {"name": "B>Y>2", "sentences": [7, 8]},
        ]
        result, merge_map = _merge_small_topics(topics, min_sentences=5)
        assert set(merge_map.keys()) == {"A>X", "B>Y"}
        assert len(result) == 2


# =============================================================================
# _build_merged_summaries
# =============================================================================

class TestBuildMergedSummaries:
    def test_no_merge_map(self):
        summaries = {"A>B": "summary b", "A>C": "summary c"}
        result = _build_merged_summaries({}, summaries)
        assert result == summaries

    def test_merge_concatenates_summaries(self):
        summaries = {"A>B>X": "X summary", "A>B>Y": "Y summary"}
        merge_map = {"A>B": ["A>B>X", "A>B>Y"]}
        result = _build_merged_summaries(merge_map, summaries)
        assert result["A>B"] == "X summary; Y summary"
        # Original keys preserved
        assert result["A>B>X"] == "X summary"

    def test_missing_summary_skipped(self):
        summaries = {"A>B>X": "X summary"}
        merge_map = {"A>B": ["A>B>X", "A>B>Y"]}  # Y has no summary
        result = _build_merged_summaries(merge_map, summaries)
        assert result["A>B"] == "X summary"  # only non-empty parts joined


# =============================================================================
# _fan_out_annotations
# =============================================================================

class TestFanOutAnnotations:
    def _make_original_topics(self):
        return [
            {"name": "Tech>AI>GPT", "sentences": [1, 2, 3]},
            {"name": "Tech>AI>BERT", "sentences": [4, 5]},
            {"name": "Science>Biology", "sentences": [6, 7, 8]},
        ]

    def test_no_merge_map_passthrough(self):
        ta = {"Tech>AI": {"reading_priority": "must_read", "recommended_sentences": []}}
        ss = {"reading_order": ["Tech>AI"]}
        result_ta, result_ss = _fan_out_annotations(ta, ss, {}, self._make_original_topics())
        assert result_ta == ta
        assert result_ss == ss

    def test_fan_out_to_original_names(self):
        merge_map = {"Tech>AI": ["Tech>AI>GPT", "Tech>AI>BERT"]}
        ta = {
            "Tech>AI": {"reading_priority": "must_read", "skip_reason": None, "recommended_sentences": [1, 4]},
            "Science>Biology": {"reading_priority": "optional", "skip_reason": "too_brief", "recommended_sentences": []},
        }
        ss = {"reading_order": ["Tech>AI"], "fold_topics": [], "highlight_topics": []}
        original_topics = self._make_original_topics()

        result_ta, result_ss = _fan_out_annotations(ta, ss, merge_map, original_topics)

        # Merged name should NOT be in the result
        assert "Tech>AI" not in result_ta
        # Both original names should be present
        assert "Tech>AI>GPT" in result_ta
        assert "Tech>AI>BERT" in result_ta
        # Non-merged topic passes through
        assert "Science>Biology" in result_ta
        assert result_ta["Science>Biology"]["reading_priority"] == "optional"

    def test_recommended_sentences_filtered_per_topic(self):
        """Each original topic only gets recommended sentences it owns."""
        merge_map = {"Tech>AI": ["Tech>AI>GPT", "Tech>AI>BERT"]}
        ta = {
            "Tech>AI": {"reading_priority": "must_read", "skip_reason": None, "recommended_sentences": [1, 2, 4]},
        }
        ss = {}
        original_topics = [
            {"name": "Tech>AI>GPT", "sentences": [1, 2, 3]},
            {"name": "Tech>AI>BERT", "sentences": [4, 5]},
        ]
        result_ta, _ = _fan_out_annotations(ta, ss, merge_map, original_topics)

        assert result_ta["Tech>AI>GPT"]["recommended_sentences"] == [1, 2]  # only sentences in GPT
        assert result_ta["Tech>AI>BERT"]["recommended_sentences"] == [4]   # only sentences in BERT

    def test_reading_order_expanded(self):
        merge_map = {"Tech>AI": ["Tech>AI>GPT", "Tech>AI>BERT"]}
        ta = {
            "Tech>AI": {"reading_priority": "must_read", "skip_reason": None, "recommended_sentences": []},
        }
        ss = {
            "reading_order": ["Tech>AI", "Science>Biology"],
            "fold_topics": ["Tech>AI"],
            "highlight_topics": [],
        }
        original_topics = [
            {"name": "Tech>AI>GPT", "sentences": [1, 2]},
            {"name": "Tech>AI>BERT", "sentences": [3, 4]},
            {"name": "Science>Biology", "sentences": [5]},
        ]
        _, result_ss = _fan_out_annotations(ta, ss, merge_map, original_topics)

        assert result_ss["reading_order"] == ["Tech>AI>GPT", "Tech>AI>BERT", "Science>Biology"]
        assert result_ss["fold_topics"] == ["Tech>AI>GPT", "Tech>AI>BERT"]
