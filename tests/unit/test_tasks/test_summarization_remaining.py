"""Unit tests for untested branches in summarization.py."""

import logging
from unittest.mock import MagicMock, patch

import pytest

from lib.llm_queue.client import QueuedLLMClient
from lib.tasks.summarization import (
    _build_extractive_article_summary,
    _cache_namespace,
    _children_to_records,
    _fallback_merge_article_summary,
    _format_chunk_summaries_for_merge,
    _group_children_for_merge,
    _is_valid_article_summary_response,
    _LLMAdapter,
    _merge_records_recursively,
    _normalize_article_summary,
    _parallel_generate_article_summary,
    _parallel_summarize_sentence_groups,
    _parallel_summarize_topic_tree,
    _response_preview,
    _run_merge,
    _summary_overlaps_source,
    _truncate_words,
    _ValidatedCachingLLMCallable,
    build_article_summary_chunks,
    build_topic_tree,
    generate_article_summary,
    parse_article_summary_response,
    process_summarization,
    summarize_topic_tree,
    topic_tree_to_flat_index,
)


class MockFuture:
    def __init__(self, value: str) -> None:
        self._value = value

    def result(self, timeout: float | None = None) -> str:
        del timeout
        return self._value


@pytest.fixture
def mock_llm() -> MagicMock:
    llm = MagicMock()
    llm.estimate_tokens = MagicMock(return_value=100)
    llm.max_context_tokens = 11000
    llm.call = MagicMock(
        return_value='{"text":"Brief summary","bullets":["Detail A","Detail B"]}'
    )
    return llm


@pytest.fixture
def mock_db() -> MagicMock:
    db = MagicMock()
    db.submissions = MagicMock()
    db.task_queue = MagicMock()
    db.list_collection_names = MagicMock(return_value=["llm_cache"])
    db.llm_cache = MagicMock()
    return db


# =============================================================================
# _LLMAdapter
# =============================================================================


def test_llm_adapter_model_id_returns_none_when_missing() -> None:
    class DummyClient:
        pass

    adapter = _LLMAdapter(DummyClient())
    assert adapter.model_id is None


def test_llm_adapter_model_id_returns_value_when_present() -> None:
    client = MagicMock()
    client.model_id = "test-model"
    adapter = _LLMAdapter(client)
    assert adapter.model_id == "test-model"


def test_llm_adapter_call_delegates_to_client() -> None:
    client = MagicMock()
    client.call = MagicMock(return_value="response")
    adapter = _LLMAdapter(client)
    assert adapter.call("prompt", 0.5) == "response"
    client.call.assert_called_once_with(["prompt"], temperature=0.5)


# =============================================================================
# _ValidatedCachingLLMCallable
# =============================================================================


def test_validated_cache_bypasses_for_nonzero_temperature() -> None:
    inner = MagicMock()
    inner.call.return_value = "response"
    store = MagicMock()

    cached_llm = _ValidatedCachingLLMCallable(
        inner,
        store,
        namespace="test",
        validator=lambda x: True,
    )
    # Patch _should_cache to return False
    with patch.object(cached_llm, "_should_cache", return_value=False):
        response = cached_llm.call("prompt", 0.8)

    assert response == "response"
    store.get.assert_not_called()
    store.set.assert_not_called()


def test_validated_cache_returns_cached_valid_response() -> None:
    inner = MagicMock()
    store = MagicMock()
    store.get.return_value = MagicMock(response='{"text":"Cached","bullets":["A"]}')

    cached_llm = _ValidatedCachingLLMCallable(
        inner,
        store,
        namespace="test",
        validator=_is_valid_article_summary_response,
    )
    response = cached_llm.call("prompt", 0.0)

    assert response == '{"text":"Cached","bullets":["A"]}'
    inner.call.assert_not_called()
    store.set.assert_not_called()


# =============================================================================
# _cache_namespace
# =============================================================================


def test_cache_namespace_includes_model_id() -> None:
    client = MagicMock()
    client.model_id = "model-42"
    assert _cache_namespace("base", client) == "base:model-42"


def test_cache_namespace_fallback_to_unknown() -> None:
    class DummyClient:
        pass

    assert _cache_namespace("base", DummyClient()) == "base:unknown"


# =============================================================================
# _normalize_article_summary
# =============================================================================


