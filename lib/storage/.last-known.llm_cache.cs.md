# Storage Layer

All storage classes use MongoDB and accept a `db` (database handle) in their constructor. Each class exposes a `prepare()` method that creates the necessary indexes (silently skipping already-existing ones).

---

## MongoLLMCacheStore (`llm_cache` collection)

Implements the `txt_splitt.cache.LLMCacheStore` protocol. Caches LLM responses keyed by an opaque string key.

### Indexes
- `key` — unique
- `namespace`
- `created_at`
- Drops legacy `prompt_hash_1` index on `prepare()` if present

### CacheEntry fields
| Field | Type | Notes |
|---|---|---|
| `key` | str | Unique lookup key |
| `response` | str | LLM response text |
| `created_at` | float | Unix timestamp |
| `namespace` | str | Logical grouping |
| `model_id` | str \| None | Optional |
| `prompt_version` | str \| None | Optional |
| `temperature` | float | |

When persisting, an additional `stored_at` field (UTC ISO string) is written but not surfaced in `CacheEntry`.

### Core protocol methods
- `get(key) -> CacheEntry | None` — looks up by key; returns `None` if missing.
- `set(entry: CacheEntry) -> None` — upserts by key.

### Management methods
- `list_entries(namespace=None, limit=100, skip=0) -> list[dict]` — returns documents sorted by `created_at` descending. Each document has `_id` removed and replaced with a string `id` field.
- `count_entries(namespace=None) -> int`
- `delete_entry_by_id(entry_id: str) -> bool` — deletes by MongoDB ObjectId string; returns `False` for invalid IDs.
- `delete_by_namespace(namespace: str) -> int` — returns count of deleted documents.
- `delete_all() -> int` — returns count of deleted documents.
- `get_namespaces() -> list[str]` — returns all distinct namespace values.
- `get_stats() -> list[dict]` — returns `[{"namespace": ..., "count": ...}, ...]` sorted by count descending.

---

## PostsStorage (`posts` collection)

Stores feed posts per owner. All retrieval methods accept an optional `projection` dict passed directly to MongoDB.

### Indexes
`owner`, `category_id`, `feed_id`, `read`, `tags`, `pid`

### Query helpers
All multi-result methods return a MongoDB cursor (lazy iterator). When `only_unread` is provided, the filter is `read = not only_unread`. When filtering by read status, sort is `(feed_id DESC, unix_date DESC)`; otherwise `unix_date DESC`.

### Methods

**Retrieval**
- `get_by_category(owner, only_unread=None, category="", projection=None)` — filters by category if non-empty.
- `get_all(owner, only_unread=None, projection=None)` — no sort applied.
- `get_by_feed_id(owner, feed_id, only_unread=None, projection=None)`
- `get_by_pid(owner, pid: int, projection=None) -> dict | None` — looks up by integer `pid` field.
- `get_by_id(owner, pid: int, projection=None) -> dict | None` — looks up by `id` field (distinct from `pid`).
- `get_by_pids(owner, pids: list[int], projection=None)` — bulk lookup by `pid`.
- `get_by_tags(owner, tags: list, only_unread=None, projection=None)` — requires post to have **all** supplied tags (`$all`).
- `get_by_bi_grams(owner, tags: list, only_unread=None, projection=None)` — same as `get_by_tags` but matches against the `bi_grams` field.
- `get_by_clusters(owner, clusters: list, only_unread=None, projection=None)` — matches posts whose `clusters` array contains any element from `clusters` (`$elemMatch: {$in: ...}`).

**Statistics**
- `get_stat(owner) -> dict` — returns `{"unread": int, "read": int, "tags": int}`. The `tags` count comes from the separate `tags` collection.
- `get_grouped_stat(owner, only_unread=None)` — aggregates post counts grouped by `feed_id`, each group including `category_id` and `count`.
- `count(owner) -> int`

**Mutation**
- `change_status(owner, pids: list[int], readed: bool) -> bool` — bulk-sets `read` field; always returns `True`.
- `set_clusters(owner, similars: dict) -> bool` — `similars` maps `cluster_id -> set_of_pids`. Uses `$addToSet` bulk write; no-ops if `similars` is empty. Always returns `True`.
- `get_clusters(posts: list[dict]) -> set` — client-side helper; collects all `clusters` values from the provided post dicts into a flat set.

---

## SemanticDiffsStorage (`semantic_diffs` + `semantic_diff_jobs` collections)

Manages computation of semantic diffs between pairs of submissions. A diff is identified by a `pair_key` string (opaque, caller-defined). Jobs have statuses: `pending`, `processing`, `completed`, `failed`.

