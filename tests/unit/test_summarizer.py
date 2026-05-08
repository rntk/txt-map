"""Unit tests for summarizer module."""

from unittest.mock import MagicMock

from lib.summarizer import summarize_by_sentence_groups


class FakeLLM:
    max_context_tokens = 1000

    def estimate_tokens(self, text: str) -> int:
        return len(text.split())

    def call(self, prompts: list[str]) -> str:
        return f"Summary of: {prompts[0][:20]}"


def test_summarize_by_sentence_groups_basic() -> None:
    llm = FakeLLM()
    cache = MagicMock()
    cache.find_one.return_value = None
    sentences = ["First group of text.", "Second group of text."]
    summaries, mappings = summarize_by_sentence_groups(sentences, llm, cache)
    assert len(summaries) == 2
    assert len(mappings) == 2
    assert mappings[0]["source_sentences"] == [1]
    assert mappings[1]["source_sentences"] == [2]
    cache.update_one.assert_called()


def test_summarize_by_sentence_groups_cached() -> None:
    llm = MagicMock()
    llm.max_context_tokens = 1000
    llm.estimate_tokens.return_value = 10
    llm.call.return_value = "Should not be called."
    cache = MagicMock()
    cache.find_one.return_value = {"response": "Cached summary."}
    sentences = ["Some text."]
    summaries, mappings = summarize_by_sentence_groups(sentences, llm, cache)
    assert summaries == ["Cached summary."]
    assert len(mappings) == 1
    llm.call.assert_not_called()


def test_summarize_by_sentence_groups_empty_result_filtered() -> None:
    llm = FakeLLM()
    llm.call = lambda prompts: "   "  # whitespace-only response
    cache = MagicMock()
    cache.find_one.return_value = None
    sentences = ["Some text."]
    summaries, mappings = summarize_by_sentence_groups(sentences, llm, cache)
    assert summaries == []
    assert mappings == []
