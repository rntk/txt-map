"""Unit tests for word_context_highlights helpers."""

from unittest.mock import MagicMock

from lib.tasks.word_context_highlights import (
    _cache_namespace,
    _coerce_partial_spans,
    _encode_partial_spans,
    build_word_context_job_signature,
    process_pending_requests,
    submit_topic_requests,
)


def test_cache_namespace() -> None:
    llm = MagicMock()
    llm.model_id = "provider:model"
    assert (
        _cache_namespace(llm, "Codex") == "word_context_highlights:provider:model:codex"
    )


def test_cache_namespace_special_chars() -> None:
    llm = MagicMock()
    llm.model_id = "provider:model"
    assert _cache_namespace(llm, "C++") == "word_context_highlights:provider:model:c__"


def test_build_word_context_job_signature_stable() -> None:
    llm = MagicMock()
    llm.model_id = "provider:model"
    sig1 = build_word_context_job_signature(llm, "word")
    sig2 = build_word_context_job_signature(llm, "word")
    assert sig1 == sig2
    assert len(sig1) == 64


def test_coerce_partial_spans() -> None:
    raw = {"0": [[1, 3], [5, 7]], "1": [[10, 12]]}
    result = _coerce_partial_spans(raw)
    assert result == {0: [(1, 3), (5, 7)], 1: [(10, 12)]}


def test_coerce_partial_spans_invalid() -> None:
    raw = {"0": [[1, 3]], "bad": "not-a-list", "2": "invalid"}
    result = _coerce_partial_spans(raw)
    assert result == {0: [(1, 3)]}


def test_coerce_partial_spans_not_dict() -> None:
    assert _coerce_partial_spans(None) == {}
    assert _coerce_partial_spans([]) == {}


def test_encode_partial_spans() -> None:
    spans = {0: [(1, 3), (5, 7)], 1: [(10, 12)]}
    result = _encode_partial_spans(spans)
    assert result == {"0": [[1, 3], [5, 7]], "1": [[10, 12]]}


def test_encode_partial_spans_empty_skipped() -> None:
    spans = {0: [(1, 3)], 1: []}
    result = _encode_partial_spans(spans)
    assert "1" not in result


class FakeFuture:
    def __init__(self, pre_done: bool, response: str = "") -> None:
        self._pre_done = pre_done
        self._response = response

    def done(self) -> bool:
        return self._pre_done

    def result(self) -> str:
        return self._response

    @property
    def request_id(self) -> str | None:
        return "req-1" if not self._pre_done else None


class FakeLLM:
    model_id = "provider:model"

    def submit(self, prompt: str, temperature: float = 0.0) -> FakeFuture:
        return FakeFuture(pre_done=False)


def test_submit_topic_requests_skips_empty_topics() -> None:
    queued_llm = FakeLLM()
    topics = [{"name": "Empty", "sentences": []}]
    pending, resolved = submit_topic_requests("word", topics, ["sentence"], queued_llm)
    assert pending == {}
    assert resolved == {}


def test_process_pending_requests_empty() -> None:
    store = MagicMock()
    still_pending, completed = process_pending_requests({}, {}, [], store)
    assert still_pending == {}
    assert completed == {}


def test_process_pending_requests_with_completed_doc() -> None:
    store = MagicMock()
    store.get_results.return_value = [
        {
            "request_id": "req-1",
            "status": "completed",
            "response": "1-3\n5",
        }
    ]
    pending = {
        "TopicA": {
            "chunks": [
                {
                    "request_id": "req-1",
                    "chunk_index": 0,
                    "range_index": 0,
                    "start_word_offset": 1,
                    "word_count": 10,
                }
            ],
            "partial_spans": {},
        }
    }
    topics_by_name = {
        "TopicA": {
            "name": "TopicA",
            "sentences": [1],
            "ranges": [{"sentence_start": 1, "sentence_end": 1}],
        }
    }
    still_pending, completed = process_pending_requests(
        pending, topics_by_name, ["Hello world test sentence."], store
    )
    assert "TopicA" in completed or still_pending == {}
    store.delete_by_ids.assert_called_once_with(["req-1"])
