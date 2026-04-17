"""Unit tests for topic marker summary generation."""

from unittest.mock import patch

from lib.llm_queue.client import QueuedLLMClient
from lib.tasks.topic_marker_summary_generation import (
    _build_summary_text,
    _normalize_marker_spans,
    _parse_marker_output,
    process_topic_marker_summary_generation,
)


class MockLLM:
    """Simple mock LLM for sequential task tests."""

    model_id = "mock-model"

    def call(self, prompts, temperature=0.0):
        return "1-2\n4"


class MockFuture:
    """Resolved future for queued LLM tests."""

    def __init__(self, value: str) -> None:
        self._value = value

    def result(self, timeout=None) -> str:
        return self._value


def test_parse_marker_output_parses_range_and_point() -> None:
    assert _parse_marker_output("1-2\n4") == [(1, 2), (4, 4)]


def test_parse_marker_output_none_returns_empty_list() -> None:
    assert _parse_marker_output("NONE") == []
    assert _parse_marker_output("") == []


def test_parse_marker_output_invalid_returns_none() -> None:
    assert _parse_marker_output("1-2: bad") is None


def test_normalize_marker_spans_filters_invalid_overlap_and_duplicates() -> None:
    assert _normalize_marker_spans(
        [(3, 2), (1, 1), (1, 1), (1, 3), (3, 4), (7, 7)],
        word_count=4,
    ) == [(1, 1), (3, 4)]


def test_build_summary_text_joins_marker_text_in_order() -> None:
    marker_spans = [
        {"start_word": 1, "end_word": 2, "text": "Alpha beta"},
        {"start_word": 4, "end_word": 4, "text": "delta"},
    ]

    assert _build_summary_text(marker_spans) == "Alpha beta delta"


def test_process_topic_marker_summary_generation_stores_marker_ranges() -> None:
    submission = {
        "submission_id": "sub-1",
        "results": {
            "sentences": ["Alpha beta gamma delta."],
            "topics": [
                {
                    "name": "Topic A",
                    "sentences": [1],
                    "ranges": [
                        {
                            "sentence_start": 1,
                            "sentence_end": 1,
                        }
                    ],
                }
            ],
        },
    }

    with patch(
        "lib.tasks.topic_marker_summary_generation.SubmissionsStorage.update_results"
    ) as mock_update_results:
        process_topic_marker_summary_generation(
            submission=submission,
            db=object(),
            llm=MockLLM(),
        )

    stored_payload = mock_update_results.call_args.args[1]["topic_marker_summaries"]
    stored_range = stored_payload["Topic A"]["ranges"][0]
    assert stored_range["marker_spans"] == [
        {"start_word": 1, "end_word": 2, "text": "Alpha beta"},
        {"start_word": 4, "end_word": 4, "text": "delta."},
    ]
    assert stored_range["summary_text"] == "Alpha beta delta."


def test_process_topic_marker_summary_generation_parallel_path_stores_results() -> None:
    submission = {
        "submission_id": "sub-2",
        "results": {
            "sentences": ["Alpha beta gamma delta."],
            "topics": [
                {
                    "name": "Topic A",
                    "sentences": [1],
                    "ranges": [
                        {
                            "sentence_start": 1,
                            "sentence_end": 1,
                        }
                    ],
                }
            ],
        },
    }
    llm = QueuedLLMClient(
        store=object(),
        model_id="queued-model",
        max_context_tokens=4000,
    )
    llm.with_namespace = lambda namespace, prompt_version=None: llm
    llm.submit = lambda prompt, temperature=0.0: MockFuture("2-3")
    llm.call = lambda prompts, temperature=0.0: "2-3"

    with patch(
        "lib.tasks.topic_marker_summary_generation.SubmissionsStorage.update_results"
    ) as mock_update_results:
        process_topic_marker_summary_generation(
            submission=submission,
            db=object(),
            llm=llm,
        )

    stored_payload = mock_update_results.call_args.args[1]["topic_marker_summaries"]
    stored_range = stored_payload["Topic A"]["ranges"][0]
    assert stored_range["marker_spans"] == [
        {"start_word": 2, "end_word": 3, "text": "beta gamma"}
    ]
    assert stored_range["summary_text"] == "beta gamma"


def test_process_topic_marker_summary_generation_chunks_large_prompt() -> None:
    class ChunkingLLM:
        model_id = "chunking-model"
        max_context_tokens = 420

        def __init__(self) -> None:
            self.prompts: list[str] = []

        @staticmethod
        def estimate_tokens(text: str) -> int:
            return len(text) // 4

        def call(self, prompts, temperature=0.0):
            del temperature
            prompt = prompts[0]
            self.prompts.append(prompt)
            if "Alpha" in prompt:
                return "1"
            if "Beta" in prompt:
                return "1"
            return "1"

    submission = {
        "submission_id": "sub-3",
        "results": {
            "sentences": [
                "Alpha " * 50,
                "Beta " * 50,
            ],
            "topics": [
                {
                    "name": "Topic A",
                    "ranges": [{"sentence_start": 1, "sentence_end": 2}],
                }
            ],
        },
    }

    llm = ChunkingLLM()

    with patch(
        "lib.tasks.topic_marker_summary_generation.SubmissionsStorage.update_results"
    ) as mock_update_results:
        process_topic_marker_summary_generation(
            submission=submission,
            db=object(),
            llm=llm,
        )

    stored_payload = mock_update_results.call_args.args[1]["topic_marker_summaries"]
    stored_range = stored_payload["Topic A"]["ranges"][0]
    assert len(llm.prompts) == 2
    assert stored_range["marker_spans"] == [
        {"start_word": 1, "end_word": 1, "text": "Alpha"},
        {"start_word": 51, "end_word": 51, "text": "Beta"},
    ]
    assert stored_range["summary_text"] == "Alpha Beta"
