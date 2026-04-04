import logging
from typing import Any, List

from lib.llm.base import LLMClient


class AnthropicClient(LLMClient):
    def __init__(
        self,
        api_key: str,
        model: str = "claude-sonnet-4-20250514",
        max_context_tokens: int = 200000,
        max_retries: int = 3,
        retry_delay: float = 1.0,
    ) -> None:
        super().__init__(
            max_context_tokens=max_context_tokens,
            max_retries=max_retries,
            retry_delay=retry_delay,
        )
        import anthropic

        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model

    @property
    def provider_name(self) -> str:
        return "Anthropic"

    @property
    def provider_key(self) -> str:
        return "anthropic"

    @property
    def model_name(self) -> str:
        return self._model

    def _extract_reasoning(self, response: Any) -> str | None:
        reasoning_parts: list[str] = []

        for block in getattr(response, "content", []) or []:
            block_type = getattr(block, "type", None)
            if block_type == "thinking":
                thinking = getattr(block, "thinking", None)
                text = getattr(block, "text", None)
                if thinking:
                    reasoning_parts.append(str(thinking))
                if text:
                    reasoning_parts.append(str(text))
            elif block_type == "redacted_thinking":
                data = getattr(block, "data", None)
                if data:
                    reasoning_parts.append(str(data))

        combined = "\n".join(part for part in reasoning_parts if part)
        return combined or None

    def _call_single(self, user_msgs: List[str], temperature: float) -> str:
        try:
            logging.info(f"LLM request: {user_msgs[0]}")

            response = self._client.messages.create(
                model=self._model,
                max_tokens=4096,
                messages=[{"role": "user", "content": user_msgs[0]}],
                temperature=temperature,
                cache_control={"type": "ephemeral"},
            )
            reasoning = self._extract_reasoning(response)
            content = response.content[0].text
            if content is None:
                raise RuntimeError("LLM returned empty response")
            if reasoning:
                logging.info(f"LLM reasoning: {reasoning}")
            logging.info(f"LLM response: {content}")
            return content
        except RuntimeError:
            raise
        except Exception as e:
            logging.error(f"Anthropic call exception: {type(e).__name__}: {e}")
            raise RuntimeError(f"LLM call failed: {e}") from e
