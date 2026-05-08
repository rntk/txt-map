"""Additional unit tests for word_context_highlights."""

from unittest.mock import MagicMock, patch

from lib.tasks.word_context_highlights import (
    process_pending_requests,
    submit_topic_requests,
)


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


def test_submit_topic_requests_with_done_future() -> None:
    queued_llm = MagicMock()
    future = FakeFuture(pre_done=True, response="1-3\n5")
    queued_llm.submit.return_value = future

    topics = [
        {
            "name": "AI",
            "sentences": [1],
            "ranges": [{"sentence_start": 1, "sentence_end": 1}],
        }
    ]
    sentences = ["Artificial intelligence is transforming industries worldwide."]

    with patch(
        "lib.tasks.word_context_highlights._build_prompt_aware_chunks",
        return_value=[
            MagicMock(
                words=["word"],
                prompt="prompt",
                chunk_index=0,
                start_word_offset=1,
            )
        ],
    ):
        pending, resolved = submit_topic_requests("word", topics, sentences, queued_llm)

    # Future is done, so it should be resolved
    assert pending == {}
    assert "AI" in resolved


def test_submit_topic_requests_with_pending_future() -> None:
    queued_llm = MagicMock()
    future = FakeFuture(pre_done=False)
    queued_llm.submit.return_value = future

    topics = [
        {
            "name": "AI",
            "sentences": [1],
            "ranges": [{"sentence_start": 1, "sentence_end": 1}],
        }
    ]
    sentences = ["Artificial intelligence is transforming industries worldwide."]

    with patch(
        "lib.tasks.word_context_highlights._build_prompt_aware_chunks",
        return_value=[
            MagicMock(
                words=["word"],
                prompt="prompt",
                chunk_index=0,
                start_word_offset=1,
            )
        ],
    ):
        pending, resolved = submit_topic_requests("word", topics, sentences, queued_llm)

    # Future is not done, so it should be pending
    assert "AI" in pending
    assert pending["AI"]["chunks"][0]["request_id"] == "req-1"


def test_submit_topic_requests_future_exception() -> None:
    class BadFuture:
        def done(self) -> bool:
            return True

        def result(self) -> str:
            raise RuntimeError("boom")

        @property
        def request_id(self) -> str | None:
            return None

    queued_llm = MagicMock()
    queued_llm.submit.return_value = BadFuture()

    topics = [
        {
            "name": "AI",
            "sentences": [1],
            "ranges": [{"sentence_start": 1, "sentence_end": 1}],
        }
    ]
    sentences = ["Artificial intelligence is transforming industries worldwide."]

    with (
        patch(
            "lib.tasks.word_context_highlights._build_prompt_aware_chunks",
            return_value=[
                MagicMock(
                    words=["word"],
                    prompt="prompt",
                    chunk_index=0,
                    start_word_offset=1,
                )
            ],
        ),
        patch(
            "lib.tasks.word_context_highlights._finalize_topic_highlights",
            return_value=None,
        ),
    ):
        pending, resolved = submit_topic_requests("word", topics, sentences, queued_llm)

    assert pending == {}
    assert resolved == {}


def test_process_pending_requests_with_failed_doc() -> None:
    store = MagicMock()
    store.get_results.return_value = [
        {
            "request_id": "req-1",
            "status": "failed",
            "error": "LLM error",
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
    with patch(
        "lib.tasks.word_context_highlights._finalize_topic_highlights",
        return_value=None,
    ):
        still_pending, completed = process_pending_requests(
            pending, topics_by_name, ["Hello world test sentence."], store
        )
    assert still_pending == {}
    assert "TopicA" not in completed  # failed docs don't produce completed highlights
    store.delete_by_ids.assert_called_once_with(["req-1"])


def test_process_pending_requests_remaining_chunks() -> None:
    store = MagicMock()
    store.get_results.return_value = [
        {
            "request_id": "req-1",
            "status": "completed",
            "response": "1-3\n5",
        },
        {
            "request_id": "req-2",
            "status": "pending",
        },
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
                },
                {
                    "request_id": "req-2",
                    "chunk_index": 1,
                    "range_index": 0,
                    "start_word_offset": 11,
                    "word_count": 10,
                },
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
    assert "TopicA" in still_pending
    assert "TopicA" not in completed


def test_process_pending_requests_missing_topic() -> None:
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
    topics_by_name = {}  # TopicA not found
    still_pending, completed = process_pending_requests(
        pending, topics_by_name, ["Hello world test sentence."], store
    )
    assert still_pending == {}
    assert completed == {}
