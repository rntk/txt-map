# Document Analysis Tasks

This subsystem provides a collection of background processing tasks that transform a submitted text document into structured analytical artifacts: sentences, topics, subtopics, summaries, a mindmap tree, and a prefix trie. Each task operates on a **submission document** stored in MongoDB and writes its output back to `submission.results` via `SubmissionsStorage.update_results`.

All task entry-point functions share the same signature:
```python
process_<task>(submission: dict, db, llm, **kwargs)
```
where `submission` is the MongoDB document, `db` is the MongoDB database instance, and `llm` is a `LLamaCPP` client. Tasks are expected to be run in dependency order (described below).

---

## Shared Concepts

### Submission Document
Relevant fields read/written by these tasks:

| Field | Type | Description |
|---|---|---|
| `submission_id` | str | Unique identifier |
| `html_content` | str | Preferred source text (HTML) |
| `text_content` | str | Fallback source text |
| `max_chunk_chars` | int | Max chars per chunk (default varies by task) |
| `results.sentences` | list[str] | Ordered sentence strings (1-indexed in all other results) |
| `results.topics` | list[dict] | Topic objects `{name, sentences}` |
| `results.subtopics` | list[dict] | Subtopic objects `{name, sentences, parent_topic}` |
| `results.summary` | list[str] | Per-sentence summary strings |
| `results.summary_mappings` | list[dict] | Mapping objects (see Summarization) |
| `results.topic_summaries` | dict[str, str] | Topic name → concatenated summary |
| `results.topic_mindmaps` | dict | Nested mindmap tree |
| `results.prefix_tree` | dict | Compressed radix trie |

### LLM Adapter
Both `subtopics_generation` and `summarization` wrap the `LLamaCPP` client in a local `_LLMAdapter` that conforms to the `txt_splitt` `LLMCallable` protocol: `call(prompt: str, temperature: float) -> str` delegates to `llm.call([prompt], temperature=temperature)`.

### LLM Caching
Tasks that accept an optional `cache_store` argument wrap the adapter in `CachingLLMCallable(adapter, cache_store, namespace=<task_name>)` from `txt_splitt.cache`. When `cache_store` is `None`, the adapter is used directly.

`topic_extraction` manages its own MongoDB-based cache directly via `db.llm_cache`, using MD5 hashes of prompts as keys (`prompt_hash`). The collection is created with a unique index on `prompt_hash` if it does not already exist.

---

## Tasks

### 1. Text Splitting (`process_text_splitting`)

**Purpose:** Split the raw document into sentences and produce initial topics.

**Input:** `html_content` (preferred) or `text_content`. Raises `ValueError` if both are empty.

**Processing:** Calls `split_article_with_markers(source, llm, max_chunk_chars=84_000)` from `lib.article_splitter`. Returns a result object with `.sentences` (list of strings) and `.topics`.

**Output written:** `results.sentences`, `results.topics`.

**Dependencies:** None (first task).

---

### 2. Split + Topic Generation (`process_split_topic_generation`)

**Purpose:** Combined replacement for text splitting + topic generation in a single call, with retry logic and tracing.

**Input:** `html_content` or `text_content`. `max_chunk_chars` read from submission (default `12_000`). Raises `ValueError` if both content fields are empty.

**Processing:**
- Instantiates a `Tracer` from `txt_splitt`.
- Calls `split_article_with_markers(source, llm, tracer=tracer, max_chunk_chars=max_chunk_chars, cache_store=cache_store)`.
- Retries up to `max_retries` times (default 3) on failure with exponential backoff starting at 2 s (delay = `2.0 * 2^attempt`).
- Logs tracer output after completion.

**Output written:** `results.sentences`, `results.topics`.

**Dependencies:** None (alternative first task; supersedes `process_text_splitting`).

---

### 3. Topic Extraction (`process_topic_extraction`)

**Purpose:** Re-extract hierarchical topics from already-split sentences using a detailed LLM prompt, then generate subtopics.

**Dependencies:** `results.sentences` must be populated; raises `ValueError` otherwise.

**Processing:**

#### 3a. Chunking
Sentences are grouped into token-bounded chunks. The available token budget per chunk is: `context_size - template_tokens - 1500`. Sentences are formatted as `{N} sentence_text` (0-indexed). A new chunk begins whenever the running token count would exceed the budget.

#### 3b. Topic Prompt
Each chunk is formatted with `build_tagged_text(sentences, start_index)` which produces `{N} sentence` lines joined by newlines. This is inserted into a fixed prompt template requesting hierarchical topic paths in the form `Category>Sub>Leaf: range_list` (0-indexed sentences). The LLM response is cached in `db.llm_cache` by prompt MD5.

#### 3c. Range Parsing (`parse_llm_ranges`)
Parses each non-empty line as `<topic_path>: <ranges>`. Ranges are comma-separated and may be single numbers (`5`) or inclusive ranges (`0-5`), handled by `parse_range_string`.

#### 3d. Normalization (`normalize_topic_ranges`)
Applied globally across all chunks on 0-based indices up to `len(sentences) - 1`:
- Clamps all indices to `[0, max_index]`.
- Sorts by start index.
- Fills gaps with `"no_topic"` ranges.
- Appends a trailing `"no_topic"` range if the last covered index is less than `max_index`.
- Skips ranges that end before the current cursor.

