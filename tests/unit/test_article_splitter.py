"""
Unit tests for the article_splitter module.

Tests ArticleSplitResult dataclass, _groups_to_topics, _LLMCallableAdapter,
split_article, and split_article_with_markers functions.
"""
from unittest.mock import MagicMock, patch

# Import module under test
from lib.article_splitter import (
    ArticleSplitResult,
    _groups_to_topics,
    _LLMCallableAdapter,
    split_article,
    split_article_with_markers,
)


# =============================================================================
# Mock Classes for txt_splitt Components
# =============================================================================

class MockSentence:
    """Mock Sentence object from txt_splitt."""
    def __init__(self, text, index, start=None, end=None):
        self.text = text
        self.index = index
        self.start = start
        self.end = end


class MockSentenceRange:
    """Mock SentenceRange object from txt_splitt."""
    def __init__(self, start, end):
        self.start = start
        self.end = end


class MockGroup:
    """Mock Group object from txt_splitt."""
    def __init__(self, label, ranges):
        self.label = label
        self.ranges = ranges


class MockTracer:
    """Mock Tracer from txt_splitt."""
    def __init__(self):
        self.traces = []

    def trace(self, component, data):
        self.traces.append((component, data))

    def format(self):
        if not self.traces:
            return ""
        return "\n".join(f"{comp}: {data}" for comp, data in self.traces)


class MockLLMClient:
    """Mock LLM client (LLamaCPP)."""
    def __init__(self, response="Mock LLM response"):
        self.response = response
        self.call_count = 0
        self.last_prompts = []
        self.last_temperature = None

    def call(self, prompts, temperature=0.0):
        self.call_count += 1
        self.last_prompts = prompts
        self.last_temperature = temperature
        return self.response


class MockSparseRegexSentenceSplitter:
    """Mock SparseRegexSentenceSplitter from txt_splitt."""
    def __init__(self, anchor_every_words=5, html_aware=False):
        self.anchor_every_words = anchor_every_words
        self.html_aware = html_aware

    def split(self, text):
        # Simple mock: split by sentence-ending punctuation
        sentences = []
        import re
        parts = re.split(r'(?<=[.!?])\s+', text.strip())
        for i, part in enumerate(parts):
            if part.strip():
                sentences.append(MockSentence(part.strip(), i))
        return sentences


class MockBracketMarker:
    """Mock BracketMarker from txt_splitt."""
    pass


class MockOverlapChunker:
    """Mock OverlapChunker from txt_splitt."""
    def __init__(self, max_chars=12000):
        self.max_chars = max_chars


class MockTopicRangeLLM:
    """Mock TopicRangeLLM from txt_splitt."""
    def __init__(self, client=None, temperature=0.0, chunker=None):
        self.client = client
        self.temperature = temperature
        self.chunker = chunker


class MockTopicRangeParser:
    """Mock TopicRangeParser from txt_splitt."""
    pass


class MockLLMRepairingGapHandler:
    """Mock LLMRepairingGapHandler from txt_splitt."""
    def __init__(self, llm_callable, temperature=0.0, tracer=None):
        self.llm_callable = llm_callable
        self.temperature = temperature
        self.tracer = tracer


class MockAdjacentSameTopicJoiner:
    """Mock AdjacentSameTopicJoiner from txt_splitt."""
    pass


class MockHTMLParserTagStripCleaner:
    """Mock HTMLParserTagStripCleaner from txt_splitt."""
    def clean(self, html):
        # Simple mock: strip HTML tags
        import re
        text = re.sub(r'<[^>]+>', '', html)
        text = re.sub(r'\s+', ' ', text).strip()
        return text, None


class MockMappingOffsetRestorer:
    """Mock MappingOffsetRestorer from txt_splitt."""
    pass


class MockPipeline:
    """Mock Pipeline from txt_splitt."""
    def __init__(self, splitter, marker, llm, parser, gap_handler, joiner,
                 html_cleaner, offset_restorer, tracer=None):
        self.splitter = splitter
        self.marker = marker
        self.llm = llm
        self.parser = parser
        self.gap_handler = gap_handler
        self.joiner = joiner
        self.html_cleaner = html_cleaner
        self.offset_restorer = offset_restorer
        self.tracer = tracer

    def run(self, article):
        # Mock pipeline result
        sentences = [
            MockSentence("First sentence.", 0, start=0, end=15),
            MockSentence("Second sentence.", 1, start=16, end=32),
            MockSentence("Third sentence.", 2, start=33, end=48),
        ]

        groups = [
            MockGroup(
                label=["Topic", "Subtopic"],
                ranges=[MockSentenceRange(0, 1)]
            ),
            MockGroup(
                label=["Another Topic"],
                ranges=[MockSentenceRange(2, 2)]
            ),
        ]

        result = MagicMock()
        result.sentences = sentences
        result.groups = groups
        return result


