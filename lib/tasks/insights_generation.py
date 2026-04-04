"""
Insights generation task.
"""
import inspect
import logging
import re
from collections import defaultdict
from typing import Any, DefaultDict, Dict, List, Tuple

from lib.article_splitter import _make_llm_callable
from lib.llm_queue.client import QueuedLLMClient
from lib.storage.submissions import SubmissionsStorage
from txt_splitt import RetryConfig, RetryingLLMCallable
from txt_splitt.cache import CachingLLMCallable
from txt_splitt.html_cleaners import HTMLParserTagStripCleaner
from txt_splitt.insights import InsightParser, build_insight_llm
from txt_splitt.sentences import (
    BracketMarker,
    OptimizingMarker,
    OverlapChunker,
    SparseRegexSentenceSplitter,
)


logger = logging.getLogger(__name__)


def _coerce_sentence_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    text_attr = getattr(value, "text", None)
    if isinstance(text_attr, str):
        return text_attr
    return str(value or "")


def _cache_namespace(llm_client: Any) -> str:
    model_id = getattr(llm_client, "model_id", "unknown")
    return f"content_annotation:{model_id}"


def _build_compatible_insight_llm(
    llm_callable: Any,
    *,
    temperature: float,
    chunker: Any,
    retry_policy: RetryConfig,
) -> Any:
    """Build an insight LLM across txt_splitt API versions."""
    build_signature = inspect.signature(build_insight_llm)
    builder_arguments: Dict[str, Any] = {
        "temperature": temperature,
        "chunker": chunker,
    }

    if "retry_policy" in build_signature.parameters:
        builder_arguments["retry_policy"] = retry_policy

    if "client" in build_signature.parameters:
        builder_arguments["client"] = llm_callable
        return build_insight_llm(**builder_arguments)

    if "llm_callable" in build_signature.parameters:
        builder_arguments["llm_callable"] = llm_callable
        return build_insight_llm(**builder_arguments)

    insight_llm = build_insight_llm(**builder_arguments)

    # Older txt_splitt releases return an unbound TopicRangeLLM. Bind the client
    # and retry policy here so the caller can still use .query() directly.
    if getattr(insight_llm, "_client", None) is None:
        setattr(insight_llm, "_client", llm_callable)
    if getattr(insight_llm, "_retry_policy", None) is None:
        setattr(insight_llm, "_retry_policy", retry_policy)
    return insight_llm


def _build_compatible_insight_parser(*, input_mode: str) -> InsightParser:
    """Build an insight parser across txt_splitt API versions."""
    parser_signature = inspect.signature(InsightParser)
    if "input_mode" in parser_signature.parameters:
        return InsightParser(input_mode=input_mode)
    return InsightParser()


def _insight_ranges_to_sentence_indices(ranges: List[Any]) -> List[int]:
    """Convert 0-based inclusive insight ranges into deduped 1-based sentence indices."""
    indices: List[int] = []
    seen: set[int] = set()

    for sentence_range in ranges:
        for idx in range(sentence_range.start + 1, sentence_range.end + 2):
            if idx in seen:
                continue
            seen.add(idx)
            indices.append(idx)

    return indices


def _normalize_sentence_text(text: str) -> str:
    return re.sub(r"\s+", " ", _coerce_sentence_text(text).strip())


def _resolve_insight_source_sentences(
    sentence_indices: List[int],
    sentence_list: List[Any],
) -> List[str]:
    source_sentences: List[str] = []
    for sentence_index in sentence_indices:
        zero_based_index = sentence_index - 1
        if 0 <= zero_based_index < len(sentence_list):
            source_sentences.append(_coerce_sentence_text(sentence_list[zero_based_index]))
    return source_sentences


def _align_source_sentences_to_results_sentences(
    source_sentences: List[str],
    results_sentences: List[str],
) -> List[int]:
    """Map insight sentence texts onto canonical results.sentences indices."""
    if not source_sentences or not results_sentences:
        return []

    normalized_index_map: DefaultDict[str, List[int]] = defaultdict(list)
    for index, sentence in enumerate(results_sentences, start=1):
        normalized_index_map[_normalize_sentence_text(sentence)].append(index)

    occurrence_cursor: DefaultDict[str, int] = defaultdict(int)
    aligned_indices: List[int] = []

    for source_sentence in source_sentences:
        normalized_sentence = _normalize_sentence_text(source_sentence)
        candidate_indices = normalized_index_map.get(normalized_sentence, [])
        candidate_position = occurrence_cursor[normalized_sentence]
        if candidate_position >= len(candidate_indices):
            continue
        aligned_indices.append(candidate_indices[candidate_position])
        occurrence_cursor[normalized_sentence] += 1

    return aligned_indices


