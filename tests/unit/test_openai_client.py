import sys
import types
from unittest.mock import MagicMock

from lib.llm.base import LLMMessage, ToolCall, ToolDefinition
from lib.llm.openai_client import OpenAIClient


def _install_openai_stub(monkeypatch, responses_client: MagicMock) -> None:
    openai_module = types.SimpleNamespace(
        OpenAI=lambda api_key: types.SimpleNamespace(
            api_key=api_key,
            responses=responses_client,
        )
    )
    monkeypatch.setitem(sys.modules, "openai", openai_module)


def test_complete_uses_responses_api_with_tools_and_history(monkeypatch) -> None:
    responses_client = MagicMock()
    responses_client.create.return_value = types.SimpleNamespace(
        output=[
            types.SimpleNamespace(
                type="message",
                content=[types.SimpleNamespace(type="output_text", text="done")],
            )
        ]
    )
    _install_openai_stub(monkeypatch, responses_client)

    client = OpenAIClient(api_key="secret", model="gpt-5.4")
    tool = ToolDefinition(
        name="lookup",
        description="Look up data",
        parameters={"type": "object", "properties": {"id": {"type": "integer"}}},
    )

    response = client.complete(
        user_prompt="final question",
        system_prompt="system text",
        tools=(tool,),
        messages=(
            LLMMessage(
                role="assistant",
                content="working",
                tool_calls=(ToolCall(name="lookup", arguments={"id": 1}, id="call-1"),),
            ),
            LLMMessage(role="tool", content='{"id": 1}', tool_call_id="call-1"),
        ),
        tool_choice="required",
        parallel_tool_calls=True,
        temperature=0.2,
    )

    assert response.content == "done"
    kwargs = responses_client.create.call_args.kwargs
    assert kwargs["model"] == "gpt-5.4"
    assert kwargs["instructions"] == "system text"
    assert kwargs["tool_choice"] == "required"
    assert kwargs["parallel_tool_calls"] is True
    assert kwargs["temperature"] == 0.2
    assert kwargs["tools"][0]["name"] == "lookup"
    assert kwargs["input"][0]["role"] == "assistant"
    # Function calls are separate items, not in an "output" key
    assert kwargs["input"][1]["type"] == "function_call"
    assert kwargs["input"][1]["name"] == "lookup"
    assert kwargs["input"][2]["type"] == "function_call_output"
    assert kwargs["input"][3] == {"role": "user", "content": "final question"}


def test_complete_parses_function_tool_calls(monkeypatch) -> None:
    responses_client = MagicMock()
    responses_client.create.return_value = types.SimpleNamespace(
        output=[
            types.SimpleNamespace(
                type="function_call",
                call_id="call-1",
                name="lookup",
                arguments='{"city":"Paris"}',
            )
        ]
    )
    _install_openai_stub(monkeypatch, responses_client)

    client = OpenAIClient(api_key="secret", model="gpt-5.4")

    response = client.complete(user_prompt="weather?", tools=())

    assert response.content is None
    assert len(response.tool_calls) == 1
    assert response.tool_calls[0].id == "call-1"
    assert response.tool_calls[0].name == "lookup"
    assert response.tool_calls[0].arguments == {"city": "Paris"}


def test_call_returns_text_from_responses_api(monkeypatch) -> None:
    responses_client = MagicMock()
    responses_client.create.return_value = types.SimpleNamespace(
        output=[
            types.SimpleNamespace(
                type="message",
                content=[types.SimpleNamespace(type="output_text", text="hello")],
            )
        ]
    )
    _install_openai_stub(monkeypatch, responses_client)

    client = OpenAIClient(api_key="secret", model="gpt-5.4")

    assert client.call(["hi"]) == "hello"
