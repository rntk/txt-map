"""
NLP utilities using NLTK for tokenisation, POS tagging, lemmatisation,
and stop-word removal.
"""

import os
import re
import math
import html
import collections
from pathlib import Path
from typing import List, Dict, TypedDict

import nltk
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer


# Module-level singletons, initialised lazily.
_lemmatizer: WordNetLemmatizer | None = None
_stop_words: set | None = None
_TOKEN_ARTIFACTS = {"nbsp"}

# WordNet POS tags as plain strings to avoid importing/initializing corpus
# readers for constants.
WN_ADJ = "a"
WN_VERB = "v"
WN_ADV = "r"
WN_NOUN = "n"


class WordFrequencyEntry(TypedDict):
    word: str
    frequency: int
    specificity_score: float
    outside_topic_frequency: int


class BigramHeatmapData(TypedDict):
    window_size: int
    words: List[WordFrequencyEntry]
    col_words: List[WordFrequencyEntry]
    matrix: List[List[int]]
    max_value: int
    default_visible_word_count: int
    total_word_count: int


def ensure_nltk_data(download_missing: bool = True) -> None:
    """Ensure required NLTK corpora / models are available."""
    download_dir_raw: str | None = os.getenv("NLTK_DATA")
    download_dir: str | None = None
    if download_dir_raw:
        download_dir = str(Path(download_dir_raw).expanduser())
        nltk.data.path.insert(0, download_dir)

    needed = [
        ("tokenizers/punkt_tab", "punkt_tab"),
        ("corpora/stopwords", "stopwords"),
        ("corpora/wordnet", "wordnet"),
        ("corpora/omw-1.4", "omw-1.4"),
        ("taggers/averaged_perceptron_tagger_eng", "averaged_perceptron_tagger_eng"),
    ]
    for data_path, package in needed:
        try:
            nltk.data.find(data_path)
        except LookupError:
            if download_missing:
                if download_dir is not None:
                    Path(download_dir).mkdir(parents=True, exist_ok=True)
                    nltk.download(package, quiet=True, download_dir=download_dir)
                else:
                    nltk.download(package, quiet=True)


def _lemmatizer_instance() -> WordNetLemmatizer:
    global _lemmatizer
    if _lemmatizer is None:
        _lemmatizer = WordNetLemmatizer()
    return _lemmatizer