def _find_matching_result_sentence_indices(
    source_sentence: str,
    results_sentences: List[str],
) -> List[int]:
    normalized_source_sentence = _normalize_sentence_text(source_sentence)
    if not normalized_source_sentence:
        return []

    matches: List[int] = []
    for sentence_index, result_sentence in enumerate(results_sentences, start=1):
        normalized_result_sentence = _normalize_sentence_text(result_sentence)
        if not normalized_result_sentence:
            continue
        if normalized_result_sentence == normalized_source_sentence:
            matches.append(sentence_index)
            continue
        if len(normalized_source_sentence) >= 24 and (
            normalized_source_sentence in normalized_result_sentence
            or normalized_result_sentence in normalized_source_sentence
        ):
            matches.append(sentence_index)

    return matches


def _map_insight_sentence_indices_to_topics(
    sentence_indices: List[int],
    topics: List[Dict[str, Any]],
) -> List[str]:
    """Map insight sentence indices to original topic names in article order."""
    if not sentence_indices or not topics:
        return []

    sentence_index_set = set(sentence_indices)
    topic_matches: List[Tuple[int, str]] = []

    for topic in topics:
        topic_name = str(topic.get("name", "")).strip()
        topic_sentences_raw = topic.get("sentences", [])
        if not topic_name or not isinstance(topic_sentences_raw, list):
            continue

        matched_indices = sorted(
            idx for idx in topic_sentences_raw
            if isinstance(idx, int) and idx in sentence_index_set
        )
        if matched_indices:
            topic_matches.append((matched_indices[0], topic_name))

    topic_matches.sort(key=lambda item: item[0])
    return [topic_name for _, topic_name in topic_matches]


def _map_insight_ranges_to_topics_by_overlap(
    ranges: List[Dict[str, int]],
    topics: List[Dict[str, Any]],
) -> List[str]:
    """Map insight ranges to topics by sentence-range overlap, not exact index equality."""
    if not ranges or not topics:
        return []

    normalized_insight_ranges: List[Tuple[int, int]] = []
    for sentence_range in ranges:
        start = sentence_range.get("start")
        end = sentence_range.get("end")
        if not isinstance(start, int) or not isinstance(end, int):
            continue
        normalized_insight_ranges.append((start + 1, end + 1))

    if not normalized_insight_ranges:
        return []

    topic_matches: List[Tuple[int, str]] = []
    for topic in topics:
        topic_name = str(topic.get("name", "")).strip()
        if not topic_name:
            continue

        topic_ranges = topic.get("ranges", [])
        matched_start: int | None = None

        if isinstance(topic_ranges, list) and topic_ranges:
            for topic_range in topic_ranges:
                if not isinstance(topic_range, dict):
                    continue
                topic_start = topic_range.get("sentence_start")
                topic_end = topic_range.get("sentence_end", topic_start)
                if not isinstance(topic_start, int) or not isinstance(topic_end, int):
                    continue
                for insight_start, insight_end in normalized_insight_ranges:
                    if insight_start <= topic_end and topic_start <= insight_end:
                        matched_start = topic_start
                        break
                if matched_start is not None:
                    break
        else:
            topic_sentences = [
                sentence_index
                for sentence_index in topic.get("sentences", [])
                if isinstance(sentence_index, int)
            ]
            if topic_sentences:
                topic_start = min(topic_sentences)
                topic_end = max(topic_sentences)
                for insight_start, insight_end in normalized_insight_ranges:
                    if insight_start <= topic_end and topic_start <= insight_end:
                        matched_start = topic_start
                        break

        if matched_start is not None:
            topic_matches.append((matched_start, topic_name))

    topic_matches.sort(key=lambda item: item[0])
    seen_topic_names: set[str] = set()
    ordered_topic_names: List[str] = []
    for _, topic_name in topic_matches:
        if topic_name in seen_topic_names:
            continue
        seen_topic_names.add(topic_name)
        ordered_topic_names.append(topic_name)
    return ordered_topic_names


def _map_insight_source_sentences_to_topics(
    source_sentences: List[str],
    results_sentences: List[str],
    topics: List[Dict[str, Any]],
) -> List[str]:
    if not source_sentences or not results_sentences or not topics:
        return []

    candidate_sentence_indices: List[int] = []
    seen_indices: set[int] = set()
    for source_sentence in source_sentences:
        for sentence_index in _find_matching_result_sentence_indices(source_sentence, results_sentences):
            if sentence_index in seen_indices:
                continue
            seen_indices.add(sentence_index)
            candidate_sentence_indices.append(sentence_index)

    return _map_insight_sentence_indices_to_topics(candidate_sentence_indices, topics)


