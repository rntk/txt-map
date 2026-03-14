# API Handlers

Four FastAPI routers that together form the HTTP API layer. All routers are registered on the FastAPI app. Storage objects are read from `request.app.state` via FastAPI `Depends` helpers.

---

## Submission Handler (`/submit`, `/upload`, `/submission/*`, `/submissions`)

### Data Models

**`SubmitRequest`** – `html: str`, `source_url: Optional[str] = ""`

**`RefreshRequest`** – `tasks: Optional[List[str]] = None`

### Task Queue Bootstrapping

Helper `_queue_all_tasks(db, submission_id)` inserts one `task_queue` document per task type with these fields:

| Field | Value on insert |
|---|---|
| `submission_id` | given id |
| `task_type` | see table below |
| `priority` | see table below |
| `status` | `"pending"` |
| `created_at` | `datetime.now(UTC)` |
| `started_at`, `completed_at`, `worker_id`, `error` | `None` |
| `retry_count` | `0` |

Task types and priorities:

| `task_type` | `priority` |
|---|---|
| `split_topic_generation` | 1 |
| `subtopics_generation` | 2 |
| `summarization` | 3 |
| `mindmap` | 3 |
| `prefix_tree` | 3 |

### File Upload Extraction

`_extract_content_from_upload(filename, data) -> (html_content, text_content)`

Allowed extensions: `.html`, `.htm`, `.txt`, `.md`, `.pdf`.

- `.html` / `.htm` / `.txt`: decode UTF-8 (replace errors); both fields are the raw decoded string.
- `.md`: decode UTF-8, convert via `markdown` library with `extra` + `codehilite` extensions; `html_content` = rendered HTML, `text_content` = original markdown text.
- `.pdf`: call `convert_pdf_to_html(data)` for `html_content` and `extract_text_from_pdf(data)` for `text_content`; raise HTTP 400 if extracted text is blank; propagate any other exception as HTTP 400.
- Any other extension: HTTP 415.

### Endpoints

#### `POST /submit`
Accepts `SubmitRequest`. Creates a submission via `SubmissionsStorage.create(html_content=html, text_content=html, source_url=source_url)`. Both `html_content` and `text_content` are set to the raw HTML to avoid pre-cleaning. Calls `_queue_all_tasks`. Returns `{submission_id, redirect_url}` where `redirect_url = /page/text/{submission_id}`.

#### `POST /upload`
Accepts a multipart `UploadFile`. Validates extension against `ALLOWED_UPLOAD_EXTENSIONS`; raises HTTP 415 if invalid. Calls `_extract_content_from_upload`, then `SubmissionsStorage.create` with the extracted fields and `source_url=filename`. Calls `_queue_all_tasks`. Returns same shape as `/submit`.

#### `GET /submission/{submission_id}/status`
Returns `{submission_id, tasks, overall_status}`. HTTP 404 if not found.

#### `GET /submission/{submission_id}`
Returns full submission fields: `submission_id`, `source_url`, `text_content`, `html_content`, `created_at`, `status: {overall, tasks}`, `results`. HTTP 404 if not found.

#### `DELETE /submission/{submission_id}`
Deletes all `task_queue` entries for the submission (by `submission_id`), then deletes the submission document. Returns `{message, submission_id}`. HTTP 404 if submission not found; HTTP 500 if the delete operation reports zero deleted documents.

#### `POST /submission/{submission_id}/refresh`
Body: `RefreshRequest`. Defaults `tasks` to `["all"]` when omitted. Validates all task names against `SubmissionsStorage.task_names` ("all" is always valid); raises HTTP 400 listing any unknown names. Calls `submissions_storage.expand_recalculation_tasks(requested_tasks)` to resolve the final task list. Clears results via `submissions_storage.clear_results(submission_id, task_names)`. Deletes matching pending/all `task_queue` entries, then re-inserts them with the same schema as `_queue_all_tasks` (using the same priority map). Returns `{message, tasks_queued}`.

#### `GET /submission/{submission_id}/word-cloud`
Query params: `path: List[str]` (default `[]`), `top_n: int` (1–200, default 60). Loads submission results; returns `{words: [], sentence_count: 0}` if no sentences. Filters topics whose `name` (split on `">"` and stripped) starts with the given path segments. Collects unique 1-based sentence indices from matched topics, pulls the corresponding sentence strings, and passes them to `compute_word_frequencies(texts, top_n=top_n)`. Returns `{words, sentence_count}`.

#### `GET /submissions`
Query params: `submission_id`, `status`, `limit` (default 100, must be positive). Fetches submissions sorted by `created_at` descending. When `status` is provided, over-fetches (`min(max(limit*5, limit), 1000)`) and post-filters by `overall_status`. Returns per-submission summary: `submission_id`, `source_url`, `created_at`, `updated_at`, `overall_status`, `text_characters`, `sentence_count`, `topic_count`. Response: `{submissions, count}`.

---

## Task Queue Handler (`/task-queue`, `/task-queue/*`)

### Constants

`ALLOWED_TASKS`: `split_topic_generation`, `subtopics_generation`, `summarization`, `mindmap`, `prefix_tree`.

`TASK_PRIORITIES`: same mapping as the submission handler.

