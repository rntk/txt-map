"""Unit tests for uncovered branches in topic marker summary generation."""

from unittest.mock import MagicMock, patch

from lib.tasks.topic_marker_summary_generation import (
    TOPIC_MARKER_SUMMARY_CORRECTION_TEMPLATE,
    _build_fallback_marker_spans,
    _build_marker_span_payload,
    _build_topic_marker_summary_prompt,
    _cache_namespace,
    _call_llm_cached,
    _generate_marker_spans_for_chunk,
    _generate_marker_spans_for_chunk_from_response,
    _generate_marker_summary_for_range,
    _generate_marker_summary_from_response,
    _offset_spans,
    _parse_marker_output,
    _process_all_topics_parallel,
    _process_topic,
    _select_merged_marker_spans,
    _strip_markdown_fences,
    _submit_marker_summary_request,
    process_topic_marker_summary_generation,
)
from lib.tasks.markup_generation import PromptChunk, TopicRange


class MockLLM:
    """Simple mock LLM for sequential task tests."""

    model_id = "mock-model"

    def __init__(self, response: str = "1-2\n4") -> None:
        self._response = response
        self.prompts: list[str] = []

    def call(self, prompts: list[str], temperature: float = 0.0) -> str:
        del temperature
        self.prompts.append(prompts[0])
        return self._response


class SequencedLLM:
    """Mock LLM that returns responses in sequence."""

    model_id = "sequenced-model"

    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.prompts: list[str] = []

    def call(self, prompts: list[str], temperature: float = 0.0) -> str:
        del temperature
        self.prompts.append(prompts[0])
        if self.responses:
            return self.responses.pop(0)
        return "1"


class MockFuture:
    """Resolved future for queued LLM tests."""

    def __init__(self, value: str) -> None:
        self._value = value

    def result(self, timeout: float | None = None) -> str:
        del timeout
        return self._value


def make_topic_range(text: str = "Alpha beta gamma delta.") -> TopicRange:
    return TopicRange(
        range_index=1,
        sentence_start=1,
        sentence_end=1,
        text=text,
    )


def make_prompt_chunk(
    clean_text: str = "Alpha beta gamma delta.",
    words: tuple[str, ...] = ("Alpha", "beta", "gamma", "delta."),
    start_word_offset: int = 1,
    prompt: str | None = None,
) -> PromptChunk:
    if prompt is None:
        prompt = _build_topic_marker_summary_prompt(
            "Topic A", clean_text, "Alpha{{1}} beta{{2}} gamma{{3}} delta.{{4}}"
        )
    return PromptChunk(
        chunk_index=1,
        clean_text=clean_text,
        words=words,
        prompt=prompt,
        start_word_offset=start_word_offset,
    )


# =============================================================================
# _cache_namespace
# =============================================================================


def test_cache_namespace_uses_model_id() -> None:
    llm = MockLLM()
    assert _cache_namespace(llm) == "topic_marker_summary_generation:mock-model"


def test_cache_namespace_unknown_when_no_model_id() -> None:
    assert _cache_namespace(object()) == "topic_marker_summary_generation:unknown"


# =============================================================================
# _call_llm_cached
# =============================================================================


def test_call_llm_cached_without_cache_store() -> None:
    llm = MockLLM(response="cached response")
    result = _call_llm_cached("prompt", llm, cache_store=None, namespace="ns")
    assert result == "cached response"


def test_call_llm_cached_cache_hit() -> None:
    llm = MockLLM(response="new response")
    cache_store = MagicMock()
    cache_store.get.return_value = MagicMock(response="cached response")

    result = _call_llm_cached("prompt", llm, cache_store=cache_store, namespace="ns")

    assert result == "cached response"
    cache_store.get.assert_called_once()
    cache_store.set.assert_not_called()


def test_call_llm_cached_cache_miss() -> None:
    llm = MockLLM(response="new response")
    cache_store = MagicMock()
    cache_store.get.return_value = None

    result = _call_llm_cached("prompt", llm, cache_store=cache_store, namespace="ns")

    assert result == "new response"
    cache_store.get.assert_called_once()
    cache_store.set.assert_called_once()


