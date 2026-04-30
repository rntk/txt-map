# Content Analysis Platform

This is a FastAPI + worker system that processes submitted HTML content into structured analysis results (topics, summaries, mindmap, and insights), computes topic-aware semantic diffs between submissions, then serves them in a React UI.

## Documentation Map

- `README.md`: project overview, architecture, quick start, API and worker flow
- `Docker-README.md`: Docker Compose setup and container operations
- `TESTING.md`: detailed testing guide with coverage and troubleshooting
- `frontend/README.md`: React app routes, commands, and frontend testing
- `extension/README.md`: browser extension setup and usage
- `docs/`: additional documentation (LLM handler, workers, linting, tasks)

## Architecture

```
Browser Extension / Direct API Calls
  -> POST /api/submit (auth required)
FastAPI API (main.py)
  -> stores submission + queues tasks in MongoDB
  -> serves React frontend from /page/* routes
Worker(s) (workers.py)
  -> process queued tasks (topic generation, summarization, mindmap, etc.)
LLM Worker(s) (llm_workers.py)
  -> parallel LLM call execution via queue
MongoDB
  -> stores submission status/results + task queue + semantic diffs + LLM cache
React Frontend (frontend/build)
  -> polls status, renders results, and provides a diff UI
```

## Quick Start

### Using Docker Compose (Recommended)

From `/app`:

```bash
# Start all services (API, workers, llm_workers, MongoDB)
docker compose up --build

# Or in background
docker compose up -d --build

# Access the application
# - API docs: http://localhost:8000/docs
# - Frontend: http://localhost:8000/page/menu
```

### Local Development Setup

**Prerequisites:**
- MongoDB reachable by `MONGODB_URL` (default: `mongodb://localhost:27017/`)
- LLM provider configured (LLamaCPP, OpenAI, or Anthropic)

**Start services:**

```bash
# Terminal 1: Start API
cd /app
python main.py

# Terminal 2: Start LLM workers (parallel LLM processing)
cd /app
python llm_workers.py

# Terminal 3: Start task workers
cd /app
python workers.py

# Terminal 4: Start frontend (development mode)
cd /app/frontend
npm install
npm run dev
```

API is available at `http://127.0.0.1:8000`.
Frontend dev server runs on `http://localhost:5173` (or configured Vite port).

## Docker Services

The `docker-compose.yml` includes the following services:

- **`api`**: FastAPI server on `http://localhost:8000` - main application entry point
- **`llm_worker`**: Background LLM call processor (2 replicas by default) - handles parallel LLM requests
- **`worker`**: Background task processor (2 replicas by default) - processes submission tasks
- **`mongodb`**: MongoDB 8 on `localhost:27017` - persistent data storage

All services communicate via the `app-network` bridge network.

## Core Components

- **API server**: `main.py` - FastAPI application with all route handlers
- **LLM Worker process**: `llm_workers.py` - parallel LLM call execution
- **Worker process**: `workers.py` - task queue processing
- **API handlers**: `handlers/` - route implementations
- **Task implementations**: `lib/tasks/` - all analysis tasks
- **MongoDB storage helpers**: `lib/storage/` - data persistence layer
- **Semantic diff logic**: `lib/diff/semantic_diff.py` - topic-aware diff computation
- **LLM provider abstraction**: `lib/llm/` - LlamaCPP, OpenAI, Anthropic clients

## Processing Pipeline

Tasks are queued on submission and executed with dependencies. The full task list includes:

1. `split_topic_generation` - Base task, no dependencies
2. `subtopics_generation` - Depends on `split_topic_generation`
3. `summarization` - Depends on `split_topic_generation`
4. `mindmap` - Depends on `subtopics_generation`
5. `prefix_tree` - Depends on `split_topic_generation`
6. `insights_generation` - Depends on `split_topic_generation`
7. `markup_generation` - Depends on `split_topic_generation`
8. `topic_marker_summary_generation` - Depends on `split_topic_generation`
9. `topic_temperature_generation` - Depends on `split_topic_generation`
10. `clustering_generation` - Depends on `split_topic_generation`
11. `topic_modeling_generation` - Depends on `split_topic_generation`

