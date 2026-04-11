# Tasks, Tools & Backend Architecture Documentation

## Overview

This is a **Text Analysis and Document Processing Platform** that ingests text content (HTML, PDF, EPUB, FB2, Markdown, TXT) and uses AI/LLM-powered analysis to generate insights, summaries, topic hierarchies, and semantic comparisons between documents.

---

## Background Task System

The application uses a **priority-based task queue** system with two types of workers:

1. **`workers.py`** - Main task workers that process document analysis tasks
2. **`llm_workers.py`** - Dedicated LLM workers that execute AI calls in parallel

### Task Execution Flow

```
Submission Created
       ↓
Tasks Queued (by priority)
       ↓
Worker Claims Task → Checks Dependencies
       ↓
Task Handler Executes
       ↓
Results Stored in MongoDB
```

---

## Task Definitions (`lib/tasks/`)

### 1. **split_topic_generation** (Priority 1)
**File:** `lib/tasks/split_topic_generation.py`

**Purpose:** Foundational task that processes raw input text into sentences and extracts hierarchical topics.

**Functionality:**
- Splits article into sentences using `lib.article_splitter`
- Generates hierarchical topics with ">" separators (e.g., "Technology>AI>Machine Learning")
- Uses retry logic (3 attempts with exponential backoff)
- Configurable `max_chunk_chars` (default 12,000)

**LLM Integration:**
- Temperature: 0.0 (deterministic)
- Supports caching via `cache_store`

**Dependencies:** None (root task)

**Output:**
- `sentences`: List of extracted sentences
- `topics`: List of topics with names and sentence indices

---

### 2. **subtopics_generation** (Priority 2)
**File:** `lib/tasks/subtopics_generation.py`

**Purpose:** Generates detailed subtopics for existing topics.

**Functionality:**
- Groups sentences within each topic into 2-5 sub-chapters
- Supports parallel execution via `QueuedLLMClient`
- Parses LLM responses: `<subtopic_name>: <comma-separated sentence numbers>`

**LLM Prompt:**
```
Group the following sentences into detailed sub-chapters for the topic "{topic_name}".
- For each sub-chapter, specify which sentences belong to it.
- Output format MUST be exactly:
<subtopic_name>: <comma-separated sentence numbers>
```

**LLM Integration:**
- Temperature: 0.5 (creative subtopic naming)
- Cache namespace: `subtopics:{model_id}`

**Dependencies:** `split_topic_generation`

**Output:**
- `subtopics`: List with `name`, `sentences`, `parent_topic`

---

### 3. **summarization** (Priority 3)
**File:** `lib/tasks/summarization.py`

**Purpose:** Generates multiple types of summaries at different granularities.

**Functionality:**
- **Sentence Summaries:** One summary per sentence (max 15 words)
- **Article Summary:** Hierarchical summary with one-sentence overview + 3-6 bullet points
- **Topic Summaries:** Summary for each topic's sentences
- Supports multi-chunk processing for long articles
- Retry logic (up to 10 attempts) for malformed JSON
- Extractive fallback if LLM fails

**LLM Prompts:**
1. **Sentence Summary:** Summarize text in one short phrase (max 15 words)
2. **Article Summary:** Return strict JSON with `text` and `bullets` array
3. **Merge Summaries:** Combine chunk summaries, remove duplicates

**LLM Integration:**
- Temperature: 0.8
- Parallel execution via `QueuedLLMClient`
- Caching with validation

**Dependencies:** `split_topic_generation`

**Output:**
- `summary`: List of sentence summaries
- `summary_mappings`: Maps summaries to source sentences
- `topic_summaries`: Dict mapping topic names to summaries
- `article_summary`: Dict with `text` and `bullets`

---

### 4. **mindmap** (Priority 3)
**File:** `lib/tasks/mindmap.py`

**Purpose:** Builds a nested tree structure from topics and subtopics for visualization.

**Functionality:**
- **No LLM calls** - pure data transformation
- Parses topic names with ">" hierarchy
- Builds nested tree with `children` and `sentences` at each node
- Attaches subtopics as leaf children
- Propagates sentence indices to ancestors

