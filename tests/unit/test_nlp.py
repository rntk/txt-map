"""
Unit tests for the NLP module.

Tests all functions in lib/nlp.py:
- ensure_nltk_data
- _lemmatizer_instance
- _stop_words_set
- _wordnet_pos
- compute_word_frequencies

Tests all constants:
- WN_ADJ, WN_VERB, WN_ADV, WN_NOUN
"""

import pytest
from unittest.mock import MagicMock, patch

# Import the module under test - the autouse fixture in conftest.py
# handles mocking NLTK corpus before imports
import lib.nlp as nlp_module
from lib.nlp import (
    ensure_nltk_data,
    _lemmatizer_instance,
    _stop_words_set,
    _wordnet_pos,
    compute_word_frequencies,
    WN_ADJ,
    WN_VERB,
    WN_ADV,
    WN_NOUN,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture(autouse=True)
def reset_nlp_module_state():
    """Reset module-level singletons before each test for test isolation."""
    # Reset the singletons before test
    nlp_module._lemmatizer = None
    nlp_module._stop_words = None
    yield
    # Reset after test as well
    nlp_module._lemmatizer = None
    nlp_module._stop_words = None


# =============================================================================
# Test: Constants
# =============================================================================


class TestConstants:
    """Tests for NLP module constants."""

    def test_wn_adj_is_lowercase_a(self):
        """WN_ADJ constant is 'a' (adjective)."""
        assert WN_ADJ == "a"

    def test_wn_verb_is_lowercase_v(self):
        """WN_VERB constant is 'v' (verb)."""
        assert WN_VERB == "v"

    def test_wn_adv_is_lowercase_r(self):
        """WN_ADV constant is 'r' (adverb)."""
        assert WN_ADV == "r"

    def test_wn_noun_is_lowercase_n(self):
        """WN_NOUN constant is 'n' (noun)."""
        assert WN_NOUN == "n"


# =============================================================================
# Test: ensure_nltk_data
# =============================================================================


class TestEnsureNltkData:
    """Tests for the ensure_nltk_data function."""

    @patch("lib.nlp.nltk.data.find")
    @patch("lib.nlp.nltk.download")
    def test_downloads_punkt_tab_if_not_found(self, mock_download, mock_find):
        """Downloads punkt_tab if not found."""
        # Arrange: punkt_tab not found, others found
        mock_find.side_effect = [
            LookupError("punkt_tab not found"),  # punkt_tab
            None,  # stopwords
            None,  # wordnet
            None,  # omw-1.4
            None,  # averaged_perceptron_tagger_eng
        ]

        # Act
        ensure_nltk_data()

        # Assert
        mock_download.assert_any_call("punkt_tab", quiet=True)

    @patch("lib.nlp.nltk.data.find")
    @patch("lib.nlp.nltk.download")
    def test_downloads_stopwords_if_not_found(self, mock_download, mock_find):
        """Downloads stopwords if not found."""
        # Arrange
        mock_find.side_effect = [
            None,  # punkt_tab
            LookupError("stopwords not found"),  # stopwords
            None,  # wordnet
            None,  # omw-1.4
            None,  # averaged_perceptron_tagger_eng
        ]

        # Act
        ensure_nltk_data()

        # Assert
        mock_download.assert_any_call("stopwords", quiet=True)

    @patch("lib.nlp.nltk.data.find")
    @patch("lib.nlp.nltk.download")
    def test_downloads_wordnet_if_not_found(self, mock_download, mock_find):
        """Downloads wordnet if not found."""
        # Arrange
        mock_find.side_effect = [
            None,  # punkt_tab
            None,  # stopwords
            LookupError("wordnet not found"),  # wordnet
            None,  # omw-1.4
            None,  # averaged_perceptron_tagger_eng
        ]

        # Act
        ensure_nltk_data()

        # Assert
        mock_download.assert_any_call("wordnet", quiet=True)

    @patch("lib.nlp.nltk.data.find")
    @patch("lib.nlp.nltk.download")
    def test_downloads_omw_1_4_if_not_found(self, mock_download, mock_find):
        """Downloads omw-1.4 if not found."""
        # Arrange
        mock_find.side_effect = [
            None,  # punkt_tab
            None,  # stopwords
            None,  # wordnet
            LookupError("omw-1.4 not found"),  # omw-1.4
            None,  # averaged_perceptron_tagger_eng
        ]

        # Act
        ensure_nltk_data()

        # Assert
        mock_download.assert_any_call("omw-1.4", quiet=True)

    @patch("lib.nlp.nltk.data.find")
    @patch("lib.nlp.nltk.download")
    def test_downloads_averaged_perceptron_tagger_eng_if_not_found(
        self, mock_download, mock_find
    ):
        """Downloads averaged_perceptron_tagger_eng if not found."""
        # Arrange
        mock_find.side_effect = [
            None,  # punkt_tab
            None,  # stopwords
            None,  # wordnet
            None,  # omw-1.4
            LookupError("averaged_perceptron_tagger_eng not found"),
        ]

        # Act
        ensure_nltk_data()

        # Assert
        mock_download.assert_any_call("averaged_perceptron_tagger_eng", quiet=True)

    @patch("lib.nlp.nltk.data.find")
    @patch("lib.nlp.nltk.download")
    def test_skips_download_if_data_already_exists(self, mock_download, mock_find):
        """Skips download if data already exists."""
        # Arrange: all data found
        mock_find.return_value = None  # No LookupError raised

        # Act
        ensure_nltk_data()

        # Assert
        mock_download.assert_not_called()

    @patch("lib.nlp.nltk.data.find")
    @patch("lib.nlp.nltk.download")
    def test_propagates_download_failures(self, mock_download, mock_find):
        """Download failures propagate to caller."""
        # Arrange
        mock_find.side_effect = LookupError("not found")
        mock_download.side_effect = Exception("Download failed")

        # Act & Assert: Exception should propagate
        with pytest.raises(Exception, match="Download failed"):
            ensure_nltk_data()

    @patch("lib.nlp.nltk.data.find")
    @patch("lib.nlp.nltk.download")
    def test_all_5_required_packages_checked(self, mock_download, mock_find):
        """All 5 required packages are checked."""
        # Arrange
        mock_find.side_effect = [None] * 5  # All found

        # Act
        ensure_nltk_data()

        # Assert: find called 5 times for each package
        assert mock_find.call_count == 5
        expected_paths = [
            "tokenizers/punkt_tab",
            "corpora/stopwords",
            "corpora/wordnet",
            "corpora/omw-1.4",
            "taggers/averaged_perceptron_tagger_eng",
        ]
        calls = [call[0][0] for call in mock_find.call_args_list]
        assert calls == expected_paths


# =============================================================================
# Test: _lemmatizer_instance
# =============================================================================


class TestLemmatizerInstance:
    """Tests for the _lemmatizer_instance function."""

    def test_creates_lemmatizer_on_first_call(self):
        """Creates lemmatizer on first call."""
        with patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer_class:
            mock_instance = MagicMock()
            mock_lemmatizer_class.return_value = mock_instance

            # Act
            result = _lemmatizer_instance()

            # Assert
            mock_lemmatizer_class.assert_called_once()
            assert result is mock_instance

    def test_returns_same_instance_on_subsequent_calls(self):
        """Returns same instance on subsequent calls."""
        with patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer_class:
            mock_instance = MagicMock()
            mock_lemmatizer_class.return_value = mock_instance

            # Act: Call twice
            result1 = _lemmatizer_instance()
            result2 = _lemmatizer_instance()

            # Assert
            assert result1 is result2
            mock_lemmatizer_class.assert_called_once()

    def test_global_lemmatizer_variable_used(self):
        """Global _lemmatizer variable is used."""
        with patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer_class:
            mock_instance = MagicMock()
            mock_lemmatizer_class.return_value = mock_instance

            # Act
            _lemmatizer_instance()

            # Assert: Global variable is set
            assert nlp_module._lemmatizer is mock_instance


# =============================================================================
# Test: _stop_words_set
# =============================================================================


class TestStopWordsSet:
    """Tests for the _stop_words_set function."""

    def test_loads_from_nltk_stopwords_corpus(self):
        """Loads from NLTK stopwords corpus."""
        with patch("lib.nlp.stopwords.words") as mock_stopwords:
            mock_stopwords.return_value = ["the", "a", "an", "is", "are"]

            # Act
            result = _stop_words_set()

            # Assert
            mock_stopwords.assert_called_once_with("english")
            assert result == {"the", "a", "an", "is", "are"}

    def test_falls_back_to_hardcoded_set_if_nltk_data_unavailable(self):
        """Falls back to hardcoded set if NLTK data unavailable."""
        with patch("lib.nlp.stopwords.words") as mock_stopwords:
            mock_stopwords.side_effect = LookupError("stopwords not found")

            # Act
            result = _stop_words_set()

            # Assert
            assert isinstance(result, set)
            # Check for some expected hardcoded stop words
            assert "the" in result
            assert "a" in result
            assert "is" in result
            assert "and" in result

    def test_returns_same_instance_on_subsequent_calls(self):
        """Returns same instance on subsequent calls."""
        with patch("lib.nlp.stopwords.words") as mock_stopwords:
            mock_stopwords.return_value = ["the", "a", "an"]

            # Act: Call twice
            result1 = _stop_words_set()
            result2 = _stop_words_set()

            # Assert
            assert result1 is result2
            mock_stopwords.assert_called_once()

    def test_hardcoded_set_includes_common_english_stop_words(self):
        """Hardcoded set includes common English stop words."""
        with patch("lib.nlp.stopwords.words") as mock_stopwords:
            mock_stopwords.side_effect = LookupError("stopwords not found")

            # Act
            result = _stop_words_set()

            # Assert: Check for expected stop words
            expected_words = {
                "a",
                "an",
                "and",
                "are",
                "as",
                "at",
                "be",
                "by",
                "for",
                "from",
                "has",
                "he",
                "in",
                "is",
                "it",
                "its",
                "of",
                "on",
                "that",
                "the",
                "to",
                "was",
                "were",
                "will",
                "with",
            }
            assert expected_words.issubset(result)


# =============================================================================
# Test: _wordnet_pos
# =============================================================================


class TestWordnetPos:
    """Tests for the _wordnet_pos function."""

    def test_tags_starting_with_j_return_wn_adj(self):
        """Tags starting with 'J' return WN_ADJ ('a')."""
        assert _wordnet_pos("JJ") == WN_ADJ
        assert _wordnet_pos("JJR") == WN_ADJ
        assert _wordnet_pos("JJS") == WN_ADJ
        assert _wordnet_pos("J") == WN_ADJ

    def test_tags_starting_with_v_return_wn_verb(self):
        """Tags starting with 'V' return WN_VERB ('v')."""
        assert _wordnet_pos("VB") == WN_VERB
        assert _wordnet_pos("VBD") == WN_VERB
        assert _wordnet_pos("VBG") == WN_VERB
        assert _wordnet_pos("VBN") == WN_VERB
        assert _wordnet_pos("VBP") == WN_VERB
        assert _wordnet_pos("VBZ") == WN_VERB
        assert _wordnet_pos("V") == WN_VERB

    def test_tags_starting_with_r_return_wn_adv(self):
        """Tags starting with 'R' return WN_ADV ('r')."""
        assert _wordnet_pos("RB") == WN_ADV
        assert _wordnet_pos("RBR") == WN_ADV
        assert _wordnet_pos("RBS") == WN_ADV
        assert _wordnet_pos("R") == WN_ADV

    def test_all_other_tags_return_wn_noun(self):
        """All other tags return WN_NOUN ('n')."""
        # Noun tags
        assert _wordnet_pos("NN") == WN_NOUN
        assert _wordnet_pos("NNS") == WN_NOUN
        assert _wordnet_pos("NNP") == WN_NOUN
        assert _wordnet_pos("NNPS") == WN_NOUN
        # Other tags
        assert _wordnet_pos("DT") == WN_NOUN
        assert _wordnet_pos("IN") == WN_NOUN
        assert _wordnet_pos("CC") == WN_NOUN
        assert _wordnet_pos("MD") == WN_NOUN
        assert _wordnet_pos("PRP") == WN_NOUN
        assert _wordnet_pos("CD") == WN_NOUN

    def test_handles_empty_string_returns_wn_noun(self):
        """Handles empty string (returns WN_NOUN)."""
        assert _wordnet_pos("") == WN_NOUN

    def test_handles_single_character_tags(self):
        """Handles single character tags."""
        assert _wordnet_pos("J") == WN_ADJ
        assert _wordnet_pos("V") == WN_VERB
        assert _wordnet_pos("R") == WN_ADV
        assert _wordnet_pos("N") == WN_NOUN
        assert _wordnet_pos("X") == WN_NOUN  # Unknown tag


# =============================================================================
# Test: compute_word_frequencies
# =============================================================================


class TestComputeWordFrequencies:
    """Tests for the compute_word_frequencies function."""

    # -------------------------------------------------------------------------
    # Input Handling Tests
    # -------------------------------------------------------------------------

    def test_empty_texts_list_returns_empty_list(self):
        """Empty texts list returns []."""
        result = compute_word_frequencies([])
        assert result == []

    def test_none_texts_list_returns_empty_list(self):
        """None texts list returns []."""
        result = compute_word_frequencies(None)
        assert result == []

    def test_single_text_processed_correctly(self):
        """Single text processed correctly."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            # Setup mocks
            mock_tokenize.return_value = ["hello", "world", "hello"]
            mock_pos_tag.return_value = [
                ("hello", "NN"),
                ("world", "NN"),
                ("hello", "NN"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["hello world hello"])

            # Assert
            assert len(result) == 2
            assert {"word": "hello", "frequency": 2} in result
            assert {"word": "world", "frequency": 1} in result

    def test_multiple_texts_combined(self):
        """Multiple texts combined."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            # Setup mocks
            mock_tokenize.return_value = [
                "hello",
                "from",
                "first",
                "hello",
                "from",
                "second",
            ]
            mock_pos_tag.return_value = [
                ("hello", "NN"),
                ("from", "IN"),
                ("first", "NN"),
                ("hello", "NN"),
                ("from", "IN"),
                ("second", "NN"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["hello from first", "hello from second"])

            # Assert
            assert {"word": "hello", "frequency": 2} in result
            assert {"word": "from", "frequency": 2} in result
            assert {"word": "first", "frequency": 1} in result
            assert {"word": "second", "frequency": 1} in result

    # -------------------------------------------------------------------------
    # Tokenization Tests
    # -------------------------------------------------------------------------

    def test_uses_nltk_word_tokenize(self):
        """Uses NLTK word_tokenize."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["test", "token"]
            mock_pos_tag.return_value = [("test", "NN"), ("token", "NN")]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            compute_word_frequencies(["test token"])

            # Assert
            mock_tokenize.assert_called_once()

    def test_falls_back_to_regex_if_nltk_unavailable(self):
        """Falls back to regex [a-z]+ if NLTK unavailable."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.side_effect = LookupError("tokenizer not found")
            mock_pos_tag.return_value = [("test", "NN"), ("token", "NN")]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["test123token"])

            # Assert: regex should extract only alphabetic parts
            words = [r["word"] for r in result]
            assert "test" in words
            assert "token" in words

    def test_converts_to_lowercase(self):
        """Converts to lowercase."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["hello", "world"]
            mock_pos_tag.return_value = [("hello", "NN"), ("world", "NN")]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word.lower()
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["HELLO WORLD"])

            # Assert
            words = [r["word"] for r in result]
            assert "hello" in words
            assert "world" in words

    def test_filters_non_alphabetic_tokens(self):
        """Filters non-alphabetic tokens."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["hello", "123", "world", "test!"]
            mock_pos_tag.return_value = [
                ("hello", "NN"),
                ("123", "CD"),
                ("world", "NN"),
                ("test!", "NN"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["hello 123 world test!"])

            # Assert
            words = [r["word"] for r in result]
            assert "hello" in words
            assert "world" in words
            assert "123" not in words
            assert "test!" not in words

    def test_filters_tokens_less_than_3_characters(self):
        """Filters tokens < 3 characters."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["a", "an", "at", "the", "hello", "world"]
            mock_pos_tag.return_value = [
                ("a", "DT"),
                ("an", "DT"),
                ("at", "IN"),
                ("the", "DT"),
                ("hello", "NN"),
                ("world", "NN"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["a an at the hello world"])

            # Assert
            words = [r["word"] for r in result]
            assert "hello" in words  # 5 chars - kept
            assert "world" in words  # 5 chars - kept
            assert "the" in words  # 3 chars - kept
            assert "a" not in words  # 1 char - filtered
            assert "an" not in words  # 2 chars - filtered
            assert "at" not in words  # 2 chars - filtered

    # -------------------------------------------------------------------------
    # POS Tagging Tests
    # -------------------------------------------------------------------------

    def test_uses_nltk_pos_tag(self):
        """Uses NLTK pos_tag."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["test", "word"]
            mock_pos_tag.return_value = [("test", "NN"), ("word", "NN")]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            compute_word_frequencies(["test word"])

            # Assert
            mock_pos_tag.assert_called_once()

    def test_falls_back_to_default_nn_if_pos_tagger_unavailable(self):
        """Falls back to default 'NN' if tagger unavailable."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["test", "word"]
            mock_pos_tag.side_effect = LookupError("tagger not found")
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["test word"])

            # Assert: Should still work with default NN tag
            assert len(result) > 0

    # -------------------------------------------------------------------------
    # Lemmatization Tests
    # -------------------------------------------------------------------------

    def test_uses_wordnetlemmatizer(self):
        """Uses WordNetLemmatizer."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["cats"]
            mock_pos_tag.return_value = [("cats", "NNS")]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.return_value = "cat"
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["cats"])

            # Assert
            mock_lemmatizer.assert_called_once()
            assert result[0]["word"] == "cat"

    def test_applies_correct_pos_mapping(self):
        """Applies correct POS mapping."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["running"]
            mock_pos_tag.return_value = [("running", "VBG")]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.return_value = "run"
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["running"])

            # Assert
            mock_lemma_instance.lemmatize.assert_called_with("running", pos="v")
            assert result[0]["word"] == "run"

    def test_falls_back_to_original_token_if_lemmatization_fails(self):
        """Falls back to original token if lemmatization fails."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["test"]
            mock_pos_tag.return_value = [("test", "NN")]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = LookupError("lemmatizer error")
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["test"])

            # Assert
            assert result[0]["word"] == "test"

    # -------------------------------------------------------------------------
    # Stop Word Removal Tests
    # -------------------------------------------------------------------------

    def test_removes_common_stop_words(self):
        """Removes common stop words."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["the", "hello", "world", "is"]
            mock_pos_tag.return_value = [
                ("the", "DT"),
                ("hello", "NN"),
                ("world", "NN"),
                ("is", "VBZ"),
            ]
            mock_stopwords.return_value = ["the", "is", "are", "was"]
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["the hello world is"])

            # Assert
            words = [r["word"] for r in result]
            assert "hello" in words
            assert "world" in words
            assert "the" not in words
            assert "is" not in words

    def test_checks_both_original_and_lemmatized_forms(self):
        """Checks both original and lemmatized forms for stop words."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["running"]
            mock_pos_tag.return_value = [("running", "VBG")]
            # 'run' is not a stop word, but let's test lemmatized form check
            mock_stopwords.return_value = ["run", "the"]
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.return_value = "run"
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["running"])

            # Assert: 'running' lemmatizes to 'run' which is a stop word
            assert len(result) == 0

    # -------------------------------------------------------------------------
    # Output Tests
    # -------------------------------------------------------------------------

    def test_returns_list_of_word_frequency_dicts(self):
        """Returns list of {'word': str, 'frequency': int}."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["hello", "world"]
            mock_pos_tag.return_value = [("hello", "NN"), ("world", "NN")]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["hello world"])

            # Assert
            assert isinstance(result, list)
            for item in result:
                assert isinstance(item, dict)
                assert "word" in item
                assert "frequency" in item
                assert isinstance(item["word"], str)
                assert isinstance(item["frequency"], int)

    def test_sorted_by_frequency_descending(self):
        """Sorted by frequency descending."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["aaa", "aaa", "aaa", "bbb", "bbb", "ccc"]
            mock_pos_tag.return_value = [
                ("aaa", "NN"),
                ("aaa", "NN"),
                ("aaa", "NN"),
                ("bbb", "NN"),
                ("bbb", "NN"),
                ("ccc", "NN"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["aaa aaa aaa bbb bbb ccc"])

            # Assert
            assert result[0]["word"] == "aaa"
            assert result[0]["frequency"] == 3
            assert result[1]["word"] == "bbb"
            assert result[1]["frequency"] == 2
            assert result[2]["word"] == "ccc"
            assert result[2]["frequency"] == 1

    def test_limited_to_top_n_results(self):
        """Limited to top_n results."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["apple", "banana", "cherry", "date", "elder"]
            mock_pos_tag.return_value = [
                ("apple", "NN"),
                ("banana", "NN"),
                ("cherry", "NN"),
                ("date", "NN"),
                ("elder", "NN"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(
                ["apple banana cherry date elder"], top_n=3
            )

            # Assert
            assert len(result) == 3

    def test_default_top_n_is_60(self):
        """Default top_n=60."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            # Generate 100 unique alphabetic words (>= 3 chars each)
            # Using pattern like 'aaa', 'aab', 'aac', etc.
            import string

            words = []
            for i in range(100):
                c1 = string.ascii_lowercase[i // 26]
                c2 = string.ascii_lowercase[i % 26]
                words.append(c1 + c2 + "x")  # e.g., 'aax', 'abx', etc.

            mock_tokenize.return_value = words
            mock_pos_tag.return_value = [(w, "NN") for w in words]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies([" ".join(words)])

            # Assert
            assert len(result) == 60

    # -------------------------------------------------------------------------
    # Edge Cases Tests
    # -------------------------------------------------------------------------

    def test_mixed_case_text(self):
        """Mixed case text handled correctly."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["hello", "hello", "HELLO"]
            mock_pos_tag.return_value = [
                ("hello", "NN"),
                ("hello", "NN"),
                ("hello", "NN"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["Hello hello HELLO"])

            # Assert: All should be counted as same word
            assert len(result) == 1
            assert result[0]["frequency"] == 3

    def test_punctuation_handling(self):
        """Punctuation handling."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["hello", ",", "world", "!"]
            mock_pos_tag.return_value = [
                ("hello", "NN"),
                (",", ","),
                ("world", "NN"),
                ("!", "."),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["hello, world!"])

            # Assert
            words = [r["word"] for r in result]
            assert "hello" in words
            assert "world" in words

    def test_numbers_filtered_out(self):
        """Numbers filtered out."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["hello", "123", "456", "world"]
            mock_pos_tag.return_value = [
                ("hello", "NN"),
                ("123", "CD"),
                ("456", "CD"),
                ("world", "NN"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["hello 123 456 world"])

            # Assert
            words = [r["word"] for r in result]
            assert "hello" in words
            assert "world" in words
            assert "123" not in words
            assert "456" not in words

    def test_special_characters_filtered(self):
        """Special characters filtered."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["hello", "@", "#", "world"]
            mock_pos_tag.return_value = [
                ("hello", "NN"),
                ("@", "SYM"),
                ("#", "SYM"),
                ("world", "NN"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["hello @ # world"])

            # Assert
            words = [r["word"] for r in result]
            assert "hello" in words
            assert "world" in words
            assert "@" not in words
            assert "#" not in words

    def test_unicode_characters(self):
        """Unicode characters handled."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            # Unicode characters that are not a-z will be filtered
            mock_tokenize.return_value = ["hello", "cafe", "world"]
            mock_pos_tag.return_value = [
                ("hello", "NN"),
                ("cafe", "NN"),
                ("world", "NN"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["hello caf\u00e9 world"])

            # Assert
            words = [r["word"] for r in result]
            assert "hello" in words
            assert "world" in words

    def test_very_long_texts(self):
        """Very long texts handled."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            # Generate a long text
            words = ["hello"] * 1000 + ["world"] * 500
            mock_tokenize.return_value = words
            mock_pos_tag.return_value = [(w, "NN") for w in words]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies([" ".join(words)])

            # Assert
            assert result[0]["word"] == "hello"
            assert result[0]["frequency"] == 1000
            assert result[1]["word"] == "world"
            assert result[1]["frequency"] == 500

    def test_very_short_texts(self):
        """Very short texts handled."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["hi"]  # < 3 chars
            mock_pos_tag.return_value = [("hi", "NN")]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["hi"])

            # Assert
            assert len(result) == 0  # 'hi' is filtered (< 3 chars)

    def test_all_stop_words_returns_empty(self):
        """All stop words returns empty list."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["the", "is", "are"]
            mock_pos_tag.return_value = [("the", "DT"), ("is", "VBZ"), ("are", "VBP")]
            mock_stopwords.return_value = ["the", "is", "are"]
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["the is are"])

            # Assert
            assert len(result) == 0

    def test_no_valid_tokens_after_filtering(self):
        """No valid tokens after filtering returns empty list."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["a", "an", "i"]  # All < 3 chars
            mock_pos_tag.return_value = [("a", "DT"), ("an", "DT"), ("i", "PRP")]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["a an i"])

            # Assert
            assert len(result) == 0

    # -------------------------------------------------------------------------
    # Lemmatization Specific Tests
    # -------------------------------------------------------------------------

    def test_plural_nouns_lemmatized(self):
        """Plural nouns lemmatized (cats -> cat)."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["cats", "dogs", "cats"]
            mock_pos_tag.return_value = [
                ("cats", "NNS"),
                ("dogs", "NNS"),
                ("cats", "NNS"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: (
                "cat" if word == "cats" else "dog"
            )
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["cats dogs cats"])

            # Assert
            assert result[0]["word"] == "cat"
            assert result[0]["frequency"] == 2
            assert result[1]["word"] == "dog"
            assert result[1]["frequency"] == 1

    def test_verb_conjugations_lemmatized(self):
        """Verb conjugations lemmatized (running -> run)."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["running", "runs", "ran", "running"]
            mock_pos_tag.return_value = [
                ("running", "VBG"),
                ("runs", "VBZ"),
                ("ran", "VBD"),
                ("running", "VBG"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.return_value = "run"
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["running runs ran running"])

            # Assert
            assert result[0]["word"] == "run"
            assert result[0]["frequency"] == 4

    def test_comparative_adjectives_lemmatized(self):
        """Comparative adjectives lemmatized (better -> good)."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["better", "best", "good"]
            mock_pos_tag.return_value = [
                ("better", "JJR"),
                ("best", "JJS"),
                ("good", "JJ"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.return_value = "good"
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["better best good"])

            # Assert
            assert result[0]["word"] == "good"
            assert result[0]["frequency"] == 3

    def test_irregular_forms_lemmatized(self):
        """Irregular forms lemmatized."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["mice", "mouse", "mice"]
            mock_pos_tag.return_value = [
                ("mice", "NNS"),
                ("mouse", "NN"),
                ("mice", "NNS"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: (
                "mouse" if word == "mice" else "mouse"
            )
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["mice mouse mice"])

            # Assert
            assert result[0]["word"] == "mouse"
            assert result[0]["frequency"] == 3

    # -------------------------------------------------------------------------
    # Frequency Counting Tests
    # -------------------------------------------------------------------------

    def test_same_word_multiple_times(self):
        """Same word multiple times counted correctly."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["hello"] * 5
            mock_pos_tag.return_value = [("hello", "NN")] * 5
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["hello hello hello hello hello"])

            # Assert
            assert result[0]["word"] == "hello"
            assert result[0]["frequency"] == 5

    def test_different_words_with_same_frequency(self):
        """Different words with same frequency."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["apple", "banana", "apple", "banana"]
            mock_pos_tag.return_value = [
                ("apple", "NN"),
                ("banana", "NN"),
                ("apple", "NN"),
                ("banana", "NN"),
            ]
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["apple banana apple banana"])

            # Assert
            assert len(result) == 2
            assert {"word": "apple", "frequency": 2} in result
            assert {"word": "banana", "frequency": 2} in result

    def test_case_insensitive_counting(self):
        """Case insensitive counting."""
        with (
            patch("lib.nlp.word_tokenize") as mock_tokenize,
            patch("lib.nlp.nltk.pos_tag") as mock_pos_tag,
            patch("lib.nlp.stopwords.words") as mock_stopwords,
            patch("lib.nlp.WordNetLemmatizer") as mock_lemmatizer,
        ):
            mock_tokenize.return_value = ["hello", "HELLO", "Hello", "hello"]
            mock_pos_tag.return_value = [("hello", "NN")] * 4
            mock_stopwords.return_value = []
            mock_lemma_instance = MagicMock()
            mock_lemma_instance.lemmatize.side_effect = lambda word, pos: word
            mock_lemmatizer.return_value = mock_lemma_instance

            # Act
            result = compute_word_frequencies(["hello HELLO Hello hello"])

            # Assert
            assert len(result) == 1
            assert result[0]["word"] == "hello"
            assert result[0]["frequency"] == 4


# =============================================================================
# Integration Tests
# =============================================================================


class TestNlpIntegration:
    """Integration tests for NLP module."""

    def test_full_pipeline_with_real_nltk(self):
        """Full pipeline test with actual NLTK (if available)."""
        # This test will use real NLTK if available, or skip if not
        try:
            # Try to ensure data is available
            ensure_nltk_data()

            # Run a simple test
            result = compute_word_frequencies(["The cats are running fast"])

            # Should return some results
            assert isinstance(result, list)
            # At minimum, should have some words after processing
        except (LookupError, ImportError, ValueError):
            # Skip if NLTK data not available or corpus is incomplete
            pytest.skip("NLTK data not available for integration test")

    def test_constants_are_strings(self):
        """All constants are plain strings (not corpus readers)."""
        assert isinstance(WN_ADJ, str)
        assert isinstance(WN_VERB, str)
        assert isinstance(WN_ADV, str)
        assert isinstance(WN_NOUN, str)