Tasks with dependencies on `split_topic_generation` will block until it completes.

## Frontend

The React frontend is served by FastAPI from `frontend/build` in production. In development, you can run it standalone with Vite.

**Available pages:**
- `/page/menu` - Dashboard menu
- `/page/text/{submission_id}` - Submission result view with live status polling
- `/page/tasks` - Task queue management
- `/page/texts` - Submission list
- `/page/diff` - Semantic diff comparison
- `/page/topics` - Global topics view
- `/page/cache` - LLM cache management
- `/page/topic-analysis/{submission_id}` - Topic analysis
- `/page/topic-hierarchy/{submission_id}` - Topic hierarchy
- `/page/canvas/{submission_id}` - Canvas visualization
- `/page/login` - Authentication
- `/page/tokens` - Token management (admin)
- `/page/llm-providers` - LLM provider configuration (admin)

**Frontend commands:**
```bash
cd /app/frontend
npm install          # Install dependencies
npm run dev         # Start development server
npm run build       # Build for production
npm run lint        # Run linter
npm run lint:fix    # Auto-fix lint issues
npm run format      # Format code
npm test            # Run tests
```

## Authentication

Most API endpoints require authentication via the `require_auth` dependency. Configure tokens via:
- Environment variable: `SUPER_TOKEN`
- Settings: Use `/api/tokens` endpoint (admin only)

Session secret is configured via `SESSION_SECRET` environment variable.

LLM providers can be managed via `/api/llm-providers` endpoint with `LLM_PROVIDERS_SECRET`.

## Environment Variables

### Required / Common
- `MONGODB_URL` - MongoDB connection string (default: `mongodb://mongodb:27017/`)
- `LLAMACPP_URL` - LLamaCPP server base URL (e.g., `http://localhost:8989`)
- `TOKEN` - Auth token for LLamaCPP client
- `SUPER_TOKEN` - Admin authentication token
- `SESSION_SECRET` - Session encryption secret

### LLM Providers (set at least one)
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `OPENAI_MODEL` - Default OpenAI model name
- `ANTHROPIC_MODEL` - Default Anthropic model name

### Optional
- `NLTK_DATA` - Path to NLTK data (default: `/app/.nltk_data`)
- `NLTK_AUTO_DOWNLOAD_ON_STARTUP` - Auto-download NLTK data on startup (default: `1`)
- `LLM_WORKER_POLL_INTERVAL` - LLM worker poll interval in seconds (default: `0.5`)
- `LLM_WORKER_HEARTBEAT_FILE` - LLM worker heartbeat file path
- `WORKER_HEARTBEAT_FILE` - Worker heartbeat file path
- `LLM_PROVIDERS_SECRET` - Secret for LLM providers management

### Docker Compose
When using Docker Compose, variables can be set in `.env` file. The compose file automatically configures:
- MongoDB connection to the `mongodb` service
- Proper network connectivity between containers
- Volume mounts for NLTK data persistence

## Main API Endpoints

### Submissions
- `POST /api/submit` - Submit HTML and create task queue entries
- `GET /api/submission/{submission_id}` - Full submission payload + results
- `GET /api/submission/{submission_id}/status` - Task-level status
- `POST /api/submission/{submission_id}/refresh` - Clear/requeue tasks
- `DELETE /api/submission/{submission_id}` - Remove submission and queued tasks
- `GET /api/submissions` - List submissions with optional filters
- `POST /api/upload` - File upload (submit HTML file directly)
- `PUT /api/submission/{submission_id}/read-topics` - Mark topics as read
- `GET /api/submission/{submission_id}/word-cloud` - Word cloud data

### Task Queue
- `GET /api/task-queue` - List task queue entries
- `POST /api/task-queue/add` - Queue task(s) for a submission
- `POST /api/task-queue/{task_id}/repeat` - Requeue a task entry
- `DELETE /api/task-queue/{task_id}` - Delete a queue entry

### Semantic Diff
- `GET /api/diff` - Fetch oriented diff payload and job state (query params: `left_submission_id`, `right_submission_id`)
- `POST /api/diff/calculate` - Enqueue semantic diff calculation for a submission pair
- `DELETE /api/diff` - Delete a diff
- `GET /api/global-topics` - Aggregated topics from all submissions
- `GET /api/global-topics/sentences` - Sentences for global topics

