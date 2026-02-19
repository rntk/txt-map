# Content Analysis Platform

This is a FastAPI + worker system that processes submitted HTML content into structured analysis results (topics, summaries, mindmap, and insights), then serves them in a React UI.

## Documentation Map

- `README.md`: project overview, architecture, API and worker flow
- `Docker-README.md`: Docker Compose setup and container operations
- `frontend/README.md`: React app routes, commands, and frontend testing
- `extension/README.md`: browser extension setup and usage

## Architecture

```
Browser Extension
  -> POST /api/submit
FastAPI API
  -> stores submission + queues tasks in MongoDB
Worker(s)
  -> process queued tasks via LLamaCPP
MongoDB
  -> stores submission status/results + task queue
React Frontend
  -> polls status and renders results
```

## Core Components

- API server: `main.py`
- Worker process: `workers.py`
- API handlers: `handlers/`
- Task implementations: `lib/tasks/`
- MongoDB storage helpers: `lib/storage/`

## Processing Pipeline

Tasks are queued on submission and executed with dependencies:

1. `split_topic_generation`
2. `subtopics_generation` (depends on `split_topic_generation`)
3. `summarization` (depends on `split_topic_generation`)
4. `mindmap` (depends on `subtopics_generation`)

## Local (Non-Docker) Run

Prerequisites:

- MongoDB reachable by `MONGODB_URL` (default: `mongodb://localhost:8765/`)
- LLamaCPP reachable by `LLAMACPP_URL` (default: `http://localhost:8989`)

Start API:

```bash
cd /app
python main.py
```

Start worker in another terminal:

```bash
cd /app
python workers.py
```

API is available at `http://127.0.0.1:8000`.

## Environment Variables

- `MONGODB_URL`: MongoDB connection string
- `LLAMACPP_URL`: LLamaCPP server base URL
- `TOKEN`: optional auth token used by LLamaCPP client

## Main API Endpoints

- `POST /api/submit`: submit HTML and create task queue entries
- `GET /api/submission/{submission_id}`: full submission payload + results
- `GET /api/submission/{submission_id}/status`: task-level status
- `POST /api/submission/{submission_id}/refresh`: clear/requeue tasks
- `DELETE /api/submission/{submission_id}`: remove submission and queued tasks
- `GET /api/submissions`: list submissions with optional filters
- `GET /api/task-queue`: list task queue entries
- `POST /api/task-queue/add`: queue task(s) for a submission
- `POST /api/task-queue/{task_id}/repeat`: requeue a task entry
- `DELETE /api/task-queue/{task_id}`: delete a queue entry
- `GET /api/topics`: aggregated topics from stored posts
- `GET /api/themed-topic` and `GET /api/themed-topic/{topic}`: topic-filtered post view data

Interactive docs:

- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

## Notes

- This repository currently includes frontend routes for pages like `clustered-post` and `themed-post`, but only the API handlers listed above are implemented in `handlers/`.
- For Docker usage and service lifecycle commands, use `Docker-README.md`.
