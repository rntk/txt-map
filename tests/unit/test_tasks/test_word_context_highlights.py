from typing import Any
from unittest.mock import MagicMock, patch

from handlers.submission_handler import (
    WordContextHighlightsRequest,
    start_word_context_highlights,
)
from lib.tasks.word_context_highlights import build_word_context_job_signature


class DummyLLM:
    model_id = "provider:model-a"
    max_context_tokens = 4096
    provider_key = "provider"
    provider_name = "Provider"
    model_name = "model-a"


class OtherDummyLLM:
    model_id = "provider:model-b"


def test_word_context_job_signature_changes_with_model() -> None:
    assert build_word_context_job_signature(
        DummyLLM(), "Codex"
    ) != build_word_context_job_signature(OtherDummyLLM(), "Codex")


def test_start_word_context_highlights_ignores_stale_persisted_job() -> None:
    stale_signature = "old-signature"
    submission: dict[str, Any] = {
        "submission_id": "submission-1",
        "results": {
            "sentences": ["Codex shipped context analysis."],
            "topics": [{"name": "AI", "sentences": [1]}],
            "word_context_highlights": {
                "d688ae4face9f51ed484": {
                    "signature": stale_signature,
                    "pending": {"AI": "old-request"},
                    "highlights": {"AI": {"ranges": []}},
                }
            },
        },
    }
    storage = MagicMock()

    with (
        patch("handlers.submission_handler.create_llm_client", return_value=DummyLLM()),
        patch(
            "handlers.submission_handler.submit_topic_requests",
            return_value=(
                {
                    "AI": {
                        "chunks": [{"request_id": "new-request"}],
                        "partial_spans": [],
                    }
                },
                {},
            ),
        ) as submit_topic_requests,
    ):
        response = start_word_context_highlights(
            WordContextHighlightsRequest(word="Codex"),
            submission=submission,
            storage=storage,
            db=MagicMock(),
            llm_queue_store=MagicMock(),
            cache_store=MagicMock(),
        )

    submitted_topics = submit_topic_requests.call_args.args[1]
    updated_job = storage.update_results.call_args.args[1][
        "word_context_highlights.d688ae4face9f51ed484"
    ]

    assert response["status"] == "pending"
    assert [topic["name"] for topic in submitted_topics] == ["AI"]
    assert updated_job["signature"] != stale_signature
    assert updated_job["pending"] == {
        "AI": {"chunks": [{"request_id": "new-request"}], "partial_spans": []}
    }
    assert updated_job["highlights"] == {}


def test_start_word_context_highlights_refresh_ignores_matching_persisted_job() -> None:
    current_signature = build_word_context_job_signature(DummyLLM(), "Codex")
    submission: dict[str, Any] = {
        "submission_id": "submission-1",
        "results": {
            "sentences": ["Codex shipped context analysis."],
            "topics": [{"name": "AI", "sentences": [1]}],
            "word_context_highlights": {
                "d688ae4face9f51ed484": {
                    "signature": current_signature,
                    "pending": {},
                    "highlights": {"AI": {"ranges": []}},
                }
            },
        },
    }
    storage = MagicMock()

    with (
        patch("handlers.submission_handler.create_llm_client", return_value=DummyLLM()),
        patch(
            "handlers.submission_handler.submit_topic_requests",
            return_value=(
                {
                    "AI": {
                        "chunks": [{"request_id": "new-request"}],
                        "partial_spans": [],
                    }
                },
                {},
            ),
        ) as submit_topic_requests,
    ):
        response = start_word_context_highlights(
            WordContextHighlightsRequest(word="Codex", refresh=True),
            submission=submission,
            storage=storage,
            db=MagicMock(),
            llm_queue_store=MagicMock(),
            cache_store=MagicMock(),
        )

    updated_job = storage.update_results.call_args.args[1][
        "word_context_highlights.d688ae4face9f51ed484"
    ]

    assert response["status"] == "pending"
    assert submit_topic_requests.call_count == 1
    assert updated_job["pending"] == {
        "AI": {"chunks": [{"request_id": "new-request"}], "partial_spans": []}
    }
    assert updated_job["highlights"] == {}


def test_start_word_context_highlights_resolves_cache_hit_none() -> None:
    submission: dict[str, Any] = {
        "submission_id": "submission-1",
        "results": {
            "sentences": ["Codex shipped context analysis."],
            "topics": [{"name": "AI", "sentences": [1]}],
        },
    }
    storage = MagicMock()

    with (
        patch("handlers.submission_handler.create_llm_client", return_value=DummyLLM()),
        patch(
            "handlers.submission_handler.submit_topic_requests",
            return_value=(
                {},
                {
                    "AI": {
                        "ranges": [
                            {
                                "range_index": 0,
                                "sentence_start": 1,
                                "sentence_end": 1,
                                "marker_spans": [],
                            }
                        ]
                    }
                },
            ),
        ),
    ):
        response = start_word_context_highlights(
            WordContextHighlightsRequest(word="Codex"),
            submission=submission,
            storage=storage,
            db=MagicMock(),
            llm_queue_store=MagicMock(),
            cache_store=MagicMock(),
        )

    updated_job = storage.update_results.call_args.args[1][
        "word_context_highlights.d688ae4face9f51ed484"
    ]

    assert response["status"] == "completed"
    assert response["completed"] == 1
    assert response["highlights"] == {
        "AI": {
            "ranges": [
                {
                    "range_index": 0,
                    "sentence_start": 1,
                    "sentence_end": 1,
                    "marker_spans": [],
                }
            ]
        }
    }
    assert updated_job["pending"] == {}
    assert updated_job["highlights"] == response["highlights"]
