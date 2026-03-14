# FastAPI Application Server

## Overview

A FastAPI-based web application that accepts text/document submissions, runs NLP analysis tasks asynchronously via a MongoDB-backed task queue, computes semantic diffs between submission pairs, and serves a single-page frontend. All persistent state lives in a single MongoDB database named `rss`.

---

## Startup

On startup the server:
1. Downloads required NLTK corpora if not already present (`punkt_tab`, `stopwords`, `wordnet`, `omw-1.4`, `averaged_perceptron_tagger_eng`).
2. Connects to MongoDB at `MONGODB_URL` env var (default `mongodb://localhost:8765/`).
3. Initialises four storage objects against the `rss` database and calls `.prepare()` on each to create indexes: `PostsStorage`, `SubmissionsStorage`, `SemanticDiffsStorage`, `MongoLLMCacheStore`.
4. Stores all four objects on `app.state`.
5. Mounts static assets: if `frontend/build/static` exists it is served at `/static`; if `frontend/build/assets` exists it is served at `/assets`. (Supports both legacy CRA and Vite output.)
6. CORS is fully open (`allow_origins=["*"]`, `allow_credentials=False`, all methods and headers).

When run directly (`__main__`) uvicorn listens on `0.0.0.0:8000`.

---

## Frontend Routes

All of the following return `frontend/build/index.html` (SPA shell):

| Path | Notes |
|---|---|
| `GET /` | root |
| `GET /page/menu` | |
| `GET /page/text/{submission_id}` | `submission_id` is ignored server-side |
| `GET /page/tasks` | |
| `GET /page/texts` | |
| `GET /page/diff` | |
| `GET /page/cache` | |

---

## API — Submissions (`/api`)

### POST `/api/submit`

Body: `{ html: string, source_url?: string }`

