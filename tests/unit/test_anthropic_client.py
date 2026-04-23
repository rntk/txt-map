import sys
import types
from unittest.mock import MagicMock

from lib.llm.anthropic_client import AnthropicClient
from lib.llm.base import LLMMessage, ToolCall, ToolDefinition


def _install_anthropic_stub(monkeypatch, messages_client: MagicMock) -> None:
    anthropic_module = types.SimpleNamespace(
        Anthropic=lambda api_key: types.SimpleNamespace(
            api_key=api_key,
            messages=messages_client,
        )
    )
    monkeypatch.setitem(sys.modules, "anthropic", anthropic_module)


def test_complete_sends_tools_and_tool_history(monkeypatch) -> None:
    messages_client = MagicMock()
    messages_client.create.return_value = types.SimpleNamespace(
        content=[types.SimpleNamespace(type="text", text="done")]
    )
    _install_anthropic_stub(monkeypatch, messages_client)

    client = AnthropicClient(api_key="secret", model="claude-haiku-4-5")
    tool = ToolDefinition(
        name="lookup",
        description="Look up data",
        parameters={"type": "object"},
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
            LLMMessage(role="tool", content='{"id":1}', tool_call_id="call-1"),
        ),
        tool_choice={"type": "tool", "name": "lookup"},
        temperature=0.1,
    )

    assert response.content == "done"
    kwargs = messages_client.create.call_args.kwargs
    assert kwargs["model"] == "claude-haiku-4-5"
    assert kwargs["system"] == "system text"
    assert kwargs["temperature"] == 0.1
    assert kwargs["tool_choice"] == {"type": "tool", "name": "lookup"}
    assert kwargs["tools"][0]["name"] == "lookup"
    assert kwargs["messages"][0]["role"] == "assistant"
    assert kwargs["messages"][0]["content"][1]["type"] == "tool_use"
    assert kwargs["messages"][1]["role"] == "user"
    assert kwargs["messages"][1]["content"][0]["type"] == "tool_result"
    assert kwargs["messages"][1]["content"][1]["type"] == "text"


def test_complete_parses_tool_use_blocks(monkeypatch) -> None:
    messages_client = MagicMock()
    messages_client.create.return_value = types.SimpleNamespace(
        content=[
            types.SimpleNamespace(
                type="tool_use",
                id="tool-1",
                name="lookup",
                input={"city": "Paris"},
            )
        ]
    )
    _install_anthropic_stub(monkeypatch, messages_client)

    client = AnthropicClient(api_key="secret", model="claude-haiku-4-5")

    response = client.complete(user_prompt="weather?")

    assert response.content is None
    assert len(response.tool_calls) == 1
    assert response.tool_calls[0].id == "tool-1"
    assert response.tool_calls[0].name == "lookup"
    assert response.tool_calls[0].arguments == {"city": "Paris"}


def test_call_returns_text(monkeypatch) -> None:
    messages_client = MagicMock()
    messages_client.create.return_value = types.SimpleNamespace(
        content=[types.SimpleNamespace(type="text", text="hello")]
    )
    _install_anthropic_stub(monkeypatch, messages_client)

    client = AnthropicClient(api_key="secret", model="claude-haiku-4-5")

    assert client.call(["hi"]) == "hello"
