import re
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Literal, Optional, Protocol, cast
import logging

from lib.llm_queue.client import QueuedLLMClient
from txt_splitt import RetryConfig, RetryingLLMCallable, Tracer, TracingLLMCallable
from txt_splitt.cache import CacheEntry, CachingLLMCallable, _build_cache_key
from txt_splitt.errors import ParseError
from txt_splitt.html_cleaners import HTMLParserTagStripCleaner
from txt_splitt.protocols import LLMRequest, LLMResponse
from txt_splitt.sentences import (
    AdjacentSameTopicJoiner,
    BracketMarker,
    LLMRepairingGapHandler,
    MappingOffsetRestorer,
    OptimizingMarker,
    OverlapChunker,
    SparseRegexSentenceSplitter,
    TopicRangeLLM,
    TopicRangeParser,
    build_pipeline,
)

logger = logging.getLogger(__name__)
_PROMPT_CONTENT_PATTERN = re.compile(r"<content>\s*(.*?)\s*</content>", re.DOTALL)
_PROMPT_MARKER_PATTERN = re.compile(r"^\{(\d+)\}", re.MULTILINE)
_TEXT_RESPONSE_FORMAT = "text"
_JSON_RESPONSE_FORMAT = "json"
_DEFERRED_BATCH_ERROR = (
    "run() cannot execute deferred batches; use start() and drive the session"
)


@dataclass
class ArticleSplitResult:
    sentences: List[str]
    topics: List[Dict]


class _TopicRangeParserProtocol(Protocol):
    @property
    def supported_response_formats(self) -> frozenset[str]: ...

    def parse(self, response: str, sentence_count: int) -> list[Any]: ...


class _LLMFutureProtocol(Protocol):
    def result(self, timeout: Optional[float] = None) -> str: ...


class _ResolvedLLMFuture:
    def __init__(self, response: str) -> None:
        self._response = response

    def result(self, timeout: Optional[float] = None) -> str:  # noqa: ARG002
        return self._response