def test_normalize_article_summary_non_dict_input() -> None:
    assert _normalize_article_summary("not a dict") == {"text": "", "bullets": []}


def test_normalize_article_summary_non_str_text() -> None:
    assert _normalize_article_summary({"text": 123, "bullets": []}) == {
        "text": "123",
        "bullets": [],
    }


def test_normalize_article_summary_non_list_bullets() -> None:
    assert _normalize_article_summary({"text": "", "bullets": "single"}) == {
        "text": "",
        "bullets": ["single"],
    }


def test_normalize_article_summary_falsy_bullets() -> None:
    assert _normalize_article_summary({"text": "", "bullets": None}) == {
        "text": "",
        "bullets": [],
    }


def test_normalize_article_summary_non_str_bullet() -> None:
    assert _normalize_article_summary({"text": "", "bullets": ["ok", 123, None]}) == {
        "text": "",
        "bullets": ["ok", "123"],
    }


def test_normalize_article_summary_deduplicates_bullets() -> None:
    assert _normalize_article_summary(
        {"text": "t", "bullets": ["a", "a", "- a", "* a"]}
    ) == {"text": "t", "bullets": ["a"]}


# =============================================================================
# _truncate_words
# =============================================================================


def test_truncate_words_empty_string() -> None:
    assert _truncate_words("", 10) == ""


def test_truncate_words_none() -> None:
    assert _truncate_words(None, 10) == ""  # type: ignore[arg-type]


def test_truncate_words_within_limit() -> None:
    assert _truncate_words("short text", 10) == "short text"


def test_truncate_words_trailing_punctuation() -> None:
    assert _truncate_words("one two three", 2) == "one two"


# =============================================================================
# _build_extractive_article_summary
# =============================================================================


def test_build_extractive_article_summary_all_empty_sentences() -> None:
    assert _build_extractive_article_summary(["", "   ", "\t"]) == {
        "text": "",
        "bullets": [],
    }


def test_build_extractive_article_summary_limits_bullets_to_six() -> None:
    sentences = [f"Sentence {i} with enough words here." for i in range(10)]
    result = _build_extractive_article_summary(sentences)
    assert len(result["bullets"]) == 6


# =============================================================================
# _fallback_merge_article_summary
# =============================================================================


def test_fallback_merge_limits_bullets_to_six() -> None:
    summaries = []
    for i in range(10):
        summaries.append(
            {
                "start_sentence": i + 1,
                "end_sentence": i + 1,
                "summary": {
                    "text": f"Text {i}",
                    "bullets": [f"Bullet {i}-{j}" for j in range(10)],
                },
            }
        )
    result = _fallback_merge_article_summary(summaries)
    assert len(result["bullets"]) == 6


def test_fallback_merge_uses_first_bullet_when_no_text() -> None:
    chunk_summaries = [
        {
            "start_sentence": 1,
            "end_sentence": 1,
            "summary": {"text": "", "bullets": ["First bullet here."]},
        }
    ]
    result = _fallback_merge_article_summary(chunk_summaries)
    assert result["text"] == "First bullet here."


def test_fallback_merge_breaks_early_at_six_bullets() -> None:
    chunk_summaries = [
        {
            "start_sentence": 1,
            "end_sentence": 2,
            "summary": {
                "text": "T1",
                "bullets": ["B1", "B2", "B3", "B4", "B5", "B6", "B7"],
            },
        },
        {
            "start_sentence": 3,
            "end_sentence": 4,
            "summary": {"text": "T2", "bullets": ["B8"]},
        },
    ]
    result = _fallback_merge_article_summary(chunk_summaries)
    assert len(result["bullets"]) == 6
    assert "B8" not in result["bullets"]


# =============================================================================
# parse_article_summary_response
# =============================================================================


def test_parse_article_summary_response_empty_string() -> None:
    assert parse_article_summary_response("") == {"text": "", "bullets": []}


def test_parse_article_summary_response_regex_match_then_json_fail() -> None:
    response = "Some text {invalid json here} more text"
    assert parse_article_summary_response(response) == {"text": "", "bullets": []}


# =============================================================================
# _response_preview
# =============================================================================


def test_response_preview_within_limit() -> None:
    assert _response_preview("short") == "short"