def _generate_insights(
    submission: Dict[str, Any],
    topics: List[Dict[str, Any]],
    llm: Any,
    cache_store: Any,
    namespace: str,
) -> List[Dict[str, Any]]:
    """
    Run the txt_splitt insights pipeline on the submission source text.

    Returns a list of insight dicts with keys:
        name                    - short descriptive title (3-8 words)
        ranges                  - list of {start, end} dicts (0-based, inclusive)
        source_sentence_indices - 1-based sentence indices covered by the ranges
        topics                  - topic names that contain those sentence indices
    """
    source = submission.get("html_content") or submission.get("text_content", "")
    results_sentences = submission.get("results", {}).get("sentences", [])
    canonical_sentences = results_sentences if isinstance(results_sentences, list) else []
    if not source:
        return []

    html_source = submission.get("html_content") or ""
    if html_source:
        cleaner = HTMLParserTagStripCleaner(strip_tags={"style", "script"})
        text, _ = cleaner.clean(source)
    else:
        text = source

    splitter = SparseRegexSentenceSplitter(anchor_every_words=12)
    marker = OptimizingMarker(BracketMarker())
    sentence_list = splitter.split(text)
    if not sentence_list:
        return []
    marked = marker.mark(text, sentence_list)

    llm_adapted = _make_llm_callable(llm)
    if isinstance(llm, QueuedLLMClient):
        # Network retries handled by LLM worker; skip RetryingLLMCallable.
        llm_with_retry: Any = llm_adapted
    else:
        llm_with_retry = RetryingLLMCallable(llm_adapted, max_retries=3, backoff_factor=1.0)
    if cache_store is not None:
        llm_callable = CachingLLMCallable(
            llm_with_retry,
            cache_store,
            namespace=namespace + ":insights",
            prompt_version="insights_v1",
        )
    else:
        llm_callable = llm_with_retry

    retry_policy = RetryConfig(
        max_attempts=3,
        temperature_schedule=[0.1, 0.3, 0.5],
    )
    insight_llm = _build_compatible_insight_llm(
        llm_callable,
        temperature=0.0,
        chunker=OverlapChunker(max_chars=84000),
        retry_policy=retry_policy,
    )
    parser = _build_compatible_insight_parser(input_mode="text")

    try:
        raw_response = insight_llm.query(marked)
        insights = parser.parse(raw_response, marked.sentence_count)
    except Exception as exc:
        logger.warning("Insights pipeline failed: %s", exc)
        return []

    result: List[Dict[str, Any]] = []
    for insight in insights:
        ranges = [{"start": sentence_range.start, "end": sentence_range.end} for sentence_range in insight.ranges]
        raw_source_sentence_indices = _insight_ranges_to_sentence_indices(insight.ranges)
        source_sentences = _resolve_insight_source_sentences(raw_source_sentence_indices, sentence_list)
        aligned_source_sentence_indices = _align_source_sentences_to_results_sentences(
            source_sentences,
            canonical_sentences,
        )
        source_sentence_indices = aligned_source_sentence_indices or [
            sentence_index
            for sentence_index in raw_source_sentence_indices
            if 1 <= sentence_index <= len(canonical_sentences)
        ]
        insight_topics = _map_insight_sentence_indices_to_topics(source_sentence_indices, topics)
        if not insight_topics:
            insight_topics = _map_insight_source_sentences_to_topics(
                source_sentences,
                canonical_sentences,
                topics,
            )
        if not insight_topics:
            insight_topics = _map_insight_ranges_to_topics_by_overlap(ranges, topics)
        result.append(
            {
                "name": insight.name,
                "ranges": ranges,
                "source_sentence_indices": source_sentence_indices,
                "source_sentences": source_sentences,
                "topics": insight_topics,
            }
        )

    return result


def process_insights_generation(
    submission: Dict[str, Any],
    db: Any,
    llm: Any,
    cache_store: Any = None,
) -> None:
    """Generate article insights and store them at results.insights."""
    submission_id = submission["submission_id"]
    topics = submission.get("results", {}).get("topics", [])
    if not topics:
        raise ValueError("Topic extraction must be completed first")

    namespace = _cache_namespace(llm)
    insights = _generate_insights(submission, topics, llm, cache_store, namespace)

    logger.info("Insights generation completed for %s: %d insights", submission_id, len(insights))
    SubmissionsStorage(db).update_results(submission_id, {"insights": insights})
