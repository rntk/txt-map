# RSS Content Analysis - Topic Extraction & Text Analysis Platform

A production-ready content analysis system that extracts topics, generates summaries, creates mindmaps, and identifies key insights from web content using LLM-powered background workers.

## Architecture

The system uses a **thin client + background workers** architecture:

```
Browser Extension (Thin Client)
  ↓ Select content & submit HTML
  ↓
API Server (FastAPI)
  ↓ Store in MongoDB & queue tasks
  ↓
Background Workers (Python)
  ↓ Process tasks in parallel
  ↓ Store results in MongoDB
  ↓
Frontend (React)
  ↓ Poll status & display results progressively
```

## Features

- **Text Splitting**: Extract and structure text with word-level markers
- **Topic Extraction**: Grid-based coordinate approach for precise topic identification
- **Summarization**: Generate concise summaries for all content and topics
- **Mindmap Generation**: Create hierarchical mindmap structures
- **Insides Extraction**: Identify key insights, personal stories, and important takeaways
- **Real-time Processing**: Live status updates with progressive result loading
- **LLM Caching**: MD5-based caching to avoid redundant expensive LLM calls
- **Scalable Workers**: Add workers as needed for parallel processing
- **Refresh Capability**: Re-process content with one click

## Quick Start

## Prerequisites

- MongoDB running on port 8765 (or set `MONGODB_URL` env var)
- LLamaCPP server running on port 8989 (or set `LLAMACPP_URL` env var)

## Step 1: Start the API Server

Open a terminal:

```bash
cd /app
python main.py
```

You should see:
```
MONGODB_URL: mongodb://localhost:8765/
LLAMACPP_URL: http://localhost:8989
```

The API will be available at `http://127.0.0.1:8000`

## Step 2: Start the Background Worker

Open a **new terminal**:

```bash
cd /app
python workers.py
```

You should see:
```
INFO - Worker worker-12345 started
```

The worker will poll for tasks every 2 seconds.

## Step 3: Test the System

### Option A: Using the Browser Extension

1. Load extension in Firefox/Chrome:
   - Firefox: `about:debugging` → Load Temporary Add-on
   - Chrome: `chrome://extensions` → Developer mode → Load unpacked
   - Select `/app/extension/` directory

2. Navigate to any webpage (e.g., a news article)

3. Click the extension icon

4. Click "Topics Analysis" or "Insides Analysis"

5. Choose "Select Block" and click on an article, OR click "Full Page"

6. Browser will redirect to `http://127.0.0.1:8000/page/text/{id}`

7. Watch the processing status update in real-time!

### Option B: Using curl (for testing)

```bash
# Submit some content
curl -X POST http://127.0.0.1:8000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<h1>Test Article</h1><p>This is a test article about machine learning and artificial intelligence. Deep learning is a subset of machine learning.</p>",
    "source_url": "https://example.com/test"
  }'
```

You'll get a response like:
```json
{
  "submission_id": "abc123...",
  "redirect_url": "/page/text/abc123..."
}
```

Visit the URL in your browser:
```
http://127.0.0.1:8000/page/text/abc123...
```

### Check Status Programmatically

```bash
# Replace {id} with your submission_id
curl http://127.0.0.1:8000/api/submission/{id}/status
```

### Get Results

```bash
curl http://127.0.0.1:8000/api/submission/{id}
```

### Refresh/Re-process

```bash
curl -X POST http://127.0.0.1:8000/api/submission/{id}/refresh \
  -H "Content-Type: application/json" \
  -d '{"tasks": ["all"]}'
```

## What You Should See

### In the Worker Terminal

```
INFO - Worker worker-12345 started
INFO - Claimed task text_splitting for submission abc123...
INFO - Processing text_splitting for submission abc123...
Text splitting completed for submission abc123...: 45 words, 8 markers
INFO - Completed text_splitting for submission abc123...
INFO - Claimed task topic_extraction for submission abc123...
...
```