### Data Models

**`AddTaskRequest`** – `submission_id: str`, `task_type: str`, `priority: Optional[int]` (1–10, default `None`).

### Endpoints

#### `GET /task-queue`
Query params: `submission_id`, `status`, `limit` (default 100). Builds a MongoDB query from present filters, sorts by `created_at` descending, and limits results. Serializes each document, replacing `_id` with `id` (string). Returns `{tasks}`.

#### `DELETE /task-queue/{task_id}`
Parses `task_id` as `ObjectId`; HTTP 400 on parse failure. Deletes the single matching `task_queue` document; HTTP 404 if not found. Returns `{deleted: true, task_id}`.

#### `POST /task-queue/{task_id}/repeat`
Parses `task_id` as `ObjectId`; HTTP 400 on failure. Loads the task document; HTTP 404 if missing. Validates `task_type` against `ALLOWED_TASKS` (HTTP 400) and that the linked submission exists (HTTP 404). Calls `expand_recalculation_tasks([task_type])` and `clear_results`. Deletes existing `task_queue` entries for the submission/expanded-task-types that are `pending` or `processing`. Inserts fresh entries (same schema, using `TASK_PRIORITIES`). Returns `{requeued: true, tasks, task_ids}`.

#### `POST /task-queue/add`
Body: `AddTaskRequest`. Validates `task_type` (HTTP 400) and submission existence (HTTP 404). Expands tasks and clears results. Inserts new entries; if `payload.priority` is set it overrides the default priority for all expanded tasks. Returns `{queued: true, tasks, task_ids}`.

---

## Diff Handler (`/diff`, `/diff/calculate`)

### Internal Helpers

`_ensure_submissions(storage, left_id, right_id)` – raises HTTP 400 if both IDs are equal; raises HTTP 404 for either missing submission. Returns both submission documents.

`_serialize_job(job)` – returns `{job_id, status, error, created_at, started_at, completed_at, force_recalculate}` or `None`.

### State Machine

The `state` field in responses is derived as follows (evaluated in order):

1. If either submission's topic prerequisites are not ready → `"waiting_prerequisites"`
2. Else if there is an active job:
   - status `"processing"` → `"processing"`
   - otherwise → `"queued"`
3. Else if a diff document exists and is stale → `"stale"`
4. Else if a diff document exists and is not stale → `"ready"`
5. Else if the latest job has `status == "failed"` → `"failed"`
6. Otherwise → `"missing"`

### Pair Canonicalization

`canonical_pair(left_id, right_id)` returns `(pair_key, submission_a_id, submission_b_id)` — a deterministic ordering used as the storage key.

### Endpoints

#### `GET /diff`
Query params: `left_submission_id`, `right_submission_id`. Validates submissions, checks prerequisites, resolves state. If prerequisites are not ready, returns early with `state: "waiting_prerequisites"`, `diff: null`, and an empty `stale_reasons` list. Otherwise computes staleness, resolves `state`, and if a diff payload exists, orients it relative to the requested left/right order via `orient_payload`. Response shape:
```json
{
  "pair": { "left_submission_id", "right_submission_id", "pair_key", "submission_a_id", "submission_b_id" },
  "state": "<state>",
  "prereq": { "left": {...}, "right": {...} },
  "stale_reasons": [...],
  "latest_job": { ... } | null,
  "diff": { ... } | null
}
```

#### `POST /diff/calculate`
Body: `DiffCalculateRequest` – `left_submission_id`, `right_submission_id`, `force: bool = false`.

Validates submissions and prerequisites (HTTP 409 with details if prerequisites unmet).

If an active job already exists:
- If `force=true` and the job does not already have `force_recalculate`, sets it via `set_job_force_recalculate`.
- Returns the existing job's details immediately (no new job created).

If no active job and a non-stale diff exists and `force=false`: returns `{status: "up_to_date", job_id: null, ...}`.

Otherwise: calls `create_or_get_active_job` with a new UUID. If the job was retrieved (not freshly created) and `force=true` and `force_recalculate` is not already set, applies `set_job_force_recalculate`. Returns `{job_id, status, pair_key, submission_a_id, submission_b_id, force_recalculate}`.

---

## LLM Cache Handler (`/llm-cache`, `/llm-cache/*`)

The `llm_cache_store` is resolved from `request.app.state.llm_cache_store`.

### Endpoints

#### `GET /llm-cache/stats`
Returns `{namespaces: <per-namespace counts from cache_store.get_stats()>, total: <total entry count>}`.

#### `GET /llm-cache`
Query params: `namespace` (optional), `limit` (default 100, must be 1–500; HTTP 400 otherwise), `skip` (default 0). Returns `{entries, total, limit, skip}` where `total` reflects the filtered count.

#### `DELETE /llm-cache/entry/{entry_id}`
Deletes a single entry by its MongoDB document ID. HTTP 404 if not found. Returns `{deleted: true, entry_id}`.

#### `DELETE /llm-cache`
Query param: `namespace` (optional). If provided, deletes all entries for that namespace and returns `{deleted: true, namespace, deleted_count}`. Otherwise deletes all entries and returns `{deleted: true, deleted_count}`.