def test_response_preview_truncates() -> None:
    long_text = "a" * 600
    assert _response_preview(long_text) == "a" * 500 + "..."


def test_response_preview_strips_fences() -> None:
    assert _response_preview('```json\n{"text":"x"}\n```') == '{"text":"x"}'


# =============================================================================
# _summary_overlaps_source
# =============================================================================


def test_summary_overlaps_source_empty_source() -> None:
    assert _summary_overlaps_source("summary", [], 0.2) is True


def test_summary_overlaps_source_empty_summary() -> None:
    assert _summary_overlaps_source("", ["source sentence"], 0.2) is False


def test_summary_overlaps_source_high_overlap() -> None:
    assert (
        _summary_overlaps_source("source sentence here", ["source sentence"], 0.2)
        is True
    )


def test_summary_overlaps_source_low_overlap() -> None:
    assert (
        _summary_overlaps_source("completely different words", ["source sentence"], 0.2)
        is False
    )


def test_summary_overlaps_source_ignores_short_words() -> None:
    assert _summary_overlaps_source("a an the cat", ["cat"], 0.2) is True


# =============================================================================
# build_article_summary_chunks
# =============================================================================


def test_build_article_summary_chunks_empty_sentences() -> None:
    llm = MagicMock()
    assert build_article_summary_chunks([], llm) == []


def test_build_article_summary_chunks_single_sentence_too_big() -> None:
    """When one sentence exceeds max_chunk_tokens, it should still be included."""
    llm = MagicMock()
    llm.estimate_tokens = MagicMock(return_value=100)
    llm.max_context_tokens = 250
    chunks = build_article_summary_chunks(["one"], llm, max_output_tokens_buffer=10)
    assert len(chunks) == 1
    assert chunks[0]["sentences"] == ["one"]


def test_build_article_summary_chunks_next_start_idx_equals_start() -> None:
    """Trigger the next_start_idx <= start_idx branch."""
    llm = MagicMock()
    llm.estimate_tokens = MagicMock(return_value=1)
    llm.max_context_tokens = 10
    # With tiny max_context, overlap logic should trigger
    chunks = build_article_summary_chunks(
        ["S1", "S2", "S3", "S4"], llm, overlap_sentences=5, max_output_tokens_buffer=1
    )
    assert len(chunks) > 0


# =============================================================================
# _parallel_summarize_sentence_groups
# =============================================================================


def test_parallel_summarize_sentence_groups_basic() -> None:
    llm = MagicMock()
    llm.submit = MagicMock(
        side_effect=lambda prompt, temp: MockFuture(f"Summary for {prompt[:20]}")
    )
    sentences = ["First.", "Second."]
    summaries, mappings = _parallel_summarize_sentence_groups(sentences, llm)
    assert len(summaries) == 2
    assert len(mappings) == 2
    assert mappings[0]["source_sentences"] == [1]


def test_parallel_summarize_sentence_groups_skips_empty_response() -> None:
    llm = MagicMock()
    llm.submit = MagicMock(side_effect=[MockFuture(""), MockFuture("Valid")])
    sentences = ["First.", "Second."]
    summaries, mappings = _parallel_summarize_sentence_groups(sentences, llm)
    assert len(summaries) == 1
    assert len(mappings) == 1
    assert mappings[0]["source_sentences"] == [2]


# =============================================================================
# _parallel_generate_article_summary
# =============================================================================


def test_parallel_generate_article_summary_empty_chunks() -> None:
    llm = MagicMock()
    llm.estimate_tokens = MagicMock(return_value=1)
    llm.max_context_tokens = 1000
    with patch("lib.tasks.summarization.build_article_summary_chunks", return_value=[]):
        result = _parallel_generate_article_summary(["S1"], llm)
    assert result == {"text": "", "bullets": []}


def test_parallel_generate_article_summary_single_chunk() -> None:
    llm = MagicMock()
    llm.estimate_tokens = MagicMock(return_value=1)
    llm.max_context_tokens = 1000
    llm.submit = MagicMock(return_value=MockFuture('{"text":"Chunk","bullets":["A"]}'))
    llm.call = MagicMock(return_value='{"text":"Chunk","bullets":["A"]}')

    result = _parallel_generate_article_summary(["S1", "S2"], llm, max_attempts=2)
    assert result == {"text": "Chunk", "bullets": ["A"]}