### In the Browser

1. **Status Indicator** showing task progress:
   - Text Splitting: ✓ completed
   - Topic Extraction: ⟳ processing
   - Summarization: ○ pending
   - Mindmap: ○ pending
   - Insides: ○ pending

2. **Yellow banner** while processing:
   "Processing in progress... Results will appear as tasks complete."

3. **Results appear progressively** as each task completes

4. **Refresh button** to re-run all processing

## Troubleshooting

### Worker not picking up tasks?

Check MongoDB connection:
```bash
mongo mongodb://localhost:8765/
> use rss
> db.task_queue.find()
```

You should see pending tasks.

### API returning errors?

Check MongoDB and LLamaCPP are running:
```bash
# Check MongoDB
mongo mongodb://localhost:8765/

# Check LLamaCPP
curl http://localhost:8989/health
```

### Extension not working?

1. Check browser console for errors (F12)
2. Verify API is running on port 8000
3. Check extension permissions in manifest.json

### No results showing?

1. Check worker is running
2. Check task status via API: `/api/submission/{id}/status`
3. Check worker terminal for errors
4. Check MongoDB for results:
   ```bash
   mongo mongodb://localhost:8765/
   > use rss
   > db.submissions.findOne()
   ```

## Next Steps

Once everything is working:

1. Review `/app/IMPLEMENTATION_SUMMARY.md` for architecture details
2. Implement the full task processing logic (see "Next Steps" section)
3. Customize the frontend UI as needed
4. Add more task types
5. Deploy workers to separate machines for scaling

## Environment Variables

```bash
# MongoDB connection (default: mongodb://localhost:8765/)
export MONGODB_URL="mongodb://your-host:27017/"

# LLamaCPP server (default: http://localhost:8989)
export LLAMACPP_URL="http://your-llm-host:8989"

# Optional auth token for LLamaCPP
export TOKEN="your-secret-token"
```

## Running with Docker Compose

If using the provided docker-compose.yml:

```bash
docker-compose up -d mongodb
docker-compose up api
# In another terminal:
docker-compose up worker
```

Note: You may need to update docker-compose.yml to add the worker service.

## Usage

### Using the Browser Extension

1. Navigate to any webpage (e.g., news article, blog post)
2. Click the extension icon
3. Choose "Topics Analysis" or "Insides Analysis"
4. Select a text block OR use full page
5. Browser redirects to results page at `http://localhost:8000/page/text/{id}`
6. Watch processing status update in real-time
7. Results appear progressively as tasks complete

### Using the API Directly

**Submit content:**
```bash
curl -X POST http://localhost:8000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<h1>Article Title</h1><p>Content here...</p>",
    "source_url": "https://example.com/article"
  }'
```

**Response:**
```json
{
  "submission_id": "abc123-def456-...",
  "redirect_url": "/page/text/abc123-def456-..."
}
```

**Check status:**
```bash
curl http://localhost:8000/api/submission/{id}/status
```

**Get results:**
```bash
curl http://localhost:8000/api/submission/{id}
```

**Refresh/re-process:**
```bash
curl -X POST http://localhost:8000/api/submission/{id}/refresh \
  -H "Content-Type: application/json" \
  -d '{"tasks": ["all"]}'
```

## Environment Variables

```bash
# MongoDB connection (default: mongodb://localhost:8765/)
export MONGODB_URL="mongodb://localhost:27017/"

# LLamaCPP server (default: http://localhost:8989)
export LLAMACPP_URL="http://localhost:8989"

# Optional auth token for LLamaCPP
export TOKEN="your-secret-token"
```

## Project Structure