def test_call_llm_cached_skips_read_when_flag_set() -> None:
    llm = MockLLM(response="new response")
    cache_store = MagicMock()
    cache_store.get.return_value = MagicMock(response="cached response")

    result = _call_llm_cached(
        "prompt", llm, cache_store=cache_store, namespace="ns", skip_cache_read=True
    )

    assert result == "new response"
    cache_store.get.assert_not_called()
    cache_store.set.assert_called_once()


# =============================================================================
# _strip_markdown_fences
# =============================================================================


def test_strip_markdown_fences_removes_fence() -> None:
    text = "```\n1-2\n4\n```"
    assert _strip_markdown_fences(text) == "1-2\n4"


def test_strip_markdown_fences_with_language_tag() -> None:
    text = "```python\n1-2\n4\n```"
    assert _strip_markdown_fences(text) == "1-2\n4"


def test_strip_markdown_fences_no_fence() -> None:
    assert _strip_markdown_fences("1-2\n4") == "1-2\n4"


def test_strip_markdown_fences_none_input() -> None:
    assert _strip_markdown_fences(None) == ""  # type: ignore[arg-type]


# =============================================================================
# _parse_marker_output
# =============================================================================


def test_parse_marker_output_with_empty_lines() -> None:
    assert _parse_marker_output("1-2\n\n4") == [(1, 2), (4, 4)]


def test_parse_marker_output_none_in_middle() -> None:
    assert _parse_marker_output("1-2\nNONE\n4") == []


def test_parse_marker_output_strips_fences() -> None:
    assert _parse_marker_output("```\n1-2\n4\n```") == [(1, 2), (4, 4)]


# =============================================================================
# _build_marker_span_payload
# =============================================================================


def test_build_marker_span_payload_skips_empty_text() -> None:
    words = ["Alpha", "", "gamma"]
    spans = [(1, 1), (2, 2), (3, 3)]
    payload = _build_marker_span_payload(words, spans)
    assert payload == [
        {"start_word": 1, "end_word": 1, "text": "Alpha"},
        {"start_word": 3, "end_word": 3, "text": "gamma"},
    ]


# =============================================================================
# _offset_spans
# =============================================================================


def test_offset_spans_applies_offset() -> None:
    assert _offset_spans([(1, 2), (4, 4)], 10) == [(10, 11), (13, 13)]


def test_offset_spans_start_one() -> None:
    assert _offset_spans([(1, 1)], 1) == [(1, 1)]


# =============================================================================
# _select_merged_marker_spans
# =============================================================================


def test_select_merged_marker_spans_trims_to_max_spans() -> None:
    words = ["w" + str(i) for i in range(1, 21)]
    clean_text = " ".join(words)
    spans = [(i, i) for i in range(1, 21)]

    with patch(
        "lib.tasks.topic_marker_summary_generation.normalize_text_tokens",
        side_effect=lambda t: t.lower().split(),
    ):
        selected = _select_merged_marker_spans(spans, words, clean_text, max_spans=6)

    assert len(selected) == 6
    # Should be sorted by position
    assert selected == sorted(selected, key=lambda s: (s[0], s[1]))


def test_select_merged_marker_spans_no_trimming_needed() -> None:
    words = ["Alpha", "beta", "gamma"]
    clean_text = "Alpha beta gamma"
    spans = [(1, 1), (3, 3)]

    selected = _select_merged_marker_spans(spans, words, clean_text, max_spans=6)
    assert selected == [(1, 1), (3, 3)]


def test_select_merged_marker_spans_skips_overlapping_in_greedy_selection() -> None:
    words = ["a", "b", "a", "c", "d", "e"]
    clean_text = "a b a c d e"
    spans = [(1, 2), (2, 3), (4, 5)]

    with patch(
        "lib.tasks.topic_marker_summary_generation.normalize_text_tokens",
        side_effect=lambda t: t.lower().split(),
    ):
        selected = _select_merged_marker_spans(spans, words, clean_text, max_spans=6)

    # (1,2) and (2,3) both score 3; tie-breaker is start position so (1,2) is picked first.
    # (2,3) overlaps with (1,2) and must be skipped.
    assert selected == [(1, 2), (4, 5)]