def test_parallel_generate_article_summary_merge_success() -> None:
    llm = MagicMock()
    llm.estimate_tokens = MagicMock(return_value=1)
    llm.max_context_tokens = 1000
    llm.submit = MagicMock(
        side_effect=[
            MockFuture('{"text":"C1","bullets":["A"]}'),
            MockFuture('{"text":"C2","bullets":["B"]}'),
            MockFuture('{"text":"C3","bullets":["C"]}'),
            MockFuture('{"text":"C4","bullets":["D"]}'),
        ]
    )
    llm.call = MagicMock(return_value='{"text":"Merged","bullets":["A","B","C","D"]}')

    result = _parallel_generate_article_summary(
        ["S1", "S2", "S3", "S4"], llm, overlap_sentences=0, max_attempts=2
    )
    assert result == {"text": "Merged", "bullets": ["A", "B", "C", "D"]}


# =============================================================================
# generate_article_summary
# =============================================================================


def test_generate_article_summary_empty_chunks() -> None:
    cached_llm = MagicMock()
    mock_llm = MagicMock()
    with patch("lib.tasks.summarization.build_article_summary_chunks", return_value=[]):
        result = generate_article_summary(["S1"], cached_llm, mock_llm)
    assert result == {"text": "", "bullets": []}


def test_generate_article_summary_low_source_overlap_warning(
    mock_llm: MagicMock, caplog: pytest.LogCaptureFixture
) -> None:
    cached_llm = MagicMock()
    cached_llm.call.return_value = (
        '{"text":"completely alien terminology","bullets":["A"]}'
    )

    with patch("lib.tasks.summarization.build_article_summary_chunks") as mock_chunks:
        mock_chunks.return_value = [
            {"sentences": ["S1 about python"], "start_sentence": 1, "end_sentence": 1},
        ]
        with caplog.at_level(logging.WARNING):
            generate_article_summary(["S1 about python"], cached_llm, mock_llm)

    assert "low source overlap" in caplog.text.lower()


def test_generate_article_summary_merge_fallback_after_retries(
    mock_llm: MagicMock,
) -> None:
    cached_llm = MagicMock()
    cached_llm.call.return_value = "bad json"
    mock_llm.call = MagicMock(return_value="still bad")

    with patch("lib.tasks.summarization.build_article_summary_chunks") as mock_chunks:
        mock_chunks.return_value = [
            {"sentences": ["S1"], "start_sentence": 1, "end_sentence": 1},
            {"sentences": ["S2"], "start_sentence": 2, "end_sentence": 2},
        ]

        result = generate_article_summary(
            ["S1", "S2"], cached_llm, mock_llm, max_attempts=2
        )

    assert result["text"] != ""


# =============================================================================
# build_topic_tree with subtopics
# =============================================================================


def test_build_topic_tree_with_subtopics() -> None:
    topics = [{"name": "A", "sentences": [1, 2]}]
    subtopics = [{"parent_topic": "A", "name": "B", "sentences": [2, 3]}]
    root = build_topic_tree(topics, subtopics, 3)
    index = topic_tree_to_flat_index(root)
    assert "A" in index
    assert "A>B" in index
    assert index["A>B"]["source_sentences"] == [2, 3]


def test_build_topic_tree_skips_no_topic_subtopic() -> None:
    topics = [{"name": "A", "sentences": [1]}]
    subtopics = [{"parent_topic": "no_topic", "name": "B", "sentences": [2]}]
    root = build_topic_tree(topics, subtopics, 2)
    index = topic_tree_to_flat_index(root)
    assert "A>B" not in index


def test_build_topic_tree_skips_empty_subtopic_name() -> None:
    topics = [{"name": "A", "sentences": [1]}]
    subtopics = [{"parent_topic": "A", "name": "", "sentences": [2]}]
    root = build_topic_tree(topics, subtopics, 2)
    index = topic_tree_to_flat_index(root)
    assert "A>" not in index


def test_build_topic_tree_reuses_existing_leaf() -> None:
    topics = [{"name": "A>B", "sentences": [1]}]
    subtopics = [{"parent_topic": "A", "name": "B", "sentences": [2]}]
    root = build_topic_tree(topics, subtopics, 2)
    index = topic_tree_to_flat_index(root)
    assert index["A>B"]["source_sentences"] == [1, 2]


