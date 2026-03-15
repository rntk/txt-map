import logging
from typing import List

from lib.llm.base import LLMClient


class OpenAIClient(LLMClient):
    def __init__(self, api_key: str, model: str = "gpt-4o", max_context_tokens: int = 128000, max_retries: int = 3, retry_delay: float = 1.0):
        super().__init__(max_context_tokens=max_context_tokens, max_retries=max_retries, retry_delay=retry_delay)
        import openai
        self._client = openai.OpenAI(api_key=api_key)
        self._model = model

    @property
    def provider_name(self) -> str:
        return "OpenAI"

    def _call_single(self, user_msgs: List[str], temperature: float) -> str:
        try:
            prompt_preview = user_msgs[0][:500] + "..." if len(user_msgs[0]) > 500 else user_msgs[0]
            logging.info(f"LLM request (preview): {prompt_preview}")

            response = self._client.chat.completions.create(
                model=self._model,
                messages=[{"role": "user", "content": user_msgs[0]}],
                temperature=temperature,
            )
            content = response.choices[0].message.content
            if content is None:
                raise RuntimeError("LLM returned empty response")
            content_preview = content[:500] + "..." if len(content) > 500 else content
            logging.info(f"LLM response content (preview): {content_preview}")
            return content
        except RuntimeError:
            raise
        except Exception as e:
            logging.error(f"OpenAI call exception: {type(e).__name__}: {e}")
            raise RuntimeError(f"LLM call failed: {e}") from e