#### 3e. Topic Conversion
Each normalized `(topic_path, start, end)` tuple is converted to a 1-based sentence index list. Topics with the same name are merged. The resulting list is `[{name: str, sentences: [int]}]`.

#### 3f. Subtopic Generation (inline)
For every non-`no_topic` topic, calls `generate_subtopics_for_topic` (see §4 below, same prompt/parse logic) using the same MongoDB cache collection.

**Output written:** `results.topics`, `results.sentences` (re-saved), `results.subtopics`.

---

### 4. Subtopics Generation (`process_subtopics_generation`)

**Purpose:** Generate subtopics for each topic independently of topic extraction.

**Dependencies:** `results.sentences` must exist; raises `ValueError` otherwise. If `results.topics` is empty, writes `subtopics: []` and returns.

**Processing per topic (`generate_subtopics_for_topic`):**
- Skips topics named `"no_topic"` or with no sentences.
- Formats sentences as `"<1-based-index>. <text>"`, inserts into a prompt asking the LLM to group sentences into 2–5 named sub-chapters.
- Calls the (optionally cached) LLM at temperature 0.0.
- Parses each response line as `<name>: <comma-separated numbers>`. Names are cleaned with `re.sub(r"[^a-zA-Z0-9 ]+", " ", name)`. Lines without valid integer sentence numbers are discarded.
- Returns `[{name, sentences, parent_topic}]`.

**Output written:** `results.subtopics` (flat list across all topics).

---

### 5. Summarization (`process_summarization`)

**Purpose:** Generate a per-sentence summary and per-topic summary.

**Dependencies:** `results.sentences` must exist; raises `ValueError` otherwise.

**Processing (`summarize_by_sentence_groups`):**
- For each sentence, builds a prompt: `"Summarize the text within the <text> tags into a super brief summary (just a few words)."` with the sentence inserted in `<text>` tags.
- Calls the LLM at temperature 0.0; trims whitespace from the response.
- Accumulates non-empty summaries into `all_summary_sentences` (list of strings) and `summary_mappings`.
- Each mapping entry: `{summary_index: int, summary_sentence: str, source_sentences: [1-based index]}`.

Note: `max_text_tokens` is computed (context size minus template tokens minus 400) but is not currently used to truncate input.

**Topic summaries:** For each non-`no_topic` topic with sentences, the same `summarize_by_sentence_groups` is called on the topic's sentence texts. The resulting summary strings are joined with spaces and stored under the topic name.

**Output written:**
- `results.summary` — list of summary strings, one per input sentence.
- `results.summary_mappings` — list of mapping dicts.
- `results.topic_summaries` — dict mapping topic name to concatenated summary string.

---

### 6. Mindmap Generation (`process_mindmap`)

**Purpose:** Build a nested tree from topics and subtopics. No LLM calls.

**Dependencies:** `results.topics` and `results.sentences` must exist; raises `ValueError` otherwise.

**Processing (`build_tree_from_topics`):**

The tree is a nested dict. Each node has the shape `{children: {}, sentences: [int]}`.

**Topics:** Each topic name is split on `">"` into path segments. The function walks/creates nodes along the path. Sentence indices are propagated (union) to **every ancestor node** along the path, not just the leaf.

Topics named `"no_topic"` or with an empty name are skipped.

**Subtopics:** Each subtopic's `parent_topic` is split on `">"` to navigate to the parent node's `children` dict. If the parent path exists, the subtopic is inserted as a child node and its sentence indices are merged. Subtopics with missing/empty name or `parent_topic`, or where `parent_topic` is `"no_topic"`, are skipped.

**Output written:** `results.topic_mindmaps` — the top-level tree dict (keys are root-level topic names).

---

### 7. Prefix Tree (`process_prefix_tree`)

**Purpose:** Build a compressed radix trie of all words in the sentences.

**Dependencies:** `results.sentences`.

**Processing (`build_compressed_trie`):**

1. **Word counting:** Extract words with `re.findall(r"[a-zA-Z']+", sentence.lower())`, strip leading/trailing apostrophes. Accumulate per-word `count` and the set of 1-based sentence indices.

2. **Standard character trie:** Insert every word character-by-character. Leaf nodes record the word's count and sorted sentence list; intermediate nodes have `count=0` and empty `sentences`.

3. **Compression (`_compress_node`):** Post-order traversal. Any intermediate node that has exactly one child and `count == 0` is merged with that child by concatenating labels. This repeats until the node has multiple children, zero children, or is a word-end node.

The function returns `root["children"]` (the trie below the implicit root).

Each node in the final trie:
```json
{
  "children": { "<label>": <node>, ... },
  "count": 0,
  "sentences": []
}
```
Leaf (word-end) nodes have `count > 0` and a non-empty `sentences` list.

**Output written:** `results.prefix_tree` via a direct `db.submissions.update_one` call (does not use `SubmissionsStorage`).

---

## Dependency Order

```
[process_text_splitting | process_split_topic_generation]
          ↓
   process_topic_extraction   (optional; re-extracts topics and subtopics)
          ↓
   process_subtopics_generation  (optional; separate subtopic pass)
          ↓
   process_summarization
          ↓
   process_mindmap
   process_prefix_tree  (independent of summarization/mindmap)
```

`process_prefix_tree` only requires `results.sentences` and can run after the splitting step.
