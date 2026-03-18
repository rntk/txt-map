import logging
from typing import List

from lib.llm.base import LLMClient


class AnthropicClient(LLMClient):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514", max_context_tokens: int = 200000, max_retries: int = 3, retry_delay: float = 1.0):
        super().__init__(max_context_tokens=max_context_tokens, max_retries=max_retries, retry_delay=retry_delay)
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

    def _call_single(self, user_msgs: List[str], temperature: float) -> str:
        try:
            prompt_preview = user_msgs[0][:500] + "..." if len(user_msgs[0]) > 500 else user_msgs[0]
            logging.info(f"LLM request (preview): {prompt_preview}")

            response = self._client.messages.create(
                model=self._model,
                max_tokens=4096,
                messages=[{"role": "user", "content": user_msgs[0]}],
                temperature=temperature,
                cache_control={"type": "ephemeral"},
            )
            content = response.content[0].text
            if content is None:
                raise RuntimeError("LLM returned empty response")
            content_preview = content[:500] + "..." if len(content) > 500 else content
            logging.info(f"LLM response content (preview): {content_preview}")
            return content
        except RuntimeError:
            raise
        except Exception as e:
            logging.error(f"Anthropic call exception: {type(e).__name__}: {e}")
            raise RuntimeError(f"LLM call failed: {e}") from e