```
/app/
├── main.py                          # FastAPI application entry point
├── workers.py                       # Background worker system
├── handlers/
│   ├── submission_handler.py       # Submission API endpoints
│   ├── themed_post_handler.py      # Legacy themed post handler
│   └── ...
├── lib/
│   ├── storage/
│   │   ├── submissions.py          # Submissions storage class
│   │   └── posts.py                # Posts storage class
│   └── tasks/                       # Task processing modules
│       ├── text_splitting.py       # Text extraction & structuring
│       ├── topic_extraction.py     # Grid-based topic extraction
│       ├── summarization.py        # Summary generation
│       ├── mindmap.py              # Mindmap hierarchy extraction
│       └── insides.py              # Key insights extraction
├── frontend/
│   └── src/
│       ├── components/
│       │   └── TextPage.js         # Results page with status polling
│       └── App.js                  # Main React app
├── extension/                       # Browser extension (thin client)
│   ├── manifest.json
│   ├── content.js                  # Content selection & submission
│   └── popup.html
└── docker-compose.yml              # Docker orchestration
```

## Task Processing Pipeline

Tasks execute in dependency order with priorities:

1. **text_splitting** (Priority 1) - No dependencies
   - Extracts plain text from HTML
   - Creates word-level markers for precision
   - Builds sentence structure

2. **topic_extraction** (Priority 2) - Depends on text_splitting
   - Uses coordinate grid approach (Y=line, X=word)
   - Sends to LLM for topic identification
   - Rebuilds sentences from grid coordinates

3. **Parallel Processing** (Priority 3):
   - **summarization** - Generates summaries for sentences and topics
   - **mindmap** - Creates hierarchical mindmap trees
   - **insides** - Extracts key insights and important segments

## Scaling

### Horizontal Scaling

Run multiple worker instances:

```bash
# Docker Compose
docker-compose up --scale worker=5

# Manual
python workers.py &  # Terminal 1
python workers.py &  # Terminal 2
python workers.py &  # Terminal 3
```

Workers coordinate via MongoDB - no collisions!

### Production Deployment

For production:
1. Use environment-specific config
2. Set up MongoDB authentication
3. Use secrets management
4. Configure logging and monitoring
5. Set up SSL/TLS termination
6. Use production-grade LLM server

## API Documentation

Once running, access interactive API docs at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/submit` | POST | Submit HTML content for processing |
| `/api/submission/{id}` | GET | Get all results for a submission |
| `/api/submission/{id}/status` | GET | Get task completion status (for polling) |
| `/api/submission/{id}/refresh` | POST | Clear results and re-queue tasks |
| `/page/text/{id}` | GET | Serve results page in browser |

## Performance Features

- **LLM Response Caching**: MD5-based caching prevents redundant calls
- **Automatic Chunking**: Large texts split to fit LLM context windows
- **Task Dependencies**: Workers skip tasks with unmet dependencies
- **Atomic Task Claiming**: MongoDB find_one_and_update prevents race conditions
- **Progressive Loading**: Frontend displays results as they become available

## Troubleshooting

### Worker not processing?

Check MongoDB connection:
```bash
mongo mongodb://localhost:27017/
> use rss
> db.task_queue.find()
```

### Extension not working?

1. Check browser console (F12) for errors
2. Verify API running on port 8000
3. Check extension permissions

### No results showing?

1. Ensure worker is running
2. Check task status: `/api/submission/{id}/status`
3. Check worker logs for errors

## Documentation

- `Docker-README.md` - Docker-specific instructions

## Development

### Running Tests

```bash
./test_system.sh
```

### Hot Reload Development

```bash
# Start MongoDB only
docker-compose up mongodb

# Run API with auto-reload
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Run worker (restart manually when changing code)
python workers.py
```

### Frontend Development

```bash
cd frontend
npm install
npm start  # Development server on port 3000
npm run build  # Production build
```

## Technology Stack

- **Backend**: FastAPI, Python 3.11+
- **Database**: MongoDB 8.0
- **Workers**: Python asyncio-based polling
- **Frontend**: React, React Router
- **Extension**: WebExtensions API
- **LLM**: LLamaCPP (or OpenAI-compatible API)

## License

[Your license here]

## Contributing

[Contributing guidelines here]