# =============================================================================
# _build_fallback_marker_spans
# =============================================================================


def test_build_fallback_marker_spans_returns_top_tokens() -> None:
    words = ["Alpha", "beta", "Alpha", "gamma", "beta", "Alpha"]
    clean_text = "Alpha beta Alpha gamma beta Alpha"

    with patch(
        "lib.tasks.topic_marker_summary_generation.normalize_text_tokens",
        side_effect=lambda t: [t.lower()] if t else [],
    ):
        spans = _build_fallback_marker_spans(words, clean_text)

    assert len(spans) <= 6
    assert all(1 <= start <= end <= len(words) for start, end in spans)
    # alpha appears most frequently at positions 1, 3, 6
    assert (1, 1) in spans


def test_build_fallback_marker_spans_empty_tokens() -> None:
    with patch(
        "lib.tasks.topic_marker_summary_generation.normalize_text_tokens",
        return_value=[],
    ):
        spans = _build_fallback_marker_spans(["a", "b"], "a b")
    assert spans == []


def test_build_fallback_marker_spans_skips_empty_word_tokens() -> None:
    words = ["a", "", "b", "c", "d", "e", "f", "g"]
    clean_text = "a  b c d e f g"

    call_count = 0

    def mock_normalize(text: str) -> list[str]:
        nonlocal call_count
        call_count += 1
        if not text.strip():
            return []
        return [text.lower()]

    with patch(
        "lib.tasks.topic_marker_summary_generation.normalize_text_tokens",
        side_effect=mock_normalize,
    ):
        spans = _build_fallback_marker_spans(words, clean_text)

    # empty word token should be skipped (line 313)
    assert all(start != 2 for start, _ in spans)


def test_build_fallback_marker_spans_breaks_at_six() -> None:
    words = ["a", "b", "c", "d", "e", "f", "g", "h"]
    clean_text = "a b c d e f g h"

    with patch(
        "lib.tasks.topic_marker_summary_generation.normalize_text_tokens",
        side_effect=lambda t: [t.lower()] if t else [],
    ):
        spans = _build_fallback_marker_spans(words, clean_text)

    assert len(spans) == 6


# =============================================================================
# _generate_marker_spans_for_chunk
# =============================================================================


def test_generate_marker_spans_for_chunk_empty_words() -> None:
    chunk = make_prompt_chunk(words=())
    llm = MockLLM()
    result = _generate_marker_spans_for_chunk(
        "Topic A", make_topic_range(), chunk, llm, None, "ns", max_retries=1
    )
    assert result == []


def test_generate_marker_spans_for_chunk_retries_then_falls_back() -> None:
    chunk = make_prompt_chunk()
    llm = SequencedLLM(["bad response", "still bad"])

    with patch(
        "lib.tasks.topic_marker_summary_generation._build_fallback_marker_spans",
        return_value=[(1, 1)],
    ) as mock_fallback:
        result = _generate_marker_spans_for_chunk(
            "Topic A", make_topic_range(), chunk, llm, None, "ns", max_retries=2
        )

    assert result == [(1, 1)]
    mock_fallback.assert_called_once()
    assert len(llm.prompts) == 2
    assert "<previous_attempt>" in llm.prompts[1]
    assert TOPIC_MARKER_SUMMARY_CORRECTION_TEMPLATE in llm.prompts[1]


def test_generate_marker_spans_for_chunk_success_on_retry() -> None:
    chunk = make_prompt_chunk()
    llm = SequencedLLM(["bad response", "1\n3"])

    result = _generate_marker_spans_for_chunk(
        "Topic A", make_topic_range(), chunk, llm, None, "ns", max_retries=2
    )

    assert result == [(1, 1), (3, 3)]
    assert len(llm.prompts) == 2