# =============================================================================
# Test ArticleSplitResult Dataclass
# =============================================================================

class TestArticleSplitResult:
    """Test ArticleSplitResult dataclass."""

    def test_create_with_empty_lists(self):
        """Can create ArticleSplitResult with empty lists."""
        result = ArticleSplitResult(sentences=[], topics=[])

        assert result.sentences == []
        assert result.topics == []

    def test_create_with_sentences(self):
        """Can create ArticleSplitResult with sentences."""
        sentences = ["Sentence one.", "Sentence two.", "Sentence three."]
        result = ArticleSplitResult(sentences=sentences, topics=[])

        assert result.sentences == sentences
        assert result.topics == []

    def test_create_with_topics(self):
        """Can create ArticleSplitResult with topics."""
        topics = [
            {"name": "Topic A", "sentences": [1, 2]},
            {"name": "Topic B", "sentences": [3]},
        ]
        result = ArticleSplitResult(sentences=[], topics=topics)

        assert result.sentences == []
        assert result.topics == topics

    def test_create_with_both_sentences_and_topics(self):
        """Can create ArticleSplitResult with both sentences and topics."""
        sentences = ["Sentence one.", "Sentence two."]
        topics = [{"name": "Topic A", "sentences": [1, 2]}]
        result = ArticleSplitResult(sentences=sentences, topics=topics)

        assert result.sentences == sentences
        assert result.topics == topics

    def test_dataclass_fields(self):
        """ArticleSplitResult has correct fields."""
        result = ArticleSplitResult(sentences=["test"], topics=[])

        assert hasattr(result, 'sentences')
        assert hasattr(result, 'topics')
        assert isinstance(result.sentences, list)
        assert isinstance(result.topics, list)


# =============================================================================
# Test _groups_to_topics Function
# =============================================================================

