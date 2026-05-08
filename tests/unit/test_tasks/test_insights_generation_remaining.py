"""Additional unit tests for insights_generation."""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from lib.tasks.insights_generation import (
    _build_compatible_insight_llm,
    _build_compatible_insight_parser,
    _generate_insights,
    process_insights_generation,
)


def test_build_compatible_insight_llm_with_retry_policy() -> None:
    llm_callable = MagicMock()
    chunker = MagicMock()
    retry_policy = MagicMock()

    with patch("lib.tasks.insights_generation.inspect.signature") as mock_sig:
        mock_sig.return_value.parameters = {
            "temperature": None,
            "chunker": None,
            "retry_policy": None,
            "client": None,
        }
        mock_build = MagicMock(return_value="insight_llm")
        with patch("lib.tasks.insights_generation.build_insight_llm", mock_build):
            result = _build_compatible_insight_llm(
                llm_callable,
                temperature=0.0,
                chunker=chunker,
                retry_policy=retry_policy,
            )
    assert result == "insight_llm"
    mock_build.assert_called_once()


def test_build_compatible_insight_llm_with_llm_callable() -> None:
    llm_callable = MagicMock()
    chunker = MagicMock()
    retry_policy = MagicMock()

    with patch("lib.tasks.insights_generation.inspect.signature") as mock_sig:
        mock_sig.return_value.parameters = {
            "temperature": None,
            "chunker": None,
            "retry_policy": None,
            "llm_callable": None,
        }
        mock_build = MagicMock(return_value="insight_llm")
        with patch("lib.tasks.insights_generation.build_insight_llm", mock_build):
            result = _build_compatible_insight_llm(
                llm_callable,
                temperature=0.0,
                chunker=chunker,
                retry_policy=retry_policy,
            )
    assert result == "insight_llm"


def test_build_compatible_insight_llm_legacy() -> None:
    llm_callable = MagicMock()
    chunker = MagicMock()
    retry_policy = MagicMock()

    with patch("lib.tasks.insights_generation.inspect.signature") as mock_sig:
        mock_sig.return_value.parameters = {
            "temperature": None,
            "chunker": None,
        }
        mock_llm = MagicMock()
        mock_llm._client = None
        mock_llm._retry_policy = None
        mock_build = MagicMock(return_value=mock_llm)
        with patch("lib.tasks.insights_generation.build_insight_llm", mock_build):
            result = _build_compatible_insight_llm(
                llm_callable,
                temperature=0.0,
                chunker=chunker,
                retry_policy=retry_policy,
            )
    assert result._client is llm_callable
    assert result._retry_policy is retry_policy


def test_build_compatible_insight_parser_with_input_mode() -> None:
    with patch("lib.tasks.insights_generation.inspect.signature") as mock_sig:
        mock_sig.return_value.parameters = {"input_mode": None}
        mock_parser = MagicMock()
        with patch("lib.tasks.insights_generation.InsightParser", mock_parser):
            result = _build_compatible_insight_parser(input_mode="text")
    assert result is mock_parser.return_value
    mock_parser.assert_called_once_with(input_mode="text")


def test_build_compatible_insight_parser_without_input_mode() -> None:
    with patch("lib.tasks.insights_generation.inspect.signature") as mock_sig:
        mock_sig.return_value.parameters = {}
        mock_parser = MagicMock()
        with patch("lib.tasks.insights_generation.InsightParser", mock_parser):
            result = _build_compatible_insight_parser(input_mode="text")
    assert result is mock_parser.return_value
    mock_parser.assert_called_once_with()


def test_generate_insights_empty_source() -> None:
    submission: dict[str, Any] = {
        "html_content": "",
        "text_content": "",
        "results": {"sentences": ["s1"]},
    }
    result = _generate_insights(submission, [], MagicMock(), None, "ns")
    assert result == []


def test_generate_insights_empty_sentence_list() -> None:
    submission: dict[str, Any] = {
        "html_content": "Hello world.",
        "results": {"sentences": []},
    }
    with patch(
        "lib.tasks.insights_generation.SparseRegexSentenceSplitter"
    ) as mock_splitter:
        mock_splitter.return_value.split.return_value = []
        result = _generate_insights(submission, [], MagicMock(), None, "ns")
    assert result == []


def test_process_insights_generation_no_topics() -> None:
    with pytest.raises(ValueError, match="Topic extraction must be completed first"):
        process_insights_generation(
            {"submission_id": "sub-1", "results": {}}, MagicMock(), MagicMock()
        )


def test_process_insights_generation_with_topics() -> None:
    submission: dict[str, Any] = {
        "submission_id": "sub-1",
        "results": {
            "topics": [{"name": "A", "sentences": [1]}],
            "sentences": ["Hello."],
        },
    }
    db = MagicMock()
    db.submissions.update_one.return_value.modified_count = 1
    with patch(
        "lib.tasks.insights_generation._generate_insights",
        return_value=[{"name": "Insight"}],
    ):
        process_insights_generation(submission, db, MagicMock())
    db.submissions.update_one.assert_called_once()
