# Linting and Formatting

## Quick Start

```bash
# Run all lint checks
./lint.sh

# Format backend and frontend code
./lint.sh format

# Run strict frontend quality lint plus mutation checks
./frontend-quality.sh

# Run strict backend quality lint plus mutation checks
./backend-quality.sh
```

## Usage

```bash
./lint.sh [check|fix|format] [all|backend|frontend]
```

| Command | Description |
|---------|-------------|
| `./lint.sh` | Run all lint checks (default) |
| `./lint.sh check backend` | Backend lint checks only |
| `./lint.sh check frontend` | Frontend lint checks only |
| `./lint.sh fix frontend` | Auto-fix frontend lint issues |
| `./lint.sh format` | Format both backend and frontend |
| `./frontend-quality.sh --lint-only` | Strict frontend ESLint quality profile |
| `./frontend-quality.sh --mutation-only` | Frontend Stryker mutation testing |
| `./backend-quality.sh --lint-only` | Strict backend Ruff quality profile for `main.py` |
| `./backend-quality.sh --mutation-only` | Backend mutmut mutation testing for `main.py` |

## Running Tools Directly

If dependencies are installed locally:

**Backend (Python):**
```bash
ruff check .
ruff format .
./backend-quality.sh --lint-only
./backend-quality.sh --mutation-only
```

**Frontend (JavaScript/JSX):**
```bash
cd /app/frontend && npm run lint
cd /app/frontend && npm run format
cd /app/frontend && npm run quality:lint
cd /app/frontend && npm run quality:mutation
```

## Environment

The helper script runs `ruff` and `npm` directly when inside a container with local dependencies available. On host environments without `ruff`, it falls back to Docker using the `rss-tests` image.
