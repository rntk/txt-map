import logging
import random
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional


@dataclass(frozen=True)
class ProviderDefinition:
    key: str
    display_name: str
    models: tuple[str, ...]
    default_model: str


PROVIDER_DEFINITIONS: tuple[ProviderDefinition, ...] = (
    ProviderDefinition(
        key="llamacpp",
        display_name="LlamaCPP",
        models=("moonshotai/Kimi-K2.5",),
        default_model="moonshotai/Kimi-K2.5",
    ),
    ProviderDefinition(
        key="openai",
        display_name="OpenAI",
        models=("", "gpt-5-mini", "gpt-5-nano", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.4"),
        default_model="gpt-5.4-nano",
    ),
    ProviderDefinition(
        key="anthropic",
        display_name="Anthropic",
        models=("claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"),
        default_model="claude-haiku-4-5",
    ),
)

PROVIDER_DEFINITION_BY_KEY = {
    provider.key: provider for provider in PROVIDER_DEFINITIONS
}
PROVIDER_DEFINITION_BY_NAME = {
    provider.display_name: provider for provider in PROVIDER_DEFINITIONS
}


def get_provider_definition_by_key(provider_key: str) -> ProviderDefinition:
    provider = PROVIDER_DEFINITION_BY_KEY.get(provider_key)
    if provider is None:
        raise KeyError(f"Unknown LLM provider key: {provider_key}")
    return provider


def get_provider_definition_by_name(provider_name: str) -> ProviderDefinition:
    provider = PROVIDER_DEFINITION_BY_NAME.get(provider_name)
    if provider is None:
        raise KeyError(f"Unknown LLM provider name: {provider_name}")
    return provider


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

    @property
    @abstractmethod
    def provider_key(self) -> str:
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        pass

    @property
    def model_id(self) -> str:
        return f"{self.provider_key}:{self.model_name}"

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