def test_generate_marker_spans_for_chunk_success_first_attempt() -> None:
    chunk = make_prompt_chunk()
    llm = MockLLM("1-2\n4")
    result = _generate_marker_spans_for_chunk(
        "Topic A", make_topic_range(), chunk, llm, None, "ns", max_retries=1
    )
    assert result == [(1, 2), (4, 4)]


# =============================================================================
# _generate_marker_spans_for_chunk_from_response
# =============================================================================


def test_generate_marker_spans_for_chunk_from_response_empty_words() -> None:
    chunk = make_prompt_chunk(words=())
    llm = MockLLM()
    result = _generate_marker_spans_for_chunk_from_response(
        "Topic A", make_topic_range(), chunk, llm, initial_response="1", max_retries=1
    )
    assert result == []


def test_generate_marker_spans_for_chunk_from_response_bad_then_fallback() -> None:
    chunk = make_prompt_chunk()
    llm = SequencedLLM(["still bad"])

    with patch(
        "lib.tasks.topic_marker_summary_generation._build_fallback_marker_spans",
        return_value=[(2, 2)],
    ) as mock_fallback:
        result = _generate_marker_spans_for_chunk_from_response(
            "Topic A",
            make_topic_range(),
            chunk,
            llm,
            initial_response="bad",
            max_retries=2,
        )

    assert result == [(2, 2)]
    mock_fallback.assert_called_once()
    assert len(llm.prompts) == 1
    assert "<previous_attempt>" in llm.prompts[0]


def test_generate_marker_spans_for_chunk_from_response_success_initial() -> None:
    chunk = make_prompt_chunk()
    llm = MockLLM()
    result = _generate_marker_spans_for_chunk_from_response(
        "Topic A",
        make_topic_range(),
        chunk,
        llm,
        initial_response="1-2\n4",
        max_retries=1,
    )
    assert result == [(1, 2), (4, 4)]


# =============================================================================
# _generate_marker_summary_for_range
# =============================================================================


def test_generate_marker_summary_for_range_empty_words() -> None:
    topic_range = make_topic_range(text="   ")
    llm = MockLLM()
    result = _generate_marker_summary_for_range(
        "Topic A", topic_range, llm, None, "ns", max_retries=1
    )
    assert result == {"marker_spans": [], "summary_text": ""}


def test_generate_marker_summary_for_range_uses_fallback() -> None:
    topic_range = make_topic_range("Alpha beta gamma delta.")
    llm = MockLLM("NONE")

    with patch(
        "lib.tasks.topic_marker_summary_generation._build_fallback_marker_spans",
        return_value=[(1, 1), (3, 3)],
    ):
        result = _generate_marker_summary_for_range(
            "Topic A", topic_range, llm, None, "ns", max_retries=1
        )

    assert result["marker_spans"] == [
        {"start_word": 1, "end_word": 1, "text": "Alpha"},
        {"start_word": 3, "end_word": 3, "text": "gamma"},
    ]
    assert result["summary_text"] == "Alpha gamma"


# =============================================================================
# _submit_marker_summary_request
# =============================================================================


def test_submit_marker_summary_request_no_submit_method() -> None:
    topic_range = make_topic_range("Alpha beta.")
    llm = SequencedLLM([])
    words, cleaned_text, submitted = _submit_marker_summary_request(
        "Topic A", topic_range, llm
    )
    assert words == ["Alpha", "beta."]
    assert cleaned_text == "Alpha beta."
    assert submitted == []


def test_submit_marker_summary_request_skips_empty_chunk() -> None:
    class SubmitLLM:
        model_id = "submit-model"

        def submit(self, prompt: str, temperature: float = 0.0) -> MockFuture:
            return MockFuture("1")

        def estimate_tokens(self, text: str) -> int:
            return len(text) // 4

    topic_range = make_topic_range("Alpha beta.")
    llm = SubmitLLM()
    llm.max_context_tokens = 4000  # type: ignore[attr-defined]

    words, cleaned_text, submitted = _submit_marker_summary_request(
        "Topic A", topic_range, llm
    )

    assert words == ["Alpha", "beta."]
    assert len(submitted) == 1


