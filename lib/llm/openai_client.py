import logging
from typing import Any, List

from lib.llm.base import LLMClient


class OpenAIClient(LLMClient):
    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o",
        max_context_tokens: int = 128000,
        max_retries: int = 3,
        retry_delay: float = 1.0,
    ) -> None:
        super().__init__(
            max_context_tokens=max_context_tokens,
            max_retries=max_retries,
            retry_delay=retry_delay,
        )
        import openai

        self._client = openai.OpenAI(api_key=api_key)
        self._model = model

    @property
    def provider_name(self) -> str:
        return "OpenAI"

    @property
    def provider_key(self) -> str:
        return "openai"

    @property
    def model_name(self) -> str:
        return self._model

    def _extract_reasoning(self, response: Any) -> str | None:
        reasoning_parts: list[str] = []

        choices = getattr(response, "choices", None) or []
        for choice in choices:
            message = getattr(choice, "message", None)
            if message is None:
                continue

            for attr_name in ("reasoning", "reasoning_content", "thinking"):
                attr_value = getattr(message, attr_name, None)
                if attr_value:
                    reasoning_parts.append(str(attr_value))

            content_blocks = getattr(message, "content", None)
            if isinstance(content_blocks, list):
                for block in content_blocks:
                    block_type = getattr(block, "type", None)
                    if block_type in {"reasoning", "thinking"}:
                        text = getattr(block, "text", None)
                        if text:
                            reasoning_parts.append(str(text))
                        summary = getattr(block, "summary", None)
                        if summary:
                            reasoning_parts.append(str(summary))

        combined = "\n".join(part for part in reasoning_parts if part)
        return combined or None

    def _call_single(self, user_msgs: List[str], temperature: float) -> str:
        try:
            logging.info(f"LLM request: {user_msgs[0]}")

            # gpt-5-mini and gpt-5-nano don't support temperature parameter
            kwargs = {"service_tier": "flex"}
            if self._model not in ("gpt-5-mini", "gpt-5-nano"):
                kwargs["temperature"] = temperature

            response = self._client.chat.completions.create(
                model=self._model,
                messages=[{"role": "user", "content": user_msgs[0]}],
                **kwargs,
            )
            reasoning = self._extract_reasoning(response)
            content = response.choices[0].message.content
            if content is None:
                raise RuntimeError("LLM returned empty response")
            if reasoning:
                logging.info(f"LLM reasoning: {reasoning}")
            logging.info(f"LLM response: {content}")
            return content
        except RuntimeError:
            raise
        except Exception as e:
            logging.error(f"OpenAI call exception: {type(e).__name__}: {e}")
            raise RuntimeError(f"LLM call failed: {e}") from e
