# Background Workers Architecture Guide

This document provides a comprehensive overview of the background worker system in the `rsstag` project. It serves as a reference for both human developers and AI agents for maintaining and extending worker-related features.

## 1. Overview

The worker system (`workers.py`) is a background process that processes asynchronous tasks for submissions. It operates on a task queue stored in MongoDB and handles two types of work:

- **Submission Tasks**: LLM-powered processing tasks (summarization, topic generation, etc.)
- **Semantic Diff Jobs**: Computing topic-aware differences between submission pairs

The worker runs continuously, polling for available work and processing tasks according to their dependencies and priorities.

## 2. Task System Architecture

### Task Types

The following tasks are defined in `TASK_HANDLERS`:

| Task Type | Purpose | Dependencies | Priority |
|-----------|---------|--------------|----------|
| `split_topic_generation` | Break content into semantic topics | None | 1 (highest) |
| `subtopics_generation` | Generate hierarchical subtopics | `split_topic_generation` | 2 |
| `summarization` | Create article summaries | `split_topic_generation` | 3 |
| `mindmap` | Generate mindmap structures | `subtopics_generation` | 3 |
| `prefix_tree` | Build prefix trees for topics | `split_topic_generation` | 3 |
| `insights_generation` | Generate AI-powered insights | `split_topic_generation` | 4 |
| `markup_generation` | Classify topic sentences into structured markup | `split_topic_generation` | 4 |
| `clustering_generation` | Group sentences by semantic similarity (TF-IDF + Agglomerative, no LLM) | `split_topic_generation` | 4 |
| `topic_modeling_generation` | Discover latent topics via NMF (no LLM) | `split_topic_generation` | 4 |

### Dependency Graph

```
split_topic_generation
├── subtopics_generation
│   └── mindmap
├── summarization
├── prefix_tree
├── insights_generation
├── markup_generation
├── clustering_generation
└── topic_modeling_generation
```

Dependencies ensure that tasks are processed in the correct order. A task will not be claimed until all its dependencies are completed.

### Task Lifecycle

```
┌─────────┐    ┌────────────┐    ┌───────────┐    ┌───────────┐
│ pending │───→│ processing │───→│ completed │ or │  failed   │
└─────────┘    └────────────┘    └───────────┘    └───────────┘
```

Tasks are stored in the `task_queue` collection with the following key fields:
- `status`: `pending`, `processing`, `completed`, or `failed`
- `task_type`: The type of task to execute
- `submission_id`: Reference to the submission being processed
- `priority`: Lower numbers = higher priority
- `retry_count`: Number of failed attempts
- `created_at`, `started_at`, `completed_at`: Timestamps

## 3. Task Claiming Process

The worker claims tasks using an atomic find-and-update operation:

1. **Priority Ordering**: Tasks are sorted by `TASK_PRIORITIES` (lower number = higher priority)
2. **Atomic Claim**: Uses `find_one_and_update` to atomically change status from `pending` to `processing`
3. **Dependency Check**: After claiming, verifies all dependencies are met
4. **Re-queue if Blocked**: If dependencies aren't met, task is returned to `pending` status

This ensures:
- Only one worker processes a task at a time
- Higher priority tasks are claimed first
- Dependencies are respected

## 4. Task Processing

### Standard Task Flow

When a task is claimed, the worker:

1. **Initialize LLM Client**: Calls `create_llm_client(db=self.db)` to get fresh configuration
2. **Update Status**: Marks task as `processing` in the submission document
3. **Fetch Submission**: Retrieves the full submission document
4. **Execute Handler**: Calls the appropriate task handler from `TASK_HANDLERS`
5. **Pass Cache Store**: For LLM-using tasks, passes `cache_store` for response caching
6. **Mark Complete/Failed**: Updates status based on success or failure

### LLM Client Refresh

**Critical**: The worker creates a fresh LLM client for each task:

```python
llm = create_llm_client(db=self.db)
```

This enables **dynamic runtime switching** - if a user changes the LLM provider via the UI/API, the next task will automatically use the new configuration without restarting workers.

### Caching Integration

Tasks that use LLM calls can leverage the caching system:

```python
cache_tasks = {
    "split_topic_generation",
    "subtopics_generation",
    "summarization",
    "insights_generation",
    "markup_generation",
}
if task_type in cache_tasks:
    handler(submission, self.db, llm, cache_store=self.cache_store)
```

See `docs/llm_handler.md` for details on the caching mechanism.

## 5. Semantic Diff Jobs

In addition to submission tasks, workers also process semantic diff jobs:

### Purpose

Compute topic-aware semantic differences between pairs of submissions to identify what changed between versions.