class TestGroupsToTopics:
    """Test _groups_to_topics function."""

    def test_empty_groups_returns_empty_list(self):
        """Empty groups list returns empty topics list."""
        sentence_objects = []
        result = _groups_to_topics([], sentence_objects)

        assert result == []

    def test_single_group_converted_correctly(self):
        """Single group is converted to topic dictionary correctly."""
        sentence_objects = [
            MockSentence("First.", 0, start=0, end=6),
            MockSentence("Second.", 1, start=7, end=14),
        ]

        groups = [
            MockGroup(
                label=["Topic A"],
                ranges=[MockSentenceRange(0, 1)]
            )
        ]

        result = _groups_to_topics(groups, sentence_objects)

        assert len(result) == 1
        topic = result[0]

        assert topic["name"] == "Topic A"
        assert topic["sentences"] == [1, 2]  # 1-based indices
        assert len(topic["sentence_spans"]) == 2
        assert len(topic["ranges"]) == 1

        # Check range structure
        range_info = topic["ranges"][0]
        assert range_info["sentence_start"] == 1
        assert range_info["sentence_end"] == 2
        assert range_info["start"] == 0
        assert range_info["end"] == 14

    def test_multiple_groups_converted_correctly(self):
        """Multiple groups are converted correctly."""
        sentence_objects = [
            MockSentence("First.", 0, start=0, end=6),
            MockSentence("Second.", 1, start=7, end=14),
            MockSentence("Third.", 2, start=15, end=21),
            MockSentence("Fourth.", 3, start=22, end=29),
        ]

        groups = [
            MockGroup(
                label=["Topic A"],
                ranges=[MockSentenceRange(0, 1)]
            ),
            MockGroup(
                label=["Topic B"],
                ranges=[MockSentenceRange(2, 3)]
            ),
        ]

        result = _groups_to_topics(groups, sentence_objects)

        assert len(result) == 2
        assert result[0]["name"] == "Topic A"
        assert result[1]["name"] == "Topic B"
        assert result[0]["sentences"] == [1, 2]
        assert result[1]["sentences"] == [3, 4]

    def test_hierarchical_topic_name_with_join(self):
        """Topic name uses '>'.join for hierarchical labels."""
        sentence_objects = [MockSentence("Test.", 0)]

        groups = [
            MockGroup(
                label=["Parent", "Child", "Grandchild"],
                ranges=[MockSentenceRange(0, 0)]
            )
        ]

        result = _groups_to_topics(groups, sentence_objects)

        assert result[0]["name"] == "Parent>Child>Grandchild"

    def test_index_conversion_to_one_based(self):
        """Internal 0-based indices converted to 1-based for output."""
        sentence_objects = [
            MockSentence("First.", 0),
            MockSentence("Second.", 1),
            MockSentence("Third.", 2),
        ]

        groups = [
            MockGroup(
                label=["Topic"],
                ranges=[MockSentenceRange(0, 2)]
            )
        ]

        result = _groups_to_topics(groups, sentence_objects)

        # Should be 1-based: [1, 2, 3] not [0, 1, 2]
        assert result[0]["sentences"] == [1, 2, 3]

    def test_sentence_indices_deduplicated(self):
        """Sentence indices are deduplicated across ranges."""
        sentence_objects = [
            MockSentence("First.", 0),
            MockSentence("Second.", 1),
            MockSentence("Third.", 2),
        ]

        # Overlapping ranges
        groups = [
            MockGroup(
                label=["Topic"],
                ranges=[
                    MockSentenceRange(0, 1),
                    MockSentenceRange(1, 2),  # Overlaps at index 1
                ]
            )
        ]

        result = _groups_to_topics(groups, sentence_objects)

        # Should be deduplicated: [1, 2, 3] not [1, 2, 2, 3]
        assert result[0]["sentences"] == [1, 2, 3]

    def test_sentence_spans_structure(self):
        """Sentence spans have correct structure."""
        sentence_objects = [
            MockSentence("First.", 0, start=0, end=6),
            MockSentence("Second.", 1, start=7, end=14),
        ]

        groups = [
            MockGroup(
                label=["Topic"],
                ranges=[MockSentenceRange(0, 1)]
            )
        ]

        result = _groups_to_topics(groups, sentence_objects)

        spans = result[0]["sentence_spans"]
        assert len(spans) == 2

        assert spans[0]["sentence"] == 1  # 1-based
        assert spans[0]["start"] == 0
        assert spans[0]["end"] == 6

        assert spans[1]["sentence"] == 2  # 1-based
        assert spans[1]["start"] == 7
        assert spans[1]["end"] == 14

    def test_ranges_structure(self):
        """Ranges have correct structure."""
        sentence_objects = [
            MockSentence("First.", 0, start=0, end=6),
            MockSentence("Second.", 1, start=7, end=14),
        ]

        groups = [
            MockGroup(
                label=["Topic"],
                ranges=[MockSentenceRange(0, 1)]
            )
        ]

        result = _groups_to_topics(groups, sentence_objects)

        ranges = result[0]["ranges"]
        assert len(ranges) == 1

        assert ranges[0]["sentence_start"] == 1
        assert ranges[0]["sentence_end"] == 2
        assert ranges[0]["start"] == 0
        assert ranges[0]["end"] == 14

    def test_handles_missing_sentence_objects_gracefully(self):
        """Handles missing sentence objects with None offsets."""
        # Only provide sentence at index 0, not index 1
        sentence_objects = [
            MockSentence("First.", 0, start=0, end=6),
        ]

        groups = [
            MockGroup(
                label=["Topic"],
                ranges=[MockSentenceRange(0, 1)]  # References index 1 which doesn't exist
            )
        ]

        result = _groups_to_topics(groups, sentence_objects)

        assert len(result) == 1
        # Should have None for missing sentence offsets
        assert result[0]["ranges"][0]["start"] is None or result[0]["ranges"][0]["end"] is None

    def test_group_with_empty_ranges_skipped(self):
        """Groups with empty ranges are skipped."""
        sentence_objects = [MockSentence("Test.", 0)]

        groups = [
            MockGroup(
                label=["Empty Topic"],
                ranges=[]  # No ranges
            )
        ]

        result = _groups_to_topics(groups, sentence_objects)

        assert result == []

    def test_sorted_sentence_indices(self):
        """Sentence indices are sorted in output."""
        sentence_objects = [
            MockSentence("First.", 0),
            MockSentence("Second.", 1),
            MockSentence("Third.", 2),
            MockSentence("Fourth.", 3),
        ]

        # Ranges in non-sequential order
        groups = [
            MockGroup(
                label=["Topic"],
                ranges=[
                    MockSentenceRange(2, 3),
                    MockSentenceRange(0, 1),
                ]
            )
        ]

        result = _groups_to_topics(groups, sentence_objects)

        assert result[0]["sentences"] == [1, 2, 3, 4]  # Sorted


# =============================================================================
# Test _LLMCallableAdapter Class
# =============================================================================

class TestLLMCallableAdapterInit:
    """Test _LLMCallableAdapter.__init__ method."""

    def test_stores_llm_client_reference(self):
        """Adapter stores llm_client reference."""
        mock_llm = MagicMock()
        adapter = _LLMCallableAdapter(mock_llm)

        assert adapter._llm_client is mock_llm

    def test_accepts_any_llm_client(self):
        """Adapter accepts any LLM client object."""
        class CustomLLM:
            def call(self, *args, **kwargs):
                return "response"

        custom_llm = CustomLLM()
        adapter = _LLMCallableAdapter(custom_llm)

        assert adapter._llm_client is custom_llm