### LLM Cache
- `GET /api/llm-cache/stats` - LLM cache statistics
- `GET /api/llm-cache` - List LLM cache entries
- `DELETE /api/llm-cache/entry/{entry_id}` - Delete a single LLM cache entry
- `DELETE /api/llm-cache` - Clear all LLM cache entries

### Settings & Admin
- `GET /api/settings` - Get current app settings
- `PUT /api/settings/llm` - Update LLM provider/model settings
- `POST /api/login` - Authenticate and get session
- `POST /api/logout` - End session
- `GET /api/tokens` - List auth tokens (admin)
- `POST /api/tokens` - Create new token (admin)
- `GET /api/llm-providers` - List LLM providers (admin)
- `POST /api/llm-providers` - Add LLM provider (admin)
- `DELETE /api/llm-providers/{name}` - Remove LLM provider (admin)

### LLM Queue (Internal)
- `GET /api/llm-queue` - List LLM queue entries
- `POST /api/llm-queue/{request_id}/repeat` - Requeue an LLM request
- `DELETE /api/llm-queue/{request_id}` - Delete an LLM queue entry
- `GET /api/llm-workers` - List active LLM workers

### Extension
- `POST /api/extension/submit` - Extension-specific submission endpoint

### Canvas
- `GET /api/canvas/{submission_id}` - Canvas data for a submission

### Frontend Pages
- `GET /` - Redirects to `/page/menu`
- `GET /page/*` - All frontend routes served via FastAPI

## Semantic Diff Model

- Uses sentence-level topic units derived from `results.topics` ranges and `results.sentences`
- Similarity metric is TF-IDF (character n-grams 3..6) + cosine similarity
- A semantic diff job is persisted in `semantic_diff_jobs`; computed payload is stored in `semantic_diffs`
- Current algorithm version: `semantic-v3-topic-aware-charwb-3-6-th0.25-cr0.5-topk-shared`

Interactive docs:
- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

## Testing and Linting

### Backend Tests

```bash
./test.sh                    # Run all backend tests once
./test.sh tests/unit/...     # Run a specific test file
./test.sh --coverage         # With terminal coverage output
./test.sh --rebuild          # Rebuild backend test image first
```

`./test.sh` runs directly inside containers when local test dependencies are available, and otherwise uses the Docker Compose test stack defined in `docker-compose.test.yml` with MongoDB.

### Frontend Tests

```bash
./frontend-test.sh                    # Run all frontend tests once
./frontend-test.sh src/App.test.jsx   # Run a specific test target
./frontend-test.sh --coverage         # With coverage report
./frontend-test.sh --rebuild          # Rebuild image and refresh cached deps
```

`./frontend-test.sh` runs directly inside containers when local Node tooling is available, and otherwise uses Docker with a dedicated test image.

### Linting and Formatting

```bash
./lint.sh                # Run all lint checks
./lint.sh check backend  # Backend lint checks only
./lint.sh fix frontend   # Auto-fix frontend lint issues
./lint.sh format         # Format backend and frontend code
```

`./lint.sh` runs local tools directly inside containers when available:
- Backend: `ruff` for Python linting and formatting
- Frontend: `eslint` and `prettier` for JavaScript/JSX

Falls back to Docker for backend linting if `ruff` is not installed on the host.

## Docker Operations

For detailed Docker usage, see `Docker-README.md`.

**Common commands:**

```bash
# Start all services
docker compose up -d --build

# View logs
docker compose logs -f

# Scale workers
docker compose up --scale worker=3 --scale llm_worker=4

# Stop all services
docker compose down

# Rebuild after code changes
docker compose up --build

# Restart services (no rebuild)
docker compose restart
```

## Notes

- For Docker usage and service lifecycle commands, see `Docker-README.md`
- For detailed testing information, see `TESTING.md`
- For frontend-specific documentation, see `frontend/README.md`
- For browser extension setup, see `extension/README.md`
- LLM cache is enabled by default and persists responses to avoid recomputation
- NLTK data is cached in `./.nltk_data` and mounted into containers
