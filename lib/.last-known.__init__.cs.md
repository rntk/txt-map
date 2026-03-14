# Article Processing Library (`lib/`)

A collection of modules for PDF ingestion, NLP utilities, article segmentation into topic-grouped sentences, and per-topic summarization.

---

## `lib/__init__.py`

Empty — no public exports at the package level.

---

## `lib/pdf_to_html.py`

Converts PDF bytes to semantic HTML using PyMuPDF.

### Public API

#### `convert_pdf_to_html(pdf_bytes: bytes) -> str`
Convenience wrapper. Opens the PDF, runs `PDFToSemanticHTML.convert()`, closes the document, and returns a complete HTML document string.

#### `extract_text_from_pdf(pdf_bytes: bytes) -> str`
Extracts plain text from all pages, joining pages with `\n\n`. Intended as a fallback when HTML structure is not needed.

### `PDFToSemanticHTML`

Instantiated with raw PDF bytes. On construction, opens the document and runs font-size analysis.

**Font threshold detection (`_analyze_font_sizes`)**  
Collects all span font sizes across the entire document. Deduplicates and sorts descending. Maps the top three unique sizes to h1/h2/h3 thresholds. If only two unique sizes exist, h3 is set to `h2_size - 1`. If fewer than two, defaults to `24.0 / 18.0 / 14.0`. Stores result as a `FontThresholds` dataclass.

**Conversion (`convert`)**  
Iterates pages and text blocks (skipping non-text blocks). For each line, takes the maximum span font size and checks it against the thresholds (±0.5 tolerance):

- If the size meets an h1/h2/h3 threshold: flushes any buffered paragraph as `<p>`, emits `<hN>` with HTML-escaped concatenated span text.
- Otherwise: appends HTML-escaped, inline-styled span text to a paragraph buffer. Bold spans are wrapped in `<strong>`, italic in `<em>` (italic applied first, bold outermost).

A pending paragraph buffer is flushed as `<p>` at the end of each page. Pages are separated by `<!-- Page N -->` comments. The final output is a complete `<!DOCTYPE html>` document with a minimal embedded stylesheet.

**`close()`** releases the PyMuPDF document.

---

## `lib/nlp.py`

NLTK-based word frequency analysis.

### Setup

`ensure_nltk_data()` lazily downloads the following NLTK packages if not present: `punkt_tab`, `stopwords`, `wordnet`, `omw-1.4`, `averaged_perceptron_tagger_eng`.

`WordNetLemmatizer` and the English stop-word set are module-level singletons, initialized on first use. If the stop-word corpus is unavailable, a minimal hardcoded fallback set is used.

### `compute_word_frequencies(texts: List[str], top_n: int = 60) -> List[dict]`

Joins all texts, lowercases, tokenizes with NLTK (falls back to `re.findall(r"[a-z]+", ...)` on `LookupError`), and POS-tags the tokens (falls back to treating all tokens as `NN`).

For each token:
- Discard if not purely alphabetic (`[a-z]+`) or fewer than 3 characters.
- Discard stop words.
- Lemmatize using the WordNet POS mapped from the Penn Treebank tag (J→adj, V→verb, R→adv, everything else→noun).
- Discard the resulting lemma if it is shorter than 3 characters or is a stop word.
- Count surviving lemmas with a `Counter`.

Returns up to `top_n` entries as `[{"word": str, "frequency": int}]` sorted descending by frequency.

---

## `lib/article_splitter.py`

Splits article text (plain or HTML) into sentences and hierarchical topic groups using the `txt_splitt` library.

### Data Types

```python
@dataclass
class ArticleSplitResult:
    sentences: List[str]       # Sentence texts in document order
    topics: List[Dict]         # Topic groups (see structure below)
```

Each topic dict:
```python
{
    "name": str,               # ">"-joined label hierarchy, e.g. "Politics>Foreign Policy"
    "sentences": List[int],    # Sorted, deduplicated 1-based sentence indices
    "sentence_spans": [
        {"sentence": int, "start": int|None, "end": int|None}
    ],
    "ranges": [
        {
            "sentence_start": int,   # 1-based
            "sentence_end": int,     # 1-based
            "start": int|None,       # character offset in original text
            "end": int|None
        }
    ]
}
```

### `split_article(article, llm=None, tracer=None, anchor_every_words=5, max_chunk_chars=12_000, cache_store=None) -> ArticleSplitResult`

Returns `ArticleSplitResult([], [])` immediately if `article` is empty.

**Without LLM:** Strips `<style>`/`<script>` tags, splits into sentences, returns sentences with an empty topics list.

**With LLM:** Builds a `txt_splitt.Pipeline` consisting of:
- `SparseRegexSentenceSplitter` (anchor every `anchor_every_words` words, HTML-aware)
- `BracketMarker`
- `TopicRangeLLM` with `OverlapChunker(max_chars=max_chunk_chars)`, temperature 0.0
- `TopicRangeParser`
- `LLMRepairingGapHandler`
- `AdjacentSameTopicJoiner`
- `HTMLParserTagStripCleaner` (strips `style`, `script`)
- `MappingOffsetRestorer`

The LLM client is adapted to `txt_splitt`'s `LLMCallable` protocol via `_LLMCallableAdapter`. If `cache_store` is provided, calls are wrapped in `CachingLLMCallable` (namespace `"article-split"`). If a `tracer` is provided, calls are additionally wrapped in `TracingLLMCallable`.

After `pipeline.run(article)`, sentence texts are extracted directly and topics are built from `split_result.groups` via `_groups_to_topics`, which converts 0-based internal indices to 1-based and attaches character offsets from sentence objects.

`split_article_with_markers` is a backward-compatible alias for `split_article`.

---

## `lib/summarizer.py`

### `summarize_by_sentence_groups(sent_list, llm_client, cache_collection, max_groups_tokens_buffer=400)`

Produces one short summary per entry in `sent_list` (each entry is a text string representing a topic group).

**Token budget:** Estimates the token cost of the prompt template (without the sentence slot), then computes `max_text_tokens = llm_client.__max_context_tokens - template_tokens - max_groups_tokens_buffer`. Oversized groups are submitted as-is; truncation is left to the model/server.

**Per-group processing:**
1. Builds the prompt: asks the LLM for a "super brief summary (just a few words)", keeping it objective and concise.
2. Computes an MD5 hash of the full prompt and checks `cache_collection` (MongoDB) for a prior result.
3. On a cache miss, calls `llm_client.call([prompt])` and upserts `{prompt_hash, prompt, response, created_at}` into the collection.
4. Strips the response; if non-empty, appends it to the summary list and records a mapping `{"summary_index": int, "summary_sentence": str, "source_sentences": [idx+1]}` (1-based group index).

**Returns:** `(all_summary_sentences: List[str], summary_mappings: List[dict])`