class TestLLMCallableAdapterCall:
    """Test _LLMCallableAdapter.call method."""

    def test_converts_single_prompt_to_list(self):
        """Call converts single prompt string to list [prompt]."""
        mock_llm = MagicMock()
        mock_llm.call.return_value = "LLM response"

        adapter = _LLMCallableAdapter(mock_llm)
        adapter.call("Test prompt")

        mock_llm.call.assert_called_once()
        call_args = mock_llm.call.call_args
        assert call_args[0][0] == ["Test prompt"]  # First arg is list

    def test_passes_temperature_parameter(self):
        """Call passes temperature parameter to LLM."""
        mock_llm = MagicMock()
        mock_llm.call.return_value = "LLM response"

        adapter = _LLMCallableAdapter(mock_llm)
        adapter.call("Test prompt", temperature=0.5)

        mock_llm.call.assert_called_once()
        call_kwargs = mock_llm.call.call_args[1]
        assert call_kwargs["temperature"] == 0.5

    def test_default_temperature_is_zero(self):
        """Default temperature is 0.0."""
        mock_llm = MagicMock()
        mock_llm.call.return_value = "LLM response"

        adapter = _LLMCallableAdapter(mock_llm)
        adapter.call("Test prompt")

        call_kwargs = mock_llm.call.call_args[1]
        assert call_kwargs["temperature"] == 0.0

    def test_returns_response_string(self):
        """Call returns response string from LLM."""
        mock_llm = MagicMock()
        mock_llm.call.return_value = "Expected response"

        adapter = _LLMCallableAdapter(mock_llm)
        result = adapter.call("Test prompt")

        assert result == "Expected response"

    def test_handles_unicode_prompts(self):
        """Call handles Unicode prompts correctly."""
        mock_llm = MagicMock()
        mock_llm.call.return_value = "Unicode response"

        adapter = _LLMCallableAdapter(mock_llm)
        adapter.call("Test with unicode: \u4e2d\u6587 \u0420\u0443\u0441\u0441\u043a\u0438\u0439")

        mock_llm.call.assert_called_once()
        call_args = mock_llm.call.call_args
        assert "\u4e2d\u6587" in call_args[0][0][0]


# =============================================================================
# Test split_article Function
# =============================================================================

class TestSplitArticleEmptyInput:
    """Test split_article with empty input."""

    def test_empty_string_returns_empty_result(self):
        """Empty string returns ArticleSplitResult with empty lists."""
        result = split_article("")

        assert isinstance(result, ArticleSplitResult)
        assert result.sentences == []
        assert result.topics == []

    def test_none_returns_empty_result(self):
        """None input returns ArticleSplitResult with empty lists."""
        result = split_article(None)

        assert isinstance(result, ArticleSplitResult)
        assert result.sentences == []
        assert result.topics == []


