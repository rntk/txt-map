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

# Run strict frontend quality checks
./frontend-quality.sh

# Run strict backend quality checks for main.py
./backend-quality.sh
```

The helper runs `pytest` directly when executed inside a container with local dependencies available. On host environments it falls back to the Docker Compose test stack.

## Frontend Quality Mode

Use `./frontend-quality.sh` for an improvement loop that combines strict ESLint checks with Stryker mutation testing:

```bash
./frontend-quality.sh
./frontend-quality.sh --lint-only
./frontend-quality.sh --mutation-only
./frontend-quality.sh --rebuild
```

The strict lint profile includes complexity and size rules, treats warnings as failures, and escalates React hook dependency warnings. Mutation testing uses Stryker with the Vitest runner.

## Backend Quality Mode

Use `./backend-quality.sh` for a focused `main.py` improvement loop that combines strict Ruff checks with mutmut mutation testing:

```bash
./backend-quality.sh
./backend-quality.sh --lint-only
./backend-quality.sh --mutation-only
./backend-quality.sh --rebuild
```

The strict lint profile includes annotations, complexity, branch, argument, return, and statement-count checks. Mutation testing is scoped to `main.py` and the direct route-handler tests.

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

For Docker Compose runs, NLTK data is cached in `./.nltk_data` on the host and mounted into the containers via `NLTK_DATA=/app/.nltk_data`, so downloads only need to happen once.

### Permission denied when mounting volume
Ensure the Docker user has read access to the project files:
```bash
docker run --rm -v $(pwd):/app:ro rss-tests pytest
```