# =============================================================================
# _group_children_for_merge
# =============================================================================


def test_group_children_for_merge_splits_groups() -> None:
    llm = MagicMock()
    llm.estimate_tokens = MagicMock(return_value=500)
    llm.max_context_tokens = 2000
    records = [
        {
            "start_sentence": 1,
            "end_sentence": 1,
            "summary": {"text": "A", "bullets": []},
        },
        {
            "start_sentence": 2,
            "end_sentence": 2,
            "summary": {"text": "B", "bullets": []},
        },
    ]
    groups = _group_children_for_merge(records, llm)
    # With template tokens also estimated at 500, max_chunk_tokens = 2000 - 500 - 1200 = 300
    # Each record is 500 tokens, so each gets its own group
    assert len(groups) == 2


def test_group_children_for_merge_single_record_per_group() -> None:
    llm = MagicMock()
    llm.estimate_tokens = MagicMock(return_value=1000)
    llm.max_context_tokens = 2000
    records = [
        {
            "start_sentence": 1,
            "end_sentence": 1,
            "summary": {"text": "A", "bullets": []},
        },
        {
            "start_sentence": 2,
            "end_sentence": 2,
            "summary": {"text": "B", "bullets": []},
        },
    ]
    groups = _group_children_for_merge(records, llm)
    assert len(groups) == 2


# =============================================================================
# _run_merge
# =============================================================================


def test_run_merge_succeeds_on_first_attempt() -> None:
    primary = MagicMock(return_value='{"text":"Merged","bullets":["A"]}')
    retry = MagicMock()
    records = [
        {
            "start_sentence": 1,
            "end_sentence": 1,
            "summary": {"text": "A", "bullets": []},
        },
    ]
    result = _run_merge(records, primary, retry, max_attempts=2)
    assert result == {"text": "Merged", "bullets": ["A"]}
    retry.assert_not_called()


def test_run_merge_retries_then_fallbacks() -> None:
    primary = MagicMock(return_value="bad json")
    retry = MagicMock(return_value="still bad")
    records = [
        {
            "start_sentence": 1,
            "end_sentence": 1,
            "summary": {"text": "A", "bullets": []},
        },
    ]
    result = _run_merge(records, primary, retry, max_attempts=2)
    assert result["text"] == "A"


# =============================================================================
# _merge_records_recursively
# =============================================================================


def test_merge_records_recursively_single_record() -> None:
    records = [
        {
            "start_sentence": 1,
            "end_sentence": 1,
            "summary": {"text": "A", "bullets": []},
        },
    ]
    primary = MagicMock()
    retry = MagicMock()
    llm = MagicMock()
    result = _merge_records_recursively(records, primary, retry, llm, max_attempts=2)
    assert result == {"text": "A", "bullets": []}


def test_merge_records_recursively_multiple_groups() -> None:
    llm = MagicMock()
    records = [
        {
            "start_sentence": 1,
            "end_sentence": 1,
            "summary": {"text": "A", "bullets": ["b1"]},
        },
        {
            "start_sentence": 2,
            "end_sentence": 2,
            "summary": {"text": "B", "bullets": ["b2"]},
        },
    ]
    primary = MagicMock(return_value='{"text":"Merged","bullets":["b1","b2"]}')
    retry = MagicMock()

    with patch("lib.tasks.summarization._group_children_for_merge") as mock_group:
        mock_group.side_effect = [
            [[records[0]], [records[1]]],
            [[records[0], records[1]]],
        ]
        result = _merge_records_recursively(
            records, primary, retry, llm, max_attempts=2
        )

    assert result == {"text": "Merged", "bullets": ["b1", "b2"]}


# =============================================================================
# _children_to_records
# =============================================================================


def test_children_to_records_empty_source_sentences() -> None:
    from lib.tasks.summarization import TopicNode

    children = [TopicNode(path="A", name="A", level=1, source_sentences=[])]
    records = _children_to_records(children)
    assert records[0]["start_sentence"] == 0
    assert records[0]["end_sentence"] == 0
    assert records[0]["summary"] == {"text": "", "bullets": []}


# =============================================================================
# _parallel_summarize_topic_tree
# =============================================================================


