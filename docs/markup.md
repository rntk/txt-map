# Markup Generation — Developer Reference

This document describes the `markup_generation` task: its purpose, backend pipeline, and integration.

---

## 1. Purpose

`markup_generation` is an LLM-powered worker task that analyzes article text to generate semantic HTML markup. It transforms plain text into a structured, readable format by wrapping word ranges in appropriate HTML tags (e.g., `<h2>`, `<ul>`, `<li>`, `<strong>`).

The LLM acts as an editor that infers structure from the content itself. The original text is preserved as the source of truth, and the markup is stored alongside the original content to be rendered as an "Enriched" view.

The result is stored in `submission.results.markup` and exposed to the user via the `TopicSentencesModal` "Enriched" tab.

---

## 2. Pipeline Position

```
split_topic_generation
  ├── subtopics_generation
  ├── summarization
  ├── prefix_tree
  ├── insights_generation
  └── markup_generation   ← depends on split_topic_generation, priority 4
```

Registered in `workers.py` (`TASK_DEPENDENCIES`, `TASK_PRIORITIES`, `TASK_HANDLERS`, `cache_tasks`).

---

## 3. Backend Task

**File:** `lib/tasks/markup_generation.py`

### Flow

For each topic in `submission.results.topics`:

1.  **Anchor Injection:** The backend splits the topic's text into words and injects `{N}` anchors (e.g., "Hello{1} world!{2}") to create a word-indexed representation.
2.  **LLM Classification:** A prompt is sent to the LLM containing:
    -   `<clean_content>`: Original text for context.
    -   `<annotated_content>`: Text with anchors for reference.
    -   Instructions for the LLM to return structural tags (e.g., `1-2: h2`, `3-5: ul`).
3.  **Parsing & Validation:** The backend parses the LLM output, validates the tags against the word count, and handles nesting/overlapping according to defined rules (e.g., auto-wrapping `li` in `ul`).
4.  **HTML Reconstruction:** The backend reconstructs the final HTML string by inserting the tags around the corresponding word ranges.
5.  **Storage:** Results are written to `submission.results.markup` keyed by topic name.

### Caching

Uses the shared `_build_cache_key` / `CacheEntry` pattern.
Cache namespace: `markup_generation:{model_id}`.
Prompt version string: `markup_anchor_v5`.

---

## 4. MongoDB Storage Schema

Results are stored in `submission.results.markup` as a dictionary keyed by topic name:

```json
{
  "results": {
    "markup": {
      "Category>Topic Name": {
        "ranges": [
          {
            "range_index": 1,
            "sentence_start": 1,
            "sentence_end": 3,
            "html": "<h2>Topic Title</h2><p>Article body content...</p>"
          }
        ]
      }
    }
  }
}
```

---

## 5. Implementation Notes

- **Anchor-based System:** Using a `{{N}}` marker system allows the model to reference word spans precisely without parsing complex JSON.
- **Safety:** The backend enforces a strict list of allowed HTML tags and ignores forbidden/dangerous tags (`<script>`, `<iframe>`, etc.).
- **Groundedness:** The system verifies that the generated HTML contains exactly the same words as the input text (ignores tag-induced whitespace changes) to ensure content integrity.
- **Fallbacks:** If LLM parsing fails after retries, the system falls back to a plain text renderer that wraps paragraphs in `<p>` tags.
- **Parallelization:** If the LLM client supports it (e.g., `QueuedLLMClient`), markup generation can be performed for multiple topics in parallel.
