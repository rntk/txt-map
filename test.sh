#!/bin/bash
# Helper script to run backend tests directly in-container when possible,
# otherwise in the compose-backed test environment.
# Usage:
#   ./test.sh                                     # Run all backend tests once
#   ./test.sh tests/unit/test_submission_handler.py
#   ./test.sh --coverage
#   ./test.sh --rebuild tests/unit/test_workers.py

set -euo pipefail

usage() {
    cat <<'EOF'
Usage: ./test.sh [--coverage] [--rebuild] [test-target...]

Options:
  --coverage  Run with terminal coverage output.
  --rebuild   Rebuild the backend test image before running.

Examples:
  ./test.sh
  ./test.sh tests/unit/test_submission_handler.py
  ./test.sh --coverage
  ./test.sh --rebuild tests/unit/test_workers.py
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.test.yml"

REBUILD=false
COVERAGE=false
TARGETS=()

for arg in "$@"; do
    case "$arg" in
        --rebuild)
            REBUILD=true
            ;;
        --coverage)
            COVERAGE=true
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            TARGETS+=("$arg")
            ;;
    esac
done

PYTEST_ARGS=(--tb=short)
if $COVERAGE; then
    PYTEST_ARGS+=(--cov=. --cov-report=term-missing)
fi
if [ ${#TARGETS[@]} -gt 0 ]; then
    PYTEST_ARGS+=("${TARGETS[@]}")
fi

run_direct=false
if command -v pytest >/dev/null 2>&1; then
    if [ -f "/.dockerenv" ]; then
        run_direct=true
    elif ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
        run_direct=true
    fi
fi

if $run_direct; then
    if $REBUILD; then
        echo "--rebuild is ignored in direct mode." >&2
    fi
    (cd "$PROJECT_DIR" && PYTHONPATH="$PROJECT_DIR${PYTHONPATH:+:$PYTHONPATH}" pytest "${PYTEST_ARGS[@]}")
    exit 0
fi

if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
else
    echo "Neither direct pytest nor Docker Compose is available to run backend tests." >&2
    exit 1
fi

if $REBUILD; then
    echo "Rebuilding backend test image..."
    "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" build tests
fi

"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" run --rm tests pytest "${PYTEST_ARGS[@]}"
