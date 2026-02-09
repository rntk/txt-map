"""txt_splitt - A modular, pipeline-based text splitter."""

from lib.txt_splitt.chunkers import SizeBasedChunker
from lib.txt_splitt.enhancers import ShortSentenceEnhancer
from lib.txt_splitt.errors import (
    EnhancerError,
    GapError,
    HtmlCleanError,
    LLMError,
    MarkerError,
    ParseError,
    SentenceSplitError,
    SplitterError,
)
from lib.txt_splitt.gap_handlers import (
    LLMRepairingGapHandler,
    RepairingGapHandler,
    StrictGapHandler,
)
from lib.txt_splitt.html_cleaners import HTMLParserTagStripCleaner, TagStripCleaner
from lib.txt_splitt.llm import TopicRangeLLM
from lib.txt_splitt.markers import BracketMarker
from lib.txt_splitt.normalizers import NormalizingSplitter
from lib.txt_splitt.offset_restorers import MappingOffsetRestorer
from lib.txt_splitt.parsers import TopicRangeParser
from lib.txt_splitt.pipeline import Pipeline
from lib.txt_splitt.protocols import (
    Enhancer,
    GapHandler,
    HtmlCleaner,
    LLMCallable,
    LLMStrategy,
    MarkedTextChunker,
    MarkerStrategy,
    OffsetRestorer,
    ResponseParser,
    SentenceSplitter,
)
from lib.txt_splitt.splitters import (
    DenseRegexSentenceSplitter,
    HtmlAwareSentenceSplitter,
    RegexSentenceSplitter,
)
from lib.txt_splitt.tracer import NoOpSpan, NoOpTracer, Span, Tracer, TracingLLMCallable
from lib.txt_splitt.types import (
    MarkedText,
    OffsetMapping,
    OffsetSegment,
    Sentence,
    SentenceGroup,
    SentenceRange,
    SplitResult,
)

__all__ = [
    # Pipeline
    "Pipeline",
    # Types
    "MarkedText",
    "OffsetMapping",
    "OffsetSegment",
    "Sentence",
    "SentenceGroup",
    "SentenceRange",
    "SplitResult",
    # Protocols
    "Enhancer",
    "GapHandler",
    "HtmlCleaner",
    "LLMCallable",
    "LLMStrategy",
    "MarkedTextChunker",
    "MarkerStrategy",
    "OffsetRestorer",
    "ResponseParser",
    "SentenceSplitter",
    # Concrete implementations
    "BracketMarker",
    "MappingOffsetRestorer",
    "SizeBasedChunker",
    "NormalizingSplitter",
    "HTMLParserTagStripCleaner",
    "TagStripCleaner",
    "DenseRegexSentenceSplitter",
    "HtmlAwareSentenceSplitter",
    "RegexSentenceSplitter",
    "ShortSentenceEnhancer",
    "LLMRepairingGapHandler",
    "RepairingGapHandler",
    "StrictGapHandler",
    "TopicRangeLLM",
    "TopicRangeParser",
    # Tracing
    "NoOpSpan",
    "NoOpTracer",
    "Span",
    "Tracer",
    "TracingLLMCallable",
    # Errors
    "EnhancerError",
    "GapError",
    "HtmlCleanError",
    "LLMError",
    "MarkerError",
    "ParseError",
    "SentenceSplitError",
    "SplitterError",
]