def test_parallel_summarize_topic_tree_leaf_only() -> None:
    from lib.tasks.summarization import TopicNode

    root = TopicNode(path="", name="", level=0)
    leaf = TopicNode(path="A", name="A", level=1, source_sentences=[1])
    root.children.append(leaf)

    llm = MagicMock()
    llm.estimate_tokens = MagicMock(return_value=1)
    llm.max_context_tokens = 1000
    llm.submit = MagicMock(return_value=MockFuture('{"text":"Leaf","bullets":["A"]}'))
    llm.call = MagicMock(return_value='{"text":"Leaf","bullets":["A"]}')

    _parallel_summarize_topic_tree(root, ["Sentence one."], llm)
    assert leaf.summary == {"text": "Leaf", "bullets": ["A"]}


def test_parallel_summarize_topic_tree_single_child_inherits() -> None:
    from lib.tasks.summarization import TopicNode

    root = TopicNode(path="", name="", level=0)
    child = TopicNode(path="A", name="A", level=1, source_sentences=[1])
    child.summary = {"text": "Child", "bullets": ["B"]}
    root.children.append(child)

    llm = MagicMock()
    llm.estimate_tokens = MagicMock(return_value=1)
    llm.max_context_tokens = 1000
    llm.submit = MagicMock(return_value=MockFuture('{"text":"Leaf","bullets":["B"]}'))
    llm.call = MagicMock(return_value='{"text":"Leaf","bullets":["B"]}')

    with patch(
        "lib.tasks.summarization._parallel_generate_article_summary",
        return_value={"text": "Child", "bullets": ["B"]},
    ):
        _parallel_summarize_topic_tree(root, ["Sentence one."], llm)

    assert root.summary == {"text": "Child", "bullets": ["B"]}


def test_parallel_summarize_topic_tree_multiple_children_merged() -> None:
    from lib.tasks.summarization import TopicNode

    root = TopicNode(path="", name="", level=0)
    child_a = TopicNode(path="A", name="A", level=1, source_sentences=[1])
    child_a.summary = {"text": "Child A", "bullets": ["a1"]}
    child_b = TopicNode(path="B", name="B", level=1, source_sentences=[2])
    child_b.summary = {"text": "Child B", "bullets": ["b1"]}
    root.children.append(child_a)
    root.children.append(child_b)

    llm = MagicMock()
    llm.estimate_tokens = MagicMock(return_value=1)
    llm.max_context_tokens = 1000
    llm.submit = MagicMock(return_value=MockFuture('{"text":"Leaf","bullets":["L"]}'))
    llm.call = MagicMock(return_value='{"text":"Merged","bullets":["a1","b1"]}')

    def mock_group_children(records, llm_client):
        if len(records) == 2 and records[0]["summary"]["text"] == "Child A":
            return [[records[0]], [records[1]]]
        return [records]

    with patch(
        "lib.tasks.summarization._group_children_for_merge",
        side_effect=mock_group_children,
    ):
        _parallel_summarize_topic_tree(root, ["S1", "S2"], llm)

    assert root.summary == {"text": "Merged", "bullets": ["a1", "b1"]}


def test_parallel_summarize_topic_tree_no_children_uses_all_sentences() -> None:
    """When root has no children, source_sentences should cover all sentences."""
    root = build_topic_tree([], [], 3)
    assert root.source_sentences == [1, 2, 3]


# =============================================================================
# process_summarization - QueuedLLMClient path
# =============================================================================


def test_process_summarization_parallel_path(mock_db: MagicMock) -> None:
    submission = {
        "submission_id": "test-123",
        "results": {
            "sentences": ["S1", "S2"],
            "topics": [{"name": "Topic", "sentences": [1, 2]}],
        },
    }

    llm = QueuedLLMClient(
        store=object(),
        model_id="queued-model",
        max_context_tokens=4000,
    )
    llm.with_namespace = lambda namespace, prompt_version=None: llm  # type: ignore[method-assign]
    llm.submit = MagicMock(return_value=MockFuture("Summary sentence"))
    llm.call = MagicMock(return_value='{"text":"Article","bullets":["B1","B2"]}')
    llm.estimate_tokens = MagicMock(return_value=1)

    with patch("lib.tasks.summarization.SubmissionsStorage") as mock_storage:
        mock_storage_instance = MagicMock()
        mock_storage.return_value = mock_storage_instance
        process_summarization(submission, mock_db, llm)

        update_call = mock_storage_instance.update_results.call_args
        assert "summary" in update_call[0][1]
        assert update_call[0][1]["article_summary"] == {
            "text": "Article",
            "bullets": ["B1", "B2"],
        }