class TestSplitArticleWithoutLLM:
    """Test split_article without LLM (no topic extraction)."""

    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    def test_cleans_html_with_html_cleaner(self, mock_cleaner_class, mock_splitter_class):
        """Cleans HTML with html_cleaner when no LLM provided."""
        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("Clean text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        split_article("<html><body>Test</body></html>", llm=None)

        mock_cleaner_class.assert_called_once()
        mock_cleaner.clean.assert_called_once_with("<html><body>Test</body></html>")

    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    def test_splits_with_splitter(self, mock_cleaner_class, mock_splitter_class):
        """Splits cleaned text with splitter."""
        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("Clean text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_sentence = MockSentence("Test sentence.", 0)
        mock_splitter = MagicMock()
        mock_splitter.split.return_value = [mock_sentence]
        mock_splitter_class.return_value = mock_splitter

        result = split_article("Test text", llm=None)

        mock_splitter_class.assert_called_once()
        mock_splitter.split.assert_called_once_with("Clean text")
        assert result.sentences == ["Test sentence."]

    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    def test_returns_sentences_without_topics(self, mock_cleaner_class, mock_splitter_class):
        """Returns sentences without topics when no LLM."""
        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("Clean text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_sentences = [
            MockSentence("First.", 0),
            MockSentence("Second.", 1),
        ]
        mock_splitter = MagicMock()
        mock_splitter.split.return_value = mock_sentences
        mock_splitter_class.return_value = mock_splitter

        result = split_article("Test", llm=None)

        assert result.sentences == ["First.", "Second."]
        assert result.topics == []

    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    def test_splitter_configured_with_anchor_every_words(self, mock_cleaner_class, mock_splitter_class):
        """Splitter configured with anchor_every_words parameter."""
        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        split_article("Test", llm=None, anchor_every_words=10)

        mock_splitter_class.assert_called_once_with(
            anchor_every_words=10,
            html_aware=True
        )

    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    def test_splitter_configured_with_html_aware_true(self, mock_cleaner_class, mock_splitter_class):
        """Splitter configured with html_aware=True."""
        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        split_article("Test", llm=None)

        mock_splitter_class.assert_called_once_with(
            anchor_every_words=5,
            html_aware=True
        )


class TestSplitArticleWithLLM:
    """Test split_article with LLM (full pipeline)."""

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.TracingLLMCallable')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_creates_adapter_for_llm_client(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_tracing_class, mock_topic_llm_class, mock_pipeline_class
    ):
        """Creates _LLMCallableAdapter for LLM client."""
        mock_llm = MockLLMClient()

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_pipeline = MagicMock()
        mock_result = MagicMock()
        mock_result.sentences = []
        mock_result.groups = []
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        split_article("Test", llm=mock_llm)

        # Adapter should be created internally
        # Verify Pipeline was created (which uses the adapter)
        assert mock_pipeline_class.called

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.TracingLLMCallable')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_wraps_with_tracing_llm_callable_if_tracer_provided(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_tracing_class, mock_topic_llm_class, mock_pipeline_class
    ):
        """Wraps adapter with TracingLLMCallable if tracer provided."""
        mock_llm = MockLLMClient()
        mock_tracer = MockTracer()

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_tracing_wrapper = MagicMock()
        mock_tracing_class.return_value = mock_tracing_wrapper

        mock_pipeline = MagicMock()
        mock_result = MagicMock()
        mock_result.sentences = []
        mock_result.groups = []
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        split_article("Test", llm=mock_llm, tracer=mock_tracer)

        mock_tracing_class.assert_called_once()

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_configures_pipeline_components(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_topic_llm_class, mock_pipeline_class
    ):
        """Configures all pipeline components."""
        mock_llm = MockLLMClient()

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_topic_llm = MagicMock()
        mock_topic_llm_class.return_value = mock_topic_llm

        mock_pipeline = MagicMock()
        mock_result = MagicMock()
        mock_result.sentences = []
        mock_result.groups = []
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        split_article("Test", llm=mock_llm)

        mock_pipeline_class.assert_called_once()
        call_kwargs = mock_pipeline_class.call_args[1]

        # Verify all components are configured
        assert 'splitter' in call_kwargs
        assert 'marker' in call_kwargs
        assert 'llm' in call_kwargs
        assert 'parser' in call_kwargs
        assert 'gap_handler' in call_kwargs
        assert 'joiner' in call_kwargs
        assert 'html_cleaner' in call_kwargs
        assert 'offset_restorer' in call_kwargs

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.OverlapChunker')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_topic_range_llm_with_overlap_chunker(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_chunker_class, mock_topic_llm_class, mock_pipeline_class
    ):
        """TopicRangeLLM configured with OverlapChunker."""
        mock_llm = MockLLMClient()

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_chunker = MagicMock()
        mock_chunker_class.return_value = mock_chunker

        mock_topic_llm = MagicMock()
        mock_topic_llm_class.return_value = mock_topic_llm

        mock_pipeline = MagicMock()
        mock_result = MagicMock()
        mock_result.sentences = []
        mock_result.groups = []
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        split_article("Test", llm=mock_llm, max_chunk_chars=15000)

        mock_chunker_class.assert_called_once_with(max_chars=15000)

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_temperature_zero_for_llm_calls(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_topic_llm_class, mock_pipeline_class
    ):
        """Temperature set to 0.0 for LLM calls."""
        mock_llm = MockLLMClient()

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_topic_llm = MagicMock()
        mock_topic_llm_class.return_value = mock_topic_llm

        mock_pipeline = MagicMock()
        mock_result = MagicMock()
        mock_result.sentences = []
        mock_result.groups = []
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        split_article("Test", llm=mock_llm)

        mock_topic_llm_class.assert_called_once()
        call_kwargs = mock_topic_llm_class.call_args[1]
        assert call_kwargs["temperature"] == 0.0

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.LLMRepairingGapHandler')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_gap_handler_with_temperature_zero(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_gap_handler_class, mock_topic_llm_class, mock_pipeline_class
    ):
        """LLMRepairingGapHandler configured with temperature 0.0."""
        mock_llm = MockLLMClient()

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_topic_llm = MagicMock()
        mock_topic_llm_class.return_value = mock_topic_llm

        mock_gap_handler = MagicMock()
        mock_gap_handler_class.return_value = mock_gap_handler

        mock_pipeline = MagicMock()
        mock_result = MagicMock()
        mock_result.sentences = []
        mock_result.groups = []
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        split_article("Test", llm=mock_llm)

        mock_gap_handler_class.assert_called_once()
        call_kwargs = mock_gap_handler_class.call_args[1]
        assert call_kwargs["temperature"] == 0.0

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_extracts_sentences_from_pipeline_result(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_topic_llm_class, mock_pipeline_class
    ):
        """Extracts sentences from pipeline result."""
        mock_llm = MockLLMClient()

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_topic_llm = MagicMock()
        mock_topic_llm_class.return_value = mock_topic_llm

        mock_pipeline = MagicMock()
        mock_sentences = [
            MockSentence("First.", 0),
            MockSentence("Second.", 1),
        ]
        mock_result = MagicMock()
        mock_result.sentences = mock_sentences
        mock_result.groups = []
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        result = split_article("Test", llm=mock_llm)

        assert result.sentences == ["First.", "Second."]

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_converts_groups_to_topics(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_topic_llm_class, mock_pipeline_class
    ):
        """Converts groups from pipeline result to topics."""
        mock_llm = MockLLMClient()

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_topic_llm = MagicMock()
        mock_topic_llm_class.return_value = mock_topic_llm

        mock_pipeline = MagicMock()
        mock_sentences = [
            MockSentence("First.", 0),
            MockSentence("Second.", 1),
        ]
        mock_groups = [
            MockGroup(label=["Topic"], ranges=[MockSentenceRange(0, 1)])
        ]
        mock_result = MagicMock()
        mock_result.sentences = mock_sentences
        mock_result.groups = mock_groups
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        result = split_article("Test", llm=mock_llm)

        assert len(result.topics) == 1
        assert result.topics[0]["name"] == "Topic"

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_passes_tracer_to_pipeline(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_topic_llm_class, mock_pipeline_class
    ):
        """Passes tracer to pipeline for debugging."""
        mock_llm = MockLLMClient()
        mock_tracer = MockTracer()

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_topic_llm = MagicMock()
        mock_topic_llm_class.return_value = mock_topic_llm

        mock_pipeline = MagicMock()
        mock_result = MagicMock()
        mock_result.sentences = []
        mock_result.groups = []
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        split_article("Test", llm=mock_llm, tracer=mock_tracer)

        call_kwargs = mock_pipeline_class.call_args[1]
        assert call_kwargs["tracer"] is mock_tracer


