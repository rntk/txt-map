# Running Tests

## Quick Start

### Using the helper script (recommended)
```bash
# Run all tests
./test.sh

# Run specific test file
./test.sh tests/unit/test_submission_handler.py

# Run with verbose output
./test.sh -v

# Run with coverage report
./test.sh --cov=. --cov-report=html

# Run specific test class
./test.sh tests/unit/test_submission_handler.py::TestPostSubmit -v

# Run tests matching a keyword
./test.sh -k "submission" -v
```

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
docker-compose -f docker-compose.test.yml run --rm tests pytest tests/unit/test_workers.py -v

# Run with coverage
docker-compose -f docker-compose.test.yml run --rm tests pytest --cov=. --cov-report=html
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

## Generate Coverage Report

```bash
# HTML report
./test.sh --cov=. --cov-report=html
# Open htmlcov/index.html in browser

# Terminal report
./test.sh --cov=. --cov-report=term

# XML report (for CI/CD)
./test.sh --cov=. --cov-report=xml
```

## Parallel Test Execution

```bash
# Run tests in parallel using 4 CPUs
./test.sh -n 4

# Auto-detect CPU count
./test.sh -n auto
```

## Common Pytest Options

| Option | Description |
|--------|-------------|
| `-v` | Verbose output |
| `-x` | Stop on first failure |
| `--tb=short` | Shorter traceback |
| `-k "pattern"` | Run tests matching pattern |
| `--cov=.` | Coverage for current directory |
| `--cov-report=html` | HTML coverage report |
| `-n auto` | Parallel execution |
| `--maxfail=5` | Stop after 5 failures |
| `-q` | Quiet mode |

## Troubleshooting

### Tests fail with MongoDB connection error
Use Docker Compose which includes MongoDB:
```bash
docker-compose -f docker-compose.test.yml run --rm tests
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