# =============================================================================
# process_summarization - cache_store path
# =============================================================================


def test_process_summarization_with_cache_store(
    mock_db: MagicMock, mock_llm: MagicMock
) -> None:
    submission = {
        "submission_id": "test-123",
        "results": {"sentences": ["S1"], "topics": []},
    }

    cache_store = MagicMock()
    cache_store.get.return_value = None

    with patch("lib.tasks.summarization.CachingLLMCallable") as mock_caching:
        with patch(
            "lib.tasks.summarization._ValidatedCachingLLMCallable"
        ) as mock_validated:
            with patch("lib.tasks.summarization.SubmissionsStorage") as mock_storage:
                mock_storage_instance = MagicMock()
                mock_storage.return_value = mock_storage_instance

                mock_caching_instance = MagicMock()
                mock_caching_instance.call = MagicMock(return_value="Summary")
                mock_caching.return_value = mock_caching_instance

                mock_validated_instance = MagicMock()
                mock_validated_instance.call = MagicMock(
                    return_value='{"text":"Article","bullets":["B"]}'
                )
                mock_validated.return_value = mock_validated_instance

                with patch(
                    "lib.tasks.summarization.summarize_by_sentence_groups"
                ) as mock_sum:
                    mock_sum.return_value = (["Summary"], [])

                    def mock_tree_summarizer(root, sentences, cached_llm, llm):
                        root.summary = {"text": "Summary", "bullets": ["Bullet 1"]}

                    with patch(
                        "lib.tasks.summarization.summarize_topic_tree",
                        side_effect=mock_tree_summarizer,
                    ):
                        process_summarization(
                            submission, mock_db, mock_llm, cache_store=cache_store
                        )

                        mock_caching.assert_called_once()
                        mock_validated.assert_called_once()


# =============================================================================
# topic_tree_to_dict / topic_tree_to_flat_index
# =============================================================================


def test_topic_tree_to_flat_index_includes_root() -> None:
    root = build_topic_tree([{"name": "A", "sentences": [1]}], [], 1)
    index = topic_tree_to_flat_index(root)
    assert "" in index
    assert "A" in index


# =============================================================================
# summarize_topic_tree
# =============================================================================


def test_summarize_topic_tree_leaf_with_no_valid_sentences() -> None:
    from lib.tasks.summarization import TopicNode

    root = TopicNode(path="", name="", level=0)
    leaf = TopicNode(path="A", name="A", level=1, source_sentences=[100])
    root.children.append(leaf)

    cached_llm = MagicMock()
    mock_llm = MagicMock()
    summarize_topic_tree(root, ["S1"], cached_llm, mock_llm)
    assert leaf.summary == {"text": "", "bullets": []}


def test_summarize_topic_tree_single_child_inherits() -> None:
    from lib.tasks.summarization import TopicNode

    root = TopicNode(path="", name="", level=0)
    child = TopicNode(path="A", name="A", level=1, source_sentences=[1])
    child.summary = {"text": "Child", "bullets": ["B"]}
    root.children.append(child)

    cached_llm = MagicMock()
    cached_llm.call = MagicMock(return_value='{"text":"Leaf","bullets":["B"]}')
    mock_llm = MagicMock()
    mock_llm.estimate_tokens = MagicMock(return_value=1)
    mock_llm.max_context_tokens = 1000

    with patch(
        "lib.tasks.summarization.generate_article_summary",
        return_value={"text": "Child", "bullets": ["B"]},
    ):
        summarize_topic_tree(root, ["S1"], cached_llm, mock_llm)

    assert root.summary == {"text": "Child", "bullets": ["B"]}


# =============================================================================
# _format_chunk_summaries_for_merge
# =============================================================================


def test_format_chunk_summaries_for_merge_empty_bullets() -> None:
    chunk_summaries = [
        {
            "start_sentence": 1,
            "end_sentence": 1,
            "summary": {"text": "T", "bullets": []},
        },
    ]
    result = _format_chunk_summaries_for_merge(chunk_summaries)
    assert "Bullets:\n-" in result
