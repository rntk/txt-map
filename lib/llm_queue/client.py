"""Caller-side futures API for the LLM request queue."""

import logging
import time
from typing import Any, Optional

from txt_splitt.cache import _build_cache_key

from lib.llm_queue.store import LLMQueueStore

logger = logging.getLogger(__name__)


class LLMRequestError(RuntimeError):
    """Raised when an LLM request fails in the worker."""


class LLMFuture:
    """
    Promise for an LLM response backed by a MongoDB queue entry.

    If the response was already in cache, the future is pre-resolved
    and result() returns immediately without polling.
    """

    def __init__(
        self,
        request_id: Optional[str],
        store: Optional[LLMQueueStore],
        cached_response: Optional[str] = None,
        poll_interval: float = 0.5,
    ) -> None:
        self._request_id = request_id
        self._store = store
        self._cached_response = cached_response
        self._poll_interval = poll_interval

    def done(self) -> bool:
        """Non-blocking check — True if result is available."""
        if self._cached_response is not None:
            return True
        doc = self._store.get_result(self._request_id)
        return doc is not None and doc["status"] in ("completed", "failed")

    def result(self, timeout: float = 300.0) -> str:
        """
        Block until the result is available.

        Raises LLMRequestError if the worker reported a failure.
        Raises TimeoutError if timeout (seconds) is exceeded.
        """
        if self._cached_response is not None:
            return self._cached_response

        deadline = time.monotonic() + timeout
        while True:
            doc = self._store.get_result(self._request_id)
            if doc is None:
                raise LLMRequestError(
                    f"LLM request {self._request_id} disappeared from queue"
                )
            status = doc["status"]
            if status == "completed":
                return doc["response"]
            if status == "failed":
                raise LLMRequestError(
                    f"LLM request {self._request_id} failed: {doc.get('error', 'unknown error')}"
                )
            if time.monotonic() >= deadline:
                raise TimeoutError(
                    f"LLM request {self._request_id} timed out after {timeout}s"
                )
            time.sleep(self._poll_interval)

    @staticmethod
    def gather(*futures: "LLMFuture", timeout: float = 300.0) -> list[str]:
        """Wait for multiple futures and return results in order."""
        return [f.result(timeout=timeout) for f in futures]


class QueuedLLMClient:
    """
    Client that tasks use to dispatch LLM requests through the MongoDB queue.

    Satisfies the txt_splitt ``LLMCallable`` protocol via ``call(prompt, temperature)``.
    Also accepts the legacy ``call([prompt], temperature=...)`` list-based signature
    for backward compatibility with existing task code.

    Cache check happens *before* submitting to the queue — cache hits return
    pre-resolved futures without creating queue entries.
    """

    def __init__(
        self,
        store: LLMQueueStore,
        model_id: str,
        max_context_tokens: int,
        cache_store: Optional[Any] = None,
        namespace: Optional[str] = None,
        prompt_version: Optional[str] = None,
        poll_interval: float = 0.5,
    ) -> None:
        self._store = store
        self._model_id = model_id
        self._max_context_tokens = max_context_tokens
        self._cache_store = cache_store
        self._namespace = namespace
        self._prompt_version = prompt_version
        self._poll_interval = poll_interval

    # ── Metadata (mirrors LLMClient interface) ─────────────────────────────────

    @property
    def model_id(self) -> str:
        return self._model_id

    @property
    def max_context_tokens(self) -> int:
        return self._max_context_tokens

    def estimate_tokens(self, text: str) -> int:
        """Rough estimation: ~4 characters per token."""
        return len(text) // 4

    # ── Core API ───────────────────────────────────────────────────────────────

    def submit(self, prompt: str, temperature: float = 0.0) -> LLMFuture:
        """
        Non-blocking: enqueue an LLM request, return an LLMFuture.

        If cache is configured and a cached response exists, returns a
        pre-resolved future without creating a queue entry.
        """
        if self._cache_store is not None and self._namespace is not None and temperature == 0.0:
            cache_key = _build_cache_key(
                namespace=self._namespace,
                model_id=self._model_id,
                prompt_version=self._prompt_version,
                prompt=prompt,
                temperature=temperature,
            )
            entry = self._cache_store.get(cache_key)
            if entry is not None:
                logger.debug("LLM cache hit for namespace=%s", self._namespace)
                return LLMFuture(
                    request_id=None,
                    store=None,
                    cached_response=entry.response,
                    poll_interval=self._poll_interval,
                )
        else:
            cache_key = None

        request_id = self._store.submit(
            prompt=prompt,
            temperature=temperature,
            model_id=self._model_id,
            cache_key=cache_key,
            cache_namespace=self._namespace,
            prompt_version=self._prompt_version,
        )
        return LLMFuture(
            request_id=request_id,
            store=self._store,
            poll_interval=self._poll_interval,
        )

    def call(self, prompt_or_msgs: Any, temperature: float = 0.0) -> str:
        """
        Blocking call — submit and wait for result.

        Accepts both ``call(prompt, temperature)`` (LLMCallable protocol)
        and the legacy ``call([prompt], temperature=temperature)`` form.
        """
        if isinstance(prompt_or_msgs, list):
            prompt = prompt_or_msgs[0]
        else:
            prompt = prompt_or_msgs
        return self.submit(prompt, temperature).result()

    def with_namespace(self, namespace: str, prompt_version: Optional[str] = None) -> "QueuedLLMClient":
        """Return a copy of this client scoped to a specific cache namespace."""
        return QueuedLLMClient(
            store=self._store,
            model_id=self._model_id,
            max_context_tokens=self._max_context_tokens,
            cache_store=self._cache_store,
            namespace=namespace,
            prompt_version=prompt_version,
            poll_interval=self._poll_interval,
        )
