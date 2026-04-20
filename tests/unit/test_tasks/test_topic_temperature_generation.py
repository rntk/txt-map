"""Unit tests for topic temperature generation."""

from unittest.mock import patch
from typing import Any

from lib.llm_queue.client import QueuedLLMClient
from lib.tasks.topic_temperature_generation import (
    _build_topic_temperature_prompt,
    _generate_temperature,
    _parse_temperature_output,
    process_topic_temperature_generation,
)


class MockFuture:
    def __init__(self, value: str) -> None:
        self._value = value

    def result(self, timeout: float | None = None) -> str:
        del timeout
        return self._value


class SequencedLLM:
    model_id = "mock-model"

    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.prompts: list[str] = []

    def call(self, prompts: list[str], temperature: float = 0.0) -> str:
        del temperature
        self.prompts.append(prompts[0])
        if self.responses:
            return self.responses.pop(0)
        return "50"


def make_submission() -> dict[str, Any]:
    return {
        "submission_id": "sub-1",
        "results": {
            "sentences": [
                "Intro context.",
                "Important security flaw disclosed.",
                "Patch deployment details.",
                "Closing filler.",
            ],
            "topics": [
                {
                    "name": "Intro",
                    "sentences": [1],
                    "ranges": [{"sentence_start": 1, "sentence_end": 1}],
                },
                {
                    "name": "Security",
                    "sentences": [2, 3],
                    "ranges": [{"sentence_start": 2, "sentence_end": 3}],
                },
                {
                    "name": "Outro",
                    "sentences": [4],
                    "ranges": [{"sentence_start": 4, "sentence_end": 4}],
                },
            ],
        },
    }


def test_parse_temperature_output_parses_rate_and_reasoning() -> None:
    assert _parse_temperature_output("82\nHigh consequence.") == {
        "rate": 82,
        "reasoning": "High consequence.",
    }


def test_parse_temperature_output_clamps_rate() -> None:
    assert _parse_temperature_output("150\nToo high.") == {
        "rate": 100,
        "reasoning": "Too high.",
    }
    assert _parse_temperature_output("-5\nToo low.") == {
        "rate": 0,
        "reasoning": "Too low.",
    }


def test_parse_temperature_output_rejects_malformed_first_line() -> None:
    assert _parse_temperature_output("absolutely no number here") is None
    assert _parse_temperature_output("") is None


def test_parse_temperature_output_accepts_common_llm_decorations() -> None:
    assert _parse_temperature_output("Rate: 82\nReason.") == {
        "rate": 82,
        "reasoning": "Reason.",
    }
    assert _parse_temperature_output("**82**\nReason.") == {
        "rate": 82,
        "reasoning": "Reason.",
    }
    assert _parse_temperature_output("Score: 82/100\nReason.") == {
        "rate": 82,
        "reasoning": "Reason.",
    }


def test_generate_temperature_retries_on_malformed_response() -> None:
    submission = make_submission()
    prompt_data = _build_topic_temperature_prompt(
        submission["results"]["topics"][1],
        submission["results"]["topics"],
        submission["results"]["sentences"],
    )
    llm = SequencedLLM(["not parseable", "91\nCritical."])

    result = _generate_temperature(
        prompt_data=prompt_data,
        llm=llm,
        cache_store=None,
        namespace="test",
        max_retries=2,
    )

    assert result == {"rate": 91, "reasoning": "Critical."}
    assert len(llm.prompts) == 2
    assert "<previous_attempt>" in llm.prompts[1]


def test_generate_temperature_falls_back_to_neutral() -> None:
    submission = make_submission()
    prompt_data = _build_topic_temperature_prompt(
        submission["results"]["topics"][1],
        submission["results"]["topics"],
        submission["results"]["sentences"],
    )
    llm = SequencedLLM(["bad", "still bad"])

    result = _generate_temperature(
        prompt_data=prompt_data,
        llm=llm,
        cache_store=None,
        namespace="test",
        max_retries=2,
    )

    assert result == {"rate": 50, "reasoning": ""}


def test_prompt_includes_previous_and_next_context() -> None:
    submission = make_submission()

    prompt_data = _build_topic_temperature_prompt(
        submission["results"]["topics"][1],
        submission["results"]["topics"],
        submission["results"]["sentences"],
    )

    assert prompt_data is not None
    assert "Intro context." in prompt_data.prompt
    assert "Closing filler." in prompt_data.prompt
    assert "Important security flaw disclosed." in prompt_data.prompt
    assert "- Security (CURRENT)" in prompt_data.prompt
    # Context-only clarification and banded scale must stay in the prompt.
    assert "do NOT rate this" in prompt_data.prompt
    assert "76–100" in prompt_data.prompt


def test_process_topic_temperature_generation_stores_topic_temperatures() -> None:
    submission = make_submission()
    llm = SequencedLLM(["20\nIntro.", "88\nImportant.", "5\nFiller."])

    with patch(
        "lib.tasks.topic_temperature_generation.SubmissionsStorage.update_results"
    ) as mock_update_results:
        process_topic_temperature_generation(
            submission=submission,
            db=object(),
            llm=llm,
        )

    stored_payload = mock_update_results.call_args.args[1]["topic_temperatures"]
    assert stored_payload["Intro"] == {"rate": 20, "reasoning": "Intro."}
    assert stored_payload["Security"] == {"rate": 88, "reasoning": "Important."}
    assert stored_payload["Outro"] == {"rate": 5, "reasoning": "Filler."}


def test_process_topic_temperature_generation_parallel_path_stores_results() -> None:
    submission = make_submission()
    llm = QueuedLLMClient(
        store=object(),
        model_id="queued-model",
        max_context_tokens=4000,
    )
    llm.with_namespace = lambda namespace, prompt_version=None: llm
    llm.submit = lambda prompt, temperature=0.0: MockFuture("77\nQueued.")
    llm.call = lambda prompts, temperature=0.0: "77\nQueued."

    with patch(
        "lib.tasks.topic_temperature_generation.SubmissionsStorage.update_results"
    ) as mock_update_results:
        process_topic_temperature_generation(
            submission=submission,
            db=object(),
            llm=llm,
        )

    stored_payload = mock_update_results.call_args.args[1]["topic_temperatures"]
    assert stored_payload["Security"] == {"rate": 77, "reasoning": "Queued."}
