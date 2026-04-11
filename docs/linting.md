# Linting and Formatting

## Quick Start

```bash
# Run all lint checks
./lint.sh

# Format backend and frontend code
./lint.sh format
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

## Running Tools Directly

If dependencies are installed locally:

**Backend (Python):**
```bash
ruff check .
ruff format .
```

**Frontend (JavaScript/JSX):**
```bash
cd /app/frontend && npm run lint
cd /app/frontend && npm run format
```

## Environment

The helper script runs `ruff` and `npm` directly when inside a container with local dependencies available. On host environments without `ruff`, it falls back to Docker using the `rss-tests` image.
