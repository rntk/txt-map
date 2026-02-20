"""
NLP utilities using NLTK for tokenisation, POS tagging, lemmatisation,
and stop-word removal.
"""

import re
import collections
from typing import List

import nltk
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords, wordnet
from nltk.stem import WordNetLemmatizer


# Module-level singletons, initialised lazily.
_lemmatizer: WordNetLemmatizer | None = None
_stop_words: set | None = None


def ensure_nltk_data() -> None:
    """Download required NLTK corpora / models if not already present."""
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
            nltk.download(package, quiet=True)


def _lemmatizer_instance() -> WordNetLemmatizer:
    global _lemmatizer
    if _lemmatizer is None:
        _lemmatizer = WordNetLemmatizer()
    return _lemmatizer


def _stop_words_set() -> set:
    global _stop_words
    if _stop_words is None:
        _stop_words = set(stopwords.words("english"))
    return _stop_words


def _wordnet_pos(treebank_tag: str) -> str:
    """Map a Penn Treebank POS tag to the closest WordNet POS constant."""
    if treebank_tag.startswith("J"):
        return wordnet.ADJ
    if treebank_tag.startswith("V"):
        return wordnet.VERB
    if treebank_tag.startswith("R"):
        return wordnet.ADV
    return wordnet.NOUN  # default (covers NN, NNS, NNP, …)


def compute_word_frequencies(texts: List[str], top_n: int = 60) -> List[dict]:
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
    tokens = word_tokenize(combined.lower())
    tagged = nltk.pos_tag(tokens)

    freq: collections.Counter = collections.Counter()
    for token, pos in tagged:
        # Keep only plain alphabetic tokens of reasonable length
        if not re.fullmatch(r"[a-z]+", token):
            continue
        if len(token) < 3:
            continue
        if token in stop_words:
            continue

        lemma = lemmatizer.lemmatize(token, pos=_wordnet_pos(pos))

        if len(lemma) < 3 or lemma in stop_words:
            continue

        freq[lemma] += 1

    return [
        {"word": word, "frequency": count}
        for word, count in freq.most_common(top_n)
    ]
