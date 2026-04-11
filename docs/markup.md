# Markup Generation — Developer Reference

This document describes the `markup_generation` task: its purpose, architecture, data schema, frontend rendering pipeline, and how to extend it with new types.

---

## 1. Purpose

`markup_generation` is an LLM-powered worker task that classifies each topic's sentence ranges into **structured markup segments**. The goal is to transform a "sheet of text" into a more readable and easy-to-understand format using an enriched UI (bullet points for dialogs, charts for trends, etc.).

The LLM acts as an **orchestrator/classifier, not a content generator** — it identifies _how_ existing text should be displayed without changing or paraphrasing the content. A key constraint is **not to hide the source from the user**, so the original "Sentences" tab always remains as the **Source of Truth (SOT)**.

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
Storage schema managed in `lib/storage/submissions.py` (`task_names`, `task_dependencies`, `create()`, `clear_results()`).

---

## 3. Backend Task

**File:** `lib/tasks/markup_generation.py`

### Flow

For each topic in `submission.results.topics`:

1. Collect the topic's sentence texts using its 1-based `sentences` index list against `results.sentences[]`.
2. Split those sentence texts into smaller **markup-only positions** for this task.
3. Format each position with word-level `[wN]` markers while preserving one line per position for readability.
4. Send a single LLM prompt asking for classification into typed segments.
5. Parse and validate the JSON response.
6. Retry up to 3 times with temperatures `[0.0, 0.3, 0.5]`; fall back to a single `plain` segment on total failure.
7. Store results keyed by topic name in `submission.results.markup`.

Results are written via `SubmissionsStorage.update_results(submission_id, {"markup": markup})`.

### Caching

Uses the shared `_build_cache_key` / `CacheEntry` pattern from `txt_splitt.cache`.
Cache namespace: `markup_classification:{model_id}`.
Prompt version string: `markup_v22`.

### Token Efficiency & Robustness

To minimize latency and cost, the prompt and parser use several optimizations:
- **Static Prefix First:** The prompt keeps the instruction/schema block ahead of any topic-specific payload so provider-side prompt/KV caching can reuse the longest possible prefix across topics.
- **Tagged Untrusted Inputs:** Topic metadata, context-only text, and classifiable content are passed in separate tagged blocks so prompt-injection boundaries stay explicit.
- **Abbreviated Schema:** The LLM returns shortened keys (e.g., `segs`, `wrd_idx`, `spkrs`, `vals`) which the backend expands to their full names before storage/rendering.
- **Word-First Normalization:** The LLM now refers only to word markers. The backend derives stable `position_indices` from those word spans before storing or rendering the result.
- **Mandatory Ranges:** The LLM is instructed to use string ranges like `["1-8"]` for any sequence of 3+ indices, significantly reducing output length.
- **Hydration:** The parser automatically "hydrates" missing type-specific fields from the top-level `position_indices`. For example, a `title` segment missing `title_position_index` will have it automatically set to the first index of the segment.
- **Redundancy Removal:** The LLM omits index fields inside the `data` block if they are identical to the top-level `position_indices`.
- **Plain Fallback by Omission:** The classifier may leave weakly-structured positions unassigned; the renderer fills those gaps with plain text blocks.

---

## 4. MongoDB Storage Schema

Results live at `submission.results.markup` — a dict keyed by **topic name** (same key used in `results.topics[].name`):

```json
{
  "results": {
    "markup": {
      "Category>Topic Name": {
        "positions": [
          {
            "index": 1,
            "text": "How we turned LLMs to computers",
            "source_sentence_index": 7,
            "word_start_index": 1,
            "word_end_index": 6
          }
        ],
        "segments": [
          {
            "type": "<markup_type>",
            "position_indices": [1, 2, 3],
            "data": { }
          }
        ]
      }
    }
  }
}
```

**Invariant:** emitted segments never overlap, and each segment covers one contiguous span of markup-local positions. Positions not covered by a segment are rendered as plain text by the frontend. `position_indices` are topic-local 1-based integers matching `results.markup[topic].positions[]`.

---

## 5. Markup Types

All types share the same segment envelope. `data` is type-specific. **Note:** While the LLM produces abbreviated keys (e.g., `spkrs`, `vals`, `lang`) to save tokens, the backend parser expands these to the full names shown below before they are stored in MongoDB or sent to the frontend.

