"""
NLP utilities using NLTK for tokenisation, POS tagging, lemmatisation,
and stop-word removal.
"""

import os
import re
import collections
from pathlib import Path
from typing import List, Dict, Any

import nltk
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer


# Module-level singletons, initialised lazily.
_lemmatizer: WordNetLemmatizer | None = None
_stop_words: set | None = None

# WordNet POS tags as plain strings to avoid importing/initializing corpus
# readers for constants.
WN_ADJ = "a"
WN_VERB = "v"
WN_ADV = "r"
WN_NOUN = "n"


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


def compute_word_frequencies(texts: List[str], top_n: int = 60) -> List[Dict[str, Any]]:
    """
    Tokenise, POS-tag, lemmatise, and count words across all *texts*.

    Returns a list of ``{"word": str, "frequency": int}`` dicts,
    sorted descending by frequency and capped at *top_n* entries.
    """
    if not texts:
        return []

    lemmatizer = _lemmatizer_instance()
    stop_words = _stop_words_set()

    combined = " ".join(texts)
    try:
        tokens = word_tokenize(combined.lower())
    except LookupError:
        tokens = re.findall(r"[a-z]+", combined.lower())

    try:
        tagged = nltk.pos_tag(tokens)
    except LookupError:
        tagged = [(token, "NN") for token in tokens]

    freq: collections.Counter = collections.Counter()
    for token, pos in tagged:
        # Keep only plain alphabetic tokens of reasonable length
        if not re.fullmatch(r"[a-z]+", token):
            continue
        if len(token) < 3:
            continue
        if token in stop_words:
            continue

        try:
            lemma = lemmatizer.lemmatize(token, pos=_wordnet_pos(pos))
        except LookupError:
            lemma = token

        if len(lemma) < 3 or lemma in stop_words:
            continue

        freq[lemma] += 1

    return [
        {"word": word, "frequency": count} for word, count in freq.most_common(top_n)
    ]
