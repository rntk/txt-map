from dataclasses import dataclass
from typing import Dict, List, Optional

from lib.txt_splitt import (
    BracketMarker,
    DenseRegexSentenceSplitter,
    HTMLParserTagStripCleaner,
    LLMRepairingGapHandler,
    MappingOffsetRestorer,
    NormalizingSplitter,
    Pipeline,
    SizeBasedChunker,
    TopicRangeLLM,
    TopicRangeParser,
    AdjacentSameTopicJoiner,
    Tracer,
    TracingLLMCallable,
)


@dataclass
class ArticleSplitResult:
    sentences: List[str]
    topics: List[Dict]


class _LLMCallableAdapter:
    """Adapter for lib.llm.llamacpp.LLamaCPP to txt_splitt LLMCallable protocol."""

    def __init__(self, llm_client):
        self._llm_client = llm_client

    def call(self, prompt: str, temperature: float = 0.0) -> str:
        return self._llm_client.call([prompt], temperature=temperature)


def _groups_to_topics(groups) -> List[Dict]:
    topics: List[Dict] = []

    for group in groups:
        indices: List[int] = []
        for sentence_range in group.ranges:
            # Convert to 1-based sentence indices for existing storage/UI format.
            indices.extend(range(sentence_range.start + 1, sentence_range.end + 2))

        if not indices:
            continue

        topics.append(
            {
                "name": ">".join(group.label),
                "sentences": sorted(set(indices)),
            }
        )

    return topics


def split_article(
    article: str,
    llm=None,
    tracer: Optional[Tracer] = None,
    anchor_every_words: int = 5,
    max_chunk_chars: int = 12_000,
) -> ArticleSplitResult:
    """
    Split an article into sentences and topic ranges using txt_splitt.

    Args:
        article: The article text (plain or HTML).
        llm: LLM client used by txt_splitt topic extraction.
        tracer: Optional tracer for pipeline debugging.
        anchor_every_words: Add a marker anchor roughly every N words.
        max_chunk_chars: Maximum characters per chunk for LLM processing.

    Returns:
        ArticleSplitResult containing sentences and topics.
    """
    if not article:
        return ArticleSplitResult(sentences=[], topics=[])

    splitter = NormalizingSplitter(
        DenseRegexSentenceSplitter(
            anchor_every_words=anchor_every_words, html_aware=True
        ),
        min_length=20,
        max_length=260,
    )
    html_cleaner = HTMLParserTagStripCleaner()
    offset_restorer = MappingOffsetRestorer()

    if llm is None:
        cleaned_article, _ = html_cleaner.clean(article)
        sentence_objects = splitter.split(cleaned_article)
        return ArticleSplitResult(
            sentences=[s.text for s in sentence_objects],
            topics=[],
        )

    llm_adapter = _LLMCallableAdapter(llm)
    llm_callable = TracingLLMCallable(llm_adapter, tracer) if tracer else llm_adapter

    pipeline = Pipeline(
        splitter=splitter,
        marker=BracketMarker(),
        llm=TopicRangeLLM(
            client=llm_callable,
            temperature=0.0,
            chunker=SizeBasedChunker(max_chars=max_chunk_chars),
        ),
        parser=TopicRangeParser(),
        gap_handler=LLMRepairingGapHandler(
            llm_callable, temperature=0.0, tracer=tracer
        ),
        joiner=AdjacentSameTopicJoiner(),
        html_cleaner=html_cleaner,
        offset_restorer=offset_restorer,
        tracer=tracer,
    )

    split_result = pipeline.run(article)
    sentences = [s.text for s in split_result.sentences]
    topics = _groups_to_topics(split_result.groups)

    return ArticleSplitResult(sentences=sentences, topics=topics)


def split_article_with_markers(
    article: str,
    llm=None,
    tracer: Optional[Tracer] = None,
    anchor_every_words: int = 5,
    max_chunk_chars: int = 12_000,
) -> ArticleSplitResult:
    """Backward-compatible alias for split_article."""
    return split_article(
        article,
        llm=llm,
        tracer=tracer,
        anchor_every_words=anchor_every_words,
        max_chunk_chars=max_chunk_chars,
    )
