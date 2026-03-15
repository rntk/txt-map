import time
import random
import logging
from abc import ABC, abstractmethod
from typing import List, Optional


class LLMClient(ABC):
    def __init__(self, max_context_tokens: int, max_retries: int = 3, retry_delay: float = 1.0):
        self._max_context_tokens = max_context_tokens
        self._max_retries = max_retries
        self._retry_delay = retry_delay

    @property
    def max_context_tokens(self) -> int:
        return self._max_context_tokens

    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    def estimate_tokens(self, text: str) -> int:
        """Rough estimation: ~4 characters per token on average"""
        return len(text) // 4

    def call(self, user_msgs: List[str], temperature: float = 0.0, retries: Optional[int] = None) -> str:
        """Call the LLM with retry logic and exponential backoff."""
        max_retries = retries if retries is not None else self._max_retries

        for attempt in range(max_retries + 1):
            try:
                return self._call_single(user_msgs, temperature)
            except RuntimeError as e:
                if attempt < max_retries:
                    delay = self._retry_delay * (2 ** attempt) + random.uniform(0, 0.5)
                    logging.warning(
                        f"LLM call failed (attempt {attempt + 1}/{max_retries + 1}): {e}. "
                        f"Retrying in {delay:.2f}s..."
                    )
                    time.sleep(delay)
                else:
                    logging.error(f"LLM call failed after {max_retries + 1} attempts: {e}")
                    raise

    @abstractmethod
    def _call_single(self, user_msgs: List[str], temperature: float) -> str:
        pass