# =============================================================================
# Test split_article_with_markers Function
# =============================================================================

class TestSplitArticleWithMarkers:
    """Test split_article_with_markers function."""

    @patch('lib.article_splitter.split_article')
    def test_passes_all_parameters_to_split_article(self, mock_split_article):
        """Passes all parameters to split_article."""
        mock_llm = MockLLMClient()
        mock_tracer = MockTracer()
        mock_split_article.return_value = ArticleSplitResult(
            sentences=["Test."],
            topics=[]
        )

        split_article_with_markers(
            "Test article",
            llm=mock_llm,
            tracer=mock_tracer,
            anchor_every_words=10,
            max_chunk_chars=15000
        )

        mock_split_article.assert_called_once_with(
            "Test article",
            llm=mock_llm,
            tracer=mock_tracer,
            anchor_every_words=10,
            max_chunk_chars=15000,
            cache_store=None
        )

    @patch('lib.article_splitter.split_article')
    def test_returns_same_result_as_split_article(self, mock_split_article):
        """Returns same result as split_article."""
        expected_result = ArticleSplitResult(
            sentences=["First.", "Second."],
            topics=[{"name": "Topic", "sentences": [1, 2]}]
        )
        mock_split_article.return_value = expected_result

        result = split_article_with_markers("Test")

        assert result == expected_result

    @patch('lib.article_splitter.split_article')
    def test_uses_default_parameters(self, mock_split_article):
        """Uses default parameters when not specified."""
        mock_split_article.return_value = ArticleSplitResult(
            sentences=[],
            topics=[]
        )

        split_article_with_markers("Test")

        mock_split_article.assert_called_once_with(
            "Test",
            llm=None,
            tracer=None,
            anchor_every_words=5,
            max_chunk_chars=12000,
            cache_store=None
        )


# =============================================================================
# Edge Cases Tests
# =============================================================================

