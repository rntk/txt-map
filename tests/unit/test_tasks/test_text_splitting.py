"""Unit tests for text_splitting task."""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from lib.tasks.text_splitting import process_text_splitting


class FakeSplitResult:
    def __init__(self) -> None:
        self.sentences = ["Sentence one.", "Sentence two."]
        self.topics = [{"name": "Topic A", "sentences": [1]}]


def test_process_text_splitting_with_html_content() -> None:
    submission: dict[str, Any] = {
        "submission_id": "sub-1",
        "html_content": "<p>Hello world</p>",
        "text_content": "fallback",
        "temperature": 0.5,
        "use_json": True,
    }
    db = MagicMock()
    db.submissions.update_one.return_value.modified_count = 1
    llm = MagicMock()

    with patch(
        "lib.tasks.text_splitting.split_article_with_markers",
        return_value=FakeSplitResult(),
    ) as mock_split:
        process_text_splitting(submission, db, llm)

    mock_split.assert_called_once_with(
        "<p>Hello world</p>",
        llm,
        max_chunk_chars=84_000,
        temperature=0.5,
        use_json=True,
    )
    db.submissions.update_one.assert_called_once()
    update_call = db.submissions.update_one.call_args
    assert update_call.args[0] == {"submission_id": "sub-1"}
    assert update_call.args[1]["$set"]["results.sentences"] == [
        "Sentence one.",
        "Sentence two.",
    ]
    assert update_call.args[1]["$set"]["results.topics"] == [
        {"name": "Topic A", "sentences": [1]}
    ]


def test_process_text_splitting_falls_back_to_text_content() -> None:
    submission: dict[str, Any] = {
        "submission_id": "sub-2",
        "html_content": "",
        "text_content": "plain text",
    }
    db = MagicMock()
    db.submissions.update_one.return_value.modified_count = 1
    llm = MagicMock()

    with patch(
        "lib.tasks.text_splitting.split_article_with_markers",
        return_value=FakeSplitResult(),
    ) as mock_split:
        process_text_splitting(submission, db, llm)

    mock_split.assert_called_once_with(
        "plain text",
        llm,
        max_chunk_chars=84_000,
        temperature=0.0,
        use_json=False,
    )


def test_process_text_splitting_raises_when_no_content() -> None:
    submission: dict[str, Any] = {
        "submission_id": "sub-3",
        "html_content": "",
        "text_content": "",
    }
    with pytest.raises(ValueError, match="^No text content to process$"):
        process_text_splitting(submission, MagicMock(), MagicMock())


def test_process_text_splitting_missing_html_content_key() -> None:
    submission: dict[str, Any] = {
        "submission_id": "sub-4",
        "text_content": "plain text",
    }
    db = MagicMock()
    db.submissions.update_one.return_value.modified_count = 1
    llm = MagicMock()

    with patch(
        "lib.tasks.text_splitting.split_article_with_markers",
        return_value=FakeSplitResult(),
    ) as mock_split:
        process_text_splitting(submission, db, llm)

    mock_split.assert_called_once_with(
        "plain text",
        llm,
        max_chunk_chars=84_000,
        temperature=0.0,
        use_json=False,
    )


def test_process_text_splitting_missing_text_content_key() -> None:
    submission: dict[str, Any] = {
        "submission_id": "sub-5",
        "html_content": "<p>Hello</p>",
    }
    db = MagicMock()
    db.submissions.update_one.return_value.modified_count = 1
    llm = MagicMock()

    with patch(
        "lib.tasks.text_splitting.split_article_with_markers",
        return_value=FakeSplitResult(),
    ) as mock_split:
        process_text_splitting(submission, db, llm)

    mock_split.assert_called_once_with(
        "<p>Hello</p>",
        llm,
        max_chunk_chars=84_000,
        temperature=0.0,
        use_json=False,
    )


def test_process_text_splitting_print_output(
    capsys: pytest.CaptureFixture[str],
) -> None:
    submission: dict[str, Any] = {
        "submission_id": "sub-6",
        "html_content": "<p>Hello</p>",
        "text_content": "",
    }
    db = MagicMock()
    db.submissions.update_one.return_value.modified_count = 1
    llm = MagicMock()

    with patch(
        "lib.tasks.text_splitting.split_article_with_markers",
        return_value=FakeSplitResult(),
    ):
        process_text_splitting(submission, db, llm)

    captured = capsys.readouterr()
    assert "Text splitting completed for submission sub-6" in captured.out
    assert "2 sentences, 1 topics" in captured.out


def test_process_text_splitting_missing_both_content_keys() -> None:
    submission: dict[str, Any] = {
        "submission_id": "sub-7",
    }
    with pytest.raises(ValueError, match="^No text content to process$"):
        process_text_splitting(submission, MagicMock(), MagicMock())