| Type | When to use | Key `data` fields |
|---|---|---|
| `plain` | Default / no special structure | `{}` |
| `dialog` | Conversation between identified speakers | `speakers[]{name, lines[]{position_index, text}}` |
| `comparison` | Multi-column comparison of alternatives, pros/cons, or features | `columns[]{label, items[]{position_index, text}}` — supports 2+ columns; legacy `left_label`/`right_label` format still rendered |
| `list` | Enumerated items or bullet points | `ordered` (bool), `items[]{position_index, text}` — `ordered=true` renders as `<ol>` with sequential numbers |
| `data_trend` | Numbers / statistics suitable for a bar chart | `values[]{label, value}`, `unit` |
| `timeline` | Chronological events with dates | `events[]{position_index, date, description}` |
| `definition` | A term being defined or explained | `term`, `explanation_position_indices[]` |
| `quote` | Direct quotation or attributed statement | `attribution`, `position_indices[]` |
| `code` | Source code, CLI output, file paths, preformatted text | `language` (nullable), `items[]{position_index, text}` |
| `emphasis` | Sentences with key phrases worth visual weight | `items[]{position_index, text, highlights[]{phrase, style}}` |
| `title` | Heading or section title followed by body text | `level` (2\|3\|4), `title_position_index` |
| `steps` | Ordered procedural instructions where sequence matters | `items[]{position_index, step_number}` |
| `paragraph` | Longer prose split into readable paragraph blocks | `paragraphs[]{position_indices[]}` |
| `table` | Structured tabular data — multiple entities × multiple attributes | `headers[]`, `rows[]{cells[], position_indices[]}` |
| `question_answer` | Questions followed by answers (FAQ style) | `pairs[]{question_position_index, answer_position_indices[]}` |
| `callout` | Important notice deserving visual separation | `level` (warning\|tip\|note\|important) |
| `key_value` | Label:value pairs — specs, properties, config settings | `pairs[]{key, value, position_index}` |
| `summary` | Summary or key takeaways block | `label` (optional), `points[]{position_index, text}` |
| `pro_con` | Side-by-side pros and cons | `pros[]{position_index, text}`, `cons[]{position_index, text}`, `pro_label`, `con_label` |
| `aside` | Parenthetical background context or editorial aside | `label` (optional, default `"Background"`) |
| `rating` | Score/rating with visual bar | `score` (string, e.g. `"8/10"` or `"7.5"`), `label` (optional) |
| `attribution_block` | Statement attributed to a named source | `source` (string) |

### Emphasis styles

`highlights[].style` values and their HTML mapping:

| Style | HTML tag | Intended use |
|---|---|---|
| `bold` | `<strong>` | Key terms, facts |
| `italic` | `<em>` | Titles, foreign terms |
| `highlight` | `<mark>` | Warnings, critical info |
| `underline` | `<u>` | Defined terms |

---

## 6. Frontend Rendering

### Component Tree

```
TopicSentencesModal
  ├── Tab: Sentences   — original plain text (always available)
  ├── Tab: Enriched    — MarkupRenderer (enabled when markup exists)
  └── Tab: Raw JSON    — pretty-printed debug view of results.markup[topicName]

MarkupRenderer
  ├── PlainMarkup
  ├── DialogMarkup
  ├── ComparisonMarkup
  ├── ListMarkup
  ├── DataTrendMarkup    → wraps DataChart (DataBarChart)
  ├── TimelineMarkup     → wraps DataTimelineChart
  ├── DefinitionMarkup
  ├── QuoteMarkup
  ├── CodeMarkup
  ├── EmphasisMarkup
  ├── ParagraphMarkup
  ├── TitleMarkup
  ├── StepsMarkup
  ├── TableMarkup
  ├── QuestionAnswerMarkup
  ├── CalloutMarkup
  ├── KeyValueMarkup
  ├── SummaryMarkup
  ├── ProConMarkup
  ├── AsideMarkup
  ├── RatingMarkup
  └── AttributionBlockMarkup
```

**Files:**
- `frontend/src/components/markup/MarkupRenderer.jsx` — switch-dispatch on `segment.type`
- `frontend/src/components/markup/*.jsx` — one component per type
- `frontend/src/components/markup/markup.css` — all markup styles
- `frontend/src/components/shared/TopicSentencesModal.jsx` — tab bar + integration point

### Data flow

`TextPage` passes `markup={submission?.results?.markup}` to `TopicSentencesModal`.
The modal resolves a canonical topic key from `topic.name`, then `topic.fullPath`, then `topic.displayName`, and uses that to find `results.markup[topicKey]`. `displayName` is presentation-only and may be a shortened chart label.
`DataTrendMarkup` and `TimelineMarkup` reuse the existing `DataChart` / `DataTimelineChart` annotation chart components — they construct an `extraction` prop matching `{ values[], visualization: { chart_type, config }, label }`.

### Entry point from article view

The `TextDisplay` tooltip (hover over article text) includes a **"View sentences"** button per topic, which calls `onShowSentences(topic)` → sets `summaryModalTopic` in `TextPage` → opens `TopicSentencesModal`.

---

## 7. Adding a New Markup Type

1. **Backend** (`lib/tasks/markup_generation.py`):
   - Add the type name to `VALID_MARKUP_TYPES`.
   - Add its data schema to the `MARKUP_TYPES` section of `MARKUP_CLASSIFICATION_PROMPT`.
   - Add guidance to the `RULES` section for when the LLM should use it.
   - Bump the prompt version string in `_call_llm_cached()` (e.g. `markup_v4` → `markup_v5`) to invalidate cached LLM responses.

2. **Frontend component** (`frontend/src/components/markup/`):
   - Create `YourTypeMarkup.jsx`. Props: `{ segment, sentences }`. `segment.position_indices` are topic-local 1-based markup position indices; look up text via `sentences[idx - 1]`.
   - Add styles to `markup.css`.

3. **Register** in `MarkupRenderer.jsx`:
   - Import the new component.
   - Add a `case 'your_type':` to the switch.

No worker registration changes are needed for new types. New types should use the markup-local position schema described above.

---

## 8. Triggering / Recalculating

- **Automatic:** runs after `split_topic_generation` completes for any submission.
- **Manual (UI):** Recalculate menu → **Markup** button in `TextPage`.
---

## 9. Design Inspiration & Implementation Notes

- **Reference Implementation**: See `ll.py` in the `txt_splitt` module for an example of how to handle text splitting and range classification.
- **Marker Strategy**: Use a single word-marker system (`[wN]`) in the prompt so the model reasons about one index vocabulary only; the backend maps those spans back to position ranges for storage and UI rendering.
- **Development**: This task is considered "pretty big" due to the need for a comprehensive set of frontend components for each markup type; use subagents where appropriate for modular development.