**Dependencies:** `subtopics_generation`

**Output:**
- `topic_mindmaps`: Nested dict tree structure

---

### 5. **prefix_tree** (Priority 3)
**File:** `lib/tasks/prefix_tree.py`

**Purpose:** Builds a compressed prefix tree (radix trie) of all words.

**Functionality:**
- **No LLM calls** - algorithmic processing
- Extracts words using regex `[a-zA-Z']+`
- Counts word frequencies and tracks sentence positions
- Builds character trie then compresses single-child nodes
- Enables fast prefix-based word lookup

**Algorithm:**
1. Count words and sentence positions (1-indexed)
2. Build standard character trie
3. Compress by merging single-child nodes

**Dependencies:** `split_topic_generation`

**Output:**
- `prefix_tree`: Compressed trie with `children`, `count`, `sentences`

---

### 6. **insights_generation** (Priority 4)
**File:** `lib/tasks/insights_generation.py`

**Purpose:** Generates AI-powered insights and analysis about article content.

**Functionality:**
- Analyzes article to extract key insights
- Identifies main themes, entities, relationships
- Generates actionable observations

**LLM Integration:**
- Uses LLM for insight extraction
- Supports caching

**Dependencies:** `split_topic_generation`

**Output:**
- `insights`: List of insight objects

---

### 7. **markup_generation** (Priority 4)
**File:** `lib/tasks/markup_generation.py`

**Purpose:** Classifies each topic's sentence ranges into structured markup segments for enriched UI rendering.

**Functionality:**
- For each topic, splits sentences into markup positions and sends an LLM classification prompt
- LLM identifies segment types (dialog, list, chart, etc.) without paraphrasing content
- Retries up to 3 times with increasing temperature; falls back to `plain` on failure
- Results stored per-topic keyed by topic name

**LLM Integration:**
- Uses LLM for segment type classification
- Supports caching (namespace `markup_classification:{model_id}`)

**Dependencies:** `split_topic_generation`

**Output:**
- `markup`: Dict keyed by topic name; each value has `positions[]` and `segments[]`

---

### 8. **clustering_generation** (Priority 4)
**File:** `lib/tasks/clustering_generation.py`

**Purpose:** Groups sentences by semantic similarity using TF-IDF + Agglomerative Clustering. No LLM required.

**Functionality:**
- Vectorises sentences with TF-IDF (max 5000 features, bigrams)
- Runs Agglomerative Clustering with cosine distance; `k = min(max(2, n_sentences // 10), 20)`
- Maps clusters back to topics

**Dependencies:** `split_topic_generation`

**Output:**
- `clusters`: List of cluster objects with sentence assignments

---

### 9. **topic_modeling_generation** (Priority 4)
**File:** `lib/tasks/topic_modeling_generation.py`

**Purpose:** Discovers latent topics via NMF on TF-IDF sentence vectors and maps them to LLM-assigned topics. No LLM required.

**Functionality:**
- Vectorises sentences with TF-IDF; decomposes with NMF (`n_components = min(max(2, n_topics), 15)`)
- Extracts top keywords per latent topic
- Maps LLM-assigned topics to closest latent topic by sentence overlap

**Dependencies:** `split_topic_generation`

**Output:**
- `topic_model`: Dict with latent topics, weights, and keyword lists

---

## Task Dependencies Graph

```
split_topic_generation (Priority 1)
    ├── subtopics_generation (Priority 2)
    │   └── mindmap (Priority 3)
    ├── summarization (Priority 3)
    ├── prefix_tree (Priority 3)
    ├── insights_generation (Priority 4)
    ├── markup_generation (Priority 4)
    ├── clustering_generation (Priority 4)
    └── topic_modeling_generation (Priority 4)
```

---

## Task Priorities

