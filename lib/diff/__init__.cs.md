# Semantic Diff Subsystem

Provides topic-aware semantic comparison of two submissions, identifying matched, nearest, and unmatched sentence units across both submissions.

---

## Algorithm Version

A module-level constant `ALGORITHM_VERSION = "semantic-v3-topic-aware-charwb-3-6-th0.25-cr0.5-topk-shared"` identifies the current algorithm. It is embedded in all computed diff outputs and used for staleness checks.

---

## Data Shapes

### Submission

An input `submission` dict with:
- `results.sentences`: list of sentence strings (1-based positions when referenced from topics)
- `results.topics`: list of topic dicts, each with:
  - `name`: string topic label (falls back to `"(untitled)"` if blank/missing)
  - `ranges`: list of dicts with optional `sentence_start` / `sentence_end` integers (1-based, inclusive)
  - `sentences`: list of 1-based integer sentence indices
- `updated_at`: `datetime` used for staleness checks

### Topic Unit

```python
{"topic": str, "sentence_index": int, "text": str}
```

`sentence_index` is 0-based. `text` is stripped.

### Match / Nearest Row (canonical A/B form)

```python
{
    "{prefix}_topic": str | None,
    "{prefix}_sentence_index": int | None,
    "{prefix}_text": str | None,
    "similarity": float,  # rounded to 4 decimal places
}
```

where `{prefix}` is `"a"` or `"b"`. In oriented (left/right) form the prefixes become `"left"` and `"right"`.

---

## Public API

### `canonical_pair(left_submission_id, right_submission_id) -> (pair_key, submission_a_id, submission_b_id)`

Returns a deterministic canonical ordering for any unordered pair of submission IDs by lexicographic sort. `pair_key` is `"{a_id}::{b_id}"`.

---

### `build_topic_units(submission) -> (units, missing_reasons)`

Builds the list of topic units from a submission.

**Logic:**
1. Extracts `results.sentences` and `results.topics`.
2. For each topic, converts `ranges` and `sentences` entries to 0-based sentence indices (see _Sentence Index Parsing_ below).
3. Assigns each sentence index its first-seen topic name. Sentences appearing in multiple topics get the topic whose entry is processed first.
4. Produces one unit per assigned sentence that has non-empty text, sorted by `sentence_index`.

**`missing_reasons`** — a list of strings; non-empty means the submission is not ready:
- `"sentences_missing"` — `results.sentences` is absent or empty
- `"topics_missing"` — `results.topics` is absent or empty
- `"topic_ranges_missing"` — no topic produced any valid sentence indices
- `"topic_units_empty"` — all candidate sentences had empty/non-string text

Returns `([], reasons)` on any failure.

#### Sentence Index Parsing (internal)

From `topic.ranges`: each entry with at least one of `sentence_start` / `sentence_end` (both must be `int`; a missing bound defaults to the other). The range `[min, max]` (both inclusive, 1-based) is converted to 0-based indices. Indices `< 0` are discarded.

From `topic.sentences`: each value that is an `int > 0` is converted to 0-based by subtracting 1.

Duplicates across both sources are deduplicated.

---

### `check_submission_topic_readiness(submission) -> dict`

Returns:
```python
{"ready": bool, "missing": list[str], "unit_count": int}
```

`ready` is `True` iff `missing` is empty.

---

### `compute_topic_aware_semantic_diff(submission_a, submission_b, *, threshold=0.25, nearest_min_similarity=0.5, top_k_nearest=3) -> dict`

Computes a bidirectional semantic diff between two submissions.

**Raises** `ValueError` if either submission is not topic-ready (propagates `missing_reasons` in the message).

**Similarity computation:**
- Combines all unit texts from both submissions into a single corpus.
- Vectorizes with `TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 6), lowercase=True)`.
- Computes an `(len(units_a) × len(units_b))` cosine similarity matrix.
- The same matrix (transposed for the reverse direction) is reused for both directional passes.

**Directional pass** (run twice: A→B and B→A):

For each source unit, rank all target units by descending similarity.
- **Match (rank #1 target):** If best similarity ≥ `threshold`, emit a match row linking source to that target unit and record the target index as matched. Otherwise emit a match row with all target fields `None` and the best (sub-threshold) similarity score.
- **Nearest (ranks #2 … #(top_k_nearest+1)):** For each of the next `top_k_nearest` ranked targets, if similarity ≥ `nearest_min_similarity`, emit a nearest row.

After the A→B pass, target units whose index was never matched become `unmatched_b` (and vice-versa from the B→A pass for `unmatched_a`). Unmatched entries are the full unit dicts (not rows).

**Return shape:**
```python
{
    "meta": {
        "algorithm_version": str,
        "threshold": float,
        "nearest_min_similarity": float,
        "top_k_nearest": int,
        "generated_at": str,   # ISO-8601 UTC, e.g. "2024-01-01T00:00:00Z"
        "units_a": int,
        "units_b": int,
        "topics_a": int,       # distinct topic names in units_a
        "topics_b": int,
    },
    "matches_a_to_b": list[dict],
    "matches_b_to_a": list[dict],
    "nearest_a_to_b": list[dict],
    "nearest_b_to_a": list[dict],
    "unmatched_a": list[dict],  # topic unit dicts
    "unmatched_b": list[dict],
}
```

**Edge cases:**
- If source units is empty, return empty matches/nearest and mark all target indices as unmatched.
- If target units is empty, return all source units as unmatched match rows (similarity 0.0) and no nearest.

---

### `orient_payload(payload, submission_a_id, submission_b_id, left_submission_id, right_submission_id) -> dict`

Re-orients a canonical A/B diff payload into a caller-requested left/right perspective.

If `left == a` and `right == b`, A→B becomes left→right; otherwise A is treated as right and B as left, and the directional sets are swapped accordingly.

All row field keys are renamed from `a_*`/`b_*` to `left_*`/`right_*` in both cases.

**Return shape:**
```python
{
    "meta": dict,
    "matches_left_to_right": list[dict],
    "matches_right_to_left": list[dict],
    "nearest_left_to_right": list[dict],
    "nearest_right_to_left": list[dict],
    "unmatched_left": list[dict],
    "unmatched_right": list[dict],
}
```

In all oriented rows, `left_*` fields always refer to the left document and `right_*` fields to the right document, regardless of which directional pass produced the row.

---

### `stale_reasons(diff_doc, submission_a, submission_b, *, algorithm_version=ALGORITHM_VERSION) -> list[str]`

Returns a list of reasons why a stored diff is stale. Possible values:
- `"algorithm_version_mismatch"` — `diff_doc["algorithm_version"]` ≠ `algorithm_version`
- `"left_submission_updated"` — `submission_a["updated_at"] > diff_doc["computed_at"]` (only checked when both are `datetime` instances)
- `"right_submission_updated"` — same check for `submission_b`

Returns `[]` if the diff is fresh.
