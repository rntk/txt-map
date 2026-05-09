/**
 * Naive in-browser tokenization, lemmatization, and frequency counting for
 * building a tag cloud directly from article text. No external NLP deps.
 */

const STOP_WORDS = new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "cannot",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "don",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "just",
  "let",
  "like",
  "made",
  "make",
  "may",
  "me",
  "might",
  "more",
  "most",
  "must",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "now",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "ought",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "same",
  "shall",
  "she",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
  "also",
  "even",
  "much",
  "many",
  "one",
  "two",
  "three",
]);

const TOKEN_REGEX = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'-]*/g;

/**
 * Strip a few common English suffixes to coarsely group word forms.
 * Intentionally simple — no dictionary lookup.
 * @param {string} word
 * @returns {string}
 */
export function naiveLemmatize(word) {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;

  if (w.length >= 5 && w.endsWith("ies")) {
    return w.slice(0, -3) + "y";
  }
  if (w.length >= 6 && w.endsWith("ing")) {
    let stem = w.slice(0, -3);
    if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
      stem = stem.slice(0, -1);
    }
    return stem;
  }
  if (w.length >= 5 && w.endsWith("edly")) {
    return w.slice(0, -4);
  }
  if (w.length >= 5 && w.endsWith("ed")) {
    let stem = w.slice(0, -2);
    if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
      stem = stem.slice(0, -1);
    }
    return stem;
  }
  if (w.length >= 5 && w.endsWith("ly")) {
    return w.slice(0, -2);
  }
  if (w.length >= 5 && w.endsWith("sses")) {
    return w.slice(0, -2);
  }
  if (w.length >= 5 && w.endsWith("es") && !w.endsWith("ses")) {
    return w.slice(0, -2);
  }
  if (
    w.length >= 4 &&
    w.endsWith("s") &&
    !w.endsWith("ss") &&
    !w.endsWith("us") &&
    !w.endsWith("is")
  ) {
    return w.slice(0, -1);
  }
  return w;
}

/**
 * Tokenize article text and group occurrences by their naive lemma.
 *
 * @param {string} text
 * @returns {{
 *   words: Array<{ word: string, frequency: number }>,
 *   ranges: Map<string, Array<{start: number, end: number}>>,
 * }}
 */
export function buildArticleWordCloud(text) {
  if (typeof text !== "string" || text.length === 0) {
    return { words: [], ranges: new Map() };
  }

  const counts = new Map();
  const ranges = new Map();
  const display = new Map();

  TOKEN_REGEX.lastIndex = 0;
  let match;
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const raw = match[0];
    if (raw.length < 3) continue;
    const lower = raw.toLowerCase();
    if (STOP_WORDS.has(lower)) continue;
    const lemma = naiveLemmatize(raw);
    if (!lemma || lemma.length < 3) continue;
    if (STOP_WORDS.has(lemma)) continue;

    counts.set(lemma, (counts.get(lemma) || 0) + 1);
    if (!ranges.has(lemma)) ranges.set(lemma, []);
    ranges
      .get(lemma)
      .push({ start: match.index, end: match.index + raw.length });
    if (!display.has(lemma)) display.set(lemma, lower);
  }

  const words = Array.from(counts.entries())
    .filter(([, freq]) => freq >= 2)
    .map(([lemma, freq]) => ({
      word: display.get(lemma) || lemma,
      frequency: freq,
      lemma,
    }))
    .sort((a, b) => b.frequency - a.frequency);

  return { words, ranges };
}
