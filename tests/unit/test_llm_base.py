import pytest

from lib.llm.base import (
    LLMClient,
    LLMMessage,
    LLMRequest,
    LLMResponse,
    ToolCall,
    ToolDefinition,
)


class DummyLLMClient(LLMClient):
    def __init__(self, responses: list[LLMResponse]) -> None:
        super().__init__(max_context_tokens=1024, max_retries=0, retry_delay=0.0)
        self._responses = responses
        self.requests: list[LLMRequest] = []

    @property
    def provider_name(self) -> str:
        return "Dummy"

    @property
    def provider_key(self) -> str:
        return "dummy"

    @property
    def model_name(self) -> str:
        return "dummy-model"

    def _complete_single(self, request: LLMRequest) -> LLMResponse:
        self.requests.append(request)
        return self._responses.pop(0)


def test_call_wraps_complete_with_first_user_message() -> None:
    client = DummyLLMClient([LLMResponse(content="ok")])

    result = client.call(["first", "second"], temperature=0.4)

    assert result == "ok"
    assert len(client.requests) == 1
    assert client.requests[0].user_prompt == "first"
    assert client.requests[0].temperature == 0.4


def test_call_raises_when_complete_has_no_text_content() -> None:
    client = DummyLLMClient(
        [
            LLMResponse(
                content=None,
                tool_calls=(ToolCall(name="search", arguments={"q": "x"}, id="1"),),
            )
        ]
    )

    try:
        client.call(["prompt"])
    except RuntimeError as exc:
        assert str(exc) == "LLM returned empty text response"
    else:
        raise AssertionError("Expected RuntimeError")


def test_complete_builds_request_with_tools_and_messages() -> None:
    client = DummyLLMClient([LLMResponse(content="done")])
    tool = ToolDefinition(
        name="lookup",
        description="Look up something",
        parameters={"type": "object"},
    )
    history = (
        LLMMessage(
            role="assistant",
            content="calling tool",
            tool_calls=(ToolCall(name="lookup", arguments={"id": 1}, id="tool-1"),),
        ),
        LLMMessage(role="tool", content="{}", tool_call_id="tool-1"),
    )

    response = client.complete(
        user_prompt="final prompt",
        system_prompt="system text",
        tools=(tool,),
        messages=history,
        tool_choice="required",
        parallel_tool_calls=True,
    )

    assert response.content == "done"
    request = client.requests[0]
    assert request.system_prompt == "system text"
    assert request.tools == (tool,)
    assert request.messages == history
    assert request.tool_choice == "required"
    assert request.parallel_tool_calls is True


def test_call_raises_with_empty_user_messages() -> None:
    client = DummyLLMClient([LLMResponse(content="ok")])
    with pytest.raises(RuntimeError, match="at least one user message"):
        client.call([])


def test_get_provider_definition_by_key_unknown_raises() -> None:
    from lib.llm.base import get_provider_definition_by_key

    with pytest.raises(KeyError, match="Unknown LLM provider key"):
        get_provider_definition_by_key("unknown-key")


def test_get_provider_definition_by_name_unknown_raises() -> None:
    from lib.llm.base import get_provider_definition_by_name

    with pytest.raises(KeyError, match="Unknown LLM provider name"):
        get_provider_definition_by_name("Unknown Provider")


def test_get_provider_definition_by_key_success() -> None:
    from lib.llm.base import (
        get_provider_definition_by_key,
        PROVIDER_DEFINITION_BY_KEY,
    )

    for key, expected in PROVIDER_DEFINITION_BY_KEY.items():
        result = get_provider_definition_by_key(key)
        assert result == expected


def test_get_provider_definition_by_name_success() -> None:
    from lib.llm.base import (
        get_provider_definition_by_name,
        PROVIDER_DEFINITION_BY_NAME,
    )

    for name, expected in PROVIDER_DEFINITION_BY_NAME.items():
        result = get_provider_definition_by_name(name)
        assert result == expected
