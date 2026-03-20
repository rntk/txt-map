# Running Tests

## Quick Start

### Using the helper script (recommended)
```bash
# Run all backend tests once
./test.sh

# Run specific test file
./test.sh tests/unit/test_submission_handler.py

# Run with coverage report
./test.sh --coverage

# Rebuild the backend test image first
./test.sh --rebuild
```

The helper runs `pytest` directly when executed inside a container with local dependencies available. On host environments it falls back to the Docker Compose test stack.

## Test Dependencies

Test dependencies are defined in `requirements-test.txt`. Install them with:

```bash
# Install only test dependencies
pip install -r requirements-test.txt

# Install both main and test dependencies
pip install -r requirements.txt -r requirements-test.txt
```

### Using Docker directly
```bash
# Build the test image
docker build -f Dockerfile.tests -t rss-tests .

# Run all tests
docker run --rm -v $(pwd):/app rss-tests pytest

# Run specific test file
docker run --rm -v $(pwd):/app rss-tests pytest tests/unit/test_submission_handler.py -v

# Run with coverage
docker run --rm -v $(pwd):/app rss-tests pytest --cov=. --cov-report=html
```

### Using Docker Compose (with MongoDB)
```bash
# Run tests with MongoDB service
docker-compose -f docker-compose.test.yml run --rm tests

# Run specific tests
docker-compose -f docker-compose.test.yml run --rm tests pytest --tb=short tests/unit/test_workers.py

# Run with coverage
docker-compose -f docker-compose.test.yml run --rm tests pytest --tb=short --cov=. --cov-report=term-missing
```

## Test Structure

```
tests/
├── conftest.py                 # Shared fixtures
├── unit/                       # Unit tests
│   ├── test_submission_handler.py
│   ├── test_task_queue_handler.py
│   ├── test_diff_handler.py
│   ├── test_semantic_diff.py
│   ├── test_submissions_storage.py
│   ├── test_semantic_diffs_storage.py
│   ├── test_workers.py
│   ├── test_nlp.py
│   ├── test_llamacpp.py
│   ├── test_article_splitter.py
│   ├── test_main_app.py
│   ├── test_pdf_to_html.py
│   ├── test_posts_storage.py
│   └── test_tasks/
│       ├── test_split_topic_generation.py
│       ├── test_subtopics_generation.py
│       ├── test_summarization.py
│       ├── test_mindmap.py
│       └── test_prefix_tree.py
├── integration/                # Integration tests (future)
└── plans/                      # Test plans
```

## Test Statistics

| Category | Tests |
|----------|-------|
| API Handlers | 178 |
| Storage Layers | 284 |
| Core Logic | 167 |
| Workers | 117 |
| Task Handlers | 177 |
| NLP/LLM | 145 |
| Application | 158 |
| **Total** | **1,226** |

## Coverage Goals

| Component | Target |
|-----------|--------|
| Handlers | 90%+ |
| Storage | 90%+ |
| Core Logic | 85%+ |
| Task Handlers | 85%+ |
| Workers | 80%+ |
| Overall | 85%+ |

## Coverage

```bash
./test.sh --coverage
```

## Advanced Pytest Usage

```bash
# Run a specific test class directly
pytest tests/unit/test_submission_handler.py::TestPostSubmit -v

# Run tests matching a keyword directly
pytest -k "submission" -v

# Run parallel tests directly
pytest -n auto
```

## Troubleshooting

### Tests fail with MongoDB connection error
Use the helper script or Docker Compose, both of which include MongoDB:
```bash
./test.sh
```

### Tests fail due to missing NLTK data
The tests mock NLTK dependencies, but if running locally:
```bash
python -c "import nltk; nltk.download('punkt_tab'); nltk.download('stopwords'); nltk.download('wordnet')"
```

### Permission denied when mounting volume
Ensure the Docker user has read access to the project files:
```bash
docker run --rm -v $(pwd):/app:ro rss-tests pytest
```