class _ValidatedCachingLLMCallable(CachingLLMCallable):
    """Cache wrapper that only stores and serves responses accepted by a validator."""

    def __init__(
        self,
        *args: Any,
        validator: Callable[[str, str], bool],
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        self._validator = validator

    def call(self, prompt: str, temperature: float) -> str:
        if not self._should_cache(temperature):
            self._annotate_cache_event(
                hit=False,
                cache_key=None,
                bypass_reason="nonzero_temperature",
            )
            return self._inner.call(prompt, temperature)

        cache_key = _build_cache_key(
            namespace=self._namespace,
            model_id=self._model_id,
            prompt_version=self._prompt_version,
            prompt=prompt,
            temperature=temperature,
        )
        entry = self._store.get(cache_key)
        if entry is not None and self._validator(prompt, entry.response):
            self._annotate_cache_event(hit=True, cache_key=cache_key)
            return entry.response

        response = self._inner.call(prompt, temperature)
        if self._validator(prompt, response):
            self._store.set(
                CacheEntry(
                    key=cache_key,
                    response=response,
                    created_at=time.time(),
                    namespace=self._namespace,
                    model_id=self._model_id,
                    prompt_version=self._prompt_version,
                    temperature=temperature,
                )
            )
            self._annotate_cache_event(hit=False, cache_key=cache_key)
            return response

        self._annotate_cache_event(
            hit=False,
            cache_key=cache_key,
            bypass_reason="validation_failed",
        )
        return response

    def submit(self, prompt: str, temperature: float) -> _LLMFutureProtocol:
        if not hasattr(self._inner, "submit"):
            return _ResolvedLLMFuture(self.call(prompt, temperature))

        if not self._should_cache(temperature):
            self._annotate_cache_event(
                hit=False,
                cache_key=None,
                bypass_reason="nonzero_temperature",
            )
            return cast(Any, self._inner).submit(prompt, temperature)

        cache_key = _build_cache_key(
            namespace=self._namespace,
            model_id=self._model_id,
            prompt_version=self._prompt_version,
            prompt=prompt,
            temperature=temperature,
        )
        entry = self._store.get(cache_key)
        if entry is not None and self._validator(prompt, entry.response):
            self._annotate_cache_event(hit=True, cache_key=cache_key)
            return _ResolvedLLMFuture(entry.response)

        inner_future = cast(Any, self._inner).submit(prompt, temperature)
        return _ValidatedCachingFuture(
            inner_future=inner_future,
            store=self._store,
            validator=self._validator,
            prompt=prompt,
            cache_key=cache_key,
            namespace=self._namespace,
            model_id=self._model_id,
            prompt_version=self._prompt_version,
            temperature=temperature,
            annotate_cache_event=self._annotate_cache_event,
        )


class _ValidatedCachingFuture:
    def __init__(
        self,
        *,
        inner_future: _LLMFutureProtocol,
        store: Any,
        validator: Callable[[str, str], bool],
        prompt: str,
        cache_key: str,
        namespace: str,
        model_id: Optional[str],
        prompt_version: Optional[str],
        temperature: float,
        annotate_cache_event: Callable[..., None],
    ) -> None:
        self._inner_future = inner_future
        self._store = store
        self._validator = validator
        self._prompt = prompt
        self._cache_key = cache_key
        self._namespace = namespace
        self._model_id = model_id
        self._prompt_version = prompt_version
        self._temperature = temperature
        self._annotate_cache_event = annotate_cache_event

    def result(self, timeout: Optional[float] = None) -> str:
        response = self._inner_future.result(timeout=timeout)
        if self._validator(self._prompt, response):
            self._store.set(
                CacheEntry(
                    key=self._cache_key,
                    response=response,
                    created_at=time.time(),
                    namespace=self._namespace,
                    model_id=self._model_id,
                    prompt_version=self._prompt_version,
                    temperature=self._temperature,
                )
            )
            self._annotate_cache_event(hit=False, cache_key=self._cache_key)
            return response

        self._annotate_cache_event(
            hit=False,
            cache_key=self._cache_key,
            bypass_reason="validation_failed",
        )
        return response


class _TracingFuture:
    def __init__(
        self,
        *,
        inner_future: _LLMFutureProtocol,
        tracer: Tracer,
        prompt: str,
        temperature: float,
    ) -> None:
        self._inner_future = inner_future
        self._tracer = tracer
        self._prompt = prompt
        self._temperature = temperature

    def result(self, timeout: Optional[float] = None) -> str:
        with self._tracer.span(
            "llm.call",
            prompt_length=len(self._prompt),
            temperature=self._temperature,
        ) as span:
            response = self._inner_future.result(timeout=timeout)
            span.attributes.setdefault("response_length", len(response))
            span.attributes.setdefault("prompt", self._prompt)
            span.attributes.setdefault("response", response)
            return response


class _LLMCallableAdapter:
    """Adapter for lib.llm.llamacpp.LLamaCPP to txt_splitt LLMCallable protocol."""

    def __init__(self, llm_client: Any) -> None:
        self._llm_client = llm_client

    @property
    def model_id(self) -> Optional[str]:
        return getattr(self._llm_client, "model_id", None)

    def call(self, prompt: str, temperature: float = 0.0) -> str:
        prompt_preview = prompt[:300] + "..." if len(prompt) > 300 else prompt
        logger.info(
            f"LLMCallableAdapter sending chunk ({len(prompt)} chars): {prompt_preview}"
        )
        result = self._llm_client.call([prompt], temperature=temperature)
        result_preview = result[:300] + "..." if len(result) > 300 else result
        logger.info(
            f"LLMCallableAdapter received response ({len(result)} chars): {result_preview}"
        )
        return result


def _make_llm_callable(llm: Any) -> Any:
    """
    Return an object satisfying txt_splitt's LLMCallable protocol.

    ``QueuedLLMClient`` already satisfies the protocol (``call(prompt, temperature)``),
    so it is returned as-is. Legacy ``LLMClient`` instances (``call([prompt], temperature=)``)
    are wrapped with ``_LLMCallableAdapter``.
    """
    if isinstance(llm, QueuedLLMClient):
        return llm
    return _LLMCallableAdapter(llm)


def _cache_namespace(base_namespace: str, llm_client: Any) -> str:
    model_id = getattr(llm_client, "model_id", "unknown")
    return f"{base_namespace}:{model_id}"


def _extract_prompt_marker_count(prompt: str) -> int:
    content_match = _PROMPT_CONTENT_PATTERN.search(prompt)
    content = content_match.group(1) if content_match else prompt
    marker_ids = [int(marker) for marker in _PROMPT_MARKER_PATTERN.findall(content)]
    if not marker_ids:
        return 0
    return max(marker_ids) + 1


def _response_has_valid_topic_ranges(
    prompt: str,
    response: str,
    parser_mode: Literal["text", "json", "auto"],
) -> bool:
    sentence_count = _extract_prompt_marker_count(prompt)
    if sentence_count <= 0:
        return False

    try:
        parser = _build_topic_range_parser(parser_mode)
        parsed_groups = parser.parse(response, sentence_count)
    except (ParseError, ValueError):
        return False

    return bool(parsed_groups)


def _build_topic_range_parser(
    parser_mode: Literal["text", "json", "auto"],
) -> _TopicRangeParserProtocol:
    try:
        parser = TopicRangeParser(input_mode=parser_mode)
    except TypeError:
        parser = TopicRangeParser()
    return cast(_TopicRangeParserProtocol, parser)


def _resolve_response_modes(
    use_json: bool,
) -> tuple[Literal["text", "json"], Literal["text", "json", "auto"]]:
    requested_output_mode: Literal["text", "json"] = (
        _JSON_RESPONSE_FORMAT if use_json else _TEXT_RESPONSE_FORMAT
    )
    requested_parser_mode: Literal["text", "json", "auto"] = (
        _JSON_RESPONSE_FORMAT
        if requested_output_mode == _JSON_RESPONSE_FORMAT
        else "auto"
    )
    parser = _build_topic_range_parser(requested_parser_mode)
    supported_formats = getattr(
        parser,
        "supported_response_formats",
        frozenset({_TEXT_RESPONSE_FORMAT}),
    )
    if requested_output_mode in supported_formats:
        return requested_output_mode, requested_parser_mode

    logger.warning(
        "TopicRangeParser does not support %s responses; falling back to text mode",
        requested_output_mode,
    )
    return _TEXT_RESPONSE_FORMAT, _TEXT_RESPONSE_FORMAT


def _groups_to_topics(
    groups: List[Any], sentence_objects: List[Any]
) -> List[Dict[str, Any]]:
    topics: List[Dict[str, Any]] = []
    sentence_by_index = {s.index: s for s in sentence_objects}

    for group in groups:
        indices: List[int] = []
        sentence_spans: List[Dict] = []
        topic_ranges: List[Dict] = []
        seen_sentence_indices = set()
        for sentence_range in group.ranges:
            sentence_start = sentence_range.start + 1
            sentence_end = sentence_range.end + 1
            # Convert to 1-based sentence indices for existing storage/UI format.
            indices.extend(range(sentence_range.start + 1, sentence_range.end + 2))

            start_sentence_obj = sentence_by_index.get(sentence_range.start)
            end_sentence_obj = sentence_by_index.get(sentence_range.end)
            start_offset = getattr(start_sentence_obj, "start", None)
            end_offset = getattr(end_sentence_obj, "end", None)
            topic_ranges.append(
                {
                    "sentence_start": sentence_start,
                    "sentence_end": sentence_end,
                    "start": start_offset,
                    "end": end_offset,
                }
            )

            for idx in range(sentence_range.start, sentence_range.end + 1):
                if idx in seen_sentence_indices:
                    continue
                seen_sentence_indices.add(idx)
                sentence_obj = sentence_by_index.get(idx)
                sentence_spans.append(
                    {
                        "sentence": idx + 1,
                        "start": getattr(sentence_obj, "start", None),
                        "end": getattr(sentence_obj, "end", None),
                    }
                )

        if not indices:
            continue

        topics.append(
            {
                "name": ">".join(group.label),
                "sentences": sorted(set(indices)),
                "sentence_spans": sentence_spans,
                "ranges": topic_ranges,
            }
        )

    return topics


def _execute_request(
    llm_callable: Any,
    request: LLMRequest,
) -> LLMResponse:
    response = llm_callable.call(request.prompt, temperature=request.temperature)
    return LLMResponse(content=response)


def _submit_request(
    llm_callable: Any,
    request: LLMRequest,
) -> Optional[_LLMFutureProtocol]:
    if isinstance(llm_callable, TracingLLMCallable):
        inner_submit = _submit_request(getattr(llm_callable, "_inner"), request)
        if inner_submit is None:
            return None
        return _TracingFuture(
            inner_future=inner_submit,
            tracer=getattr(llm_callable, "_tracer"),
            prompt=request.prompt,
            temperature=request.temperature,
        )

    submit = getattr(llm_callable, "submit", None)
    if callable(submit):
        return cast(_LLMFutureProtocol, submit(request.prompt, request.temperature))

    return None


def _run_pipeline_session(
    pipeline: Any,
    article: str,
    llm_callable: Any,
) -> Any:
    session = pipeline.start(article)
    while not session.is_complete():
        requests = session.pending_requests()
        futures_or_none = [
            _submit_request(llm_callable, request) for request in requests
        ]
        if all(future is not None for future in futures_or_none):
            responses = [
                LLMResponse(content=cast(_LLMFutureProtocol, future).result())
                for future in futures_or_none
            ]
        else:
            responses = [
                _execute_request(llm_callable, request) for request in requests
            ]
        session.submit_responses(responses)
    return session.result()


def _execute_pipeline(
    pipeline: Any,
    article: str,
    llm_callable: Any,
) -> Any:
    try:
        return pipeline.run(article)
    except RuntimeError as exc:
        if str(exc) != _DEFERRED_BATCH_ERROR:
            raise
        return _run_pipeline_session(pipeline, article, llm_callable)


def split_article(
    article: str,
    llm: Optional[Any] = None,
    tracer: Optional[Tracer] = None,
    anchor_every_words: int = 12,
    max_chunk_chars: int = 84_000,
    long_sentence_word_threshold: int = 24,
    min_sentence_words: int = 4,
    cache_store: Optional[Any] = None,
    temperature: float = 0.0,
    retry_policy: Optional[RetryConfig] = None,
    use_json: bool = False,
) -> ArticleSplitResult:
    """
    Split an article into sentences and topic ranges using txt_splitt.

    Args:
        article: The article text (plain or HTML).
        llm: LLM client used by txt_splitt topic extraction.
        tracer: Optional tracer for pipeline debugging.
        anchor_every_words: Add a marker anchor roughly every N words.
        max_chunk_chars: Maximum characters per chunk for LLM processing.
        temperature: LLM generation temperature.
        retry_policy: Optional retry configuration for LLM calls.
        use_json: Whether to use JSON output mode for LLM responses.

    Returns:
        ArticleSplitResult containing sentences and topics.
    """
    if not article:
        return ArticleSplitResult(sentences=[], topics=[])

    splitter = SparseRegexSentenceSplitter(
        anchor_every_words=anchor_every_words,
        long_sentence_word_threshold=long_sentence_word_threshold,
        min_sentence_words=min_sentence_words,
        html_aware=True,
    )
    html_cleaner = HTMLParserTagStripCleaner(strip_tags={"style", "script"})
    offset_restorer = MappingOffsetRestorer()

    if llm is None:
        cleaned_article, _ = html_cleaner.clean(article)
        sentence_objects = splitter.split(cleaned_article)
        return ArticleSplitResult(
            sentences=[s.text for s in sentence_objects],
            topics=[],
        )

    llm_callable = _make_llm_callable(llm)
    # For QueuedLLMClient, network retries are handled by the LLM worker;
    # skip RetryingLLMCallable to avoid double-retry overhead.
    if isinstance(llm, QueuedLLMClient):
        llm_with_retry = llm_callable
    else:
        llm_with_retry = RetryingLLMCallable(
            llm_callable, max_retries=3, backoff_factor=1.0
        )

    if retry_policy is None:
        retry_policy = RetryConfig(
            max_attempts=3,
            temperature_schedule=[
                temperature + 0.1,
                temperature + 0.3,
                temperature + 0.5,
            ],
        )

    output_mode, parser_mode = _resolve_response_modes(use_json)
    cached_adapter = (
        _ValidatedCachingLLMCallable(
            llm_with_retry,
            cache_store,
            namespace=_cache_namespace("article-split", llm),
            validator=lambda prompt, response: _response_has_valid_topic_ranges(
                prompt,
                response,
                parser_mode,
            ),
        )
        if cache_store is not None
        else llm_with_retry
    )
    llm_callable = (
        TracingLLMCallable(cached_adapter, tracer) if tracer else cached_adapter
    )

    pipeline = build_pipeline(
        splitter=splitter,
        marker=OptimizingMarker(BracketMarker()),
        llm=TopicRangeLLM(
            client=llm_callable,
            temperature=temperature,
            chunker=OverlapChunker(max_chars=max_chunk_chars),
            output_mode=output_mode,
            retry_policy=retry_policy,
        ),
        parser=_build_topic_range_parser(parser_mode),
        gap_handler=LLMRepairingGapHandler(
            llm_callable, temperature=temperature, tracer=tracer
        ),
        joiner=AdjacentSameTopicJoiner(),
        html_cleaner=html_cleaner,
        offset_restorer=offset_restorer,
        tracer=tracer,
        merge_similar_topics=True,
    )

    article_preview = article[:500] + "..." if len(article) > 500 else article
    logger.info(
        f"Running pipeline on article ({len(article)} chars): {article_preview}"
    )

    split_result = _execute_pipeline(pipeline, article, llm_callable)
    sentences = [s.text for s in split_result.sentences]
    topics = _groups_to_topics(split_result.groups, split_result.sentences)

    return ArticleSplitResult(sentences=sentences, topics=topics)


def split_article_with_markers(
    article: str,
    llm: Optional[Any] = None,
    tracer: Optional[Tracer] = None,
    anchor_every_words: int = 12,
    max_chunk_chars: int = 84_000,
    long_sentence_word_threshold: int = 24,
    min_sentence_words: int = 4,
    cache_store: Optional[Any] = None,
    temperature: float = 0.0,
    retry_policy: Optional[RetryConfig] = None,
    use_json: bool = False,
) -> ArticleSplitResult:
    """Backward-compatible alias for split_article."""
    return split_article(
        article,
        llm=llm,
        tracer=tracer,
        anchor_every_words=anchor_every_words,
        max_chunk_chars=max_chunk_chars,
        long_sentence_word_threshold=long_sentence_word_threshold,
        min_sentence_words=min_sentence_words,
        cache_store=cache_store,
        temperature=temperature,
        retry_policy=retry_policy,
        use_json=use_json,
    )