# =============================================================================
# _generate_marker_summary_from_response
# =============================================================================


def test_generate_marker_summary_from_response_fallback() -> None:
    words = ["Alpha", "beta", "gamma"]
    cleaned_text = "Alpha beta gamma"
    chunk = make_prompt_chunk(clean_text=cleaned_text, words=tuple(words))
    llm = MockLLM("NONE")

    with patch(
        "lib.tasks.topic_marker_summary_generation._build_fallback_marker_spans",
        return_value=[(1, 1)],
    ):
        result = _generate_marker_summary_from_response(
            "Topic A",
            make_topic_range(),
            llm,
            words,
            cleaned_text,
            [(chunk, "NONE")],
            max_retries=1,
        )

    assert result["marker_spans"] == [{"start_word": 1, "end_word": 1, "text": "Alpha"}]
    assert result["summary_text"] == "Alpha"


def test_generate_marker_summary_from_response_success() -> None:
    words = ["Alpha", "beta", "gamma", "delta."]
    cleaned_text = "Alpha beta gamma delta."
    chunk = make_prompt_chunk(clean_text=cleaned_text, words=tuple(words))
    llm = MockLLM("1-2\n4")

    result = _generate_marker_summary_from_response(
        "Topic A",
        make_topic_range(),
        llm,
        words,
        cleaned_text,
        [(chunk, "1-2\n4")],
        max_retries=1,
    )

    assert result["summary_text"] == "Alpha beta delta."


# =============================================================================
# _process_topic
# =============================================================================


def test_process_topic_empty_ranges() -> None:
    topic = {"name": "Empty", "sentences": [], "ranges": []}
    result = _process_topic(topic, ["Only sentence."], MockLLM(), None, "ns", 1)
    assert result == {"ranges": []}


# =============================================================================
# _process_all_topics_parallel
# =============================================================================


def test_process_all_topics_parallel_empty_words() -> None:
    from lib.llm_queue.client import QueuedLLMClient

    llm = QueuedLLMClient(
        store=object(),
        model_id="queued-model",
        max_context_tokens=4000,
    )
    llm.with_namespace = lambda namespace, prompt_version=None: llm  # type: ignore[method-assign]
    llm.submit = lambda prompt, temperature=0.0: MockFuture("1")  # type: ignore[method-assign]
    llm.call = lambda prompts, temperature=0.0: "1"  # type: ignore[method-assign]

    topics = [
        {
            "name": "Topic A",
            "sentences": [1],
            "ranges": [{"sentence_start": 1, "sentence_end": 1}],
        }
    ]
    all_sentences = ["   "]

    result = _process_all_topics_parallel(topics, all_sentences, llm, max_retries=1)

    assert result["Topic A"]["ranges"] == [
        {
            "range_index": 1,
            "sentence_start": 1,
            "sentence_end": 1,
            "marker_spans": [],
            "summary_text": "",
        }
    ]


# =============================================================================
# process_topic_marker_summary_generation
# =============================================================================


def test_process_topic_marker_summary_generation_empty_results() -> None:
    submission = {
        "submission_id": "sub-empty",
        "results": {},
    }

    with patch(
        "lib.tasks.topic_marker_summary_generation.SubmissionsStorage.update_results"
    ) as mock_update:
        process_topic_marker_summary_generation(
            submission=submission,
            db=object(),
            llm=MockLLM(),
        )

    mock_update.assert_called_once_with(
        "sub-empty",
        {"topic_marker_summaries": {}},
    )


def test_process_topic_marker_summary_generation_empty_topics() -> None:
    submission = {
        "submission_id": "sub-empty",
        "results": {
            "sentences": ["One."],
            "topics": [],
        },
    }

    with patch(
        "lib.tasks.topic_marker_summary_generation.SubmissionsStorage.update_results"
    ) as mock_update:
        process_topic_marker_summary_generation(
            submission=submission,
            db=object(),
            llm=MockLLM(),
        )

    mock_update.assert_called_once_with(
        "sub-empty",
        {"topic_marker_summaries": {}},
    )