def _stop_words_set() -> set:
    global _stop_words
    if _stop_words is None:
        try:
            _stop_words = set(stopwords.words("english"))
        except LookupError:
            # Keep endpoint functional if corpus download is unavailable.
            _stop_words = {
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
    return _stop_words


def _wordnet_pos(treebank_tag: str) -> str:
    """Map a Penn Treebank POS tag to the closest WordNet POS constant."""
    if treebank_tag.startswith("J"):
        return WN_ADJ
    if treebank_tag.startswith("V"):
        return WN_VERB
    if treebank_tag.startswith("R"):
        return WN_ADV
    return WN_NOUN  # default (covers NN, NNS, NNP, …)


def _tokenize_text(text: str) -> List[str]:
    """Tokenize a single text to lowercase tokens with regex fallback."""
    cleaned_text = html.unescape(text).replace("\xa0", " ")
    try:
        return word_tokenize(cleaned_text.lower())
    except LookupError:
        return re.findall(r"[a-z]+", cleaned_text.lower())


def _tag_tokens(tokens: List[str]) -> List[tuple[str, str]]:
    """POS-tag tokens with a noun fallback when tagger data is unavailable."""
    try:
        return nltk.pos_tag(tokens)
    except LookupError:
        return [(token, "NN") for token in tokens]


def normalize_text_tokens(text: str) -> List[str]:
    """
    Tokenize, lemmatize, and filter a single text into normalized tokens.

    The normalization rules match ``compute_word_frequencies`` so callers can
    reuse the same NLTK-backed stopword and lemmatization behavior.
    """
    if not text:
        return []

    lemmatizer = _lemmatizer_instance()
    stop_words = _stop_words_set()
    tokens = _tokenize_text(text)
    tagged_tokens = _tag_tokens(tokens)

    normalized_tokens: List[str] = []
    for token, pos in tagged_tokens:
        if not re.fullmatch(r"[a-z]+", token):
            continue
        if len(token) < 3:
            continue
        if token in _TOKEN_ARTIFACTS:
            continue
        if token in stop_words:
            continue

        try:
            lemma = lemmatizer.lemmatize(token, pos=_wordnet_pos(pos))
        except LookupError:
            lemma = token

        if len(lemma) < 3 or lemma in stop_words or lemma in _TOKEN_ARTIFACTS:
            continue

        normalized_tokens.append(lemma)

    return normalized_tokens


def compute_word_frequencies(
    texts: List[str], top_n: int = 60
) -> List[WordFrequencyEntry]:
    """
    Tokenise, POS-tag, lemmatise, and count words across all *texts*.

    Returns a list of ``{"word": str, "frequency": int}`` dicts,
    sorted descending by frequency and capped at *top_n* entries.
    """
    if not texts:
        return []

    freq: collections.Counter = collections.Counter()
    combined_text = " ".join(texts)
    for token in normalize_text_tokens(combined_text):
        freq[token] += 1

    return [
        {"word": word, "frequency": count} for word, count in freq.most_common(top_n)
    ]


def compute_bigram_heatmap(
    topic_texts: List[str],
    background_texts: List[str],
    window_size: int = 3,
    default_visible_word_count: int = 40,
) -> BigramHeatmapData:
    """
    Build a co-occurrence matrix for normalized tokens.

    Co-occurrence is computed within each input text separately using a
    lookahead window of ``window_size`` tokens.  Rows and columns use
    different word orderings so each axis independently highlights what
    matters most:

    - **rows** are sorted by ``specificity_score × cooccurrence_strength``
      so the most topic-specific and well-connected words lead the rows.
    - **columns** are sorted by ``cooccurrence_strength`` alone so the
      most densely connected words anchor the left side of the table,
      maximising the chance that the top-left quadrant holds the highest
      co-occurrence values.

    Words with zero co-occurrence strength (isolated tokens that never
    appear within the window of any other token) are excluded from both
    axes since they contribute nothing to a bigram analysis.
    """
    if not topic_texts:
        return {
            "window_size": window_size,
            "words": [],
            "col_words": [],
            "matrix": [],
            "max_value": 0,
            "default_visible_word_count": default_visible_word_count,
            "total_word_count": 0,
        }

    normalized_by_text: List[List[str]] = [
        normalize_text_tokens(text) for text in topic_texts if text
    ]
    unigram_counts: collections.Counter[str] = collections.Counter()
    pair_counts: collections.Counter[tuple[str, str]] = collections.Counter()
    background_counts: collections.Counter[str] = collections.Counter()

    for tokens in normalized_by_text:
        unigram_counts.update(tokens)
        for index, left_word in enumerate(tokens):
            upper_bound = min(index + window_size + 1, len(tokens))
            for lookahead_index in range(index + 1, upper_bound):
                right_word = tokens[lookahead_index]
                pair = tuple(sorted((left_word, right_word)))
                pair_counts[pair] += 1

    for text in background_texts:
        if not text:
            continue
        background_counts.update(normalize_text_tokens(text))

    if not unigram_counts:
        return {
            "window_size": window_size,
            "words": [],
            "col_words": [],
            "matrix": [],
            "max_value": 0,
            "default_visible_word_count": default_visible_word_count,
            "total_word_count": 0,
        }

    partition_count = 2

    def specificity_score(word: str) -> float:
        topic_frequency = unigram_counts[word]
        background_frequency = background_counts[word]
        document_frequency = 1 + int(background_frequency > 0)
        inverse_document_frequency = (
            math.log((1 + partition_count) / (1 + document_frequency)) + 1.0
        )
        return (topic_frequency * inverse_document_frequency) / (
            1 + background_frequency
        )

    cooccurrence_strengths: collections.Counter[str] = collections.Counter()
    for (left_word, right_word), count in pair_counts.items():
        cooccurrence_strengths[left_word] += count
        cooccurrence_strengths[right_word] += count

    connected_words: List[str] = [
        word
        for word, _count in sorted(
            unigram_counts.items(),
            key=lambda item: (-item[1], item[0]),
        )
        if cooccurrence_strengths[word] > 0
    ]

    # Rows: most topic-specific AND well-connected words first.
    row_ordered_words = sorted(
        connected_words,
        key=lambda word: (
            -(specificity_score(word) * cooccurrence_strengths[word]),
            -unigram_counts[word],
            word,
        ),
    )

    # Columns: most densely connected words first so the top-left quadrant
    # concentrates the highest co-occurrence values.
    col_ordered_words = sorted(
        connected_words,
        key=lambda word: (
            -cooccurrence_strengths[word],
            -unigram_counts[word],
            word,
        ),
    )

    def make_word_entry(word: str) -> WordFrequencyEntry:
        return {
            "word": word,
            "frequency": unigram_counts[word],
            "specificity_score": round(specificity_score(word), 6),
            "outside_topic_frequency": background_counts[word],
        }

    word_entries: List[WordFrequencyEntry] = [
        make_word_entry(w) for w in row_ordered_words
    ]
    col_word_entries: List[WordFrequencyEntry] = [
        make_word_entry(w) for w in col_ordered_words
    ]

    matrix: List[List[int]] = [
        [0 for _ in range(len(col_ordered_words))]
        for _ in range(len(row_ordered_words))
    ]
    row_index_by_word: Dict[str, int] = {w: i for i, w in enumerate(row_ordered_words)}
    col_index_by_word: Dict[str, int] = {w: i for i, w in enumerate(col_ordered_words)}

    for (left_word, right_word), count in pair_counts.items():
        matrix[row_index_by_word[left_word]][col_index_by_word[right_word]] = count
        if left_word != right_word:
            matrix[row_index_by_word[right_word]][col_index_by_word[left_word]] = count

    max_value = max(pair_counts.values()) if pair_counts else 0
    return {
        "window_size": window_size,
        "words": word_entries,
        "col_words": col_word_entries,
        "matrix": matrix,
        "max_value": max_value,
        "default_visible_word_count": default_visible_word_count,
        "total_word_count": len(word_entries),
    }