Creates a submission with `html_content = text_content = html`. Queues all five analysis tasks (see [Task Queue](#task-queue)). Returns `{ submission_id, redirect_url }`.

### POST `/api/upload`

Multipart file upload. Allowed extensions: `.html`, `.htm`, `.txt`, `.md`, `.pdf`.

Extraction rules by file type:
- `.html` / `.htm` / `.txt`: `html_content = text_content = utf-8 decoded bytes`.
- `.md`: `html_content` = rendered HTML (markdown library, `extra` + `codehilite` extensions); `text_content` = raw decoded text.
- `.pdf`: `html_content` = semantic HTML with headings/paragraphs/bold/italic; `text_content` = plain extracted text. Returns HTTP 400 if no extractable text, or if parsing fails.

Unsupported extension → HTTP 415.

`source_url` is set to the uploaded filename. Queues all five tasks. Returns `{ submission_id, redirect_url }`.

### GET `/api/submission/{submission_id}`

Returns full submission document: `submission_id`, `source_url`, `text_content`, `html_content`, `created_at`, `status: { overall, tasks }`, `results`.
404 if not found.

### GET `/api/submission/{submission_id}/status`

Returns `{ submission_id, tasks, overall_status }` for lightweight polling.

### DELETE `/api/submission/{submission_id}`

Deletes the submission document and all its `task_queue` entries. HTTP 404 if not found, HTTP 500 if deletion fails.

### POST `/api/submission/{submission_id}/refresh`

Body: `{ tasks?: string[] }` — list of task names or `["all"]` (default). Invalid task names → HTTP 400.

Expands the requested tasks to include all downstream dependents (see [Task Dependencies](#task-dependencies)), clears their results and resets their statuses to `pending`, deletes matching `task_queue` entries, and re-queues them.

Returns `{ message, tasks_queued }`.

### GET `/api/submission/{submission_id}/word-cloud`

Query params: `path: string[]` (hierarchical topic filter, e.g. `["Sport", "Tennis"]`), `top_n: int` (1–200, default 60).

Filters `results.topics` whose name (split by `>` and trimmed) starts with the supplied path segments. Collects 1-based sentence indices from matching topics, fetches corresponding sentences, and passes them to `compute_word_frequencies`. Returns `{ words: [{word, frequency}], sentence_count }`.

### GET `/api/submissions`

Query params: `submission_id?: string`, `status?: string`, `limit: int` (default 100, must be > 0).

Returns submissions sorted by `created_at` descending. When filtering by status the server over-fetches up to `max(limit * 5, limit)` (capped at 1000) and filters in-memory. Each item includes `submission_id`, `source_url`, `created_at`, `updated_at`, `overall_status`, `text_characters`, `sentence_count`, `topic_count`.

Returns `{ submissions, count }`.

---

## API — Task Queue (`/api`)

### GET `/api/task-queue`

Query params: `submission_id?: string`, `status?: string`, `limit: int` (default 100, must be > 0).

Returns `{ tasks }` — queue entries sorted by `created_at` descending with `_id` serialised to string field `id`.

### DELETE `/api/task-queue/{task_id}`

Deletes a single queue entry by MongoDB ObjectId. HTTP 400 for invalid ID, HTTP 404 if not found.

### POST `/api/task-queue/{task_id}/repeat`

Re-queues a task based on an existing entry's `task_type` and `submission_id`. Expands to downstream dependents, clears results, removes pending/processing entries for those task types, inserts fresh pending entries. Returns `{ requeued, tasks, task_ids }`.

HTTP 400 for invalid or unsupported task type, HTTP 404 if task or submission not found.

### POST `/api/task-queue/add`

Body: `{ submission_id: string, task_type: string, priority?: int (1–10) }`

Adds a new queue entry for a valid task type and existing submission. Expands to dependents, clears results, inserts pending entries. Priority from request overrides default if provided. Returns `{ queued, tasks, task_ids }`.

---

## API — Semantic Diff (`/api`)

### GET `/api/diff`

Query params: `left_submission_id`, `right_submission_id`.

Both must exist and be different (HTTP 400/404 otherwise).

Checks topic readiness for both submissions. If either is not ready, returns `state: "waiting_prerequisites"` with `prereq` details.

Otherwise determines `state` as one of:
- `"processing"` — active job with status `processing`
- `"queued"` — active job with status `pending`
- `"stale"` — diff exists but is outdated (algorithm version mismatch, or a submission was updated after the diff was computed)
- `"ready"` — diff exists and is current
- `"failed"` — no diff, latest job failed
- `"missing"` — no diff and no failed job

If a diff document exists, its payload is oriented to match `left`/`right` order (see [Diff Orientation](#diff-orientation)).

Returns `{ pair: { left_submission_id, right_submission_id, pair_key, submission_a_id, submission_b_id }, state, prereq, stale_reasons, latest_job, diff }`.

### POST `/api/diff/calculate`

Body: `{ left_submission_id, right_submission_id, force?: bool }`

HTTP 409 if topic prerequisites are not ready for either submission.

Behavior:
- If an active job already exists and `force=true`, sets `force_recalculate=true` on it; returns the existing job.
- If a current (non-stale) diff exists and `force=false`, returns `status: "up_to_date"`.
- Otherwise creates a new pending job (idempotent via unique partial index on `pair_key` for active statuses).

Returns `{ job_id, status, pair_key, submission_a_id, submission_b_id, force_recalculate }`.

### DELETE `/api/diff`

Query params: `left_submission_id`, `right_submission_id`. Must be different.

Deletes all `semantic_diffs` and `semantic_diff_jobs` documents for the canonical pair key. Returns `{ deleted, pair_key, submission_a_id, submission_b_id, deleted_diff_count, deleted_job_count }`.

---

## API — LLM Cache (`/api`)

### GET `/api/llm-cache/stats`

Returns `{ namespaces: [{namespace, count}], total }` — entry counts grouped by namespace.

### GET `/api/llm-cache`

Query params: `namespace?: string`, `limit: int` (1–500, default 100), `skip: int` (default 0).

Returns `{ entries, total, limit, skip }`. Entries sorted by `created_at` descending.

### DELETE `/api/llm-cache/entry/{entry_id}`

Deletes a single cache entry by MongoDB ObjectId. HTTP 404 if not found.

### DELETE `/api/llm-cache`

Query param: `namespace?: string`. Deletes all entries in the namespace, or all entries if omitted. Returns `{ deleted, deleted_count, namespace? }`.

---

## Data Model

### Submission (collection: `submissions`)

| Field | Type | Notes |
|---|---|---|
| `submission_id` | string (UUID4) | indexed |
| `html_content` | string | |
| `text_content` | string | |
| `source_url` | string | |
| `created_at` | datetime | indexed |
| `updated_at` | datetime | |
| `tasks` | object | map of task name → `{ status, started_at, completed_at, error }` |
| `results` | object | see below |

`results` fields: `sentences[]`, `topics[]`, `topic_summaries{}`, `topic_mindmaps{}`, `mindmap_results[]`, `mindmap_metadata{}`, `subtopics[]`, `summary[]`, `summary_mappings[]`, `prefix_tree{}`.

Task status values: `pending`, `processing`, `completed`, `failed`.

Overall status derivation:
- `failed` if any task is failed
- `completed` if all tasks are completed
- `processing` if any task is processing
- otherwise `pending`

### Task Queue (collection: `task_queue`)

| Field | Notes |
|---|---|
| `submission_id` | |
| `task_type` | one of the five task names |
| `priority` | integer; lower = higher priority |
| `status` | `pending`, `processing`, `completed`, `failed` |
| `created_at`, `started_at`, `completed_at` | datetimes |
| `worker_id` | set when claimed |
| `retry_count` | integer |
| `error` | string or null |

### Semantic Diff Job (collection: `semantic_diff_jobs`)

Indexes: `(pair_key, created_at desc)`, unique partial on `pair_key` where `status in [pending, processing]`, `status`, `(status, force_recalculate desc, created_at asc)`.

Fields: `job_id` (UUID), `pair_key`, `submission_a_id`, `submission_b_id`, `requested_left_id`, `requested_right_id`, `force_recalculate`, `status`, timestamps, `worker_id`, `error`.

### Semantic Diff Result (collection: `semantic_diffs`)

Unique index on `pair_key`. Fields: `pair_key`, `submission_a_id`, `submission_b_id`, `algorithm_version`, `computed_at`, `updated_at`, `source_fingerprint: { submission_a_updated_at, submission_b_updated_at }`, `payload`.

### LLM Cache (collection: `llm_cache`)

Unique index on `key`. Also indexed: `namespace`, `created_at`. Fields: `key`, `response`, `created_at`, `namespace`, `model_id`, `prompt_version`, `temperature`, `stored_at`.

---

## Task Queue Details

### Task Names and Default Priorities

| Task | Priority |
|---|---|
| `split_topic_generation` | 1 |
| `subtopics_generation` | 2 |
| `summarization` | 3 |
| `mindmap` | 3 |
| `prefix_tree` | 3 |

### Task Dependencies

`subtopics_generation`, `summarization`, `mindmap`, and `prefix_tree` all depend on `split_topic_generation`. When any of these dependents is selected for refresh/re-queue, `split_topic_generation` is also included.

The expansion algorithm: given a set of selected tasks, iteratively adds any task whose dependency is already in the expanded set, until stable.

### Results Cleared per Task

| Task | Cleared result fields |
|---|---|
| `split_topic_generation` | `sentences`, `topics` |
| `subtopics_generation` | `subtopics` |
| `summarization` | `topic_summaries`, `summary`, `summary_mappings` |
| `mindmap` | `topic_mindmaps`, `mindmap_results`, `mindmap_metadata` |
| `prefix_tree` | `prefix_tree` |

---

## Semantic Diff Algorithm

**Algorithm version:** `semantic-v3-topic-aware-charwb-3-6-th0.25-cr0.5-topk-shared`

Prerequisites: both submissions must have non-empty `results.sentences` and `results.topics`, with at least one topic containing sentence ranges/indices.

**Topic units:** for each submission, sentences are associated with their topic (name taken from `topic.name`, `>` -separated hierarchy). A sentence that appears in multiple topics keeps the first assignment.

**Similarity matrix:** TF-IDF with character n-grams (analyzer `char_wb`, ngram range 3–6, lowercase) fitted on the combined corpus of both submissions; cosine similarity matrix between A and B units.

**Directional matching** (A→B and B→A, sharing the same matrix via transpose):
- For each source unit, find the best-matching target unit by cosine similarity.
- If similarity ≥ threshold (0.25), record as a match; otherwise record as unmatched (with similarity but no target).
- Additionally record up to `top_k_nearest` (3) secondary matches per source unit with similarity ≥ `nearest_min_similarity` (0.5) as "nearest" links.

**Output payload:** `{ meta, matches_a_to_b, matches_b_to_a, nearest_a_to_b, nearest_b_to_a, unmatched_a, unmatched_b }`.

Each match row contains `{a|b}_topic`, `{a|b}_sentence_index`, `{a|b}_text`, `similarity`.

**Staleness:** a diff is stale if `algorithm_version` doesn't match current, or if either submission's `updated_at` is after the diff's `computed_at`.

### Diff Orientation

The canonical diff is always stored with the lexicographically smaller submission ID as `a`. When serving, `orient_payload` remaps `a`/`b` field prefixes to `left`/`right` based on which ID was requested as left. Output keys: `matches_left_to_right`, `matches_right_to_left`, `nearest_left_to_right`, `nearest_right_to_left`, `unmatched_left`, `unmatched_right`.

---

## NLP Utilities

`compute_word_frequencies(texts, top_n=60)` — tokenises (NLTK punkt), POS-tags, lemmatises (WordNetLemmatizer with Penn Treebank → WordNet POS mapping), removes English stop words and tokens shorter than 3 characters or non-alphabetic. Returns `[{word, frequency}]` sorted by frequency descending, capped at `top_n`. Falls back to regex tokenisation and default noun POS if NLTK data unavailable at runtime.