| Priority | Task | Description |
|----------|------|-------------|
| 1 | `split_topic_generation` | Foundation - must run first |
| 2 | `subtopics_generation` | Depends on topics |
| 3 | `summarization` | Depends on topics |
| 3 | `mindmap` | Depends on subtopics |
| 3 | `prefix_tree` | Depends on topics |
| 4 | `insights_generation` | Depends on topics |
| 4 | `markup_generation` | Depends on topics |
| 4 | `clustering_generation` | Depends on topics (no LLM) |
| 4 | `topic_modeling_generation` | Depends on topics (no LLM) |

---

## Worker Types

### Main Worker (`workers.py`)

**Responsibilities:**
- Polls `task_queue` collection for pending tasks
- Claims tasks atomically (prevents duplicate processing)
- Handles stale task reclamation (from crashed workers)
- Executes task handlers with dependency checking
- Processes semantic diff jobs between submissions
- Manages heartbeat for liveness detection

**Key Features:**
- Priority-based task claiming (lower priority number = higher priority)
- Dependency validation before execution
- Automatic retry on failure (with retry_count tracking)
- Graceful shutdown on SIGINT/SIGTERM
- Supports both queued (parallel) and synchronous LLM execution

### LLM Worker (`llm_workers.py`)

**Responsibilities:**
- Polls `llm_queue` collection for pending LLM requests
- Executes LLM calls with network-level retries
- Stores results in LLM cache for deduplication
- Cleans up old completed tasks (48-hour retention)

**Key Features:**
- Multiple workers can run in parallel for N-times throughput
- Atomic claim mechanism prevents duplicate execution
- Exponential backoff for network failures
- Automatic cache writing on completion
- Runtime model/provider switching support

---

## Backend Architecture (`main.py`)

### Application Type
FastAPI-based web application with React frontend serving a text analysis platform.

### API Router Structure

| Handler | Prefix | Purpose |
|---------|--------|---------|
| `auth_handler` | `/api` | Authentication (login, no auth required) |
| `tokens_handler` | `/api` | API token management (superuser only) |
| `submission_handler` | `/api` | Document CRUD, ingestion, word clouds |
| `task_queue_handler` | `/api` | Background task management |
| `llm_queue_handler` | `/api` | LLM async task queue |
| `diff_handler` | `/api` | Semantic comparison between submissions |
| `llm_cache_handler` | `/api` | LLM response cache management |
| `settings_handler` | `/api` | App settings, LLM provider config |
| `extension_handler` | `/api` | Browser extension download |

### Frontend Integration
- Serves React/Vite SPA from `frontend/build/`
- Supports both legacy CRA (`build/static`) and Vite (`build/assets`) outputs
- SPA routing: All `/page/*` routes serve `index.html`

### CORS Configuration
- Allows all origins (`*`)
- Supports extension/background fetch requests

---

## Storage Layer (`lib/storage/`)

| Storage Module | Purpose |
|----------------|---------|
| `submissions.py` | Document/submission CRUD operations |
| `task_queue.py` | Background task queue management |
| `semantic_diffs.py` | Diff job storage and retrieval |
| `llm_cache.py` | LLM response caching (MongoDB-backed) |
| `app_settings.py` | Application configuration |
| `tokens.py` | API token storage and management |
| `posts.py` | RSS/post data storage |

---

## LLM Integration (`lib/llm/`)

**Supported Providers:**
- **OpenAI** (`openai_client.py`) - GPT models
- **Anthropic** (`anthropic_client.py`) - Claude models
- **LlamaCPP** (`llamacpp.py`) - Local models

**Features:**
- Runtime provider/model switching via settings
- Response caching with namespace support
- Queue-based async execution
- Exponential backoff retry logic

---

## Key Capabilities Summary

1. **Document Ingestion:** Submit HTML, upload files (PDF, EPUB, FB2, MD, TXT), fetch URLs
2. **AI Analysis:** Topic extraction, summarization, insights, semantic markup
3. **Visualization:** Mind maps, prefix trees, word clouds
4. **Comparison:** Semantic diff between documents
5. **Caching:** LLM response caching for cost/performance optimization
6. **Extensibility:** Browser extension for easy content submission