### Job Flow

1. **Claim Job**: Atomically claim a pending diff job from `semantic_diffs` collection
2. **Validate Submissions**: Ensure both submissions exist and are topic-ready
3. **Check Freshness**: Skip if an up-to-date diff already exists (unless `force_recalculate`)
4. **Compute Diff**: Call `compute_topic_aware_semantic_diff()`
5. **Store Result**: Persist the diff with algorithm version for cache invalidation

### Readiness Check

Before computing a diff, the worker verifies both submissions have completed their topic-related tasks using `check_submission_topic_readiness()`.

## 6. Error Handling and Retries

### Task Failure Handling

When a task fails:
- Status is set to `failed` in both `task_queue` and submission
- Error message is recorded
- `retry_count` is incremented
- Exception is logged with full traceback

### Retry Policy

Currently, failed tasks remain in `failed` status. The system does not automatically retry - this must be triggered externally (e.g., via API or manual intervention).

### Graceful Shutdown

Workers handle `SIGINT` and `SIGTERM` signals:
- Sets `self.running = False`
- Current task completes before exiting
- MongoDB connection is properly closed

## 7. Adding a New Task Type

To add a new background task:

### Step 1: Create Task Handler

Create a handler function in `lib/tasks/your_task.py`:

```python
def process_your_task(submission, db, llm, cache_store=None):
    """
    Process your custom task.

    Args:
        submission: The submission document
        db: MongoDB database instance
        llm: LLM client instance
        cache_store: Optional cache store for LLM responses
    """
    # Your implementation here
    # Use CachingLLMCallable for LLM calls if cache_store is provided
    pass
```

### Step 2: Register in workers.py

Add to the appropriate dictionaries:

```python
# In TASK_DEPENDENCIES - define what must complete first
TASK_DEPENDENCIES = {
    # ... existing tasks ...
    "your_task": ["split_topic_generation"],  # or [] if no deps
}

# In TASK_PRIORITIES - set priority (lower = higher priority)
TASK_PRIORITIES = {
    # ... existing tasks ...
    "your_task": 3,
}

# In TASK_HANDLERS - map to your handler
TASK_HANDLERS = {
    # ... existing tasks ...
    "your_task": process_your_task,
}
```

### Step 3: Update Submission Storage

Ensure `SubmissionsStorage` can track your task status. The submission document stores task status in a `tasks` field:

```python
{
    "tasks": {
        "your_task": {
            "status": "pending|processing|completed|failed",
            "error": "..."  # only on failure
        }
    }
}
```

### Step 4: Queue Tasks

Tasks must be queued via `SubmissionsStorage.queue_task()` or similar mechanism:

```python
submissions_storage.queue_task(submission_id, "your_task")
```

## 8. Worker Configuration

### Environment Variables

- `MONGODB_URL`: MongoDB connection string (default: `mongodb://localhost:8765/`)

### Polling Interval

The worker polls every 2 seconds (configurable via `poll_interval` parameter).

### Scaling

Multiple worker processes can run simultaneously:
- Each worker has a unique `worker_id` based on process ID
- Atomic claim operations prevent duplicate processing
- Tasks are distributed across workers via the queue

## 9. Monitoring and Debugging

### Logs

Workers log at `INFO` level:
- Task claims: `"Claimed task {type} for submission {id}"`
- Task completion: `"Completed {type} for submission {id}"`
- Errors: Full traceback on task failure

### Database Inspection

Check task status:
```javascript
// Pending tasks
db.task_queue.find({status: "pending"})

// Failed tasks
db.task_queue.find({status: "failed"})

// Tasks by submission
db.task_queue.find({submission_id: "..."})
```

Check submission task status:
```javascript
db.submissions.findOne({_id: "..."}).tasks
```

## 10. Key Design Decisions

### Why Per-Task LLM Initialization?

Creating a fresh LLM client for each task (rather than reusing) enables dynamic configuration changes without worker restarts. This is critical for the settings UI to work seamlessly.

### Why Separate Task Queue Collection?

Tasks are stored in a dedicated `task_queue` collection rather than just in submission documents to:
- Enable atomic claim operations
- Support efficient querying by status and priority
- Allow multiple workers to claim tasks without contention

### Why Dependency Check After Claim?

Dependencies are checked **after** claiming (and task re-queued if not met) rather than in the query to:
- Keep the claim query simple and fast
- Avoid race conditions where dependencies complete during claim
- Allow tasks to be claimed and re-queued efficiently

---
*Note: AI agents should always check `workers.py` and `lib/tasks/` when modifying task handlers or adding new task types.*
