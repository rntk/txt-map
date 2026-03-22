from dataclasses import dataclass
from typing import Dict, List, Optional, Any
import logging

from txt_splitt import (
    BracketMarker,
    SparseRegexSentenceSplitter,
    HTMLParserTagStripCleaner,
    LLMRepairingGapHandler,
    MappingOffsetRestorer,
    Pipeline,
    OverlapChunker,
    TopicRangeLLM,
    TopicRangeParser,
    AdjacentSameTopicJoiner,
    Tracer,
    TracingLLMCallable,
    RetryConfig,
    RetryingLLMCallable,
)
from txt_splitt.cache import CachingLLMCallable

logger = logging.getLogger(__name__)


@dataclass
class ArticleSplitResult:
    sentences: List[str]
    topics: List[Dict]


class _LLMCallableAdapter:
    """Adapter for lib.llm.llamacpp.LLamaCPP to txt_splitt LLMCallable protocol."""

    def __init__(self, llm_client: Any) -> None:
        self._llm_client = llm_client

    @property
    def model_id(self) -> Optional[str]:
        return getattr(self._llm_client, "model_id", None)

    def call(self, prompt: str, temperature: float = 0.0) -> str:
        prompt_preview = prompt[:300] + "..." if len(prompt) > 300 else prompt
        logger.info(f"LLMCallableAdapter sending chunk ({len(prompt)} chars): {prompt_preview}")
        result = self._llm_client.call([prompt], temperature=temperature)
        result_preview = result[:300] + "..." if len(result) > 300 else result
        logger.info(f"LLMCallableAdapter received response ({len(result)} chars): {result_preview}")
        return result


def _cache_namespace(base_namespace: str, llm_client: Any) -> str:
    model_id = getattr(llm_client, "model_id", "unknown")
    return f"{base_namespace}:{model_id}"


def _groups_to_topics(groups: List[Any], sentence_objects: List[Any]) -> List[Dict[str, Any]]:
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


def split_article(
    article: str,
    llm: Optional[Any] = None,
    tracer: Optional[Tracer] = None,
    anchor_every_words: int = 5,
    max_chunk_chars: int = 12_000,
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
        anchor_every_words=anchor_every_words, html_aware=True
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

    llm_adapter = _LLMCallableAdapter(llm)
    llm_with_retry = RetryingLLMCallable(llm_adapter, max_retries=3, backoff_factor=1.0)
    
    cached_adapter = (
        CachingLLMCallable(
            llm_with_retry,
            cache_store,
            namespace=_cache_namespace("article-split", llm),
        )
        if cache_store is not None
        else llm_with_retry
    )
    llm_callable = TracingLLMCallable(cached_adapter, tracer) if tracer else cached_adapter

    if retry_policy is None:
        retry_policy = RetryConfig(
            max_attempts=3,
            temperature_schedule=[
                temperature + 0.1,
                temperature + 0.3,
                temperature + 0.5,
            ],
        )

    output_mode: Literal["text", "json"] = "json" if use_json else "text"
    parser_mode: Literal["text", "json", "auto"] = "json" if output_mode == "json" else "auto"

    pipeline = Pipeline(
        splitter=splitter,
        marker=BracketMarker(),
        llm=TopicRangeLLM(
            client=llm_callable,
            temperature=temperature,
            chunker=OverlapChunker(max_chars=max_chunk_chars),
            output_mode=output_mode,
            retry_policy=retry_policy,
        ),
        parser=TopicRangeParser(input_mode=parser_mode),
        gap_handler=LLMRepairingGapHandler(
            llm_callable, temperature=temperature, tracer=tracer
        ),
        joiner=AdjacentSameTopicJoiner(),
        html_cleaner=html_cleaner,
        offset_restorer=offset_restorer,
        tracer=tracer,
    )

    article_preview = article[:500] + "..." if len(article) > 500 else article
    logger.info(f"Running pipeline on article ({len(article)} chars): {article_preview}")
    
    split_result = pipeline.run(article)
    sentences = [s.text for s in split_result.sentences]
    topics = _groups_to_topics(split_result.groups, split_result.sentences)

    return ArticleSplitResult(sentences=sentences, topics=topics)


def split_article_with_markers(
    article: str,
    llm: Optional[Any] = None,
    tracer: Optional[Tracer] = None,
    anchor_every_words: int = 5,
    max_chunk_chars: int = 12_000,
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
        cache_store=cache_store,
        temperature=temperature,
        retry_policy=retry_policy,
        use_json=use_json,
    )