### Indexes

**`semantic_diffs`**
- `pair_key` — unique

**`semantic_diff_jobs`**
- `(pair_key, created_at DESC)`
- `pair_key` unique — partial, only for `status` in `["pending", "processing"]` (enforces at most one active job per pair)
- `status`
- `(status ASC, force_recalculate DESC, created_at ASC)` — supports worker claim ordering

### Diff document fields
`pair_key`, `submission_a_id`, `submission_b_id`, `algorithm_version`, `computed_at`, `updated_at`, `created_at` (set on insert only), `source_fingerprint: {submission_a_updated_at, submission_b_updated_at}`, `payload: dict`

### Job document fields
`job_id`, `pair_key`, `submission_a_id`, `submission_b_id`, `requested_left_id`, `requested_right_id`, `force_recalculate`, `status`, `created_at`, `started_at`, `completed_at`, `worker_id`, `error`

### Methods

**Diff**
- `get_diff_by_pair_key(pair_key) -> dict | None`
- `upsert_diff(*, pair_key, submission_a_id, submission_b_id, algorithm_version, submission_a_updated_at, submission_b_updated_at, payload)` — upserts by `pair_key`; sets `created_at` only on insert.

**Jobs**
- `get_latest_job(pair_key) -> dict | None` — most recent by `created_at`.
- `get_active_job(pair_key) -> dict | None` — most recent job with status `pending` or `processing`.
- `create_job(*, job_id, pair_key, submission_a_id, submission_b_id, requested_left_id, requested_right_id, force_recalculate=False) -> dict` — inserts and returns the new job document.
- `create_or_get_active_job(...) -> tuple[dict, bool]` — attempts insert; on `DuplicateKeyError` (active-job uniqueness constraint), returns the existing active job. Returns `(job, True)` if created, `(job, False)` if an active job already existed.
- `claim_job(worker_id: str) -> dict | None` — atomically finds one `pending` job, sets it to `processing`, records `started_at` and `worker_id`. Pick order: `force_recalculate DESC`, then `created_at ASC`.
- `set_job_force_recalculate(job_id, force_recalculate: bool)` — updates by `_id`.
- `mark_job_completed(job_id)` — sets `status=completed`, `completed_at=now`.
- `mark_job_failed(job_id, error_msg: str)` — sets `status=failed`, `completed_at=now`, `error=error_msg`.

---

## SubmissionsStorage (`submissions` collection)

Stores document submissions for async NLP processing. Each submission tracks per-task execution state and accumulated results.

### Indexes
`submission_id`, `created_at`

### Tasks
Five tasks are defined, with a dependency graph:

| Task | Depends on |
|---|---|
| `split_topic_generation` | *(none)* |
| `subtopics_generation` | `split_topic_generation` |
| `summarization` | `split_topic_generation` |
| `mindmap` | `split_topic_generation` |
| `prefix_tree` | `split_topic_generation` |

Each task has fields: `status` (`pending`/`processing`/`completed`/`failed`), `started_at`, `completed_at`, `error`.

### Results fields
`sentences`, `topics`, `topic_summaries`, `topic_mindmaps`, `mindmap_results`, `subtopics`, `summary`, `summary_mappings`, `prefix_tree`

### Methods

- `create(html_content, text_content="", source_url="") -> dict` — generates a UUID `submission_id`, initializes all tasks to `pending` with empty results, inserts and returns the document.
- `get_by_id(submission_id) -> dict | None`
- `update_task_status(submission_id, task_name, status, error=None) -> bool` — sets task status and updates `updated_at`. Sets `started_at` when transitioning to `processing`; sets `completed_at` when transitioning to `completed` or `failed`. Sets `error` if provided.
- `update_results(submission_id, results: dict) -> bool` — merges keys from `results` into `results.*` fields using dot-notation. Returns `True` if the document was modified.
- `clear_results(submission_id, task_names=None) -> bool` — resets task statuses to `pending` (clearing timestamps and errors) and clears the associated result fields. Task list is first expanded via `expand_recalculation_tasks`. Returns `True` if the document was modified.
- `expand_recalculation_tasks(task_names=None) -> list[str]` — if `None` or contains `"all"`, returns all task names. Otherwise expands the given set by iteratively adding any task whose dependency appears in the set (transitive downstream closure). Result is ordered as per the canonical `task_names` list.
- `get_overall_status(submission: dict) -> str` — derives a single status from all task statuses: `failed` if any failed, `completed` if all completed, `processing` if any processing, otherwise `pending`.