class TestEdgeCases:
    """Test edge cases for article splitter."""

    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    def test_complex_html_nesting(self, mock_cleaner_class, mock_splitter_class):
        """Handles HTML with complex nesting."""
        complex_html = """
        <html>
            <body>
                <div>
                    <article>
                        <section>
                            <p>First sentence.</p>
                            <p>Second <strong>bold</strong> sentence.</p>
                        </section>
                    </article>
                </div>
            </body>
        </html>
        """

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("First sentence. Second bold sentence.", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_sentences = [
            MockSentence("First sentence.", 0),
            MockSentence("Second bold sentence.", 1),
        ]
        mock_splitter = MagicMock()
        mock_splitter.split.return_value = mock_sentences
        mock_splitter_class.return_value = mock_splitter

        result = split_article(complex_html, llm=None)

        assert len(result.sentences) == 2

    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    def test_plain_text_without_html(self, mock_cleaner_class, mock_splitter_class):
        """Handles plain text without HTML tags."""
        plain_text = "First sentence. Second sentence. Third sentence."

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = (plain_text, None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_sentences = [
            MockSentence("First sentence.", 0),
            MockSentence("Second sentence.", 1),
            MockSentence("Third sentence.", 2),
        ]
        mock_splitter = MagicMock()
        mock_splitter.split.return_value = mock_sentences
        mock_splitter_class.return_value = mock_splitter

        result = split_article(plain_text, llm=None)

        assert len(result.sentences) == 3

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_very_long_article(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_topic_llm_class, mock_pipeline_class
    ):
        """Handles very long articles with chunking."""
        long_text = " ".join([f"Sentence {i}." for i in range(1000)])

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = (long_text, None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_topic_llm = MagicMock()
        mock_topic_llm_class.return_value = mock_topic_llm

        mock_pipeline = MagicMock()
        mock_result = MagicMock()
        mock_result.sentences = []
        mock_result.groups = []
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        result = split_article(long_text, llm=MockLLMClient(), max_chunk_chars=12000)

        assert isinstance(result, ArticleSplitResult)
        # Pipeline should be configured to handle chunking
        mock_topic_llm_class.assert_called_once()

    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    def test_malformed_html(self, mock_cleaner_class, mock_splitter_class):
        """Handles malformed HTML gracefully."""
        malformed_html = "<p>Unclosed paragraph <div>Mixed tags</p></div>"

        mock_cleaner = MagicMock()
        # Cleaner should handle malformed HTML
        mock_cleaner.clean.return_value = ("Unclosed paragraph Mixed tags", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_sentences = [
            MockSentence("Unclosed paragraph Mixed tags", 0),
        ]
        mock_splitter = MagicMock()
        mock_splitter.split.return_value = mock_sentences
        mock_splitter_class.return_value = mock_splitter

        result = split_article(malformed_html, llm=None)

        assert isinstance(result, ArticleSplitResult)
        assert isinstance(result.sentences, list)  # sentences should always be a list

    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    def test_unicode_content(self, mock_cleaner_class, mock_splitter_class):
        """Handles Unicode content correctly."""
        unicode_text = "Chinese: \u4e2d\u6587\u3002Russian: \u041f\u0440\u0438\u0432\u0435\u0442\u3002Emoji: \ud83d\ude00"

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = (unicode_text, None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_sentences = [
            MockSentence(unicode_text, 0),
        ]
        mock_splitter = MagicMock()
        mock_splitter.split.return_value = mock_sentences
        mock_splitter_class.return_value = mock_splitter

        result = split_article(unicode_text, llm=None)

        assert len(result.sentences) == 1
        assert "\u4e2d\u6587" in result.sentences[0]

    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    def test_empty_sentences_after_cleaning(self, mock_cleaner_class, mock_splitter_class):
        """Handles empty sentences after HTML cleaning."""
        html_only_tags = "<div><span></span></div>"

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        result = split_article(html_only_tags, llm=None)

        assert result.sentences == []
        assert result.topics == []

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_single_topic_article(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_topic_llm_class, mock_pipeline_class
    ):
        """Handles article with single topic."""
        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_topic_llm = MagicMock()
        mock_topic_llm_class.return_value = mock_topic_llm

        mock_pipeline = MagicMock()
        mock_sentences = [
            MockSentence("First.", 0),
            MockSentence("Second.", 1),
        ]
        mock_groups = [
            MockGroup(label=["Single Topic"], ranges=[MockSentenceRange(0, 1)])
        ]
        mock_result = MagicMock()
        mock_result.sentences = mock_sentences
        mock_result.groups = mock_groups
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        result = split_article("Test", llm=MockLLMClient())

        assert len(result.topics) == 1
        assert result.topics[0]["name"] == "Single Topic"

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_no_clear_topics(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_topic_llm_class, mock_pipeline_class
    ):
        """Handles article with no clear topics (empty groups)."""
        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_topic_llm = MagicMock()
        mock_topic_llm_class.return_value = mock_topic_llm

        mock_pipeline = MagicMock()
        mock_sentences = [
            MockSentence("First.", 0),
            MockSentence("Second.", 1),
        ]
        mock_result = MagicMock()
        mock_result.sentences = mock_sentences
        mock_result.groups = []  # No topics identified
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        result = split_article("Test", llm=MockLLMClient())

        assert len(result.sentences) == 2
        assert result.topics == []

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_overlapping_topic_ranges(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_topic_llm_class, mock_pipeline_class
    ):
        """Handles overlapping topic ranges correctly."""
        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_topic_llm = MagicMock()
        mock_topic_llm_class.return_value = mock_topic_llm

        mock_pipeline = MagicMock()
        mock_sentences = [
            MockSentence("First.", 0),
            MockSentence("Second.", 1),
            MockSentence("Third.", 2),
        ]
        # Overlapping ranges in same group
        mock_groups = [
            MockGroup(
                label=["Topic"],
                ranges=[
                    MockSentenceRange(0, 1),
                    MockSentenceRange(1, 2),
                ]
            )
        ]
        mock_result = MagicMock()
        mock_result.sentences = mock_sentences
        mock_result.groups = mock_groups
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        result = split_article("Test", llm=MockLLMClient())

        assert len(result.topics) == 1
        # Sentences should be deduplicated
        assert result.topics[0]["sentences"] == [1, 2, 3]

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_gaps_between_topic_ranges(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_topic_llm_class, mock_pipeline_class
    ):
        """Handles gaps between topic ranges."""
        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_topic_llm = MagicMock()
        mock_topic_llm_class.return_value = mock_topic_llm

        mock_pipeline = MagicMock()
        mock_sentences = [
            MockSentence("First.", 0),
            MockSentence("Second.", 1),
            MockSentence("Third.", 2),
            MockSentence("Fourth.", 3),
        ]
        # Non-contiguous ranges (gap at sentence 2)
        mock_groups = [
            MockGroup(
                label=["Topic A"],
                ranges=[MockSentenceRange(0, 0)]
            ),
            MockGroup(
                label=["Topic B"],
                ranges=[MockSentenceRange(2, 3)]
            ),
        ]
        mock_result = MagicMock()
        mock_result.sentences = mock_sentences
        mock_result.groups = mock_groups
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        result = split_article("Test", llm=MockLLMClient())

        assert len(result.topics) == 2
        assert result.topics[0]["sentences"] == [1]
        assert result.topics[1]["sentences"] == [3, 4]


# =============================================================================
# Integration Tests
# =============================================================================

class TestIntegration:
    """Integration tests for article splitter with mocked dependencies."""

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_full_pipeline_with_html_content(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_topic_llm_class, mock_pipeline_class
    ):
        """Full pipeline integration with HTML content."""
        html_content = """
        <article>
            <h1>Article Title</h1>
            <p>Introduction paragraph with context.</p>
            <p>Main content paragraph.</p>
            <p>Conclusion paragraph.</p>
        </article>
        """

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = (
            "Article Title Introduction paragraph with context. Main content paragraph. Conclusion paragraph.",
            None
        )
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_topic_llm = MagicMock()
        mock_topic_llm_class.return_value = mock_topic_llm

        mock_pipeline = MagicMock()
        mock_sentences = [
            MockSentence("Article Title", 0, start=0, end=13),
            MockSentence("Introduction paragraph with context.", 1, start=14, end=50),
            MockSentence("Main content paragraph.", 2, start=51, end=74),
            MockSentence("Conclusion paragraph.", 3, start=75, end=96),
        ]
        mock_groups = [
            MockGroup(label=["Introduction"], ranges=[MockSentenceRange(0, 1)]),
            MockGroup(label=["Content"], ranges=[MockSentenceRange(2, 2)]),
            MockGroup(label=["Conclusion"], ranges=[MockSentenceRange(3, 3)]),
        ]
        mock_result = MagicMock()
        mock_result.sentences = mock_sentences
        mock_result.groups = mock_groups
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        mock_llm = MockLLMClient()
        result = split_article(html_content, llm=mock_llm)

        assert len(result.sentences) == 4
        assert len(result.topics) == 3
        assert result.topics[0]["name"] == "Introduction"
        assert result.topics[1]["name"] == "Content"
        assert result.topics[2]["name"] == "Conclusion"

    @patch('lib.article_splitter.Pipeline')
    @patch('lib.article_splitter.TopicRangeLLM')
    @patch('lib.article_splitter.SparseRegexSentenceSplitter')
    @patch('lib.article_splitter.HTMLParserTagStripCleaner')
    @patch('lib.article_splitter.MappingOffsetRestorer')
    def test_full_pipeline_with_tracer(
        self, mock_restorer_class, mock_cleaner_class, mock_splitter_class,
        mock_topic_llm_class, mock_pipeline_class
    ):
        """Full pipeline integration with tracer for debugging."""
        mock_splitter = MagicMock()
        mock_splitter.split.return_value = []
        mock_splitter_class.return_value = mock_splitter

        mock_cleaner = MagicMock()
        mock_cleaner.clean.return_value = ("text", None)
        mock_cleaner_class.return_value = mock_cleaner

        mock_restorer = MagicMock()
        mock_restorer_class.return_value = mock_restorer

        mock_topic_llm = MagicMock()
        mock_topic_llm_class.return_value = mock_topic_llm

        mock_pipeline = MagicMock()
        mock_result = MagicMock()
        mock_result.sentences = [MockSentence("Test.", 0)]
        mock_result.groups = []
        mock_pipeline.run.return_value = mock_result
        mock_pipeline_class.return_value = mock_pipeline

        mock_llm = MockLLMClient()
        mock_tracer = MockTracer()

        result = split_article("Test", llm=mock_llm, tracer=mock_tracer)

        assert isinstance(result, ArticleSplitResult)
        mock_pipeline_class.assert_called_once()
        call_kwargs = mock_pipeline_class.call_args[1]
        assert call_kwargs["tracer"] is mock_tracer
