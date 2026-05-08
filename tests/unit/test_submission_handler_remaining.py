"""Additional unit tests for submission_handler."""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from handlers.submission_handler import (
    FetchUrlRequest,
    _word_storage_key,
    get_similar_words,
    get_word_context_highlights,
    post_fetch_url,
)


def test_get_similar_words_no_matches() -> None:
    submission: dict[str, Any] = {
        "submission_id": "sub-1",
        "results": {
            "sentences": ["Hello world."],
            "topics": [{"name": "Greeting", "sentences": [1]}],
        },
    }
    with patch("lib.nlp._lemmatizer_instance") as mock_lemma:
        lemmatizer = MagicMock()
        lemmatizer.lemmatize.return_value = "zebra"
        mock_lemma.return_value = lemmatizer
        result = get_similar_words(word="zebra", submission=submission)
    assert "similar_words" in result
    # Falls back to frequent words
    assert len(result["similar_words"]) > 0


def test_get_word_context_highlights_missing() -> None:
    submission: dict[str, Any] = {
        "submission_id": "sub-1",
        "results": {
            "sentences": ["Hello world."],
            "topics": [{"name": "Greeting", "sentences": [1]}],
        },
    }
    result = get_word_context_highlights(
        word="test",
        submission=submission,
        storage=MagicMock(),
        llm_queue_store=MagicMock(),
    )
    assert result["status"] == "not_found"


def test_get_word_context_highlights_found() -> None:
    word = "hello"
    word_key = _word_storage_key(word)
    submission: dict[str, Any] = {
        "submission_id": "sub-1",
        "results": {
            "sentences": ["Hello world."],
            "topics": [{"name": "Greeting", "sentences": [1]}],
            "word_context_highlights": {
                word_key: {
                    "signature": "sig",
                    "pending": {},
                    "highlights": {
                        "Greeting": {
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
                }
            },
        },
    }
    result = get_word_context_highlights(
        word=word,
        submission=submission,
        storage=MagicMock(),
        llm_queue_store=MagicMock(),
    )
    assert result["status"] == "completed"
    assert result["completed"] == 1


def test_post_fetch_url_bad_url() -> None:
    with pytest.raises(HTTPException, match="URL must start with http"):
        post_fetch_url(
            FetchUrlRequest(url="ftp://bad-url.com"),
            submissions_storage=MagicMock(),
            task_queue_storage=MagicMock(),
        )
