"""txt_splitt - A modular, pipeline-based text splitter."""

from lib.txt_splitt.chunkers import SizeBasedChunker
from lib.txt_splitt.enhancers import ShortSentenceEnhancer
from lib.txt_splitt.errors import (
    EnhancerError,
    GapError,
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
from lib.txt_splitt.llm import TopicRangeLLM
from lib.txt_splitt.markers import BracketMarker
from lib.txt_splitt.normalizers import NormalizingSplitter
from lib.txt_splitt.parsers import TopicRangeParser
from lib.txt_splitt.pipeline import Pipeline
from lib.txt_splitt.protocols import (
    Enhancer,
    GapHandler,
    LLMCallable,
    LLMStrategy,
    MarkedTextChunker,
    MarkerStrategy,
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
    "Sentence",
    "SentenceGroup",
    "SentenceRange",
    "SplitResult",
    # Protocols
    "Enhancer",
    "GapHandler",
    "LLMCallable",
    "LLMStrategy",
    "MarkedTextChunker",
    "MarkerStrategy",
    "ResponseParser",
    "SentenceSplitter",
    # Concrete implementations
    "BracketMarker",
    "SizeBasedChunker",
    "NormalizingSplitter",
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
    "LLMError",
    "MarkerError",
    "ParseError",
    "SentenceSplitError",
    "SplitterError",
]
